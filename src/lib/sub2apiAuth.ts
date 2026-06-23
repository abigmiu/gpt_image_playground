export interface Sub2ApiAuthSession {
  accessToken: string
  refreshToken: string
}

export interface Sub2ApiPublicSettings {
  registration_enabled: boolean
  email_verify_enabled: boolean
  promo_code_enabled: boolean
  invitation_code_enabled: boolean
  turnstile_enabled: boolean
  turnstile_site_key: string
}

interface Sub2ApiEnvelope<T> {
  code: number
  message: string
  data?: T
}

interface Sub2ApiAuthPayload {
  access_token?: string
  refresh_token?: string
  expires_in?: number
  token_type?: string
  user?: unknown
  requires_2fa?: boolean
  temp_token?: string
  user_email_masked?: string
}

interface RefreshTokenResponse {
  access_token: string
  refresh_token: string
}

const STORAGE_KEY = 'sub2api-auth-session'
const AUTH_CHANGE_EVENT = 'sub2api-auth-change'
const AUTH_API_PREFIX = '/api/v1'

let refreshPromise: Promise<Sub2ApiAuthSession | null> | null = null

function emitAuthChange() {
  if (typeof window === 'undefined') return
  window.dispatchEvent(new Event(AUTH_CHANGE_EVENT))
}

function parseEnvelopeMessage(payload: unknown): string {
  if (!payload || typeof payload !== 'object') return '请求失败'
  const record = payload as Record<string, unknown>
  if (typeof record.message === 'string' && record.message.trim()) return record.message
  if (typeof record.reason === 'string' && record.reason.trim()) return record.reason
  return '请求失败'
}

export function getSub2ApiAuthSession(): Sub2ApiAuthSession | null {
  if (typeof window === 'undefined') return null
  const raw = window.localStorage.getItem(STORAGE_KEY)
  if (!raw) return null
  try {
    const parsed = JSON.parse(raw) as Partial<Sub2ApiAuthSession>
    if (!parsed.accessToken || !parsed.refreshToken) return null
    return {
      accessToken: parsed.accessToken,
      refreshToken: parsed.refreshToken,
    }
  } catch {
    return null
  }
}

export function setSub2ApiAuthSession(session: Sub2ApiAuthSession) {
  if (typeof window === 'undefined') return
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(session))
  emitAuthChange()
}

export function clearSub2ApiAuthSession() {
  if (typeof window === 'undefined') return
  window.localStorage.removeItem(STORAGE_KEY)
  emitAuthChange()
}

export function subscribeSub2ApiAuthChange(callback: () => void) {
  if (typeof window === 'undefined') return () => {}
  window.addEventListener(AUTH_CHANGE_EVENT, callback)
  return () => window.removeEventListener(AUTH_CHANGE_EVENT, callback)
}

function buildAuthUrl(path: string): string {
  return `${AUTH_API_PREFIX}/${path.replace(/^\/+/, '')}`
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

async function refreshSub2ApiAuthSession(): Promise<Sub2ApiAuthSession | null> {
  const currentSession = getSub2ApiAuthSession()
  if (!currentSession?.refreshToken) {
    clearSub2ApiAuthSession()
    return null
  }
  if (refreshPromise) return refreshPromise

  refreshPromise = (async () => {
    try {
      const response = await fetch(buildAuthUrl('auth/refresh'), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        cache: 'no-store',
        body: JSON.stringify({
          refresh_token: currentSession.refreshToken,
        }),
      })
      const payload = await parseJsonResponse<RefreshTokenResponse>(response)
      if (!response.ok || payload.code !== 0 || !payload.data?.access_token || !payload.data?.refresh_token) {
        clearSub2ApiAuthSession()
        return null
      }
      const nextSession = {
        accessToken: payload.data.access_token,
        refreshToken: payload.data.refresh_token,
      }
      setSub2ApiAuthSession(nextSession)
      return nextSession
    } catch {
      clearSub2ApiAuthSession()
      return null
    } finally {
      refreshPromise = null
    }
  })()

  return refreshPromise
}

export async function fetchWithSub2ApiAuth(input: RequestInfo | URL, init: RequestInit = {}): Promise<Response> {
  const send = async (session: Sub2ApiAuthSession | null) => {
    const headers = new Headers(init.headers ?? undefined)
    if (session?.accessToken) headers.set('Authorization', `Bearer ${session.accessToken}`)
    return fetch(input, {
      ...init,
      headers,
    })
  }

  let response = await send(getSub2ApiAuthSession())
  if (response.status !== 401) return response

  const refreshedSession = await refreshSub2ApiAuthSession()
  if (!refreshedSession) return response

  response = await send(refreshedSession)
  if (response.status === 401) clearSub2ApiAuthSession()
  return response
}

export async function getSub2ApiPublicSettings(): Promise<Sub2ApiPublicSettings> {
  const response = await fetch(buildAuthUrl('settings/public'), {
    cache: 'no-store',
  })
  const payload = await parseJsonResponse<Sub2ApiPublicSettings>(response)
  if (!response.ok || payload.code !== 0 || !payload.data) {
    throw new Error(parseEnvelopeMessage(payload))
  }
  return payload.data
}

export async function getSub2ApiCurrentUser() {
  const response = await fetchWithSub2ApiAuth(buildAuthUrl('auth/me'), {
    cache: 'no-store',
  })
  const payload = await parseJsonResponse<Record<string, unknown>>(response)
  if (!response.ok || payload.code !== 0 || !payload.data) {
    throw new Error(parseEnvelopeMessage(payload))
  }
  return payload.data
}

export async function loginSub2Api(input: {
  email: string
  password: string
  turnstileToken?: string
}) {
  const response = await fetch(buildAuthUrl('auth/login'), {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    cache: 'no-store',
    body: JSON.stringify({
      email: input.email,
      password: input.password,
      turnstile_token: input.turnstileToken ?? '',
    }),
  })
  const payload = await parseJsonResponse<Sub2ApiAuthPayload>(response)
  if (!response.ok || payload.code !== 0 || !payload.data) {
    throw new Error(parseEnvelopeMessage(payload))
  }
  return payload.data
}

export async function loginSub2Api2FA(input: {
  tempToken: string
  totpCode: string
}) {
  const response = await fetch(buildAuthUrl('auth/login/2fa'), {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    cache: 'no-store',
    body: JSON.stringify({
      temp_token: input.tempToken,
      totp_code: input.totpCode,
    }),
  })
  const payload = await parseJsonResponse<Sub2ApiAuthPayload>(response)
  if (!response.ok || payload.code !== 0 || !payload.data) {
    throw new Error(parseEnvelopeMessage(payload))
  }
  return payload.data
}

export async function registerSub2Api(input: {
  email: string
  password: string
  verifyCode?: string
  invitationCode?: string
  promoCode?: string
  turnstileToken?: string
}) {
  const response = await fetch(buildAuthUrl('auth/register'), {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    cache: 'no-store',
    body: JSON.stringify({
      email: input.email,
      password: input.password,
      verify_code: input.verifyCode ?? '',
      invitation_code: input.invitationCode ?? '',
      promo_code: input.promoCode ?? '',
      turnstile_token: input.turnstileToken ?? '',
    }),
  })
  const payload = await parseJsonResponse<Sub2ApiAuthPayload>(response)
  if (!response.ok || payload.code !== 0 || !payload.data) {
    throw new Error(parseEnvelopeMessage(payload))
  }
  return payload.data
}

export async function sendSub2ApiVerifyCode(input: {
  email: string
  turnstileToken?: string
}) {
  const response = await fetch(buildAuthUrl('auth/send-verify-code'), {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    cache: 'no-store',
    body: JSON.stringify({
      email: input.email,
      turnstile_token: input.turnstileToken ?? '',
    }),
  })
  const payload = await parseJsonResponse<{ countdown: number }>(response)
  if (!response.ok || payload.code !== 0 || !payload.data) {
    throw new Error(parseEnvelopeMessage(payload))
  }
  return payload.data
}

export async function logoutSub2Api() {
  const session = getSub2ApiAuthSession()
  try {
    await fetch(buildAuthUrl('auth/logout'), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      cache: 'no-store',
      body: JSON.stringify({
        refresh_token: session?.refreshToken ?? '',
      }),
    })
  } finally {
    clearSub2ApiAuthSession()
  }
}
