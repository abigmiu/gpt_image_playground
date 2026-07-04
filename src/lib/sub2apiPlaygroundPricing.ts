export type Sub2ApiPlaygroundPricingTier = '1K' | '2K' | '4K'

export interface Sub2ApiPlaygroundPricingItem {
  group_id?: number
  group_name?: string
  price?: number | null
}

export type Sub2ApiPlaygroundPricing = Record<Sub2ApiPlaygroundPricingTier, Sub2ApiPlaygroundPricingItem>

interface Sub2ApiEnvelope<T> {
  code: number
  message: string
  data?: T
  reason?: string
}

const PLAYGROUND_PRICING_URL = '/api/v1/playground/pricing'

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

export async function getSub2ApiPlaygroundPricing(): Promise<Sub2ApiPlaygroundPricing> {
  const response = await fetch(PLAYGROUND_PRICING_URL, {
    cache: 'no-store',
  })
  const payload = await parseJsonResponse<Sub2ApiPlaygroundPricing>(response)
  if (!response.ok || payload.code !== 0 || !payload.data) {
    throw new Error(parseEnvelopeMessage(payload))
  }
  return payload.data
}

export function formatSub2ApiPlaygroundPrice(price: number | null | undefined): string {
  if (typeof price !== 'number' || Number.isNaN(price)) return '--'
  return `$${price.toFixed(3).replace(/\.?0+$/, '')}`
}
