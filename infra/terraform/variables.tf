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
  description = "Where model calls go: 'foundry' (Azure AI Foundry) or 'gemini' (Vertex AI, europe-west3). Both keep data in the EU."
  default     = "gemini"
}

variable "entra_client_id" {
  description = "App registration used for Entra ID sign-in; empty disables SSO (dev only)."
  default     = ""
}

variable "legal_group_object_id" {
  description = "Entra ID group allowed to use the tool."
  default     = ""
}
