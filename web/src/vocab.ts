/** The words the legal team sees. Backend enum values map here; nothing technical leaks by default. */

export type L = { de: string; en: string }

export const AUDIT_KINDS: Record<string, L> = {
  missing_clause: { de: 'Fehlende Klausel', en: 'Missing clause' },
  missing_passage: { de: 'Fehlende Regelung', en: 'Missing passage' },
  rename: { de: 'Alter Firmenname', en: 'Old company name' },
}

export const AUDIT_QUESTIONS: Record<string, L> = {
  missing_clause: { de: 'Welchen Verträgen fehlt eine Klausel?', en: 'Which contracts lack a clause?' },
  missing_passage: { de: 'Welche Verträge enthalten eine bestimmte Regelung nicht?', en: 'Which contracts do not contain a given passage?' },
  rename: { de: 'Wo steht noch ein alter Firmenname?', en: 'Where does an old company name still appear?' },
}

/** Machine verdicts name their author, so they can never be read as human sign-off. */
export const VERDICTS: Record<string, L> = {
  confirmed: { de: 'KI-bestätigt', en: 'AI-confirmed' },
  unverified: { de: 'Nicht gegengeprüft', en: 'Not cross-checked' },
  dismissed: { de: 'Entkräftet', en: 'Cleared' },
  unreadable: { de: 'Nicht lesbar', en: 'Unreadable' },
}

export const VERDICT_HELP: Record<string, L> = {
  confirmed: { de: 'Regelprüfung und KI-Gegenprüfung im Volltext stimmen überein.', en: 'Rule check and AI full-text cross-check agree.' },
  unverified: { de: 'Regelbasiert gefunden; eine KI-Gegenprüfung war nicht verfügbar. Bitte prüfen Sie den Beleg selbst.', en: 'Found by the rule check; no AI cross-check was available. Please verify the evidence yourself.' },
  dismissed: { de: 'Die KI-Gegenprüfung hat im Volltext eine passende Regelung gefunden. Kein Handlungsbedarf.', en: 'The AI cross-check found a matching provision in the full text. No action needed.' },
  unreadable: { de: 'Der Scan konnte nicht zuverlässig gelesen werden. Dieser Vertrag wurde nicht geprüft und gilt nicht als unauffällig. Bitte prüfen Sie das Original.', en: 'The scan could not be read reliably. This contract was not checked and does not count as fine. Please check the original.' },
}

export const REVIEW_STATUS: Record<string, L> = {
  pending: { de: 'Entscheidung offen', en: 'Decision pending' },
  approved: { de: 'Freigegeben', en: 'Approved' },
  rejected: { de: 'Abgelehnt', en: 'Rejected' },
  filed: { de: 'Abgelegt', en: 'Filed' },
}

export const DOC_STATUS: Record<string, L> = {
  queued: { de: 'Wartet', en: 'Waiting' },
  processing: { de: 'Wird gelesen …', en: 'Reading …' },
  ready: { de: 'Bereit', en: 'Ready' },
  failed: { de: 'Fehlgeschlagen', en: 'Failed' },
}

export const AUDIT_STATUS: Record<string, L> = {
  running: { de: 'Läuft …', en: 'Running …' },
  done: { de: 'Abgeschlossen', en: 'Done' },
  failed: { de: 'Fehlgeschlagen', en: 'Failed' },
}

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
  preamble: { de: 'Präambel', en: 'Preamble' },
  scope: { de: 'Leistungsumfang', en: 'Scope' },
  notices: { de: 'Mitteilungen', en: 'Notices' },
  signature: { de: 'Unterschriften', en: 'Signatures' },
  other: { de: 'Sonstiges', en: 'Other' },
}

/** Short forms for narrow matrix headers. */
export const CLAUSE_SHORT: Record<string, L> = {
  term_termination: { de: 'Laufzeit', en: 'Term' },
  fees_payment: { de: 'Vergütung', en: 'Fees' },
  liability_cap: { de: 'Haftung', en: 'Liability' },
  confidentiality: { de: 'Vertraulichkeit', en: 'Confidentiality' },
  data_protection: { de: 'Datenschutz', en: 'Data protection' },
  governing_law: { de: 'Recht', en: 'Law' },
  dispute_resolution: { de: 'Gerichtsstand', en: 'Disputes' },
  force_majeure: { de: 'Höhere Gewalt', en: 'Force majeure' },
  assignment: { de: 'Abtretung', en: 'Assignment' },
  audit_rights: { de: 'Audit', en: 'Audit' },
  anti_corruption: { de: 'Antikorruption', en: 'Anti-corruption' },
  change_of_control: { de: 'Kontrollwechsel', en: 'Control change' },
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
export const CONTRACT_TYPE_KEYS = ['merchant_agreement', 'dpa', 'nda', 'vendor_agreement', 'receivables_purchase', 'collection_services', 'saas_agreement', 'amendment']

export const INPUT_TYPES: Record<string, L> = {
  digital_pdf: { de: 'Digitales PDF', en: 'Digital PDF' },
  scanned_pdf: { de: 'Scan', en: 'Scan' },
  mixed_pdf: { de: 'PDF mit gescannten Seiten', en: 'PDF with scanned pages' },
  image: { de: 'Foto', en: 'Photo' },
  image_handwritten: { de: 'Handschrift (Foto)', en: 'Handwritten (photo)' },
  unknown: { de: 'Unbekannt', en: 'Unknown' },
}

export const LANGUAGES: Record<string, L> = {
  de: { de: 'Deutsch', en: 'German' },
  en: { de: 'Englisch', en: 'English' },
}

/** Technical switch only. */
export const PAGE_METHODS: Record<string, L> = {
  text_layer: { de: 'Text direkt gelesen', en: 'Text read directly' },
  tesseract: { de: 'Texterkennung (OCR)', en: 'Text recognition (OCR)' },
  vision_llm: { de: 'KI-Bilderkennung', en: 'AI image reading' },
}

export const LEGIBILITY: Record<string, L> = {
  good: { de: 'Gut lesbar', en: 'Good' },
  partial: { de: 'Schwer lesbar', en: 'Hard to read' },
  unreadable: { de: 'Nicht lesbar', en: 'Unreadable' },
  reading: { de: 'Wird gelesen …', en: 'Reading …' },
}

export const RELIABILITY: Record<string, L> = {
  high: { de: 'hoch', en: 'high' },
  medium: { de: 'mittel', en: 'medium' },
  low: { de: 'gering', en: 'low' },
}

export const CLAUSE_METHODS: Record<string, L> = {
  rules: { de: 'Regelprüfung', en: 'Rule check' },
  'llm+rules agree': { de: 'Regelprüfung und KI einig', en: 'Rules and AI agree' },
  'llm (rules disagree)': { de: 'KI-Einstufung (Regelprüfung abweichend)', en: 'AI label (rules disagree)' },
}

export const ENTITY_KINDS: Record<string, L> = {
  our_entity_old: { de: 'Alter Riverty-Name', en: 'Old Riverty name' },
  our_entity_current: { de: 'Aktueller Riverty-Name', en: 'Current Riverty name' },
  counterparty: { de: 'Vertragspartner', en: 'Counterparty' },
  third_party: { de: 'Anderes Unternehmen (nicht Riverty)', en: 'Unrelated company' },
  other: { de: 'Sonstige', en: 'Other' },
}

export const ENTITY_METHODS: Record<string, L> = {
  rules: { de: 'Namensregister (exakt)', en: 'Name registry (exact)' },
  'rules-fuzzy': { de: 'Namensregister (Schreibvariante, OCR-tolerant)', en: 'Name registry (near match, OCR-tolerant)' },
  llm: { de: 'KI-Extraktion', en: 'AI extraction' },
}

export const LOG_ACTIONS: Record<string, L> = {
  ingest: { de: 'hat „{target}“ eingelesen', en: 'read in “{target}”' },
  'audit.create': { de: 'hat eine Prüfung gestartet: {target}', en: 'started a check: {target}' },
  'finding.approved': { de: 'hat Fund Nr. {id} freigegeben', en: 'approved finding no. {id}' },
  'finding.rejected': { de: 'hat Fund Nr. {id} abgelehnt', en: 'rejected finding no. {id}' },
  'finding.pushed_to_storage': { de: 'hat Fund Nr. {id} in der Vertragsablage abgelegt', en: 'filed finding no. {id} in contract storage' },
}

export const ROUTING_TASKS: Record<string, L> = {
  ocr_vision: { de: 'Scans und Handschrift lesen', en: 'Read scans and handwriting' },
  classify: { de: 'Klauseln einordnen', en: 'Label clauses' },
  extract: { de: 'Parteien und Vertragsart erkennen', en: 'Extract parties and contract type' },
  screen: { de: 'Auf verdächtigen Text prüfen', en: 'Screen for suspicious text' },
  verify: { de: 'Funde gegenprüfen', en: 'Cross-check findings' },
  answer: { de: 'Fragen beantworten', en: 'Answer questions' },
  embeddings: { de: 'Ähnlichkeitssuche', en: 'Similarity search' },
}

export const THINKING: Record<string, L> = {
  minimal: { de: 'minimal', en: 'minimal' },
  low: { de: 'gering', en: 'low' },
  medium: { de: 'mittel', en: 'medium' },
  high: { de: 'hoch', en: 'high' },
}

/** Model IDs are technical; the tier word is what a lawyer sees. Derived by substring from /api/config. */
export function modelTier(id: string): L {
  if (id.includes('embedding')) return { de: 'Einbettungen', en: 'Embeddings' }
  if (id.includes('lite')) return { de: 'Leichtes Modell', en: 'Light model' }
  if (id.includes('pro')) return { de: 'Großes Modell', en: 'Large model' }
  if (id.includes('flash')) return { de: 'Schnelles Modell', en: 'Fast model' }
  return { de: 'Modell', en: 'Model' }
}

/** Shared UI strings used by more than one page. */
export const COMMON = {
  nav_home: { de: 'Start', en: 'Home' },
  nav_contracts: { de: 'Verträge', en: 'Contracts' },
  nav_clauses: { de: 'Klauseln', en: 'Clauses' },
  nav_checks: { de: 'Prüfungen', en: 'Checks' },
  nav_approvals: { de: 'Freigabe', en: 'Approvals' },
  nav_ask: { de: 'Fragen', en: 'Ask' },
  nav_tech: { de: 'Technik', en: 'Technical' },
  nav_quality: { de: 'Qualitätsmessung', en: 'Quality measurement' },
  nav_models: { de: 'Modelle', en: 'Models' },
  tech_switch: { de: 'Technische Details anzeigen', en: 'Show technical details' },
  ai_on: { de: 'KI-Gegenprüfung aktiv', en: 'AI cross-check on' },
  ai_off: { de: 'Ohne KI-Gegenprüfung', en: 'Without AI cross-check' },
  ai_off_hint: { de: 'Funde werden regelbasiert erzeugt und als „nicht gegengeprüft“ markiert. Handschrift kann nicht gelesen werden.', en: 'Findings are rule-based and marked “not cross-checked”. Handwriting cannot be read.' },
  lang_hint: { de: 'Bedienoberfläche und KI-Texte (Antworten, Gegenprüfung) in dieser Sprache.', en: 'Interface and AI-written text (answers, cross-check) in this language.' },
  start_check: { de: 'Prüfung starten', en: 'Start check' },
  check: { de: 'Prüfen', en: 'Check' },
  approve: { de: 'Freigeben', en: 'Approve' },
  reject: { de: 'Ablehnen', en: 'Reject' },
  cancel: { de: 'Abbrechen', en: 'Cancel' },
  file: { de: 'In der Vertragsablage ablegen', en: 'File in contract storage' },
  file_hint: { de: 'Ein zweiter Klick legt keine Kopie an.', en: 'Filing twice never creates a second copy.' },
  open_contract: { de: 'Vertrag öffnen', en: 'Open contract' },
  page: { de: 'Seite {n}', en: 'Page {n}' },
  evidence: { de: 'Beleg', en: 'Evidence' },
  evidence_rename: { de: 'Fundstelle des alten Namens', en: 'Where the old name appears' },
  evidence_nearest: { de: 'Ähnlichste Stelle – ersetzt die gesuchte Klausel nicht', en: 'Closest passage – does not replace the clause looked for' },
  reasoning: { de: 'KI-Gegenprüfung im Volltext', en: 'AI cross-check, full text' },
  how_found: { de: 'So kam der Fund zustande', en: 'How this was found' },
  reliability: { de: 'Verlässlichkeit', en: 'Confidence' },
  legibility: { de: 'Lesbarkeit', en: 'Legibility' },
  finding: { de: 'Fund', en: 'Finding' },
  contract: { de: 'Vertrag', en: 'Contract' },
  contract_type: { de: 'Vertragsart', en: 'Contract type' },
  all_types: { de: 'Alle Vertragsarten', en: 'All contract types' },
  note_optional: { de: 'Anmerkung (optional)', en: 'Note (optional)' },
  details: { de: 'Details', en: 'Details' },
  no_quote: { de: 'Kein Zitat möglich – die Seite konnte nicht zuverlässig gelesen werden.', en: 'No quote possible – the page could not be read reliably.' },
  checksum: { de: 'Prüfsumme', en: 'Checksum' },
  checksum_hint: { de: 'Eindeutiger Fingerabdruck der Datei.', en: 'Unique fingerprint of the file.' },
  suspicious: { de: 'Verdächtiger Text im Dokument', en: 'Suspicious text in document' },
  suspicious_help: { de: 'Dieses Dokument enthält Text, der sich an automatische Prüfsysteme richtet. Solche Anweisungen werden ignoriert. Bitte prüfen Sie dieses Dokument mit besonderer Sorgfalt.', en: 'This document contains text addressed to automated review systems. Such instructions are ignored. Please review this document with particular care.' },
  found_via_matrix: { de: 'Über die Klausel-Übersicht gefunden', en: 'Found via the clause overview' },
  found_via_search: { de: 'Über die Ähnlichkeitssuche gefunden', en: 'Found via similarity search' },
  found_via_registry: { de: 'Über das Namensregister gefunden', en: 'Found via the name registry' },
  found_via_ocr: { de: 'Seiten konnten nicht zuverlässig gelesen werden', en: 'Pages could not be read reliably' },
  verified_yes: { de: 'KI-gegengeprüft', en: 'AI cross-checked' },
  verified_no: { de: 'Ohne KI-Gegenprüfung', en: 'Without AI cross-check' },
  show_tech: { de: 'Technische Details einblenden', en: 'Show technical details' },
  sentence_missing_clause: { de: 'Keine Klausel „{x}“ gefunden', en: 'No “{x}” clause found' },
  sentence_missing_passage: { de: 'Regelung nicht gefunden: „{x}“', en: 'Passage not found: “{x}”' },
  sentence_rename: { de: 'Alter Firmenname wird noch als Vertragspartei genannt', en: 'Old company name still named as a contracting party' },
  sentence_unreadable: { de: 'Nicht lesbar – bitte das Original prüfen', en: 'Unreadable – please check the original' },
  approve_title: { de: 'Fund freigeben', en: 'Approve finding' },
  approve_text: { de: 'Sie geben diesen Fund frei, weil er nach Ihrer Prüfung zutrifft. Ihre Entscheidung wird unter dem Kürzel „legal.reviewer“ mit Zeitpunkt und Prüfsumme des Dokuments protokolliert und kann nicht gelöscht werden.', en: 'You approve this finding because, on your review, it is correct. Your decision is logged under the reviewer “legal.reviewer” with time and document checksum and cannot be deleted.' },
  reject_title: { de: 'Fund ablehnen', en: 'Reject finding' },
  reject_text: { de: 'Der Fund wird als nicht zutreffend markiert und nicht abgelegt. Eine kurze Begründung hilft später beim Nachvollziehen.', en: 'The finding is marked as not applicable and will not be filed. A short reason helps others understand later.' },
  note_example: { de: 'z. B. „Mit dem unterschriebenen Original abgeglichen.“', en: 'e.g. “Checked against the signed original.”' },
  approved_toast: { de: 'Freigegeben. Der Eintrag steht im Protokoll.', en: 'Approved. The entry is in the activity log.' },
  rejected_toast: { de: 'Abgelehnt. Der Eintrag steht im Protokoll.', en: 'Rejected. The entry is in the activity log.' },
  filed_toast: { de: 'Abgelegt unter {ref}. Ein erneutes Ablegen erzeugt keine Kopie.', en: 'Filed under {ref}. Filing again creates no copy.' },
  file_now: { de: 'Jetzt ablegen', en: 'File now' },
  error: { de: 'Das hat leider nicht funktioniert. Bitte versuchen Sie es erneut.', en: 'That did not work. Please try again.' },
  error_detail: { de: 'Fehlermeldung', en: 'Error message' },
}
