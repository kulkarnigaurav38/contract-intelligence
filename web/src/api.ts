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
  }[]
}

export type Config = {
  llm_enabled: boolean
  routing: { task: string; model: string; thinking: string; purpose: string }[]
  taxonomy: string[]
  embedding: { model: string; dim: number }
}

export type ChatResult = {
  answer: string
  mode: string
  citations: (Passage & { quote: string })[]
  passages: Passage[]
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
  audits: () => request<Audit[]>('/api/audits'),
  audit: (id: number) => request<Audit & { findings: Finding[] }>(`/api/audits/${id}`),
  createAudit: (kind: string, params: Record<string, string>) =>
    request<Audit>('/api/audits', json({ kind, params })),
  findings: (review_status?: string) =>
    request<Finding[]>(`/api/findings${review_status ? `?review_status=${review_status}` : ''}`),
  review: (id: number, decision: string, note: string) =>
    request<Finding>(`/api/findings/${id}/review`, json({ decision, note, actor: 'legal.reviewer' })),
  push: (id: number) => request<Finding>(`/api/findings/${id}/push-to-storage`, { method: 'POST' }),
  auditLog: () => request<LogEntry[]>('/api/audit-log'),
  chat: (question: string) => request<ChatResult>('/api/chat', json({ question })),
  runEval: () => request<Record<string, unknown>>('/api/eval/run', { method: 'POST' }),
}

export const label = (s: string) => s.replace(/_/g, ' ')
