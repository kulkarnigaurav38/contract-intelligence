/** Backend enum values → what the legal team reads. */
type L = { de: string; en: string }

export const CLAUSE_TYPES: Record<string, L> = {
  term_termination: { de: 'Laufzeit und Kündigung', en: 'Term and termination' },
  fees_payment: { de: 'Vergütung und Zahlung', en: 'Fees and payment' },
  liability_cap: { de: 'Haftungsbegrenzung', en: 'Limitation of liability' },
  confidentiality: { de: 'Vertraulichkeit', en: 'Confidentiality' },
  data_protection: { de: 'Datenschutz (DSGVO)', en: 'Data protection (GDPR)' },
  governing_law: { de: 'Anwendbares Recht', en: 'Governing law' },
  dispute_resolution: { de: 'Gerichtsstand und Streitbeilegung', en: 'Dispute resolution and jurisdiction' },
  force_majeure: { de: 'Höhere Gewalt', en: 'Force majeure' },
  assignment: { de: 'Abtretung', en: 'Assignment' },
  audit_rights: { de: 'Auditrechte', en: 'Audit rights' },
  anti_corruption: { de: 'Antikorruption und Compliance', en: 'Anti-corruption and compliance' },
  change_of_control: { de: 'Kontrollwechsel (Change of Control)', en: 'Change of control' },
}

export const CONTRACT_TYPES: Record<string, L> = {
  merchant_agreement: { de: 'Händlervertrag', en: 'Merchant agreement' },
  dpa: { de: 'Auftragsverarbeitungsvertrag (AVV)', en: 'Data processing agreement (DPA)' },
  nda: { de: 'Geheimhaltungsvereinbarung (NDA)', en: 'Non-disclosure agreement (NDA)' },
  vendor_agreement: { de: 'Lieferantenvertrag', en: 'Vendor agreement' },
  receivables_purchase: { de: 'Forderungskaufvertrag', en: 'Receivables purchase agreement' },
  collection_services: { de: 'Inkassodienstleistungsvertrag', en: 'Collection services agreement' },
  saas_agreement: { de: 'SaaS-Vertrag', en: 'SaaS agreement' },
  amendment: { de: 'Nachtrag', en: 'Amendment' },
  other: { de: 'Sonstiger Vertrag', en: 'Other' },
  unknown: { de: 'Sonstiger Vertrag', en: 'Other' },
}

export const COMMON = {
  nav_contracts: { de: 'Verträge', en: 'Contracts' },
  nav_how: { de: 'So funktioniert es', en: 'How it works' },
  ai_on: { de: 'KI-Gegenprüfung aktiv', en: 'AI cross-check on' },
  ai_off: { de: 'Ohne KI-Gegenprüfung', en: 'Without AI cross-check' },
  ai_off_hint: { de: 'Ohne Modellschlüssel gilt nur die Regelprüfung; Handschrift kann nicht gelesen werden.', en: 'Without a model key only the rule check applies; handwriting cannot be read.' },
  lang_hint: { de: 'Oberfläche und Begründungen der KI in dieser Sprache.', en: 'Interface and the AI’s reasoning in this language.' },
  page: { de: 'Seite {n}', en: 'Page {n}' },
  pages: { de: 'Seiten {n}', en: 'Pages {n}' },
  error: { de: 'Das hat leider nicht funktioniert. Bitte versuchen Sie es erneut.', en: 'That did not work. Please try again.' },
}
