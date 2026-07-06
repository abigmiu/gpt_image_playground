import { fetchWithSub2ApiAuth } from './sub2apiAuth'

export interface Sub2ApiRedeemResult {
  message: string
  type: string
  value: number
  new_balance?: number
  new_concurrency?: number
  group_id?: number
  validity_days?: number
  group?: {
    id: number
    name: string
  }
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

export function parseRedeemCodesInput(input: string) {
  return input
    .split(/\r?\n/)
    .map((item) => item.trim())
    .filter(Boolean)
}

export async function redeemSub2ApiCode(code: string): Promise<Sub2ApiRedeemResult> {
  const normalizedCode = code.trim()
  if (!normalizedCode) throw new Error('请输入兑换码')

  const response = await fetchWithSub2ApiAuth(buildAuthUrl('redeem'), {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    cache: 'no-store',
    body: JSON.stringify({
      code: normalizedCode,
    }),
  })
  const payload = await parseJsonResponse<Sub2ApiRedeemResult>(response)
  if (!response.ok || payload.code !== 0 || !payload.data) {
    throw new Error(parseEnvelopeMessage(payload))
  }
  return payload.data
}
