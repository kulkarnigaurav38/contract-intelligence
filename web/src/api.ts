export type PageSummary = { page: number; method: string; confidence: number; note: string }

export type Doc = {
  id: number
  filename: string
  title: string
  contract_type: string
  language: string
  input_type: string
  pages: number
  status: string
  error: string
  ingest_summary: PageSummary[]
  injection_suspected: boolean
  injection_note: string
  sha256: string
  clauses: number
  entities: number
}

export type Clause = {
  id: number
  ordinal: number
  page_no: number
  heading: string
  clause_type: string
  confidence: number
  method: string
  rule_label: string
  llm_label: string
  text: string
}

export type Entity = {
  name: string
  kind: string
  page_no: number
  historical: boolean
  context: string
  method: string
  confidence: number
}

export type DocDetail = Doc & {
  page_rows: { page_no: number; method: string; confidence: number; text: string }[]
  clause_rows: Clause[]
  entity_rows: Entity[]
}

export type Evidence = { page: number; quote: string }

export type Finding = {
  id: number
  audit_id: number
  document_id: number
  filename: string
  title: string
  verdict: string
  confidence: number
  method_chain: string[]
  evidence: Evidence[]
  reasoning: string
  review_status: string
  review_note: string
  reviewed_at: string | null
  storage_ref: string
  audit_kind: string
  audit_params: Record<string, string>
  class_key: string
  policy: Policy
}

/** Why a person did or did not have to look at a finding (see api/app/policy.py). */
export type Policy =
  | { kind: 'required'; reason: 'not_verified' | 'learning'; review_rate: number }
  | { kind: 'spot_check'; review_rate: number }
  | { kind: 'auto'; review_rate: number }
  | { kind: 'carried_over'; decision: 'approved' | 'rejected'; note: string; decided_at: string | null; finding_id: number }
  | Record<string, never>

export type PolicyClass = {
  class_key: string
  kind: string
  params: Record<string, string>
  decisions: number
  approved: number
  rejected: number
  since_rejection: number
  agreement: number | null
  review_rate: number
  automation_active: boolean
  findings: Record<string, number>
}

export type PolicyReport = {
  classes: PolicyClass[]
  rules: { min_decisions: number; min_agreement: number; tiers: [number, number][] }
}

export type Audit = {
  id: number
  kind: string
  params: Record<string, string>
  status: string
  summary: Record<string, number | string | boolean | Record<string, number>>
  created_at: string
  findings: number | Finding[]
}

export type Coverage = {
  taxonomy: string[]
  labels: Record<string, string>
  rows: {
    document_id: number
    filename: string
    title: string
    contract_type: string
    language: string
    cells: Record<string, { confidence: number; method: string; page: number; heading: string }>
    required: string[] // clause types the corporate guideline demands for this contract type
  }[]
}

export type Config = {
  llm_enabled: boolean
  provider: string // gemini | foundry | none
  ocr_provider: string // tesseract | document_intelligence
  document_source: string // local | sharepoint
  routing: { task: string; model: string; thinking: string; purpose: string }[]
  taxonomy: string[]
  embedding: { model: string; dim: number }
}

export type ChatResult = {
  answer: string
  mode: string
  citations: (Passage & { quote: string })[]
  passages: Passage[]
  scope: { document_id: number; title: string; counterparty: string }[] // contracts the question names
}

export type Passage = {
  index: number
  document_id: number
  filename: string
  title: string
  page: number
  clause_type: string
  heading: string
  text: string
  score: number
}

export type LogEntry = {
  id: number
  ts: string
  actor: string
  action: string
  target_type: string
  target_id: number
  details: Record<string, unknown>
}

async function request<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, init)
  if (!res.ok) throw new Error(`${res.status} ${await res.text()}`)
  return res.json()
}

const json = (body: unknown): RequestInit => ({
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(body),
})

export const api = {
  config: () => request<Config>('/api/config'),
  documents: () => request<Doc[]>('/api/documents'),
  document: (id: number) => request<DocDetail>(`/api/documents/${id}`),
  ingestSamples: () => request<{ queued: number }>('/api/documents/ingest-samples', { method: 'POST' }),
  upload: (file: File) => {
    const body = new FormData()
    body.append('file', file)
    return request<{ queued: number }>('/api/documents/upload', { method: 'POST', body })
  },
  coverage: () => request<Coverage>('/api/coverage'),
  guidelines: () => request<Record<string, string[]>>('/api/guidelines'),
  guidelineAudits: (contract_type: string, language: string) =>
    request<{ audits: number[] }>(`/api/audits/guideline?contract_type=${encodeURIComponent(contract_type)}&language=${language}`, { method: 'POST' }),
  sync: () => request<{ source: string; queued: boolean }>('/api/documents/sync', { method: 'POST' }),
  audits: () => request<Audit[]>('/api/audits'),
  audit: (id: number) => request<Audit & { findings: Finding[] }>(`/api/audits/${id}`),
  createAudit: (kind: string, params: Record<string, string>, language: string) =>
    request<Audit>('/api/audits', json({ kind, params: { ...params, language } })),
  findings: (review_status?: string) =>
    request<Finding[]>(`/api/findings${review_status ? `?review_status=${review_status}` : ''}`),
  review: (id: number, decision: string, note: string) =>
    request<Finding>(`/api/findings/${id}/review`, json({ decision, note, actor: 'legal.reviewer' })),
  push: (id: number) => request<Finding>(`/api/findings/${id}/push-to-storage`, { method: 'POST' }),
  auditLog: () => request<LogEntry[]>('/api/audit-log'),
  policy: () => request<PolicyReport>('/api/policy'),
  chat: (question: string, language: string) => request<ChatResult>('/api/chat', json({ question, language })),
  runEval: () => request<Record<string, unknown>>('/api/eval/run', { method: 'POST' }),
}

