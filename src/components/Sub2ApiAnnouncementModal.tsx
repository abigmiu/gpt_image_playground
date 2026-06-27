import { useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { usePreventBackgroundScroll } from '../hooks/usePreventBackgroundScroll'
import { dismissAllTooltips } from '../lib/tooltipDismiss'
import MarkdownRenderer from './MarkdownRenderer'
import { BellIcon } from './icons'
import type { Sub2ApiAnnouncement } from '../lib/sub2apiAnnouncements'

interface Sub2ApiAnnouncementModalProps {
  announcement: Sub2ApiAnnouncement
  markingRead: boolean
  onConfirmRead: () => void
}

function formatAnnouncementTime(value: string) {
  const time = Date.parse(value)
  if (Number.isNaN(time)) return value
  return new Intl.DateTimeFormat('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).format(time)
}

export default function Sub2ApiAnnouncementModal({
  announcement,
  markingRead,
  onConfirmRead,
}: Sub2ApiAnnouncementModalProps) {
  const modalRef = useRef<HTMLDivElement>(null)
  const [acknowledged, setAcknowledged] = useState(false)
  usePreventBackgroundScroll(true, modalRef)

  useEffect(() => {
    dismissAllTooltips()
    setAcknowledged(false)
  }, [announcement.id])

  const createdAt = useMemo(() => formatAnnouncementTime(announcement.created_at), [announcement.created_at])

  return createPortal(
    <div data-no-drag-select className="fixed inset-0 z-[130] flex items-center justify-center p-4 sm:p-6">
      <div className="absolute inset-0 bg-black/30 backdrop-blur-sm animate-overlay-in" />
      <div
        ref={modalRef}
        className="relative z-10 flex max-h-[85vh] w-full max-w-2xl flex-col overflow-hidden rounded-[2rem] border border-white/50 bg-white/95 shadow-2xl ring-1 ring-black/5 animate-modal-in dark:border-white/[0.08] dark:bg-gray-900/95 dark:ring-white/10"
      >
        <div className="border-b border-gray-200/80 px-6 py-5 dark:border-white/[0.08]">
          <div className="flex items-start gap-4">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-gray-100 text-gray-600 dark:bg-white/[0.06] dark:text-gray-300">
              <BellIcon className="h-5 w-5" />
            </div>
            <div className="min-w-0 flex-1">
              <div className="mb-2 inline-flex items-center rounded-full bg-gray-100 px-3 py-1 text-xs font-medium text-gray-600 dark:bg-white/[0.06] dark:text-gray-300">
                未读公告
              </div>
              <h2 className="text-xl font-semibold leading-8 text-gray-900 dark:text-gray-50">
                {announcement.title}
              </h2>
              <p className="mt-2 text-sm text-gray-500 dark:text-gray-400">
                {createdAt}
              </p>
            </div>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-5 sm:px-6">
          <MarkdownRenderer content={announcement.content} className="text-sm leading-7 text-gray-700 dark:text-gray-200" />
        </div>

        <div className="border-t border-gray-200/80 bg-white/80 px-5 py-4 dark:border-white/[0.08] dark:bg-gray-900/80 sm:px-6">
          <label className="flex cursor-pointer items-start gap-3 text-sm text-gray-600 dark:text-gray-300">
            <input
              type="checkbox"
              checked={acknowledged}
              onChange={(event) => setAcknowledged(event.target.checked)}
              className="mt-0.5 h-4 w-4 rounded border-gray-300 text-gray-900 focus:ring-gray-400 dark:border-white/[0.14] dark:bg-gray-900 dark:text-white"
            />
            <span>我已阅读以上公告内容</span>
          </label>
          <button
            type="button"
            onClick={onConfirmRead}
            disabled={!acknowledged || markingRead}
            className="mt-4 inline-flex w-full items-center justify-center rounded-2xl bg-gray-900 px-4 py-3 text-sm font-semibold text-white transition hover:bg-gray-800 dark:bg-white dark:text-gray-900 dark:hover:bg-gray-100 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {markingRead ? '确认中...' : '已阅读'}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  )
}
