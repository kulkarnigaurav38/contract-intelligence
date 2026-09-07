output "web_url" {
  value = "https://${azurerm_container_app.web.ingress[0].fqdn}"
}

output "document_intelligence_endpoint" {
  value = azurerm_cognitive_account.document_intelligence.endpoint
}
