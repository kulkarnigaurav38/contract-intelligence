export type PageSummary = { page: number; method: string; confidence: number; note: string }

export type ReportClause = {
  clause_type: string
  required: boolean // the corporate guideline demands this clause for the contract type
  verified: boolean // the model read the whole contract to confirm the rule result
  status: 'present' | 'missing' | 'partial'
  page: number | null
  quote: string
  reason?: string
}

export type ReportSummary = {
  missing: number
  partial: number
  old_names: number
  old_name_pages: number[]
  unreadable: boolean
  open: number
  accepted: number
  dismissed: number
  auto: number
}

/** Pixel size of the rendered page PNG (for the aspect ratio) and whether the page has real text. */
export type ReportPage = { page: number; width: number; height: number; text_layer: boolean }

export type ItemReview = {
  status: 'open' | 'accepted' | 'dismissed' | 'auto'
  note: string
  edited_text: string
  carried_over: boolean // the same file was checked before and the earlier decision was reused
  decided_at: string | null
  actor: string
}

export type BBox = [number, number, number, number] // normalized 0..1 of the page image: x0, y0, x1, y1

/** One finding = one marker on a page. */
export type Item = {
  key: string // 'clause:liability_cap' | 'name:2:arvato-financial-solutions'
  kind: 'missing_clause' | 'partial_clause' | 'old_name'
  clause_type?: string
  name?: string
  page: number // 1-based
  anchor: { kind: 'highlight' | 'insert'; bbox: BBox | null } // null = page-level (no precise position, e.g. handwriting)
  quote: string
  reason: string // AI cross-check reasoning (may be '')
  suggestion_title: string
  suggestion: string
  verified: boolean
  editable: boolean // page has a text layer and the doc is a digital pdf → edited_text can be applied
  class_key: string
  review: ItemReview
  policy: { kind: 'required' | 'spot_check' | 'auto' | 'carried_over'; review_rate: number }
}

export type Decision = 'accepted' | 'dismissed' | 'reopen'

/** The per-contract result, built automatically after reading (api/app/report.py). Only `status` is there before the check ran. */
export type Report = {
  status: 'pending' | 'running' | 'ready' | 'failed'
  error?: string
  generated_at?: string
  language?: string
  cross_checked?: boolean
  degraded?: boolean // the AI cross-check could not run (quota, outage) and is repeated at the next restart
  editable?: boolean // digital PDF: suggestions can be applied into a corrected copy
  pages?: ReportPage[]
  items?: Item[]
  clauses?: ReportClause[]
  historical_names?: string[]
  old_names_reason?: string
  summary?: ReportSummary
  storage?: { external_id: string; sha256: string; at: string } | null
}

export type Doc = {
  id: number
  filename: string
  title: string
  contract_type: string
  language: string
  input_type: string
  pages: number
  status: string // processing | ready | failed
  error: string
  ingest_summary: PageSummary[]
  injection_suspected: boolean
  injection_note: string
  warnings: string[]
  sha256: string
  created_at: string
  report_status: Report['status']
  report_summary: ReportSummary | null
}

export type DocDetail = Doc & {
  clauses: number // clauses recognised while reading
  entities: number // company-name hits while reading
  report: Report
  page_rows: { page_no: number; method: string; confidence: number; text: string }[]
  clause_rows: { id: number; ordinal: number; page_no: number; heading: string; clause_type: string; confidence: number; method: string; rule_label: string; llm_label: string; text: string }[]
  entity_rows: { name: string; kind: string; page_no: number; historical: boolean; context: string; method: string; confidence: number }[]
}

/** Node and relationship counts of the graph, and how many guideline gaps the pattern finds (GET /api/graph/stats). */
export type GraphStats = { nodes: Record<string, number>; relationships: Record<string, number>; gaps: number }

export type Config = {
  llm_enabled: boolean
  provider: string // gemini | foundry | none
  ocr_provider: string // tesseract | document_intelligence
  document_source: string // local | sharepoint
  routing: { task: string; model: string; thinking: string; purpose: string }[]
  taxonomy: string[]
  embedding: { model: string; dim: number }
}

/** One contract flagged by a cross-contract audit (POST /api/audits). */
export type Finding = {
  id: number
  document_id: number
  verdict: string // confirmed | partial | unverified | not_cross_checked | dismissed
  evidence: { page: number; quote: string }[]
  reasoning: string
}

export type Audit = {
  id: number
  kind: string // missing_clause | missing_passage | rename
  params: Record<string, string>
  status: string // running | done | failed
  summary: { scope?: number; findings?: Record<string, number>; error?: string }
  created_at: string
  findings: number | Finding[] // count in the list, rows in the detail
}

/** One step of the processing pipeline (GET /api/pipeline, generated from the backend code). */
export type Stage = {
  id: string
  phase: 'read' | 'check' | 'decide'
  title: { de: string; en: string }
  text: { de: string; en: string }
  tools: string
  task: string | null
  model: string | null
  thinking: string | null // the model's thinking level for this task
  module: string // where it runs
  detail: { de: string; en: string } // the technical layer: rules and thresholds
  produces: { de: string; en: string }
}

async function request<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, init)
  if (!res.ok) throw new Error(`${res.status} ${await res.text()}`)
  return res.json()
}

const json = (body: unknown): RequestInit => ({ method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })

export const api = {
  config: () => request<Config>('/api/config'),
  pipeline: () => request<{ stages: Stage[] }>('/api/pipeline'),
  graphStats: () => request<GraphStats>('/api/graph/stats'),
  documents: () => request<Doc[]>('/api/documents'),
  document: (id: number) => request<DocDetail>(`/api/documents/${id}`),
  upload: (files: File[], language: string) => {
    const body = new FormData()
    for (const f of files) body.append('files', f)
    return request<{ queued: number }>(`/api/documents/upload?language=${language}`, { method: 'POST', body })
  },
  ingestSamples: (language: string) => request<{ queued: number }>(`/api/documents/ingest-samples?language=${language}`, { method: 'POST' }),
  samples: () => request<{ batch: number; file: string }[]>('/api/samples'),
  ingestSample: (file: string, language: string) =>
    request<{ queued: number }>(`/api/documents/ingest-samples?file=${encodeURIComponent(file)}&language=${language}`, { method: 'POST' }),
  sync: () => request<{ source: string; queued: boolean }>('/api/documents/sync', { method: 'POST' }),
  recheck: (id: number, language: string) => request<{ queued: number }>(`/api/documents/${id}/report?language=${language}`, { method: 'POST' }),
  retryDocument: (id: number) => request<{ queued: number }>(`/api/documents/${id}/retry`, { method: 'POST' }),
  deleteDocument: (id: number) => request<{ deleted: number }>(`/api/documents/${id}`, { method: 'DELETE' }),
  decide: (id: number, key: string, body: { decision: Decision; note?: string; edited_text?: string }) =>
    request<Report>(`/api/documents/${id}/items/${encodeURIComponent(key)}/decide`, json(body)),
  fileToStorage: (id: number) => request<{ external_id: string; duplicate: boolean }>(`/api/documents/${id}/file-to-storage`, { method: 'POST' }),
  createAudit: (kind: string, params: Record<string, string>) => request<Audit>('/api/audits', json({ kind, params })),
  audit: (id: number) => request<Audit & { findings: Finding[] }>(`/api/audits/${id}`),
}
