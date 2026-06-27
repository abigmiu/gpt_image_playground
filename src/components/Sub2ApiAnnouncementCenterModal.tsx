import { useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useCloseOnEscape } from '../hooks/useCloseOnEscape'
import { usePreventBackgroundScroll } from '../hooks/usePreventBackgroundScroll'
import MarkdownRenderer from './MarkdownRenderer'
import { CloseIcon } from './icons'
import type { Sub2ApiAnnouncement } from '../lib/sub2apiAnnouncements'

interface Sub2ApiAnnouncementCenterModalProps {
  announcements: Sub2ApiAnnouncement[]
  loading: boolean
  onClose: () => void
  onMarkRead: (id: number) => Promise<void> | void
}

function formatAnnouncementTime(value: string) {
  const time = Date.parse(value)
  if (Number.isNaN(time)) return value
  return new Intl.DateTimeFormat('zh-CN', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).format(time)
}

export default function Sub2ApiAnnouncementCenterModal({
  announcements,
  loading,
  onClose,
  onMarkRead,
}: Sub2ApiAnnouncementCenterModalProps) {
  const modalRef = useRef<HTMLDivElement>(null)
  const [selectedId, setSelectedId] = useState<number | null>(null)
  const [markingId, setMarkingId] = useState<number | null>(null)
  useCloseOnEscape(true, onClose)
  usePreventBackgroundScroll(true, modalRef)

  useEffect(() => {
    if (announcements.length === 0) {
      setSelectedId(null)
      return
    }
    if (!announcements.some((item) => item.id === selectedId)) {
      setSelectedId(announcements[0]?.id ?? null)
    }
  }, [announcements, selectedId])

  const selectedAnnouncement = useMemo(
    () => announcements.find((item) => item.id === selectedId) ?? announcements[0] ?? null,
    [announcements, selectedId],
  )

  const handleMarkRead = async (id: number) => {
    if (markingId != null) return
    setMarkingId(id)
    try {
      await onMarkRead(id)
    } finally {
      setMarkingId(null)
    }
  }

  return createPortal(
    <div data-no-drag-select className="fixed inset-0 z-[125] flex items-center justify-center p-4 sm:p-6" onClick={onClose}>
      <div className="absolute inset-0 bg-black/25 backdrop-blur-md animate-overlay-in" />
      <div
        ref={modalRef}
        className="relative z-10 flex h-[82vh] w-full max-w-5xl overflow-hidden rounded-[2rem] border border-white/50 bg-white/95 shadow-2xl ring-1 ring-black/5 animate-modal-in dark:border-white/[0.08] dark:bg-gray-900/95 dark:ring-white/10"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex w-[38%] min-w-[280px] max-w-[360px] flex-col border-r border-gray-200/80 bg-gray-50/80 dark:border-white/[0.08] dark:bg-white/[0.03]">
          <div className="flex items-center justify-between gap-4 border-b border-gray-200/80 px-5 py-4 dark:border-white/[0.08]">
            <div>
              <h2 className="text-base font-semibold text-gray-900 dark:text-gray-50">公告</h2>
              <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">系统消息与通知</p>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="rounded-full p-2 text-gray-400 transition hover:bg-gray-200/70 hover:text-gray-700 dark:hover:bg-white/[0.06] dark:hover:text-gray-200"
              aria-label="关闭"
            >
              <CloseIcon className="h-4 w-4" />
            </button>
          </div>
          <div className="flex-1 overflow-y-auto p-3">
            {loading ? (
              <div className="rounded-2xl border border-dashed border-gray-200 px-4 py-8 text-center text-sm text-gray-500 dark:border-white/[0.08] dark:text-gray-400">
                加载中...
              </div>
            ) : announcements.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-gray-200 px-4 py-8 text-center text-sm text-gray-500 dark:border-white/[0.08] dark:text-gray-400">
                暂无公告
              </div>
            ) : (
              <div className="space-y-2">
                {announcements.map((item) => {
                  const selected = item.id === selectedAnnouncement?.id
                  const unread = !item.read_at
                  return (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => setSelectedId(item.id)}
                      className={`w-full rounded-2xl border px-4 py-3 text-left transition ${
                        selected
                          ? 'border-gray-200 bg-white shadow-sm dark:border-white/[0.12] dark:bg-gray-900'
                          : 'border-transparent bg-white/70 hover:border-gray-200 hover:bg-white dark:bg-transparent dark:hover:border-white/[0.08] dark:hover:bg-white/[0.03]'
                      }`}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <p className="line-clamp-2 text-sm font-medium text-gray-900 dark:text-gray-100">{item.title}</p>
                        {unread ? <span className="mt-1 h-2.5 w-2.5 shrink-0 rounded-full bg-gray-900 dark:bg-white" /> : null}
                      </div>
                      <p className="mt-2 text-xs text-gray-500 dark:text-gray-400">{formatAnnouncementTime(item.created_at)}</p>
                    </button>
                  )
                })}
              </div>
            )}
          </div>
        </div>

        <div className="flex min-w-0 flex-1 flex-col">
          <div className="border-b border-gray-200/80 px-5 py-5 dark:border-white/[0.08] sm:px-6">
            {selectedAnnouncement ? (
              <>
                <div className="mb-3 flex items-center gap-2">
                  <span className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-semibold ${
                    selectedAnnouncement.read_at
                      ? 'bg-emerald-500/10 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-200'
                      : 'bg-gray-100 text-gray-700 dark:bg-white/[0.06] dark:text-gray-200'
                  }`}>
                    {selectedAnnouncement.read_at ? '已读' : '未读'}
                  </span>
                </div>
                <h3 className="text-xl font-semibold leading-8 text-gray-900 dark:text-gray-50">{selectedAnnouncement.title}</h3>
                <p className="mt-2 text-sm text-gray-500 dark:text-gray-400">{formatAnnouncementTime(selectedAnnouncement.created_at)}</p>
              </>
            ) : (
              <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-50">公告</h3>
            )}
          </div>

          <div className="flex-1 overflow-y-auto px-5 py-5 sm:px-6">
            {selectedAnnouncement ? (
              <MarkdownRenderer content={selectedAnnouncement.content} className="text-sm leading-7 text-gray-700 dark:text-gray-200" />
            ) : (
              <div className="rounded-[1.5rem] border border-dashed border-gray-200 px-4 py-8 text-center text-sm text-gray-500 dark:border-white/[0.08] dark:text-gray-400">
                暂无公告
              </div>
            )}
          </div>

          {selectedAnnouncement && !selectedAnnouncement.read_at ? (
            <div className="border-t border-gray-200/80 px-5 py-4 dark:border-white/[0.08] sm:px-6">
              <button
                type="button"
                onClick={() => void handleMarkRead(selectedAnnouncement.id)}
                disabled={markingId === selectedAnnouncement.id}
                className="inline-flex items-center justify-center rounded-2xl bg-gray-900 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-gray-800 dark:bg-white dark:text-gray-900 dark:hover:bg-gray-100 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {markingId === selectedAnnouncement.id ? '处理中...' : '标记已读'}
              </button>
            </div>
          ) : null}
        </div>
      </div>
    </div>,
    document.body,
  )
}
