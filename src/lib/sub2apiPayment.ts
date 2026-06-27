import { fetchWithSub2ApiAuth } from './sub2apiAuth'

export type OrderType = 'balance' | 'subscription'
export type VisiblePaymentMethod = 'alipay' | 'wxpay' | 'stripe' | 'airwallex'
export type StripeVisibleMethod = 'alipay' | 'wechat_pay'
export type PaymentLaunchKind =
  | 'qr_waiting'
  | 'redirect_waiting'
  | 'stripe_popup'
  | 'stripe_route'
  | 'airwallex_route'
  | 'wechat_oauth'
  | 'wechat_jsapi'
  | 'unhandled'

export interface MethodLimit {
  currency?: string
  daily_limit: number
  daily_used: number
  daily_remaining: number
  single_min: number
  single_max: number
  fee_rate: number
  available: boolean
}

export interface CheckoutInfoResponse {
  methods: Record<string, MethodLimit>
  global_min: number
  global_max: number
  plans: Array<unknown>
  balance_disabled: boolean
  balance_recharge_multiplier: number
  recharge_fee_rate: number
  help_text: string
  help_image_url: string
  stripe_publishable_key: string
  alipay_force_qrcode?: boolean
}

export interface CreateOrderRequest {
  amount: number
  payment_type: string
  order_type: string
  plan_id?: number
  return_url?: string
  payment_source?: string
  openid?: string
  wechat_resume_token?: string
  is_mobile?: boolean
}

export type CreateOrderResultType = 'order_created' | 'oauth_required' | 'jsapi_ready'

export interface WechatOAuthInfo {
  authorize_url?: string
  appid?: string
  openid?: string
  scope?: string
  state?: string
  redirect_url?: string
}

export interface WechatJSAPIPayload {
  appId?: string
  timeStamp?: string
  nonceStr?: string
  package?: string
  signType?: string
  paySign?: string
}

export interface CreateOrderResult {
  order_id: number
  amount: number
  pay_url?: string
  qr_code?: string
  client_secret?: string
  intent_id?: string
  currency?: string
  country_code?: string
  payment_env?: string
  pay_amount: number
  fee_rate: number
  expires_at: string
  result_type?: CreateOrderResultType
  payment_type?: string
  out_trade_no?: string
  payment_mode?: string
  resume_token?: string
  oauth?: WechatOAuthInfo
  jsapi?: WechatJSAPIPayload
  jsapi_payload?: WechatJSAPIPayload
}

export interface PaymentOrder {
  id: number
  amount: number
  pay_amount: number
  currency?: string
  fee_rate: number
  payment_type: string
  out_trade_no: string
  status: string
  order_type: OrderType
  created_at: string
  expires_at: string
}

export interface PaymentOrderListResponse {
  items: PaymentOrder[]
  total: number
  page: number
  page_size: number
}

interface Sub2ApiEnvelope<T> {
  code: number
  message: string
  data?: T
  reason?: string
  metadata?: Record<string, unknown>
}

const AUTH_API_PREFIX = '/api/v1'
export const PAYMENT_RECOVERY_STORAGE_KEY = 'payment.recovery.current'

const VISIBLE_METHOD_ALIASES = {
  alipay: 'alipay',
  alipay_direct: 'alipay',
  wxpay: 'wxpay',
  wxpay_direct: 'wxpay',
  stripe: 'stripe',
  airwallex: 'airwallex',
} as const

export interface PaymentRecoverySnapshot {
  orderId: number
  amount: number
  qrCode: string
  expiresAt: string
  paymentType: string
  payUrl: string
  outTradeNo: string
  clientSecret: string
  intentId: string
  currency: string
  countryCode: string
  paymentEnv: string
  payAmount: number
  orderType: OrderType | ''
  paymentMode: string
  resumeToken: string
  createdAt: number
}

export interface PaymentLaunchContext {
  visibleMethod: string
  orderType: OrderType
  isMobile: boolean
  isWechatBrowser?: boolean
  forceQRCode?: boolean
  now?: number
  stripePopupUrl?: string
  stripeRouteUrl?: string
  airwallexRouteUrl?: string
}

export interface PaymentLaunchDecision {
  kind: PaymentLaunchKind
  paymentState: PaymentRecoverySnapshot
  recovery: PaymentRecoverySnapshot
  stripeMethod?: StripeVisibleMethod
  oauth?: WechatOAuthInfo
  jsapi?: WechatJSAPIPayload
}

export interface BuildCreateOrderPayloadInput {
  amount: number
  paymentType: string
  orderType: OrderType
  planId?: number
  origin?: string
  isMobile: boolean
  isWechatBrowser: boolean
  forceQRCode?: boolean
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

function parseEnvelopeMessage(payload: unknown): string {
  if (!payload || typeof payload !== 'object') return '请求失败'
  const record = payload as Record<string, unknown>
  if (typeof record.message === 'string' && record.message.trim()) return record.message
  if (typeof record.reason === 'string' && record.reason.trim()) return record.reason
  return '请求失败'
}

function toApiError<T>(response: Response, payload: Sub2ApiEnvelope<T>) {
  return {
    status: response.status,
    code: payload.code,
    message: parseEnvelopeMessage(payload),
    reason: payload.reason,
    metadata: payload.metadata,
  }
}

export async function getCheckoutInfo(): Promise<CheckoutInfoResponse> {
  const response = await fetchWithSub2ApiAuth(buildAuthUrl('payment/checkout-info'), {
    cache: 'no-store',
  })
  const payload = await parseJsonResponse<CheckoutInfoResponse>(response)
  if (!response.ok || payload.code !== 0 || !payload.data) {
    throw toApiError(response, payload)
  }
  return payload.data
}

export async function createPaymentOrder(data: CreateOrderRequest): Promise<CreateOrderResult> {
  const response = await fetchWithSub2ApiAuth(buildAuthUrl('payment/orders'), {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    cache: 'no-store',
    body: JSON.stringify(data),
  })
  const payload = await parseJsonResponse<CreateOrderResult>(response)
  if (!response.ok || payload.code !== 0 || !payload.data) {
    throw toApiError(response, payload)
  }
  return payload.data
}

export async function getPaymentOrder(id: number): Promise<PaymentOrder> {
  const response = await fetchWithSub2ApiAuth(buildAuthUrl(`payment/orders/${id}`), {
    cache: 'no-store',
  })
  const payload = await parseJsonResponse<PaymentOrder>(response)
  if (!response.ok || payload.code !== 0 || !payload.data) {
    throw toApiError(response, payload)
  }
  return payload.data
}

export async function getMyPaymentOrders(params: {
  page?: number
  page_size?: number
  status?: string
} = {}): Promise<PaymentOrderListResponse> {
  const search = new URLSearchParams()
  if (typeof params.page === 'number' && params.page > 0) search.set('page', String(params.page))
  if (typeof params.page_size === 'number' && params.page_size > 0) search.set('page_size', String(params.page_size))
  if (typeof params.status === 'string' && params.status.trim()) search.set('status', params.status.trim())

  const query = search.toString()
  const response = await fetchWithSub2ApiAuth(buildAuthUrl(`payment/orders/my${query ? `?${query}` : ''}`), {
    cache: 'no-store',
  })
  const payload = await parseJsonResponse<PaymentOrderListResponse>(response)
  if (!response.ok || payload.code !== 0 || !payload.data) {
    throw toApiError(response, payload)
  }
  return payload.data
}

export async function cancelPaymentOrder(id: number): Promise<void> {
  const response = await fetchWithSub2ApiAuth(buildAuthUrl(`payment/orders/${id}/cancel`), {
    method: 'POST',
    cache: 'no-store',
  })
  const payload = await parseJsonResponse<Record<string, never>>(response)
  if (!response.ok || payload.code !== 0) {
    throw toApiError(response, payload)
  }
}

export async function verifyPaymentOrder(outTradeNo: string): Promise<PaymentOrder> {
  const response = await fetchWithSub2ApiAuth(buildAuthUrl('payment/orders/verify'), {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    cache: 'no-store',
    body: JSON.stringify({ out_trade_no: outTradeNo }),
  })
  const payload = await parseJsonResponse<PaymentOrder>(response)
  if (!response.ok || payload.code !== 0 || !payload.data) {
    throw toApiError(response, payload)
  }
  return payload.data
}

export function normalizeVisibleMethod(method: string): VisiblePaymentMethod | '' {
  const normalized = VISIBLE_METHOD_ALIASES[method.trim() as keyof typeof VISIBLE_METHOD_ALIASES]
  return normalized ?? ''
}

export function getVisibleMethods(methods: Record<string, MethodLimit>): Record<string, MethodLimit> {
  const visible: Record<string, MethodLimit> = {}

  Object.entries(methods).forEach(([type, limit]) => {
    const normalized = normalizeVisibleMethod(type)
    if (!normalized) return

    const isCanonical = type === normalized
    const existing = visible[normalized]
    if (!existing || isCanonical) {
      visible[normalized] = { ...limit }
    }
  })

  return visible
}

export function buildCreateOrderPayload(input: BuildCreateOrderPayloadInput): CreateOrderRequest {
  const visibleMethod = normalizeVisibleMethod(input.paymentType) || input.paymentType.trim()
  const normalizedOrigin = (input.origin || '').trim().replace(/\/+$/, '')
  const effectiveMobile = (input.forceQRCode && visibleMethod === 'alipay')
    ? false
    : input.isMobile
  const payload: CreateOrderRequest = {
    amount: input.amount,
    payment_type: visibleMethod,
    order_type: input.orderType,
    is_mobile: effectiveMobile,
    payment_source: visibleMethod === 'wxpay' && input.isWechatBrowser
      ? 'wechat_in_app_resume'
      : 'hosted_redirect',
  }

  if (input.planId) {
    payload.plan_id = input.planId
  }
  if (normalizedOrigin) {
    payload.return_url = `${normalizedOrigin}/payment/result`
  }

  return payload
}

export function createPaymentRecoverySnapshot(
  state: Omit<PaymentRecoverySnapshot, 'createdAt'>,
  now = Date.now(),
): PaymentRecoverySnapshot {
  return {
    ...state,
    createdAt: now,
  }
}

export function decidePaymentLaunch(
  result: CreateOrderResult,
  context: PaymentLaunchContext,
): PaymentLaunchDecision {
  const visibleMethod = normalizeVisibleMethod(context.visibleMethod) || context.visibleMethod
  const baseState = createPaymentRecoverySnapshot({
    orderId: result.order_id,
    amount: result.amount,
    qrCode: result.qr_code || '',
    expiresAt: result.expires_at || '',
    paymentType: visibleMethod,
    payUrl: result.pay_url || '',
    outTradeNo: result.out_trade_no || '',
    clientSecret: result.client_secret || '',
    intentId: result.intent_id || '',
    currency: result.currency || '',
    countryCode: result.country_code || '',
    paymentEnv: result.payment_env || '',
    payAmount: result.pay_amount,
    orderType: context.orderType,
    paymentMode: (result.payment_mode || '').trim(),
    resumeToken: result.resume_token || '',
  }, context.now)

  if (visibleMethod === 'airwallex' && baseState.clientSecret && baseState.intentId) {
    if (!context.airwallexRouteUrl) {
      return { kind: 'unhandled', paymentState: baseState, recovery: baseState }
    }
    const paymentState = { ...baseState, payUrl: context.airwallexRouteUrl || '' }
    return { kind: 'airwallex_route', paymentState, recovery: paymentState }
  }

  if (baseState.clientSecret) {
    const isStripeButton = visibleMethod === 'stripe'
    const stripeMethod: StripeVisibleMethod | undefined = isStripeButton
      ? undefined
      : visibleMethod === 'wxpay' ? 'wechat_pay' : 'alipay'
    const kind: PaymentLaunchKind = stripeMethod === 'alipay' && !context.isMobile
      ? 'stripe_popup'
      : 'stripe_route'
    const payUrl = kind === 'stripe_popup'
      ? context.stripePopupUrl || context.stripeRouteUrl || ''
      : context.stripeRouteUrl || context.stripePopupUrl || ''
    const paymentState = { ...baseState, payUrl }
    return { kind, paymentState, recovery: paymentState, stripeMethod }
  }

  if (result.result_type === 'oauth_required' && result.oauth?.authorize_url) {
    return { kind: 'wechat_oauth', paymentState: baseState, recovery: baseState, oauth: result.oauth }
  }

  const jsapiPayload = result.jsapi ?? result.jsapi_payload
  if (result.result_type === 'jsapi_ready' && jsapiPayload) {
    return { kind: 'wechat_jsapi', paymentState: baseState, recovery: baseState, jsapi: jsapiPayload }
  }

  const normalizedPaymentMode = baseState.paymentMode.trim().toLowerCase()
  const effectiveMobile = (context.forceQRCode && visibleMethod === 'alipay')
    ? false
    : context.isMobile
  const prefersRedirect = normalizedPaymentMode === 'redirect'
    || normalizedPaymentMode === 'popup'
    || (effectiveMobile && !!baseState.payUrl)
  const prefersQr = normalizedPaymentMode === 'qrcode'
    || normalizedPaymentMode === 'native'
    || (!prefersRedirect && !!baseState.qrCode)

  if (visibleMethod === 'wxpay' && context.isWechatBrowser && baseState.payUrl && !baseState.qrCode) {
    return { kind: 'redirect_waiting', paymentState: baseState, recovery: baseState }
  }

  if (prefersRedirect && baseState.payUrl) {
    return { kind: 'redirect_waiting', paymentState: baseState, recovery: baseState }
  }

  if (prefersQr && baseState.qrCode) {
    return { kind: 'qr_waiting', paymentState: baseState, recovery: baseState }
  }

  if (baseState.payUrl) {
    return { kind: 'redirect_waiting', paymentState: baseState, recovery: baseState }
  }

  return { kind: 'unhandled', paymentState: baseState, recovery: baseState }
}

export function writePaymentRecoverySnapshot(
  storage: Pick<Storage, 'setItem'>,
  snapshot: PaymentRecoverySnapshot,
  key = PAYMENT_RECOVERY_STORAGE_KEY,
): void {
  storage.setItem(key, JSON.stringify(snapshot))
}

export function clearPaymentRecoverySnapshot(
  storage: Pick<Storage, 'removeItem'>,
  key = PAYMENT_RECOVERY_STORAGE_KEY,
): void {
  storage.removeItem(key)
}

export function readPaymentRecoverySnapshot(
  raw: string | null | undefined,
  options: { now?: number; resumeToken?: string } = {},
): PaymentRecoverySnapshot | null {
  if (!raw) return null

  try {
    const parsed = JSON.parse(raw) as Partial<PaymentRecoverySnapshot>
    if (!parsed || typeof parsed !== 'object') return null
    if (typeof parsed.orderId !== 'number' || parsed.orderId <= 0) return null
    if (typeof parsed.createdAt !== 'number' || !Number.isFinite(parsed.createdAt)) return null

    const snapshot: PaymentRecoverySnapshot = {
      orderId: parsed.orderId,
      amount: typeof parsed.amount === 'number' ? parsed.amount : 0,
      qrCode: typeof parsed.qrCode === 'string' ? parsed.qrCode : '',
      expiresAt: typeof parsed.expiresAt === 'string' ? parsed.expiresAt : '',
      paymentType: typeof parsed.paymentType === 'string' ? parsed.paymentType : '',
      payUrl: typeof parsed.payUrl === 'string' ? parsed.payUrl : '',
      outTradeNo: typeof parsed.outTradeNo === 'string' ? parsed.outTradeNo : '',
      clientSecret: typeof parsed.clientSecret === 'string' ? parsed.clientSecret : '',
      intentId: typeof parsed.intentId === 'string' ? parsed.intentId : '',
      currency: typeof parsed.currency === 'string' ? parsed.currency : '',
      countryCode: typeof parsed.countryCode === 'string' ? parsed.countryCode : '',
      paymentEnv: typeof parsed.paymentEnv === 'string' ? parsed.paymentEnv : '',
      payAmount: typeof parsed.payAmount === 'number' ? parsed.payAmount : 0,
      orderType: parsed.orderType === 'balance' || parsed.orderType === 'subscription' ? parsed.orderType : '',
      paymentMode: typeof parsed.paymentMode === 'string' ? parsed.paymentMode : '',
      resumeToken: typeof parsed.resumeToken === 'string' ? parsed.resumeToken : '',
      createdAt: parsed.createdAt,
    }

    if (options.resumeToken && snapshot.resumeToken && options.resumeToken !== snapshot.resumeToken) {
      return null
    }

    const now = options.now ?? Date.now()
    const expiresAtMs = snapshot.expiresAt ? Date.parse(snapshot.expiresAt) : NaN
    if (Number.isFinite(expiresAtMs) && expiresAtMs <= now) {
      return null
    }

    return snapshot
  } catch {
    return null
  }
}
