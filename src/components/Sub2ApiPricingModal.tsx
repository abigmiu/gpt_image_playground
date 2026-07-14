import { useEffect, useRef, useState } from 'react'
import { usePreventBackgroundScroll } from '../hooks/usePreventBackgroundScroll'
import {
  formatSub2ApiPlaygroundPrice,
  getSub2ApiPlaygroundPricing,
  type Sub2ApiPlaygroundPricing,
  type Sub2ApiPlaygroundPricingTier,
} from '../lib/sub2apiPlaygroundPricing'

interface Sub2ApiPricingModalProps {
  onClose: () => void
}

const TIERS: Sub2ApiPlaygroundPricingTier[] = ['1K', '2K', '4K', 'UNSTABLE']

export default function Sub2ApiPricingModal({ onClose }: Sub2ApiPricingModalProps) {
  const modalRef = useRef<HTMLDivElement>(null)
  const [pricing, setPricing] = useState<Sub2ApiPlaygroundPricing | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  usePreventBackgroundScroll(true, modalRef)

  useEffect(() => {
    let cancelled = false

    const load = async () => {
      try {
        const next = await getSub2ApiPlaygroundPricing()
        if (cancelled) return
        setPricing(next)
        setError('')
      } catch (err) {
        if (cancelled) return
        setPricing(null)
        setError(err instanceof Error ? err.message : '加载失败')
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    void load()
    return () => {
      cancelled = true
    }
  }, [])

  return (
    <div data-no-drag-select className="fixed inset-0 z-[70] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/30 backdrop-blur-sm animate-overlay-in" onClick={onClose} />
      <div
        ref={modalRef}
        className="relative z-10 w-full max-w-md overflow-hidden rounded-3xl border border-white/50 bg-white/95 shadow-2xl ring-1 ring-black/5 animate-modal-in dark:border-white/[0.08] dark:bg-gray-900/95 dark:ring-white/10"
      >
        <div className="flex items-start justify-between border-b border-gray-200/70 px-5 py-4 dark:border-white/[0.08]">
          <h3 className="text-base font-semibold text-gray-800 dark:text-gray-100">价格</h3>
          <button
            onClick={onClose}
            className="rounded-full p-1 text-gray-400 transition hover:bg-gray-100 hover:text-gray-600 dark:hover:bg-white/[0.06] dark:hover:text-gray-200"
            aria-label="关闭"
          >
            <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="px-5 py-4">
          {loading ? (
            <div className="py-10 text-center text-sm text-gray-500 dark:text-gray-400">加载中...</div>
          ) : error ? (
            <div className="py-10 text-center text-sm text-gray-500 dark:text-gray-400">{error}</div>
          ) : (
            <div className="space-y-3">
              {TIERS.map((tier) => {
                const item = pricing?.[tier]
                return (
                  <div
                    key={tier}
                    className="flex items-center justify-between rounded-2xl border border-gray-200/70 bg-gray-50/80 px-4 py-3 dark:border-white/[0.08] dark:bg-white/[0.03]"
                  >
                    <div className="min-w-0">
                      <div className="text-sm font-semibold text-gray-800 dark:text-gray-100">
                        {tier === 'UNSTABLE' ? '1K / 2K 不固定' : tier}
                      </div>
                      {item?.group_name ? (
                        <div className="mt-1 truncate text-xs text-gray-500 dark:text-gray-400">{item.group_name}</div>
                      ) : null}
                    </div>
                    {tier === 'UNSTABLE' ? (
                      <div className="shrink-0 text-right text-sm font-semibold text-gray-900 dark:text-white">
                        <span>1K {formatSub2ApiPlaygroundPrice(item?.price_1k)}</span>
                        <span className="mx-1 text-gray-400">/</span>
                        <span>2K {formatSub2ApiPlaygroundPrice(item?.price_2k)}</span>
                      </div>
                    ) : (
                      <div className="shrink-0 text-right text-base font-semibold text-gray-900 dark:text-white">
                        {formatSub2ApiPlaygroundPrice(item?.price)}
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
