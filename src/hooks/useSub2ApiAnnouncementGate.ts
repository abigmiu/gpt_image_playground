import { useEffect, useRef, useState } from 'react'
import { getSub2ApiAuthSession, subscribeSub2ApiAuthChange } from '../lib/sub2apiAuth'
import { listSub2ApiAnnouncements, markSub2ApiAnnouncementRead, type Sub2ApiAnnouncement } from '../lib/sub2apiAnnouncements'
import { useStore } from '../store'

export function useSub2ApiAnnouncementGate() {
  const showToast = useStore((s) => s.showToast)
  const [currentAnnouncement, setCurrentAnnouncement] = useState<Sub2ApiAnnouncement | null>(null)
  const [announcements, setAnnouncements] = useState<Sub2ApiAnnouncement[]>([])
  const [loadingAnnouncements, setLoadingAnnouncements] = useState(false)
  const [markingRead, setMarkingRead] = useState(false)
  const requestTokenRef = useRef(0)

  useEffect(() => {
    let disposed = false

    const syncAnnouncements = async (unreadOnly = false) => {
      const session = getSub2ApiAuthSession()
      const token = ++requestTokenRef.current

      if (!session?.accessToken) {
        if (!disposed && token === requestTokenRef.current) {
          setCurrentAnnouncement(null)
          setAnnouncements([])
          setMarkingRead(false)
          setLoadingAnnouncements(false)
        }
        return
      }

      try {
        setLoadingAnnouncements(true)
        const nextAnnouncements = await listSub2ApiAnnouncements(unreadOnly)
        if (disposed || token !== requestTokenRef.current) return
        setAnnouncements(nextAnnouncements)
        const nextAnnouncement = nextAnnouncements.find((item) => item.notify_mode === 'popup' && !item.read_at) ?? null
        setCurrentAnnouncement(nextAnnouncement)
        setMarkingRead(false)
      } catch (error) {
        if (disposed || token !== requestTokenRef.current) return
        setCurrentAnnouncement(null)
        setAnnouncements([])
        setMarkingRead(false)
        showToast(error instanceof Error ? error.message : String(error), 'error')
      } finally {
        if (!disposed && token === requestTokenRef.current) {
          setLoadingAnnouncements(false)
        }
      }
    }

    void syncAnnouncements()
    const unsubscribe = subscribeSub2ApiAuthChange(() => {
      void syncAnnouncements()
    })

    return () => {
      disposed = true
      unsubscribe()
    }
  }, [showToast])

  const refreshAnnouncements = async (unreadOnly = false) => {
    const session = getSub2ApiAuthSession()
    if (!session?.accessToken) {
      setAnnouncements([])
      setCurrentAnnouncement(null)
      return
    }
    setLoadingAnnouncements(true)
    try {
      const nextAnnouncements = await listSub2ApiAnnouncements(unreadOnly)
      setAnnouncements(nextAnnouncements)
      const nextAnnouncement = nextAnnouncements.find((item) => item.notify_mode === 'popup' && !item.read_at) ?? null
      setCurrentAnnouncement(nextAnnouncement)
    } catch (error) {
      setAnnouncements([])
      setCurrentAnnouncement(null)
      showToast(error instanceof Error ? error.message : String(error), 'error')
    } finally {
      setLoadingAnnouncements(false)
    }
  }

  const confirmAnnouncementRead = async () => {
    if (!currentAnnouncement || markingRead) return
    setMarkingRead(true)
    try {
      await markSub2ApiAnnouncementRead(currentAnnouncement.id)
      await refreshAnnouncements(false)
    } catch (error) {
      showToast(error instanceof Error ? error.message : String(error), 'error')
    } finally {
      setMarkingRead(false)
    }
  }

  const markAnnouncementRead = async (id: number) => {
    await markSub2ApiAnnouncementRead(id)
    setAnnouncements((current) => current.map((item) => (
      item.id === id ? { ...item, read_at: new Date().toISOString() } : item
    )))
    setCurrentAnnouncement((current) => (
      current?.id === id ? { ...current, read_at: new Date().toISOString() } : current
    ))
  }

  return {
    currentAnnouncement,
    announcements,
    loadingAnnouncements,
    markingRead,
    confirmAnnouncementRead,
    refreshAnnouncements,
    markAnnouncementRead,
  }
}
