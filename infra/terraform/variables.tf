variable "project" {
  default = "contractintel"
}

variable "environment" {
  default = "dev"
}

variable "location" {
  description = "EU region: documents and the index never leave the tenant's region."
  default     = "germanywestcentral"
}

variable "tenant_id" {
  type = string
}

variable "db_password" {
  type      = string
  sensitive = true
}

variable "db_sku" {
  default = "GP_Standard_D2ds_v5"
}

variable "container_registry" {
  description = "ACR login server hosting the two images."
  type        = string
}

variable "image_tag" {
  default = "latest"
}

variable "llm_provider" {
  description = "Where model calls go: 'foundry' (Azure AI Foundry / Azure OpenAI in this tenant) or 'gemini' (Vertex AI, europe-west3). Both keep data in the EU."
  default     = "gemini"
}

variable "foundry_location" {
  description = "Region for the Azure OpenAI resource (model availability differs by region)."
  default     = "swedencentral"
}

variable "foundry_deployments" {
  description = "Deployment name -> model for each routing tier; names must match AZURE_DEPLOYMENT_* in the API."
  type        = map(object({ model = string, version = string, capacity = number }))
  default = {
    "gpt-5"                  = { model = "gpt-5", version = "2025-08-07", capacity = 50 }
    "gpt-5-mini"             = { model = "gpt-5-mini", version = "2025-08-07", capacity = 100 }
    "gpt-5-nano"             = { model = "gpt-5-nano", version = "2025-08-07", capacity = 100 }
    "text-embedding-3-large" = { model = "text-embedding-3-large", version = "1", capacity = 100 }
  }
}

variable "sharepoint_drive_id" {
  description = "Drive id of the SharePoint document library holding the contracts (Graph: /sites/{site}/drives)."
  default     = ""
}

variable "entra_client_id" {
  description = "App registration used for Entra ID sign-in; empty disables SSO (dev only)."
  default     = ""
}

variable "legal_group_object_id" {
  description = "Entra ID group allowed to use the tool."
  default     = ""
}
