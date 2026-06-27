import { useEffect, useMemo, useState } from 'react'
import { cancelPaymentOrder, getMyPaymentOrders, type PaymentOrder } from '../lib/sub2apiPayment'
import { useStore } from '../store'

interface Sub2ApiOrdersPanelProps {
  active?: boolean
}

const PAGE_SIZE = 20

const STATUS_OPTIONS = [
  { value: '', label: '全部' },
  { value: 'PENDING', label: '待支付' },
  { value: 'COMPLETED', label: '已完成' },
  { value: 'FAILED', label: '失败' },
  { value: 'REFUNDED', label: '已退款' },
]

function formatDate(value: string) {
  const time = Date.parse(value)
  if (!Number.isFinite(time)) return value
  return new Date(time).toLocaleString('zh-CN')
}

function formatOrderAmount(order: PaymentOrder) {
  return `¥${order.pay_amount.toFixed(2)}`
}

function statusTone(status: string) {
  switch (status) {
    case 'PENDING':
      return 'border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-500/20 dark:bg-amber-500/10 dark:text-amber-300'
    case 'COMPLETED':
    case 'PAID':
    case 'RECHARGING':
      return 'border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-500/20 dark:bg-emerald-500/10 dark:text-emerald-300'
    case 'REFUNDED':
      return 'border-sky-200 bg-sky-50 text-sky-700 dark:border-sky-500/20 dark:bg-sky-500/10 dark:text-sky-300'
    case 'FAILED':
    case 'EXPIRED':
    case 'CANCELLED':
      return 'border-gray-200 bg-gray-50 text-gray-700 dark:border-white/[0.08] dark:bg-white/[0.04] dark:text-gray-300'
    default:
      return 'border-gray-200 bg-gray-50 text-gray-700 dark:border-white/[0.08] dark:bg-white/[0.04] dark:text-gray-300'
  }
}

function statusLabel(status: string) {
  switch (status) {
    case 'PENDING':
      return '待支付'
    case 'COMPLETED':
      return '已完成'
    case 'PAID':
      return '已支付'
    case 'RECHARGING':
      return '处理中'
    case 'FAILED':
      return '失败'
    case 'REFUNDED':
      return '已退款'
    case 'EXPIRED':
      return '已过期'
    case 'CANCELLED':
      return '已取消'
    default:
      return status || '未知'
  }
}

export default function Sub2ApiOrdersPanel({ active = true }: Sub2ApiOrdersPanelProps) {
  const showToast = useStore((s) => s.showToast)
  const [loading, setLoading] = useState(false)
  const [actionLoadingId, setActionLoadingId] = useState<number | null>(null)
  const [orders, setOrders] = useState<PaymentOrder[]>([])
  const [status, setStatus] = useState('')
  const [page, setPage] = useState(1)
  const [total, setTotal] = useState(0)

  const totalPages = useMemo(() => Math.max(1, Math.ceil(total / PAGE_SIZE)), [total])

  const loadOrders = async (nextPage = page, nextStatus = status) => {
    setLoading(true)
    try {
      const data = await getMyPaymentOrders({
        page: nextPage,
        page_size: PAGE_SIZE,
        status: nextStatus || undefined,
      })
      setOrders(Array.isArray(data.items) ? data.items : [])
      setTotal(typeof data.total === 'number' ? data.total : 0)
      setPage(typeof data.page === 'number' && data.page > 0 ? data.page : nextPage)
    } catch (err) {
      showToast(err instanceof Error ? err.message : '加载订单失败', 'error')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (!active) return
    void loadOrders(1, status)
  }, [active, status])

  const handleCancel = async (orderId: number) => {
    if (actionLoadingId === orderId) return
    setActionLoadingId(orderId)
    try {
      await cancelPaymentOrder(orderId)
      showToast('订单已取消', 'success')
      void loadOrders(page, status)
    } catch (err) {
      showToast(err instanceof Error ? err.message : '取消订单失败', 'error')
    } finally {
      setActionLoadingId(null)
    }
  }

  return (
    <div className="space-y-4 p-5">
      <div className="flex items-center gap-2">
        <select
          value={status}
          onChange={(event) => {
            setPage(1)
            setStatus(event.target.value)
          }}
          className="rounded-xl border border-gray-200/70 bg-white px-3 py-2 text-sm text-gray-700 outline-none transition focus:border-gray-400 dark:border-white/[0.08] dark:bg-white/[0.03] dark:text-gray-200 dark:focus:border-white/[0.16]"
        >
          {STATUS_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>{option.label}</option>
          ))}
        </select>
        <button
          type="button"
          onClick={() => {
            void loadOrders(page, status)
          }}
          disabled={loading}
          className="rounded-xl border border-gray-200 bg-gray-50/80 px-3 py-2 text-sm text-gray-700 transition hover:bg-gray-100 disabled:cursor-not-allowed disabled:opacity-50 dark:border-white/[0.08] dark:bg-white/[0.04] dark:text-gray-200 dark:hover:bg-white/[0.08]"
        >
          刷新
        </button>
      </div>

      <div className="rounded-2xl border border-gray-100 bg-white shadow-sm dark:border-white/[0.06] dark:bg-white/[0.02]">
        {loading ? (
          <div className="flex items-center justify-center py-16">
            <div className="h-8 w-8 animate-spin rounded-full border-4 border-gray-900 border-t-transparent dark:border-white dark:border-t-transparent" />
          </div>
        ) : orders.length === 0 ? (
          <div className="px-4 py-16 text-center text-sm text-gray-500 dark:text-gray-400">暂无订单</div>
        ) : (
          <div className="divide-y divide-gray-100 dark:divide-white/[0.06]">
            {orders.map((order) => (
              <div key={order.id} className="space-y-3 px-4 py-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="text-sm font-semibold text-gray-900 dark:text-white">#{order.id}</div>
                    <div className="mt-1 break-all text-xs text-gray-500 dark:text-gray-400">{order.out_trade_no}</div>
                  </div>
                  <span className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-medium ${statusTone(order.status)}`}>
                    {statusLabel(order.status)}
                  </span>
                </div>
                <div className="grid grid-cols-2 gap-3 text-sm">
                  <div>
                    <div className="text-gray-500 dark:text-gray-400">实付金额</div>
                    <div className="mt-1 font-medium text-gray-900 dark:text-white">{formatOrderAmount(order)}</div>
                  </div>
                  <div>
                    <div className="text-gray-500 dark:text-gray-400">到账余额</div>
                    <div className="mt-1 font-medium text-gray-900 dark:text-white">${order.amount.toFixed(2)}</div>
                  </div>
                  <div>
                    <div className="text-gray-500 dark:text-gray-400">支付方式</div>
                    <div className="mt-1 font-medium text-gray-900 capitalize dark:text-white">{order.payment_type}</div>
                  </div>
                  <div>
                    <div className="text-gray-500 dark:text-gray-400">创建时间</div>
                    <div className="mt-1 font-medium text-gray-900 dark:text-white">{formatDate(order.created_at)}</div>
                  </div>
                </div>
                {order.status === 'PENDING' ? (
                  <div className="flex justify-end">
                    <button
                      type="button"
                      onClick={() => {
                        void handleCancel(order.id)
                      }}
                      disabled={actionLoadingId === order.id}
                      className="rounded-xl border border-gray-200 bg-gray-50/80 px-3 py-2 text-sm text-gray-700 transition hover:bg-gray-100 disabled:cursor-not-allowed disabled:opacity-50 dark:border-white/[0.08] dark:bg-white/[0.04] dark:text-gray-200 dark:hover:bg-white/[0.08]"
                    >
                      {actionLoadingId === order.id ? '处理中…' : '取消订单'}
                    </button>
                  </div>
                ) : null}
              </div>
            ))}
          </div>
        )}
      </div>

      {total > 0 ? (
        <div className="flex items-center justify-between text-sm text-gray-500 dark:text-gray-400">
          <span>共 {total} 条</span>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => {
                const nextPage = Math.max(1, page - 1)
                setPage(nextPage)
                void loadOrders(nextPage, status)
              }}
              disabled={page <= 1 || loading}
              className="rounded-xl border border-gray-200 bg-gray-50/80 px-3 py-2 text-gray-700 transition hover:bg-gray-100 disabled:cursor-not-allowed disabled:opacity-50 dark:border-white/[0.08] dark:bg-white/[0.04] dark:text-gray-200 dark:hover:bg-white/[0.08]"
            >
              上一页
            </button>
            <span>{page} / {totalPages}</span>
            <button
              type="button"
              onClick={() => {
                const nextPage = Math.min(totalPages, page + 1)
                setPage(nextPage)
                void loadOrders(nextPage, status)
              }}
              disabled={page >= totalPages || loading}
              className="rounded-xl border border-gray-200 bg-gray-50/80 px-3 py-2 text-gray-700 transition hover:bg-gray-100 disabled:cursor-not-allowed disabled:opacity-50 dark:border-white/[0.08] dark:bg-white/[0.04] dark:text-gray-200 dark:hover:bg-white/[0.08]"
            >
              下一页
            </button>
          </div>
        </div>
      ) : null}
    </div>
  )
}
