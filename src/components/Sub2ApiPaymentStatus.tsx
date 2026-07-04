import { useEffect, useMemo, useRef, useState } from 'react'
import QRCode from 'qrcode'
import { useStore } from '../store'
import { cancelPaymentOrder, getPaymentOrder, type PaymentOrder, verifyPaymentOrder } from '../lib/sub2apiPayment'

interface Sub2ApiPaymentStatusProps {
  orderId: number
  qrCode: string
  expiresAt: string
  paymentType: string
  payUrl?: string
  currency?: string
  onDone: () => void
  onSuccess: (order: PaymentOrder) => void
  onSettled: (outcome: 'success' | 'cancelled' | 'expired') => void
}

type PaymentOutcome = 'success' | 'cancelled' | 'expired'

const VERIFY_RETRY_INTERVAL_MS = 15000
const VERIFY_RETRY_MAX_ATTEMPTS = 6

function formatGatewayAmount(value: number, currency?: string) {
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

function isSuccessStatus(status: string | null | undefined) {
  return status === 'COMPLETED' || status === 'PAID' || status === 'RECHARGING'
}

export default function Sub2ApiPaymentStatus({
  orderId,
  qrCode,
  expiresAt,
  paymentType,
  payUrl,
  currency,
  onDone,
  onSuccess,
  onSettled,
}: Sub2ApiPaymentStatusProps) {
  const showToast = useStore((s) => s.showToast)
  const qrCanvasRef = useRef<HTMLCanvasElement | null>(null)
  const [remainingSeconds, setRemainingSeconds] = useState(0)
  const [outcome, setOutcome] = useState<PaymentOutcome | null>(null)
  const [paidOrder, setPaidOrder] = useState<PaymentOrder | null>(null)
  const [cancelling, setCancelling] = useState(false)
  const verifyAttemptsRef = useRef(0)
  const lastVerifyAtRef = useRef(0)

  const isAlipay = paymentType.includes('alipay')
  const isWxpay = paymentType.includes('wxpay')

  const title = useMemo(() => {
    if (isAlipay) return '支付宝扫码支付'
    if (isWxpay) return '微信扫码支付'
    return '请扫码支付'
  }, [isAlipay, isWxpay])

  const hint = useMemo(() => {
    if (isAlipay) return '请使用手机打开支付宝，扫描二维码完成支付'
    if (isWxpay) return '请使用手机打开微信，扫描二维码完成支付'
    return ''
  }, [isAlipay, isWxpay])

  useEffect(() => {
    if (!qrCanvasRef.current || !qrCode) return
    void QRCode.toCanvas(qrCanvasRef.current, qrCode, {
      width: 220,
      margin: 2,
      errorCorrectionLevel: 'M',
    })
  }, [qrCode])

  useEffect(() => {
    let cancelled = false
    const expiresAtMs = expiresAt ? Date.parse(expiresAt) : NaN
    const initialSeconds = Number.isFinite(expiresAtMs)
      ? Math.max(0, Math.floor((expiresAtMs - Date.now()) / 1000))
      : 30 * 60
    setRemainingSeconds(initialSeconds)

    if (initialSeconds <= 0) {
      setOutcome('expired')
      onSettled('expired')
      return
    }

    const countdownTimer = window.setInterval(() => {
      setRemainingSeconds((value) => {
        if (value <= 1) {
          window.clearInterval(countdownTimer)
          if (!cancelled) {
            setOutcome('expired')
            onSettled('expired')
          }
          return 0
        }
        return value - 1
      })
    }, 1000)

    const pollStatus = async () => {
      if (cancelled || outcome) return
      try {
        let order = await getPaymentOrder(orderId)
        const normalizedStatus = String(order.status || '').trim().toUpperCase()
        const outTradeNo = String(order.out_trade_no || '').trim()

        if (isWxpay && normalizedStatus === 'PENDING' && outTradeNo) {
          const now = Date.now()
          if (
            verifyAttemptsRef.current < VERIFY_RETRY_MAX_ATTEMPTS &&
            now - lastVerifyAtRef.current >= VERIFY_RETRY_INTERVAL_MS
          ) {
            lastVerifyAtRef.current = now
            verifyAttemptsRef.current += 1
            try {
              order = await verifyPaymentOrder(outTradeNo)
            } catch {
              // keep best effort
            }
          }
        }

        if (isSuccessStatus(order.status)) {
          if (cancelled) return
          setPaidOrder(order)
          setOutcome('success')
          onSuccess(order)
          onSettled('success')
          return
        }
        if (order.status === 'CANCELLED') {
          if (cancelled) return
          setOutcome('cancelled')
          onSettled('cancelled')
          return
        }
        if (order.status === 'EXPIRED' || order.status === 'FAILED') {
          if (cancelled) return
          setOutcome('expired')
          onSettled('expired')
        }
      } catch {
        // ignore polling error
      }
    }

    const pollTimer = window.setInterval(() => {
      void pollStatus()
    }, 3000)

    void pollStatus()

    return () => {
      cancelled = true
      window.clearInterval(countdownTimer)
      window.clearInterval(pollTimer)
    }
  }, [expiresAt, isWxpay, onSettled, onSuccess, orderId, outcome])

  const countdownDisplay = useMemo(() => {
    const minutes = Math.floor(remainingSeconds / 60)
    const seconds = remainingSeconds % 60
    return `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`
  }, [remainingSeconds])

  const reopenPopup = () => {
    if (!payUrl) return
    const win = window.open(payUrl, 'paymentPopup', 'popup=yes,width=520,height=760')
    if (!win || win.closed) {
      window.location.href = payUrl
    }
  }

  const handleCancel = async () => {
    if (!orderId || cancelling) return
    setCancelling(true)
    try {
      await cancelPaymentOrder(orderId)
      setOutcome('cancelled')
      onSettled('cancelled')
    } catch (err) {
      showToast(err instanceof Error ? err.message : '取消订单失败', 'error')
    } finally {
      setCancelling(false)
    }
  }

  if (outcome === 'success') {
    return (
      <div className="space-y-4">
        <div className="rounded-2xl border border-gray-100 bg-white p-4 shadow-sm dark:border-white/[0.06] dark:bg-white/[0.02]">
          <div className="flex flex-col items-center gap-4 py-4">
            <div className="flex h-16 w-16 items-center justify-center rounded-full bg-green-100 text-green-600 dark:bg-green-900/30 dark:text-green-400">
              <svg className="h-8 w-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
              </svg>
            </div>
            <p className="text-lg font-bold text-gray-900 dark:text-white">支付成功</p>
            {paidOrder ? (
              <div className="w-full rounded-xl bg-gray-50/80 p-4 text-sm dark:bg-white/[0.04]">
                <div className="space-y-2">
                  <div className="flex items-center justify-between gap-4">
                    <span className="text-gray-500 dark:text-gray-400">订单 ID</span>
                    <span className="font-medium text-gray-900 dark:text-white">#{paidOrder.id}</span>
                  </div>
                  <div className="flex items-center justify-between gap-4">
                    <span className="text-gray-500 dark:text-gray-400">订单编号</span>
                    <span className="font-medium text-gray-900 dark:text-white">{paidOrder.out_trade_no}</span>
                  </div>
                  <div className="flex items-center justify-between gap-4">
                    <span className="text-gray-500 dark:text-gray-400">到账点数</span>
                    <span className="font-medium text-gray-900 dark:text-white">{paidOrder.amount.toFixed(2)} 点</span>
                  </div>
                  <div className="flex items-center justify-between gap-4">
                    <span className="text-gray-500 dark:text-gray-400">实付金额</span>
                    <span className="font-medium text-gray-900 dark:text-white">{formatGatewayAmount(paidOrder.pay_amount, currency)}</span>
                  </div>
                </div>
              </div>
            ) : null}
            <button
              type="button"
              onClick={onDone}
              className="rounded-xl bg-gray-100/80 px-4 py-2.5 text-sm font-medium text-gray-700 transition-all hover:bg-gray-200 hover:text-gray-900 dark:bg-white/[0.06] dark:text-gray-300 dark:hover:bg-white/[0.1] dark:hover:text-white"
            >
              完成
            </button>
          </div>
        </div>
      </div>
    )
  }

  if (outcome === 'cancelled' || outcome === 'expired') {
    const isCancelled = outcome === 'cancelled'
    return (
      <div className="space-y-4">
        <div className="rounded-2xl border border-gray-100 bg-white p-4 shadow-sm dark:border-white/[0.06] dark:bg-white/[0.02]">
          <div className="flex flex-col items-center gap-4 py-4">
            <div className={`flex h-16 w-16 items-center justify-center rounded-full ${isCancelled ? 'bg-gray-100 text-gray-400 dark:bg-white/[0.06] dark:text-gray-500' : 'bg-orange-100 text-orange-500 dark:bg-orange-900/30 dark:text-orange-400'}`}>
              <svg className="h-8 w-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                {isCancelled ? (
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M6 18L18 6M6 6l12 12" />
                ) : (
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z" />
                )}
              </svg>
            </div>
            <p className="text-lg font-bold text-gray-900 dark:text-white">{isCancelled ? '订单已取消' : '订单已过期'}</p>
            <p className="text-sm text-gray-500 dark:text-gray-400">{isCancelled ? '您已取消本次支付' : '订单已超时，请重新创建订单'}</p>
            <button
              type="button"
              onClick={onDone}
              className="rounded-xl bg-gray-100/80 px-4 py-2.5 text-sm font-medium text-gray-700 transition-all hover:bg-gray-200 hover:text-gray-900 dark:bg-white/[0.06] dark:text-gray-300 dark:hover:bg-white/[0.1] dark:hover:text-white"
            >
              完成
            </button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {qrCode ? (
        <div className="rounded-2xl border border-gray-100 bg-white p-4 shadow-sm dark:border-white/[0.06] dark:bg-white/[0.02]">
          <div className="flex flex-col items-center gap-4">
            <p className="text-lg font-semibold text-gray-900 dark:text-white">{title}</p>
            <div className={`rounded-xl border-2 p-4 ${isAlipay ? 'border-sky-400 bg-sky-50 dark:border-sky-400/70 dark:bg-sky-950/20' : 'border-emerald-500 bg-emerald-50 dark:border-emerald-500/70 dark:bg-emerald-950/20'}`}>
              <canvas ref={qrCanvasRef} className="mx-auto" />
            </div>
            {hint ? <p className="text-center text-sm text-gray-500 dark:text-gray-400">{hint}</p> : null}
            {payUrl ? (
              <button
                type="button"
                onClick={reopenPopup}
                className="rounded-xl border border-gray-200 bg-gray-50/80 px-4 py-2 text-sm font-medium text-gray-700 transition hover:bg-gray-100 hover:text-gray-900 dark:border-white/[0.08] dark:bg-white/[0.04] dark:text-gray-200 dark:hover:bg-white/[0.08] dark:hover:text-white"
              >
                重新打开支付页面
              </button>
            ) : null}
          </div>
        </div>
      ) : (
        <div className="rounded-2xl border border-gray-100 bg-white p-4 shadow-sm dark:border-white/[0.06] dark:bg-white/[0.02]">
          <div className="flex flex-col items-center gap-4 py-4">
            <div className="h-10 w-10 animate-spin rounded-full border-4 border-gray-900 border-t-transparent dark:border-white dark:border-t-transparent" />
            <p className="text-sm text-gray-500 dark:text-gray-400">支付页面已在新窗口打开，请在新窗口完成支付后返回此处。</p>
            {payUrl ? (
              <button
                type="button"
                onClick={reopenPopup}
                className="rounded-xl border border-gray-200 bg-gray-50/80 px-4 py-2 text-sm font-medium text-gray-700 transition hover:bg-gray-100 hover:text-gray-900 dark:border-white/[0.08] dark:bg-white/[0.04] dark:text-gray-200 dark:hover:bg-white/[0.08] dark:hover:text-white"
              >
                重新打开支付页面
              </button>
            ) : null}
          </div>
        </div>
      )}
      <div className="rounded-2xl border border-gray-100 bg-white p-4 text-center shadow-sm dark:border-white/[0.06] dark:bg-white/[0.02]">
        <p className="text-sm text-gray-500 dark:text-gray-400">剩余支付时间</p>
        <p className="mt-1 text-2xl font-bold tabular-nums text-gray-900 dark:text-white">{countdownDisplay}</p>
        <p className="mt-1 text-xs text-gray-400 dark:text-gray-500">等待支付...</p>
      </div>
      <button
        type="button"
        disabled={cancelling}
        onClick={() => {
          void handleCancel()
        }}
        className="w-full rounded-xl border border-gray-200 bg-gray-50/80 px-5 py-3 text-sm font-medium text-gray-700 transition hover:bg-gray-100 hover:text-gray-900 disabled:cursor-not-allowed disabled:opacity-50 dark:border-white/[0.08] dark:bg-white/[0.04] dark:text-gray-200 dark:hover:bg-white/[0.08] dark:hover:text-white"
      >
        {cancelling ? '处理中' : '取消订单'}
      </button>
    </div>
  )
}
