import { useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useStore } from '../store'
import { useCloseOnEscape } from '../hooks/useCloseOnEscape'
import { usePreventBackgroundScroll } from '../hooks/usePreventBackgroundScroll'
import {
  buildCreateOrderPayload,
  clearPaymentRecoverySnapshot,
  createPaymentOrder,
  decidePaymentLaunch,
  getCheckoutInfo,
  getVisibleMethods,
  normalizeVisibleMethod,
  PAYMENT_RECOVERY_STORAGE_KEY,
  readPaymentRecoverySnapshot,
  writePaymentRecoverySnapshot,
  type CheckoutInfoResponse,
  type MethodLimit,
  type OrderType,
  type PaymentOrder,
  type PaymentRecoverySnapshot,
} from '../lib/sub2apiPayment'
import { requestSub2ApiCurrentUserRefresh } from '../lib/sub2apiAuth'
import { parseRedeemCodesInput, redeemSub2ApiCode, type Sub2ApiRedeemResult } from '../lib/sub2apiRedeem'
import Sub2ApiPaymentStatus from './Sub2ApiPaymentStatus'

interface Sub2ApiPaymentModalProps {
  onClose: () => void
}

const REDEEM_PURCHASE_URL = 'https://catfk.com/shop/5AB5YFXH'

type PaymentModalTab = 'recharge' | 'redeem'

interface RedeemBatchResult {
  code: string
  success: boolean
  detail: string
  payload?: Sub2ApiRedeemResult
}

type WeixinJSBridgeLike = {
  invoke(
    action: string,
    payload: Record<string, unknown>,
    callback: (result: Record<string, unknown>) => void,
  ): void
}

function isMobileDevice() {
  if (typeof window === 'undefined') return false
  return /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(window.navigator.userAgent)
}

function emptyPaymentState(): PaymentRecoverySnapshot {
  return {
    orderId: 0,
    amount: 0,
    qrCode: '',
    expiresAt: '',
    paymentType: '',
    payUrl: '',
    outTradeNo: '',
    clientSecret: '',
    intentId: '',
    currency: '',
    countryCode: '',
    paymentEnv: '',
    payAmount: 0,
    orderType: '',
    paymentMode: '',
    resumeToken: '',
    createdAt: 0,
  }
}

function getWeixinJSBridge(): WeixinJSBridgeLike | undefined {
  return (window as Window & { WeixinJSBridge?: WeixinJSBridgeLike }).WeixinJSBridge
}

function waitForWeixinJSBridge(timeoutMs = 4000): Promise<WeixinJSBridgeLike | null> {
  const existing = getWeixinJSBridge()
  if (existing) return Promise.resolve(existing)

  return new Promise((resolve) => {
    let settled = false
    const finish = (bridge: WeixinJSBridgeLike | null) => {
      if (settled) return
      settled = true
      document.removeEventListener('WeixinJSBridgeReady', handleReady)
      document.removeEventListener('onWeixinJSBridgeReady', handleReady)
      window.clearTimeout(timer)
      resolve(bridge)
    }
    const handleReady = () => finish(getWeixinJSBridge() ?? null)
    const timer = window.setTimeout(() => finish(getWeixinJSBridge() ?? null), timeoutMs)
    document.addEventListener('WeixinJSBridgeReady', handleReady, false)
    document.addEventListener('onWeixinJSBridgeReady', handleReady, false)
  })
}

async function invokeWechatJsapiPayment(payload: Record<string, unknown>): Promise<Record<string, unknown>> {
  const bridge = await waitForWeixinJSBridge()
  if (!bridge) {
    throw new Error('WECHAT_JSAPI_UNAVAILABLE')
  }
  return new Promise((resolve) => {
    bridge.invoke('getBrandWCPayRequest', payload, (result) => resolve(result || {}))
  })
}

function formatPaymentAmount(value: number, currency?: string) {
  const normalized = typeof currency === 'string' && currency.trim() ? currency.trim().toUpperCase() : 'CNY'
  try {
    return new Intl.NumberFormat('zh-CN', {
      style: 'currency',
      currency: normalized,
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(value)
  } catch {
    return `${normalized} ${value.toFixed(2)}`
  }
}

function formatRedeemResultDetail(result: Sub2ApiRedeemResult) {
  if (result.type === 'balance') return `+ $${result.value.toFixed(2)}`
  if (result.type === 'concurrency') return `+ ${result.value} 并发`
  if (result.type === 'subscription') {
    const groupName = result.group?.name?.trim() || ''
    const validityDays = result.validity_days && result.validity_days > 0 ? `${result.validity_days} 天` : ''
    return [groupName, validityDays].filter(Boolean).join(' ')
  }
  return result.message
}

export default function Sub2ApiPaymentModal({ onClose }: Sub2ApiPaymentModalProps) {
  const modalRef = useRef<HTMLDivElement>(null)
  const showToast = useStore((s) => s.showToast)
  const [checkoutLoading, setCheckoutLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [amount, setAmount] = useState<number | null>(null)
  const [selectedMethod, setSelectedMethod] = useState('')
  const [activeTab, setActiveTab] = useState<PaymentModalTab>('recharge')
  const [checkout, setCheckout] = useState<CheckoutInfoResponse>({
    methods: {},
    global_min: 0,
    global_max: 0,
    plans: [],
    balance_disabled: false,
    balance_recharge_multiplier: 1,
    recharge_fee_rate: 0,
    help_text: '',
    help_image_url: '',
    stripe_publishable_key: '',
  })
  const [paymentPhase, setPaymentPhase] = useState<'select' | 'paying'>('select')
  const [paymentState, setPaymentState] = useState<PaymentRecoverySnapshot>(emptyPaymentState())
  const [errorMessage, setErrorMessage] = useState('')
  const [redeemInput, setRedeemInput] = useState('')
  const [redeemSubmitting, setRedeemSubmitting] = useState(false)
  const [redeemResults, setRedeemResults] = useState<RedeemBatchResult[]>([])

  useCloseOnEscape(true, onClose)
  usePreventBackgroundScroll(true, modalRef)

  const visibleMethods = useMemo(() => getVisibleMethods(checkout.methods), [checkout.methods])
  const enabledMethods = useMemo(() => Object.keys(visibleMethods), [visibleMethods])
  const selectedLimit = selectedMethod ? visibleMethods[selectedMethod] : undefined
  const selectedCurrency = selectedLimit?.currency || 'CNY'
  const validAmount = amount ?? 0
  const globalMin = checkout.global_min > 0 ? checkout.global_min : 0
  const globalMax = checkout.global_max > 0 ? checkout.global_max : 0
  const quickAmounts = useMemo(() => {
    if (globalMax < 1) return []
    const values: number[] = []
    for (let current = 1; current <= Math.floor(globalMax); current += 1) {
      values.push(current)
    }
    return values
  }, [globalMax])
  const balanceRechargeMultiplier = checkout.balance_recharge_multiplier > 0 ? checkout.balance_recharge_multiplier : 1
  const creditedAmount = Math.round(validAmount * balanceRechargeMultiplier * 100) / 100
  const feeRate = checkout.recharge_fee_rate ?? 0
  const feeAmount = feeRate > 0 && validAmount > 0
    ? Math.ceil(((validAmount * feeRate) / 100) * 100) / 100
    : 0
  const totalAmount = feeRate > 0 && validAmount > 0
    ? Math.round((validAmount + feeAmount) * 100) / 100
    : validAmount
  const redeemCodes = useMemo(() => parseRedeemCodesInput(redeemInput), [redeemInput])
  const redeemSuccessCount = useMemo(() => redeemResults.filter((item) => item.success).length, [redeemResults])
  const redeemFailureCount = redeemResults.length - redeemSuccessCount

  const amountFitsMethod = (targetAmount: number, methodType: string) => {
    if (targetAmount <= 0) return true
    const limit = visibleMethods[methodType]
    if (!limit) return false
    if (limit.single_min > 0 && targetAmount < limit.single_min) return false
    if (limit.single_max > 0 && targetAmount > limit.single_max) return false
    return true
  }

  const amountError = useMemo(() => {
    if (validAmount <= 0) return ''
    if (globalMin > 0 && validAmount < globalMin) {
      return `最低金额为 ${formatPaymentAmount(globalMin, selectedCurrency)}`
    }
    if (globalMax > 0 && validAmount > globalMax) {
      return `最高金额为 ${formatPaymentAmount(globalMax, selectedCurrency)}`
    }
    if (!enabledMethods.some((method) => amountFitsMethod(validAmount, method))) {
      return '该金额没有可用的支付方式'
    }
    if (selectedLimit) {
      if (selectedLimit.single_min > 0 && validAmount < selectedLimit.single_min) {
        return `最低金额为 ${formatPaymentAmount(selectedLimit.single_min, selectedCurrency)}`
      }
      if (selectedLimit.single_max > 0 && validAmount > selectedLimit.single_max) {
        return `最高金额为 ${formatPaymentAmount(selectedLimit.single_max, selectedCurrency)}`
      }
    }
    return ''
  }, [enabledMethods, globalMax, globalMin, selectedCurrency, selectedLimit, validAmount])

  const canSubmit = validAmount > 0
    && (globalMin <= 0 || validAmount >= globalMin)
    && (globalMax <= 0 || validAmount <= globalMax)
    && amountFitsMethod(validAmount, selectedMethod)
    && selectedLimit?.available !== false

  useEffect(() => {
    if (validAmount <= 0 || amountFitsMethod(validAmount, selectedMethod)) return
    const available = enabledMethods.find((method) => amountFitsMethod(validAmount, method))
    if (available) setSelectedMethod(available)
  }, [enabledMethods, selectedMethod, validAmount])

  useEffect(() => {
    let cancelled = false

    void getCheckoutInfo()
      .then((data) => {
        if (cancelled) return
        setCheckout(data)
        const sorted = Object.keys(getVisibleMethods(data.methods))
        if (sorted.length > 0) {
          const preferred = ['alipay', 'wxpay', 'stripe', 'airwallex']
          sorted.sort((a, b) => preferred.indexOf(a) - preferred.indexOf(b))
          setSelectedMethod(sorted[0])
        }
        if (typeof window !== 'undefined') {
          const restored = readPaymentRecoverySnapshot(window.localStorage.getItem(PAYMENT_RECOVERY_STORAGE_KEY))
          if (restored) {
            setPaymentState(restored)
            setPaymentPhase('paying')
            setActiveTab('recharge')
            const restoredMethod = normalizeVisibleMethod(restored.paymentType)
            if (restoredMethod) {
              setSelectedMethod(restoredMethod)
            }
          } else {
            clearPaymentRecoverySnapshot(window.localStorage)
          }
        }
      })
      .catch((err) => {
        if (cancelled) return
        showToast(err instanceof Error ? err.message : '加载充值信息失败', 'error')
      })
      .finally(() => {
        if (!cancelled) setCheckoutLoading(false)
      })

    return () => {
      cancelled = true
    }
  }, [showToast])

  const persistRecoverySnapshot = (snapshot: PaymentRecoverySnapshot) => {
    if (typeof window === 'undefined' || !snapshot.orderId) return
    writePaymentRecoverySnapshot(window.localStorage, snapshot, PAYMENT_RECOVERY_STORAGE_KEY)
  }

  const removeRecoverySnapshot = () => {
    if (typeof window === 'undefined') return
    clearPaymentRecoverySnapshot(window.localStorage, PAYMENT_RECOVERY_STORAGE_KEY)
  }

  const resetPayment = () => {
    setPaymentPhase('select')
    setPaymentState(emptyPaymentState())
    removeRecoverySnapshot()
  }

  const methodButtonClass = (method: string) => {
    if (method === selectedMethod) return 'border-gray-900 bg-gray-900 text-white dark:border-white dark:bg-white dark:text-gray-900'
    return 'border-gray-200 bg-white text-gray-700 hover:border-gray-300 dark:border-white/[0.08] dark:bg-white/[0.04] dark:text-gray-200 dark:hover:border-white/[0.16]'
  }

  const createOrder = async (orderAmount: number, orderType: OrderType) => {
    setSubmitting(true)
    setErrorMessage('')
    const requestType = normalizeVisibleMethod(selectedMethod) || selectedMethod

    try {
      const payload = buildCreateOrderPayload({
        amount: orderAmount,
        paymentType: requestType,
        orderType,
        origin: typeof window !== 'undefined' ? window.location.origin : '',
        isMobile: isMobileDevice(),
        isWechatBrowser: typeof window !== 'undefined' && /MicroMessenger/i.test(window.navigator.userAgent),
        forceQRCode: !!(checkout.alipay_force_qrcode && normalizeVisibleMethod(requestType) === 'alipay'),
      })
      const result = await createPaymentOrder(payload)
      const visibleMethod = normalizeVisibleMethod(requestType) || requestType
      const decision = decidePaymentLaunch(result, {
        visibleMethod,
        orderType,
        isMobile: isMobileDevice(),
        isWechatBrowser: typeof window !== 'undefined' && /MicroMessenger/i.test(window.navigator.userAgent),
        forceQRCode: !!(checkout.alipay_force_qrcode && visibleMethod === 'alipay'),
      })

      if (decision.kind === 'wechat_oauth' && decision.oauth?.authorize_url) {
        window.location.href = decision.oauth.authorize_url
        return
      }

      if (decision.kind === 'unhandled') {
        throw new Error('当前支付方式暂不可用')
      }

      setPaymentState(decision.paymentState)
      setPaymentPhase('paying')
      persistRecoverySnapshot(decision.recovery)

      if (decision.kind === 'redirect_waiting' && decision.paymentState.payUrl) {
        const win = window.open(decision.paymentState.payUrl, 'paymentPopup', 'popup=yes,width=520,height=760')
        if (!win || win.closed) {
          window.location.href = decision.paymentState.payUrl
        }
        return
      }

      if (decision.kind === 'wechat_jsapi' && decision.jsapi) {
        try {
          const jsapiResult = await invokeWechatJsapiPayment(decision.jsapi as Record<string, unknown>)
          const errMsg = String(jsapiResult.err_msg || '').toLowerCase()
          if (errMsg.includes('cancel')) {
            showToast('您已取消本次支付', 'info')
            resetPayment()
          } else if (errMsg && !errMsg.includes('ok')) {
            resetPayment()
            throw new Error('微信支付未完成，请重新拉起支付或改用扫码支付。')
          }
        } catch (err) {
          resetPayment()
          throw err
        }
      }
    } catch (err) {
      let message = err instanceof Error ? err.message : '支付失败'
      const apiErr = err as { reason?: string; metadata?: Record<string, unknown>; message?: string }
      if (apiErr.reason === 'TOO_MANY_PENDING') {
        message = `待支付订单过多（最多 ${String(apiErr.metadata?.max || '')} 个），请先完成或取消现有订单`
      } else if (apiErr.reason === 'CANCEL_RATE_LIMITED') {
        message = '取消订单过于频繁，请稍后再试'
      } else if (apiErr.reason === 'BALANCE_MAX_LIMIT_EXCEEDED') {
        message = '充值后余额将超过站点允许的最大额度'
      }
      setErrorMessage(message)
      showToast(message, 'error')
    } finally {
      setSubmitting(false)
    }
  }

  const onPaymentDone = () => {
    resetPayment()
    onClose()
  }

  const onPaymentSuccess = (_order: PaymentOrder) => {
    removeRecoverySnapshot()
    requestSub2ApiCurrentUserRefresh()
  }

  const onPaymentSettled = () => {
    removeRecoverySnapshot()
  }

  const handleRedeemSubmit = async () => {
    if (redeemCodes.length === 0) {
      showToast('请输入兑换码', 'error')
      return
    }

    setRedeemSubmitting(true)
    setRedeemResults([])
    const nextResults: RedeemBatchResult[] = []

    try {
      for (const code of redeemCodes) {
        try {
          const payload = await redeemSub2ApiCode(code)
          nextResults.push({
            code,
            success: true,
            detail: formatRedeemResultDetail(payload),
            payload,
          })
        } catch (err) {
          nextResults.push({
            code,
            success: false,
            detail: err instanceof Error ? err.message : '兑换失败',
          })
        }
        setRedeemResults([...nextResults])
      }

      requestSub2ApiCurrentUserRefresh()

      const succeeded = nextResults.filter((item) => item.success).length
      const failed = nextResults.length - succeeded
      if (failed === 0) {
        showToast(`已兑换 ${succeeded} 个兑换码`, 'success')
      } else if (succeeded === 0) {
        showToast('兑换失败', 'error')
      } else {
        showToast(`已兑换 ${succeeded} 个，失败 ${failed} 个`, 'info')
      }
    } finally {
      setRedeemSubmitting(false)
    }
  }

  return createPortal(
    <div
      data-no-drag-select
      className="fixed inset-0 z-[110] flex items-center justify-center p-4"
      onClick={onClose}
    >
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm animate-overlay-in" />
      <div
        ref={modalRef}
        className="relative z-10 w-full max-w-2xl overflow-hidden rounded-2xl border border-gray-200/70 bg-white shadow-xl ring-1 ring-black/5 animate-modal-in dark:border-white/[0.08] dark:bg-gray-900 dark:ring-white/10"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-center justify-between gap-4 border-b border-gray-200/70 px-5 py-4 dark:border-white/[0.08]">
          <div className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-gray-100 text-gray-700 dark:bg-white/[0.06] dark:text-gray-200">
              <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 9V7a5 5 0 00-10 0v2m-2 0h14a1 1 0 011 1v8a1 1 0 01-1 1H5a1 1 0 01-1-1v-8a1 1 0 011-1z" />
              </svg>
            </div>
            <h3 className="text-sm font-bold text-gray-800 dark:text-gray-100">充值 / 兑换码</h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-full p-1 text-gray-400 transition hover:bg-gray-100 hover:text-gray-600 dark:hover:bg-white/[0.06] dark:hover:text-gray-200"
            aria-label="关闭"
          >
            <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {paymentPhase === 'paying' ? (
          <div className="p-5">
            <Sub2ApiPaymentStatus
              orderId={paymentState.orderId}
              qrCode={paymentState.qrCode}
              expiresAt={paymentState.expiresAt}
              paymentType={paymentState.paymentType}
              payUrl={paymentState.payUrl}
              currency={paymentState.currency || selectedCurrency}
              onDone={onPaymentDone}
              onSuccess={onPaymentSuccess}
              onSettled={onPaymentSettled}
            />
          </div>
        ) : (
          <div className="space-y-4 p-5">
            <div className="grid grid-cols-2 gap-2 rounded-2xl border border-gray-200/70 bg-gray-100/70 p-1 dark:border-white/[0.08] dark:bg-white/[0.04]">
              <button
                type="button"
                onClick={() => setActiveTab('recharge')}
                className={`rounded-xl px-4 py-2 text-sm font-medium transition ${
                  activeTab === 'recharge'
                    ? 'bg-white text-gray-900 shadow-sm dark:bg-white/10 dark:text-white'
                    : 'text-gray-500 hover:text-gray-800 dark:text-gray-400 dark:hover:text-gray-200'
                }`}
              >
                充值
              </button>
              <button
                type="button"
                onClick={() => setActiveTab('redeem')}
                className={`rounded-xl px-4 py-2 text-sm font-medium transition ${
                  activeTab === 'redeem'
                    ? 'bg-white text-gray-900 shadow-sm dark:bg-white/10 dark:text-white'
                    : 'text-gray-500 hover:text-gray-800 dark:text-gray-400 dark:hover:text-gray-200'
                }`}
              >
                兑换码
              </button>
            </div>

            {activeTab === 'recharge' ? (
              checkoutLoading ? (
                <div className="flex items-center justify-center py-20">
                  <div className="h-10 w-10 animate-spin rounded-full border-4 border-gray-900 border-t-transparent dark:border-white dark:border-t-transparent" />
                </div>
              ) : (
                <>
                  <div className="rounded-2xl border border-gray-100 bg-white p-4 shadow-sm dark:border-white/[0.06] dark:bg-white/[0.02]">
                    <div className="mb-3 flex items-center gap-2">
                      <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-gray-100 text-gray-700 dark:bg-white/[0.06] dark:text-gray-200">
                        <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-2.761 0-5 1.12-5 2.5S9.239 13 12 13s5-1.12 5-2.5S14.761 8 12 8zm0 0V6m0 7v5m-7-3.5C5 15.88 8.134 17 12 17s7-1.12 7-2.5" />
                        </svg>
                      </div>
                      <p className="text-sm font-bold text-gray-800 dark:text-gray-100">充值金额</p>
                    </div>
                    <div className="mt-3 grid grid-cols-4 gap-2">
                      {quickAmounts.map((quickAmount) => (
                        <button
                          key={quickAmount}
                          type="button"
                          onClick={() => setAmount(quickAmount)}
                          className={`rounded-xl border px-3 py-2 text-sm font-medium transition ${
                            amount === quickAmount
                              ? 'border-gray-900 bg-gray-900 text-white dark:border-white dark:bg-white dark:text-gray-900'
                              : 'border-gray-200 bg-gray-50/80 text-gray-700 hover:bg-gray-100 hover:text-gray-900 dark:border-white/[0.08] dark:bg-white/[0.04] dark:text-gray-200 dark:hover:bg-white/[0.08] dark:hover:text-white'
                          }`}
                        >
                          {quickAmount}
                        </button>
                      ))}
                    </div>
                    <input
                      value={amount ?? ''}
                      onChange={(event) => setAmount(event.target.value ? Number(event.target.value) : null)}
                      type="number"
                      min="0"
                      max={globalMax > 0 ? globalMax : undefined}
                      step="0.01"
                      placeholder="输入金额"
                      className="mt-3 w-full rounded-xl border border-gray-200/70 bg-gray-50/80 px-4 py-3 text-sm text-gray-700 outline-none transition focus:border-gray-400 focus:bg-white dark:border-white/[0.08] dark:bg-white/[0.03] dark:text-gray-200 dark:focus:border-white/[0.16] dark:focus:bg-white/[0.05]"
                    />
                    {amountError ? <p className="mt-2 text-xs text-amber-600 dark:text-amber-300">{amountError}</p> : null}
                  </div>

                  <div className="rounded-2xl border border-gray-100 bg-white p-4 shadow-sm dark:border-white/[0.06] dark:bg-white/[0.02]">
                    <div className="mb-3 flex items-center gap-2">
                      <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-gray-100 text-gray-700 dark:bg-white/[0.06] dark:text-gray-200">
                        <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 9V7a5 5 0 00-10 0v2m-2 0h14a1 1 0 011 1v8a1 1 0 01-1 1H5a1 1 0 01-1-1v-8a1 1 0 011-1z" />
                        </svg>
                      </div>
                      <p className="text-sm font-bold text-gray-800 dark:text-gray-100">支付方式</p>
                    </div>
                    <div className="mt-3 grid grid-cols-2 gap-2">
                      {enabledMethods.map((method) => {
                        const limit: MethodLimit | undefined = visibleMethods[method]
                        const labelMap: Record<string, string> = {
                          alipay: '支付宝',
                          wxpay: '微信支付',
                          stripe: 'Stripe',
                          airwallex: 'Airwallex',
                        }
                        return (
                          <button
                            key={method}
                            type="button"
                            onClick={() => setSelectedMethod(method)}
                            className={`rounded-xl border px-4 py-3 text-left text-sm transition ${methodButtonClass(method)} ${limit?.available === false ? 'opacity-50' : ''}`}
                          >
                            <div className="font-medium">{labelMap[method] || method}</div>
                            <div className="mt-1 text-xs opacity-70">
                              {limit?.currency ? `${limit.currency.toUpperCase()}` : 'CNY'}
                            </div>
                          </button>
                        )
                      })}
                    </div>
                  </div>

                  {validAmount > 0 ? (
                    <div className="rounded-2xl border border-gray-100 bg-white p-4 shadow-sm dark:border-white/[0.06] dark:bg-white/[0.02]">
                      <div className="mb-3 flex items-center gap-2">
                        <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-gray-100 text-gray-700 dark:bg-white/[0.06] dark:text-gray-200">
                          <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-2.761 0-5 1.12-5 2.5S9.239 13 12 13s5-1.12 5-2.5S14.761 8 12 8zm0 0V6m0 7v5m-7-3.5C5 15.88 8.134 17 12 17s7-1.12 7-2.5" />
                          </svg>
                        </div>
                        <p className="text-sm font-bold text-gray-800 dark:text-gray-100">支付明细</p>
                      </div>
                      <div className="space-y-2 text-sm">
                        <div className="flex items-center justify-between gap-4">
                          <span className="text-gray-500 dark:text-gray-400">充值金额</span>
                          <span className="text-gray-900 dark:text-white">{formatPaymentAmount(validAmount, selectedCurrency)}</span>
                        </div>
                        {feeRate > 0 ? (
                          <div className="flex items-center justify-between gap-4">
                            <span className="text-gray-500 dark:text-gray-400">手续费 ({feeRate}%)</span>
                            <span className="text-gray-900 dark:text-white">{formatPaymentAmount(feeAmount, selectedCurrency)}</span>
                          </div>
                        ) : null}
                        {feeRate > 0 ? (
                          <div className="flex items-center justify-between gap-4 border-t border-gray-200 pt-2 dark:border-white/[0.08]">
                            <span className="font-medium text-gray-700 dark:text-gray-300">实付金额</span>
                            <span className="text-lg font-bold text-gray-900 dark:text-white">{formatPaymentAmount(totalAmount, selectedCurrency)}</span>
                          </div>
                        ) : null}
                        <div className={`flex items-center justify-between gap-4 ${feeRate > 0 ? '' : 'border-t border-gray-200 pt-2 dark:border-white/[0.08]'}`}>
                          <span className="text-gray-500 dark:text-gray-400">到账点数</span>
                          <span className="text-gray-900 dark:text-white">{creditedAmount.toFixed(2)} 点</span>
                        </div>
                        <p className="border-t border-gray-200 pt-2 text-xs text-gray-500 dark:border-white/[0.08] dark:text-gray-400">
                          当前倍率：1 CNY = {balanceRechargeMultiplier.toFixed(2)} 点
                        </p>
                      </div>
                    </div>
                  ) : null}

                  {errorMessage ? (
                    <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-600 dark:border-red-500/20 dark:bg-red-500/10 dark:text-red-300">
                      {errorMessage}
                    </div>
                  ) : null}

                  <button
                    type="button"
                    disabled={!canSubmit || submitting}
                    onClick={() => {
                      void createOrder(validAmount, 'balance')
                    }}
                    className="flex w-full items-center justify-center gap-2 rounded-xl bg-gray-100/80 px-4 py-2.5 text-sm font-medium text-gray-700 transition-all hover:bg-gray-200 hover:text-gray-900 disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:bg-gray-100/80 disabled:hover:text-gray-700 dark:bg-white/[0.06] dark:text-gray-300 dark:hover:bg-white/[0.1] dark:hover:text-white dark:disabled:hover:bg-white/[0.06] dark:disabled:hover:text-gray-300"
                  >
                    {submitting ? '处理中…' : `确认支付 ${formatPaymentAmount(totalAmount, selectedCurrency)}`}
                  </button>
                </>
              )
            ) : (
              <>
                <a
                  href={REDEEM_PURCHASE_URL}
                  target="_blank"
                  rel="noreferrer"
                  className="flex items-center justify-between rounded-2xl border border-gray-200/70 bg-white/70 px-4 py-3 text-sm text-gray-700 transition hover:border-gray-300 hover:bg-white dark:border-white/[0.08] dark:bg-white/[0.03] dark:text-gray-200 dark:hover:border-white/[0.16] dark:hover:bg-white/[0.05]"
                >
                  <span>购买兑换码</span>
                  <svg className="h-4 w-4 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 17L17 7M17 7H9M17 7v8" />
                  </svg>
                </a>
                <p className="text-sm text-gray-500 dark:text-gray-400">请选择图片生成分类下的商品进行购买，并按需购买，避免一次性充值过多</p>

                <textarea
                  value={redeemInput}
                  onChange={(event) => setRedeemInput(event.target.value)}
                  placeholder="兑换码"
                  spellCheck={false}
                  className="min-h-36 w-full resize-y rounded-2xl border border-gray-200/70 bg-white/70 px-4 py-3 text-sm text-gray-700 outline-none transition focus:border-blue-300 dark:border-white/[0.08] dark:bg-white/[0.03] dark:text-gray-200 dark:focus:border-blue-500/50"
                />

                <div className="flex items-center justify-between gap-3">
                  <div className="text-sm text-gray-500 dark:text-gray-400">
                    {redeemCodes.length > 0 ? `${redeemCodes.length} 个` : ''}
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      void handleRedeemSubmit()
                    }}
                    disabled={redeemSubmitting || redeemCodes.length === 0}
                    className="rounded-xl bg-blue-500 px-4 py-2.5 text-sm font-medium text-white transition hover:bg-blue-600 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {redeemSubmitting ? `处理中 ${redeemResults.length}/${redeemCodes.length}` : '兑换'}
                  </button>
                </div>

                {redeemResults.length > 0 ? (
                  <div className="space-y-3">
                    <div className="flex items-center justify-between gap-3 text-sm text-gray-500 dark:text-gray-400">
                      <span>成功 {redeemSuccessCount}</span>
                      <span>失败 {redeemFailureCount}</span>
                    </div>
                    <div className="max-h-72 space-y-2 overflow-y-auto pr-1 custom-scrollbar">
                      {redeemResults.map((item, index) => (
                        <div
                          key={`${item.code}-${index}`}
                          className={`rounded-2xl border px-4 py-3 ${
                            item.success
                              ? 'border-green-200 bg-green-50/70 dark:border-green-500/20 dark:bg-green-500/10'
                              : 'border-red-200 bg-red-50/70 dark:border-red-500/20 dark:bg-red-500/10'
                          }`}
                        >
                          <div className="flex items-start justify-between gap-3">
                            <div className="min-w-0">
                              <div className="truncate font-mono text-sm text-gray-800 dark:text-gray-100">{item.code}</div>
                              <div className={`mt-1 text-sm ${item.success ? 'text-green-700 dark:text-green-300' : 'text-red-700 dark:text-red-300'}`}>
                                {item.detail}
                              </div>
                            </div>
                            <div className={`shrink-0 text-xs font-semibold ${item.success ? 'text-green-600 dark:text-green-300' : 'text-red-600 dark:text-red-300'}`}>
                              {item.success ? '成功' : '失败'}
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                ) : null}
              </>
            )}
          </div>
        )}
      </div>
    </div>,
    document.body,
  )
}
