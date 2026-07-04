import { useEffect } from 'react'
import { initStore } from './store'
import { useStore } from './store'
import { useDockerApiUrlMigrationNotice } from './hooks/useDockerApiUrlMigrationNotice'
import { useSub2ApiAnnouncementGate } from './hooks/useSub2ApiAnnouncementGate'
import {
  getCachedSub2ApiCurrentUser,
  subscribeSub2ApiAuthChange,
  subscribeSub2ApiCurrentUserChange,
} from './lib/sub2apiAuth'
import Header from './components/Header'
import SearchBar from './components/SearchBar'
import TaskGrid from './components/TaskGrid'
import InputBar from './components/InputBar'
import DetailModal from './components/DetailModal'
import Lightbox from './components/Lightbox'
import SettingsModal from './components/SettingsModal'
import ConfirmDialog from './components/ConfirmDialog'
import Toast from './components/Toast'
import MaskEditorModal from './components/MaskEditorModal'
import ImageContextMenu from './components/ImageContextMenu'
import SupportPromptModal from './components/SupportPromptModal'
import Sub2ApiPaymentModal from './components/Sub2ApiPaymentModal'
import Sub2ApiOrdersModal from './components/Sub2ApiOrdersModal'
import Sub2ApiUsageModal from './components/Sub2ApiUsageModal'
import Sub2ApiAnnouncementModal from './components/Sub2ApiAnnouncementModal'
import Sub2ApiAnnouncementCenterModal from './components/Sub2ApiAnnouncementCenterModal'
import { FavoriteCollectionPickerModal, FavoriteCollectionsView, ManageCollectionsModal } from './components/FavoriteCollections'
import { useGlobalClickSuppression } from './lib/clickSuppression'

type TawkApi = {
  onLoad?: () => void
  setAttributes?: (attributes: Record<string, string>, callback?: (error: unknown) => void) => void
  logout?: (callback?: (error: unknown) => void) => void
}

function syncTawkUser() {
  if (typeof window === 'undefined') return

  const tawkApi = window as Window & { Tawk_API?: TawkApi }
  const user = getCachedSub2ApiCurrentUser()
  const apply = () => {
    if (!user) {
      tawkApi.Tawk_API?.logout?.(() => {})
      return
    }

    tawkApi.Tawk_API?.setAttributes?.({
      'user-id': user.id ? String(user.id) : '',
      'user-email': user.email?.trim() || '',
      'user-name': user.display_name?.trim() || user.nickname?.trim() || user.username?.trim() || '',
    }, () => {})
  }

  if (typeof tawkApi.Tawk_API?.setAttributes === 'function' || typeof tawkApi.Tawk_API?.logout === 'function') {
    apply()
    return
  }

  tawkApi.Tawk_API = tawkApi.Tawk_API || {}
  const previousOnLoad = tawkApi.Tawk_API.onLoad
  tawkApi.Tawk_API.onLoad = () => {
    previousOnLoad?.()
    apply()
  }
}

export default function App() {
  const filterFavorite = useStore((s) => s.filterFavorite)
  const activeFavoriteCollectionId = useStore((s) => s.activeFavoriteCollectionId)
  const showSub2ApiPaymentModal = useStore((s) => s.showSub2ApiPaymentModal)
  const setShowSub2ApiPaymentModal = useStore((s) => s.setShowSub2ApiPaymentModal)
  const sub2ApiPaymentModalTab = useStore((s) => s.sub2ApiPaymentModalTab)
  const showAnnouncementCenter = useStore((s) => s.showAnnouncementCenter)
  const setShowAnnouncementCenter = useStore((s) => s.setShowAnnouncementCenter)
  const {
    currentAnnouncement,
    announcements,
    loadingAnnouncements,
    markingRead,
    confirmAnnouncementRead,
    refreshAnnouncements,
    markAnnouncementRead,
  } = useSub2ApiAnnouncementGate()
  useDockerApiUrlMigrationNotice()
  useGlobalClickSuppression()

  useEffect(() => {
    initStore()
  }, [])

  useEffect(() => {
    const preventPageImageDrag = (e: DragEvent) => {
      if ((e.target as HTMLElement | null)?.closest('img')) {
        e.preventDefault()
      }
    }

    document.addEventListener('dragstart', preventPageImageDrag)
    return () => document.removeEventListener('dragstart', preventPageImageDrag)
  }, [])

  useEffect(() => {
    syncTawkUser()
    const unsubscribeAuth = subscribeSub2ApiAuthChange(() => {
      syncTawkUser()
    })
    const unsubscribeUserChange = subscribeSub2ApiCurrentUserChange(() => {
      syncTawkUser()
    })

    return () => {
      unsubscribeAuth()
      unsubscribeUserChange()
    }
  }, [])

  return (
    <>
      <Header />
      <main data-home-main data-drag-select-surface className="pb-48">
        <div className="safe-area-x max-w-7xl mx-auto">
          <SearchBar />
          {filterFavorite && !activeFavoriteCollectionId ? <FavoriteCollectionsView /> : <TaskGrid />}
        </div>
      </main>
      <InputBar />
      <DetailModal />
      <Lightbox />
      <SettingsModal />
      <ConfirmDialog />
      <SupportPromptModal />
      <FavoriteCollectionPickerModal />
      <ManageCollectionsModal />
      <Toast />
      <MaskEditorModal />
      <ImageContextMenu />
      {showSub2ApiPaymentModal && sub2ApiPaymentModalTab === 'recharge' ? (
        <Sub2ApiPaymentModal onClose={() => setShowSub2ApiPaymentModal(false)} />
      ) : null}
      {showSub2ApiPaymentModal && sub2ApiPaymentModalTab === 'orders' ? (
        <Sub2ApiOrdersModal onClose={() => setShowSub2ApiPaymentModal(false)} />
      ) : null}
      {showSub2ApiPaymentModal && sub2ApiPaymentModalTab === 'usage' ? (
        <Sub2ApiUsageModal onClose={() => setShowSub2ApiPaymentModal(false)} />
      ) : null}
      {showAnnouncementCenter ? (
        <Sub2ApiAnnouncementCenterModal
          announcements={announcements}
          loading={loadingAnnouncements}
          onClose={() => setShowAnnouncementCenter(false)}
          onMarkRead={markAnnouncementRead}
        />
      ) : null}
      {currentAnnouncement ? (
        <Sub2ApiAnnouncementModal
          announcement={currentAnnouncement}
          markingRead={markingRead}
          onConfirmRead={confirmAnnouncementRead}
        />
      ) : null}
    </>
  )
}
