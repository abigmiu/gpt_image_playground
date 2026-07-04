import { useEffect, useMemo, useState } from 'react'
import { listSub2ApiUsage, type Sub2ApiUsageLog } from '../lib/sub2apiUsage'
import { useStore } from '../store'

interface Sub2ApiUsagePanelProps {
  active?: boolean
}

const PAGE_SIZE = 20

function formatDate(value: string) {
  const time = Date.parse(value)
  if (!Number.isFinite(time)) return value
  return new Date(time).toLocaleString('zh-CN')
}

function formatCost(value: number) {
  return `${value.toFixed(6)} 点`
}

export default function Sub2ApiUsagePanel({ active = true }: Sub2ApiUsagePanelProps) {
  const showToast = useStore((s) => s.showToast)
  const [loading, setLoading] = useState(false)
  const [rows, setRows] = useState<Sub2ApiUsageLog[]>([])
  const [page, setPage] = useState(1)
  const [total, setTotal] = useState(0)

  const totalPages = useMemo(() => Math.max(1, Math.ceil(total / PAGE_SIZE)), [total])

  const loadUsage = async (nextPage = page) => {
    setLoading(true)
    try {
      const data = await listSub2ApiUsage({
        page: nextPage,
        page_size: PAGE_SIZE,
        sort_by: 'created_at',
        sort_order: 'desc',
      })
      setRows(Array.isArray(data.items) ? data.items : [])
      setTotal(typeof data.total === 'number' ? data.total : 0)
      setPage(typeof data.page === 'number' && data.page > 0 ? data.page : nextPage)
    } catch (err) {
      showToast(err instanceof Error ? err.message : '加载使用记录失败', 'error')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (!active) return
    void loadUsage(1)
  }, [active])

  return (
    <div className="space-y-4 p-5">
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => {
            void loadUsage(page)
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
        ) : rows.length === 0 ? (
          <div className="px-4 py-16 text-center text-sm text-gray-500 dark:text-gray-400">暂无使用记录</div>
        ) : (
          <div className="divide-y divide-gray-100 dark:divide-white/[0.06]">
            {rows.map((row) => (
              <div key={row.id} className="flex items-center justify-between gap-4 px-4 py-4">
                <div className="min-w-0">
                  <div className="text-xs text-gray-500 dark:text-gray-400">时间</div>
                  <div className="mt-1 text-sm font-medium text-gray-900 dark:text-white">{formatDate(row.created_at)}</div>
                </div>
                <div className="text-right">
                  <div className="text-xs text-gray-500 dark:text-gray-400">消耗点数</div>
                  <div className="mt-1 text-sm font-semibold text-gray-900 dark:text-white">{formatCost(row.actual_cost ?? 0)}</div>
                </div>
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
                void loadUsage(nextPage)
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
                void loadUsage(nextPage)
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
