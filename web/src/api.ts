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

export type ReportName = { name: string; page: number; quote: string; fuzzy: boolean }

export type ReportSummary = { missing: number; partial: number; old_names: number; old_name_pages: number[]; unreadable: boolean }

/** The per-contract result, built automatically after reading (api/app/report.py). */
export type Report = {
  status: 'pending' | 'running' | 'ready' | 'failed'
  error?: string
  generated_at?: string
  cross_checked?: boolean
  clauses?: ReportClause[]
  old_names?: ReportName[]
  old_names_verified?: boolean
  old_names_reason?: string
  historical_names?: string[]
  summary?: ReportSummary
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
  report: Report
  page_rows: { page_no: number; method: string; confidence: number; text: string }[]
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

async function request<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, init)
  if (!res.ok) throw new Error(`${res.status} ${await res.text()}`)
  return res.json()
}

export const api = {
  config: () => request<Config>('/api/config'),
  documents: () => request<Doc[]>('/api/documents'),
  document: (id: number) => request<DocDetail>(`/api/documents/${id}`),
  upload: (files: File[], language: string) => {
    const body = new FormData()
    for (const f of files) body.append('files', f)
    return request<{ queued: number }>(`/api/documents/upload?language=${language}`, { method: 'POST', body })
  },
  ingestSamples: (language: string) => request<{ queued: number }>(`/api/documents/ingest-samples?language=${language}`, { method: 'POST' }),
  recheck: (id: number, language: string) => request<{ queued: number }>(`/api/documents/${id}/report?language=${language}`, { method: 'POST' }),
  retryDocument: (id: number) => request<{ queued: number }>(`/api/documents/${id}/retry`, { method: 'POST' }),
  deleteDocument: (id: number) => request<{ deleted: number }>(`/api/documents/${id}`, { method: 'DELETE' }),
}
