import { fetchWithSub2ApiAuth } from './sub2apiAuth'

interface Envelope<T> {
  code?: number
  message?: string
  data?: T
}

interface UploadHeader {
  name: string
  value: string
}

interface UploadSession {
  upload_id: string
  object_key: string
  file_url: string
  content_type: string
  upload_target: {
    method: string
    upload_url: string
    headers?: UploadHeader[]
  }
}

function getEnvelopeMessage(payload: unknown): string {
  if (!payload || typeof payload !== 'object') return '请求失败'
  const message = (payload as Record<string, unknown>).message
  return typeof message === 'string' && message.trim() ? message : '请求失败'
}

async function parseEnvelope<T>(response: Response): Promise<Envelope<T>> {
  try {
    return await response.json() as Envelope<T>
  } catch {
    return { message: response.statusText || '请求失败' }
  }
}

export async function uploadPlaygroundImageFile(file: File, options?: { onUploading?: () => void }): Promise<string> {
  const presignResponse = await fetchWithSub2ApiAuth('/api/v1/playground/uploads/presign', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    cache: 'no-store',
    body: JSON.stringify({
      file_name: file.name,
      content_type: file.type || 'application/octet-stream',
      size: file.size,
    }),
  })
  const presignPayload = await parseEnvelope<UploadSession>(presignResponse)
  if (!presignResponse.ok || !presignPayload.data) {
    throw new Error(getEnvelopeMessage(presignPayload))
  }

  const uploadHeaders = new Headers()
  for (const header of presignPayload.data.upload_target.headers ?? []) {
    if (!header.name) continue
    uploadHeaders.set(header.name, header.value)
  }
  if (!uploadHeaders.has('Content-Type')) {
    uploadHeaders.set('Content-Type', file.type || presignPayload.data.content_type || 'application/octet-stream')
  }

  options?.onUploading?.()
  const uploadResponse = await fetch(presignPayload.data.upload_target.upload_url, {
    method: presignPayload.data.upload_target.method || 'PUT',
    headers: uploadHeaders,
    body: file,
  })
  if (!uploadResponse.ok) {
    throw new Error(`上传失败 (${uploadResponse.status})`)
  }

  const completeResponse = await fetchWithSub2ApiAuth('/api/v1/playground/uploads/complete', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    cache: 'no-store',
    body: JSON.stringify({
      upload_id: presignPayload.data.upload_id,
    }),
  })
  const completePayload = await parseEnvelope<{ url?: string }>(completeResponse)
  const fileUrl = completePayload.data?.url || presignPayload.data.file_url
  if (!completeResponse.ok || !fileUrl) {
    throw new Error(getEnvelopeMessage(completePayload))
  }
  return fileUrl
}

export async function canAccessPlaygroundImageUrl(url: string, timeoutMs = 8000): Promise<boolean> {
  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs)
  try {
    const response = await fetch(url, {
      method: 'GET',
      mode: 'no-cors',
      cache: 'no-store',
      signal: controller.signal,
    })
    return response.type === 'opaque' || response.ok
  } catch {
    return false
  } finally {
    clearTimeout(timeoutId)
  }
}
