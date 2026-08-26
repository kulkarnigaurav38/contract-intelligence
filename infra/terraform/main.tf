# Production shape on Azure. Not applied for the case study - it documents the infrastructure story:
#   - documents stay in the tenant: SharePoint (source) -> Blob (working copies) -> PostgreSQL/pgvector (index)
#   - the API and web containers run on Container Apps behind Entra ID
#   - OCR and models: Azure AI Document Intelligence for scans; LLM access through Foundry or
#     Gemini on Vertex AI (europe-west3), configured by variable, key held in Key Vault
#   - everything logs to Log Analytics; the append-only audit log lives in PostgreSQL

terraform {
  required_version = ">= 1.6"
  required_providers {
    azurerm = { source = "hashicorp/azurerm", version = "~> 4.0" }
  }
}

provider "azurerm" {
  features {}
}

locals {
  name = "${var.project}-${var.environment}"
  tags = { project = var.project, environment = var.environment, owner = "legal-tech" }
}

resource "azurerm_resource_group" "rg" {
  name     = "rg-${local.name}"
  location = var.location
  tags     = local.tags
}

# ---------------------------------------------------------------- observability
resource "azurerm_log_analytics_workspace" "logs" {
  name                = "log-${local.name}"
  location            = azurerm_resource_group.rg.location
  resource_group_name = azurerm_resource_group.rg.name
  sku                 = "PerGB2018"
  retention_in_days   = 90
  tags                = local.tags
}

# ---------------------------------------------------------------- secrets
resource "azurerm_key_vault" "kv" {
  name                       = "kv-${replace(local.name, "-", "")}"
  location                   = azurerm_resource_group.rg.location
  resource_group_name        = azurerm_resource_group.rg.name
  tenant_id                  = var.tenant_id
  sku_name                   = "standard"
  purge_protection_enabled   = true
  soft_delete_retention_days = 90
  rbac_authorization_enabled = true
  tags                       = local.tags
}

# ---------------------------------------------------------------- documents (working copies; SharePoint stays the source)
resource "azurerm_storage_account" "docs" {
  name                            = "st${replace(local.name, "-", "")}"
  resource_group_name             = azurerm_resource_group.rg.name
  location                        = azurerm_resource_group.rg.location
  account_tier                    = "Standard"
  account_replication_type        = "ZRS"
  allow_nested_items_to_be_public = false
  min_tls_version                 = "TLS1_2"
  blob_properties {
    versioning_enabled = true
    delete_retention_policy { days = 30 }
  }
  tags = local.tags
}

resource "azurerm_storage_container" "contracts" {
  name                  = "contracts"
  storage_account_id    = azurerm_storage_account.docs.id
  container_access_type = "private"
}

# ---------------------------------------------------------------- index: PostgreSQL with pgvector
resource "azurerm_postgresql_flexible_server" "db" {
  name                          = "psql-${local.name}"
  resource_group_name           = azurerm_resource_group.rg.name
  location                      = azurerm_resource_group.rg.location
  version                       = "16"
  administrator_login           = "contracts"
  administrator_password        = var.db_password
  sku_name                      = var.db_sku
  storage_mb                    = 65536
  backup_retention_days         = 35
  geo_redundant_backup_enabled  = true
  public_network_access_enabled = false
  tags                          = local.tags
}

resource "azurerm_postgresql_flexible_server_configuration" "extensions" {
  name      = "azure.extensions"
  server_id = azurerm_postgresql_flexible_server.db.id
  value     = "VECTOR"
}

resource "azurerm_postgresql_flexible_server_database" "contracts" {
  name      = "contracts"
  server_id = azurerm_postgresql_flexible_server.db.id
  charset   = "UTF8"
  collation = "en_US.utf8"
}

# ---------------------------------------------------------------- OCR for scans (production path for Tesseract's role)
resource "azurerm_cognitive_account" "document_intelligence" {
  name                  = "di-${local.name}"
  location              = azurerm_resource_group.rg.location
  resource_group_name   = azurerm_resource_group.rg.name
  kind                  = "FormRecognizer"
  sku_name              = "S0"
  custom_subdomain_name = "di-${local.name}"
  tags                  = local.tags
}

# ---------------------------------------------------------------- compute
resource "azurerm_container_app_environment" "env" {
  name                       = "cae-${local.name}"
  location                   = azurerm_resource_group.rg.location
  resource_group_name        = azurerm_resource_group.rg.name
  log_analytics_workspace_id = azurerm_log_analytics_workspace.logs.id
  tags                       = local.tags
}

resource "azurerm_user_assigned_identity" "api" {
  name                = "id-${local.name}-api"
  location            = azurerm_resource_group.rg.location
  resource_group_name = azurerm_resource_group.rg.name
}

resource "azurerm_role_assignment" "api_secrets" {
  scope                = azurerm_key_vault.kv.id
  role_definition_name = "Key Vault Secrets User"
  principal_id         = azurerm_user_assigned_identity.api.principal_id
}

resource "azurerm_role_assignment" "api_blob" {
  scope                = azurerm_storage_account.docs.id
  role_definition_name = "Storage Blob Data Contributor"
  principal_id         = azurerm_user_assigned_identity.api.principal_id
}

resource "azurerm_container_app" "api" {
  name                         = "ca-${local.name}-api"
  container_app_environment_id = azurerm_container_app_environment.env.id
  resource_group_name          = azurerm_resource_group.rg.name
  revision_mode                = "Single"
  tags                         = local.tags

  identity {
    type         = "UserAssigned"
    identity_ids = [azurerm_user_assigned_identity.api.id]
  }

  secret {
    name                = "llm-api-key"
    key_vault_secret_id = "${azurerm_key_vault.kv.vault_uri}secrets/llm-api-key"
    identity            = azurerm_user_assigned_identity.api.id
  }
  secret {
    name                = "database-url"
    key_vault_secret_id = "${azurerm_key_vault.kv.vault_uri}secrets/database-url"
    identity            = azurerm_user_assigned_identity.api.id
  }

  template {
    min_replicas = 1
    max_replicas = 5
    container {
      name   = "api"
      image  = "${var.container_registry}/contract-intelligence-api:${var.image_tag}"
      cpu    = 1.0
      memory = "2Gi"
      env {
        name        = "GEMINI_API_KEY"
        secret_name = "llm-api-key"
      }
      env {
        name        = "DATABASE_URL"
        secret_name = "database-url"
      }
      env {
        name  = "LLM_PROVIDER"
        value = var.llm_provider
      }
      env {
        name  = "DOCUMENT_INTELLIGENCE_ENDPOINT"
        value = azurerm_cognitive_account.document_intelligence.endpoint
      }
    }
  }

  ingress {
    external_enabled = false # only the web app and internal callers reach the API
    target_port      = 8000
    traffic_weight {
      latest_revision = true
      percentage      = 100
    }
  }
}

resource "azurerm_container_app" "web" {
  name                         = "ca-${local.name}-web"
  container_app_environment_id = azurerm_container_app_environment.env.id
  resource_group_name          = azurerm_resource_group.rg.name
  revision_mode                = "Single"
  tags                         = local.tags

  template {
    min_replicas = 1
    max_replicas = 3
    container {
      name   = "web"
      image  = "${var.container_registry}/contract-intelligence-web:${var.image_tag}"
      cpu    = 0.25
      memory = "0.5Gi"
    }
  }

  ingress {
    external_enabled = true
    target_port      = 80
    traffic_weight {
      latest_revision = true
      percentage      = 100
    }
  }
}

# Entra ID sign-in in front of the web app (Container Apps "Easy Auth", Microsoft.App/containerApps/authConfigs):
# only members of var.legal_group_object_id get in. azurerm has no first-class resource for authConfigs yet,
# so it is applied with the azapi provider or the CLI (az containerapp auth microsoft update ...).
