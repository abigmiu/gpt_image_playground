import { useEffect, useRef, useState } from 'react'
import { useStore } from '../store'
import { useVersionCheck } from '../hooks/useVersionCheck'
import { useTooltip } from '../hooks/useTooltip'
import { dismissAllTooltips } from '../lib/tooltipDismiss'
import { clearSub2ApiAuthSession, getSub2ApiAuthSession, getSub2ApiCurrentUser, getSub2ApiUserDisplayName, logoutSub2Api, subscribeSub2ApiAuthChange, type Sub2ApiCurrentUser } from '../lib/sub2apiAuth'
import { listSub2ApiAnnouncements } from '../lib/sub2apiAnnouncements'
import ViewportTooltip from './ViewportTooltip'
import HelpModal from './HelpModal'
import Sub2ApiAuthModal from './Sub2ApiAuthModal'
import { useFavoriteCollectionTitle } from './FavoriteCollections'
import { BellIcon, HelpCircleIcon, InstallIcon, SettingsIcon } from './icons'

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>
}

function isInstalledPwa() {
  const nav = window.navigator as Navigator & { standalone?: boolean }
  return window.matchMedia('(display-mode: standalone)').matches || nav.standalone === true
}

export default function Header() {
  const appMode = useStore((s) => s.appMode)
  const setShowSettings = useStore((s) => s.setShowSettings)
  const setConfirmDialog = useStore((s) => s.setConfirmDialog)
  const setShowAnnouncementCenter = useStore((s) => s.setShowAnnouncementCenter)
  const filterFavorite = useStore((s) => s.filterFavorite)
  const activeFavoriteCollectionId = useStore((s) => s.activeFavoriteCollectionId)
  const favoriteCollectionTitle = useFavoriteCollectionTitle()
  const showFavoriteCollectionTitle = appMode === 'gallery' && Boolean(activeFavoriteCollectionId)
  const setShowSub2ApiPaymentModal = useStore((s) => s.setShowSub2ApiPaymentModal)
  const { hasUpdate, latestRelease, dismiss } = useVersionCheck()
  const [showHelp, setShowHelp] = useState(false)
  const [installPrompt, setInstallPrompt] = useState<BeforeInstallPromptEvent | null>(null)
  const [isPwaInstalled, setIsPwaInstalled] = useState(isInstalledPwa)
  const [scrollDirection, setScrollDirection] = useState<'up' | 'down'>('up')
  const [showAuthModal, setShowAuthModal] = useState(false)
  const [showHeaderMenu, setShowHeaderMenu] = useState(false)
  const [authUser, setAuthUser] = useState<Sub2ApiCurrentUser | null>(null)
  const [authReady, setAuthReady] = useState(false)
  const [announcementUnreadCount, setAnnouncementUnreadCount] = useState(0)
  const showToast = useStore((s) => s.showToast)
  const headerMenuRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    let lastScrollY = window.scrollY
    let ticking = false

    const handleScroll = () => {
      if (!ticking) {
        window.requestAnimationFrame(() => {
          const currentScrollY = window.scrollY
          if (currentScrollY < 20) {
            setScrollDirection('up')
          } else if (currentScrollY > lastScrollY + 10) {
            setScrollDirection('down')
          } else if (currentScrollY < lastScrollY - 10) {
            setScrollDirection('up')
          }
          lastScrollY = currentScrollY
          ticking = false
        })
        ticking = true
      }
    }

    window.addEventListener('scroll', handleScroll, { passive: true })
    return () => window.removeEventListener('scroll', handleScroll)
  }, [])

  const installTooltip = useTooltip()
  const helpTooltip = useTooltip()
  const announcementTooltip = useTooltip()
  const settingsTooltip = useTooltip()

  useEffect(() => {
    const handleBeforeInstallPrompt = (event: Event) => {
      event.preventDefault()
      setInstallPrompt(event as BeforeInstallPromptEvent)
      setIsPwaInstalled(false)
    }

    const handleAppInstalled = () => {
      setInstallPrompt(null)
      setIsPwaInstalled(true)
    }

    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt)
    window.addEventListener('appinstalled', handleAppInstalled)

    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt)
      window.removeEventListener('appinstalled', handleAppInstalled)
    }
  }, [])

  useEffect(() => {
    let cancelled = false

    const syncAuthUser = async () => {
      const session = getSub2ApiAuthSession()
      if (!session?.accessToken) {
        if (!cancelled) {
          setAuthUser(null)
          setAnnouncementUnreadCount(0)
          setAuthReady(true)
        }
        return
      }

      try {
        const user = await getSub2ApiCurrentUser()
        if (cancelled) return
        setAuthUser(user)
      } catch {
        if (cancelled) return
        clearSub2ApiAuthSession()
        setAuthUser(null)
      } finally {
        if (!cancelled) setAuthReady(true)
      }
    }

    void syncAuthUser()
    const unsubscribe = subscribeSub2ApiAuthChange(() => {
      void syncAuthUser()
    })

    return () => {
      cancelled = true
      unsubscribe()
    }
  }, [])

  useEffect(() => {
    let cancelled = false

    const syncAnnouncementUnread = async () => {
      const session = getSub2ApiAuthSession()
      if (!session?.accessToken) {
        if (!cancelled) setAnnouncementUnreadCount(0)
        return
      }
      try {
        const announcements = await listSub2ApiAnnouncements(true)
        if (!cancelled) setAnnouncementUnreadCount(announcements.length)
      } catch {
        if (!cancelled) setAnnouncementUnreadCount(0)
      }
    }

    void syncAnnouncementUnread()
    const unsubscribe = subscribeSub2ApiAuthChange(() => {
      void syncAnnouncementUnread()
    })

    return () => {
      cancelled = true
      unsubscribe()
    }
  }, [])

  useEffect(() => {
    if (!showHeaderMenu) return

    const handlePointerDown = (event: MouseEvent) => {
      if (headerMenuRef.current?.contains(event.target as Node)) return
      setShowHeaderMenu(false)
    }

    window.addEventListener('mousedown', handlePointerDown)
    return () => window.removeEventListener('mousedown', handlePointerDown)
  }, [showHeaderMenu])

  const authDisplayName = getSub2ApiUserDisplayName(authUser)

  const openRecharge = () => {
    dismissAllTooltips()
    setShowSub2ApiPaymentModal(true, 'recharge')
  }

  const openAnnouncements = () => {
    dismissAllTooltips()
    setShowAnnouncementCenter(true)
  }

  const openHelp = () => {
    dismissAllTooltips()
    setShowHelp(true)
  }

  const openSettings = () => {
    dismissAllTooltips()
    setShowSettings(true)
  }

  const handleLogout = async () => {
    try {
      await logoutSub2Api()
      setAuthUser(null)
      showToast('已退出登录', 'success')
    } catch (err) {
      showToast(err instanceof Error ? err.message : String(err), 'error')
    }
  }

  const handleInstallClick = async () => {
    if (installPrompt) {
      const promptEvent = installPrompt
      setInstallPrompt(null)

      try {
        await promptEvent.prompt()
        const choice = await promptEvent.userChoice
        setIsPwaInstalled(choice.outcome === 'accepted')
      } catch {
        setIsPwaInstalled(isInstalledPwa())
      }
    } else {
      const isIos = /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)
      if (isIos) {
        setConfirmDialog({
          title: '安装为应用',
          message: '在 Safari 浏览器中，点击底部「分享」按钮，选择「添加到主屏幕」即可安装此应用。',
          showCancel: false,
          confirmText: '我知道了',
          icon: 'info',
          action: () => {},
        })
      } else {
        setConfirmDialog({
          title: '安装为应用',
          message: '请在浏览器的菜单中选择「添加到主屏幕」或「安装应用」。\n\n（如果在微信等内置浏览器中，请先在外部浏览器打开）',
          showCancel: false,
          confirmText: '我知道了',
          icon: 'info',
          action: () => {},
        })
      }
    }
  }

  return (
    <>
      <header data-no-drag-select className="safe-area-top fixed top-0 left-0 right-0 z-40 bg-white/80 dark:bg-gray-950/80 backdrop-blur border-b border-gray-200 dark:border-white/[0.08] transition-transform duration-300 ease-in-out translate-y-0">
        <div className="safe-area-x safe-header-inner max-w-7xl mx-auto flex items-center justify-between relative">
          <div className="flex-1 min-w-0 pr-2 flex items-center gap-2">
            <div ref={headerMenuRef} className="relative mr-2 sm:hidden">
              <button
                type="button"
                onClick={() => setShowHeaderMenu((value) => !value)}
                className="inline-flex items-center gap-1 rounded-lg px-2 py-1.5 text-[17px] font-bold tracking-tight text-gray-800 transition-colors hover:bg-gray-100 hover:text-gray-600 dark:text-gray-100 dark:hover:bg-gray-900 dark:hover:text-gray-300 sm:text-lg"
                aria-haspopup="menu"
                aria-expanded={showHeaderMenu}
              >
                <span>菜单</span>
                <span className={`text-sm transition-transform ${showHeaderMenu ? 'rotate-180' : ''}`}>▼</span>
              </button>
              {showHeaderMenu ? (
                <div className="absolute left-0 top-full z-50 mt-2 min-w-[160px] overflow-hidden rounded-xl border border-gray-200/70 bg-white/95 p-1 shadow-xl ring-1 ring-black/5 dark:border-white/[0.08] dark:bg-gray-900/95 dark:ring-white/10">
                  <button
                    type="button"
                    onClick={() => {
                      setShowHeaderMenu(false)
                      setShowSub2ApiPaymentModal(true, 'recharge')
                    }}
                    className="block w-full rounded-lg px-3 py-2 text-left text-sm text-gray-700 transition-colors hover:bg-gray-100 dark:text-gray-200 dark:hover:bg-white/[0.06]"
                  >
                    充值
                  </button>
                </div>
              ) : null}
            </div>
            <nav className="hidden sm:flex items-center gap-1 mr-3">
              <button
                type="button"
                onClick={openRecharge}
                className="rounded-lg px-3 py-2 text-sm font-medium text-gray-600 transition-colors hover:bg-gray-100 hover:text-gray-900 dark:text-gray-300 dark:hover:bg-gray-900 dark:hover:text-gray-100"
              >
                充值
              </button>
              <button
                type="button"
                onClick={openAnnouncements}
                className="relative rounded-lg px-3 py-2 text-sm font-medium text-gray-600 transition-colors hover:bg-gray-100 hover:text-gray-900 dark:text-gray-300 dark:hover:bg-gray-900 dark:hover:text-gray-100"
              >
                公告
                {announcementUnreadCount > 0 ? (
                  <span className="absolute right-1.5 top-1.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-orange-500 px-1 text-[10px] font-bold leading-none text-white">
                    {announcementUnreadCount > 9 ? '9+' : announcementUnreadCount}
                  </span>
                ) : null}
              </button>
              <button
                type="button"
                onClick={openHelp}
                className="rounded-lg px-3 py-2 text-sm font-medium text-gray-600 transition-colors hover:bg-gray-100 hover:text-gray-900 dark:text-gray-300 dark:hover:bg-gray-900 dark:hover:text-gray-100"
              >
                操作指南
              </button>
              <button
                type="button"
                onClick={openSettings}
                className="rounded-lg px-3 py-2 text-sm font-medium text-gray-600 transition-colors hover:bg-gray-100 hover:text-gray-900 dark:text-gray-300 dark:hover:bg-gray-900 dark:hover:text-gray-100"
              >
                设置
              </button>
            </nav>
            <h1 className="inline-flex min-w-0 items-start relative">
              {showFavoriteCollectionTitle ? (
                <span className="min-w-0 truncate text-[17px] font-bold tracking-tight text-gray-800 dark:text-gray-100 sm:hidden" title={favoriteCollectionTitle}>{favoriteCollectionTitle}</span>
              ) : null}
              {hasUpdate && latestRelease && (
                <a
                  href={latestRelease.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={dismiss}
                  className="absolute -right-1 -top-1 translate-x-full -translate-y-1/4 px-1 py-0.5 rounded-[4px] border border-red-500/30 text-[9px] font-black bg-red-500 text-white hover:bg-red-600 transition-all animate-fade-in leading-none shadow-sm"
                  title={`新版本 ${latestRelease.tag}`}
                >
                  NEW
                </a>
              )}
            </h1>
          </div>
          {showFavoriteCollectionTitle && (
            <div className="absolute left-1/2 top-1/2 hidden max-w-[30%] -translate-x-1/2 -translate-y-1/2 sm:flex">
              <div className="truncate rounded px-2 py-1 text-sm font-semibold text-gray-700 dark:text-gray-300" title={favoriteCollectionTitle}>
                {favoriteCollectionTitle}
              </div>
            </div>
          )}
          <div className="flex items-center gap-1 shrink-0">
            {!isPwaInstalled && (
              <div
                className="relative"
                {...installTooltip.handlers}
              >
                <button
                  onClick={() => {
                    dismissAllTooltips()
                    handleInstallClick()
                  }}
                  className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-900 transition-colors"
                  aria-label="安装为应用"
                >
                  <InstallIcon className="w-5 h-5 text-gray-600 dark:text-gray-400" />
                </button>
                <ViewportTooltip visible={installTooltip.visible} className="whitespace-nowrap">
                  安装为应用
                </ViewportTooltip>
              </div>
            )}
            <div
              className="relative sm:hidden"
              {...announcementTooltip.handlers}
            >
              <button
                onClick={openAnnouncements}
                className="relative p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-900 transition-colors"
                aria-label="公告"
              >
                <BellIcon className={`w-5 h-5 ${announcementUnreadCount > 0 ? 'text-orange-500' : 'text-gray-600 dark:text-gray-400'}`} />
                {announcementUnreadCount > 0 ? (
                  <span className="absolute right-1 top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-orange-500 px-1 text-[10px] font-bold leading-none text-white">
                    {announcementUnreadCount > 9 ? '9+' : announcementUnreadCount}
                  </span>
                ) : null}
              </button>
              <ViewportTooltip visible={announcementTooltip.visible} className="whitespace-nowrap">
                公告
              </ViewportTooltip>
            </div>
            <div
              className="relative sm:hidden"
              {...helpTooltip.handlers}
            >
              <button
                onClick={openHelp}
                className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-900 transition-colors"
                aria-label="操作指南"
              >
                <HelpCircleIcon className="w-5 h-5 text-gray-600 dark:text-gray-400" />
              </button>
              <ViewportTooltip visible={helpTooltip.visible} className="whitespace-nowrap">
                操作指南
              </ViewportTooltip>
            </div>
            {authDisplayName ? (
              <div className="relative group">
                <button
                  type="button"
                  className="max-w-[180px] truncate px-3 py-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-900 transition-colors text-sm text-gray-600 dark:text-gray-400"
                  aria-label={authDisplayName}
                >
                  {authDisplayName}
                </button>
                <div className="invisible absolute right-0 top-full z-50 mt-1 min-w-[120px] overflow-hidden rounded-xl border border-gray-200/70 bg-white/95 p-1 opacity-0 shadow-xl ring-1 ring-black/5 transition-all group-hover:visible group-hover:opacity-100 dark:border-white/[0.08] dark:bg-gray-900/95 dark:ring-white/10">
                  <button
                    type="button"
                    onClick={handleLogout}
                    className="block w-full rounded-lg px-3 py-2 text-left text-sm text-gray-700 transition-colors hover:bg-gray-100 dark:text-gray-200 dark:hover:bg-white/[0.06]"
                  >
                    退出登录
                  </button>
                </div>
              </div>
            ) : (
              <button
                onClick={() => {
                  dismissAllTooltips()
                  setShowAuthModal(true)
                }}
                className="px-3 py-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-900 transition-colors text-sm text-gray-600 dark:text-gray-400"
                aria-label="登录"
                disabled={!authReady}
              >
                登录
              </button>
            )}
            <div
              className="relative sm:hidden"
              {...settingsTooltip.handlers}
            >
              <button
                onClick={openSettings}
                className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-900 transition-colors"
                aria-label="设置"
              >
                <SettingsIcon className="w-5 h-5 text-gray-600 dark:text-gray-400" />
              </button>
              <ViewportTooltip visible={settingsTooltip.visible} className="whitespace-nowrap">
                设置
              </ViewportTooltip>
            </div>
          </div>
        </div>
        <div className={`safe-area-x sm:hidden overflow-hidden transition-all duration-300 ease-in-out ${appMode === 'gallery' && scrollDirection === 'down' ? 'max-h-0 opacity-0 pb-0' : 'max-h-20 opacity-100 pb-2'}`}>
          <div className="mx-2 rounded-xl border border-gray-200 dark:border-white/[0.08] bg-gray-100/70 dark:bg-white/[0.04] px-4 py-2 text-center text-sm font-medium text-gray-900 dark:text-white shadow-sm">
            画廊
          </div>
        </div>
      </header>

      {showAuthModal ? <Sub2ApiAuthModal onClose={() => setShowAuthModal(false)} /> : null}

      <div className="safe-area-top invisible pointer-events-none transition-all duration-300 ease-in-out max-h-[500px] opacity-100" aria-hidden="true">
        <div className="safe-header-inner" />
        <div className={`safe-area-x sm:hidden overflow-hidden transition-all duration-300 ease-in-out ${appMode === 'gallery' && scrollDirection === 'down' ? 'max-h-0 pb-0' : 'max-h-20 pb-2'}`}>
          <div className="p-1">
            <div className="py-1.5 text-sm">占位</div>
          </div>
        </div>
      </div>
      {showHelp && <HelpModal appMode={appMode} isFavoriteCollectionOverview={appMode === 'gallery' && filterFavorite && !activeFavoriteCollectionId} onClose={() => setShowHelp(false)} />}
    </>
  )
}
