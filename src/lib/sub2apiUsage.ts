import { fetchWithSub2ApiAuth } from './sub2apiAuth'

export interface Sub2ApiUsageLog {
  id: number
  created_at: string
  actual_cost: number
}

export interface Sub2ApiUsageListResponse {
  items: Sub2ApiUsageLog[]
  total: number
  page: number
  page_size: number
  pages: number
}

interface Sub2ApiEnvelope<T> {
  code: number
  message: string
  data?: T
  reason?: string
}

const AUTH_API_PREFIX = '/api/v1'

function buildAuthUrl(path: string): string {
  return `${AUTH_API_PREFIX}/${path.replace(/^\/+/, '')}`
}

function parseEnvelopeMessage(payload: unknown): string {
  if (!payload || typeof payload !== 'object') return '请求失败'
  const record = payload as Record<string, unknown>
  if (typeof record.message === 'string' && record.message.trim()) return record.message
  if (typeof record.reason === 'string' && record.reason.trim()) return record.reason
  return '请求失败'
}

async function parseJsonResponse<T>(response: Response): Promise<Sub2ApiEnvelope<T>> {
  try {
    return await response.json() as Sub2ApiEnvelope<T>
  } catch {
    return {
      code: response.status,
      message: response.statusText || '请求失败',
    }
  }
}

export async function listSub2ApiUsage(params: {
  page?: number
  page_size?: number
  sort_by?: 'created_at'
  sort_order?: 'asc' | 'desc'
} = {}): Promise<Sub2ApiUsageListResponse> {
  const search = new URLSearchParams()
  search.set('page', String(params.page ?? 1))
  search.set('page_size', String(params.page_size ?? 20))
  search.set('sort_by', params.sort_by ?? 'created_at')
  search.set('sort_order', params.sort_order ?? 'desc')

  const response = await fetchWithSub2ApiAuth(buildAuthUrl(`usage?${search.toString()}`), {
    cache: 'no-store',
  })
  const payload = await parseJsonResponse<Sub2ApiUsageListResponse>(response)
  if (!response.ok || payload.code !== 0 || !payload.data) {
    throw new Error(parseEnvelopeMessage(payload))
  }
  return payload.data
}
