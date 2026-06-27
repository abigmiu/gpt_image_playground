import { fetchWithSub2ApiAuth } from './sub2apiAuth'

export interface Sub2ApiAnnouncement {
  id: number
  title: string
  content: string
  notify_mode?: string
  created_at: string
  read_at?: string
}

interface Sub2ApiEnvelope<T> {
  code: number
  message: string
  data?: T
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

export async function listSub2ApiAnnouncements(unreadOnly = false): Promise<Sub2ApiAnnouncement[]> {
  const params = unreadOnly ? '?unread_only=1' : ''
  const response = await fetchWithSub2ApiAuth(`/api/v1/announcements${params}`, {
    cache: 'no-store',
  })
  const payload = await parseJsonResponse<Sub2ApiAnnouncement[]>(response)
  if (!response.ok || payload.code !== 0 || !payload.data) {
    throw new Error(parseEnvelopeMessage(payload))
  }
  return payload.data
}

export async function markSub2ApiAnnouncementRead(id: number) {
  const response = await fetchWithSub2ApiAuth(`/api/v1/announcements/${id}/read`, {
    method: 'POST',
    cache: 'no-store',
  })
  const payload = await parseJsonResponse<{ message: string }>(response)
  if (!response.ok || payload.code !== 0 || !payload.data) {
    throw new Error(parseEnvelopeMessage(payload))
  }
  return payload.data
}
