import { afterEach, describe, expect, it, vi } from 'vitest'
import { listSub2ApiAnnouncements, markSub2ApiAnnouncementRead } from './sub2apiAnnouncements'

vi.mock('./sub2apiAuth', () => ({
  fetchWithSub2ApiAuth: vi.fn(),
}))

import { fetchWithSub2ApiAuth } from './sub2apiAuth'

const mockedFetchWithSub2ApiAuth = vi.mocked(fetchWithSub2ApiAuth)

describe('sub2apiAnnouncements', () => {
  afterEach(() => {
    mockedFetchWithSub2ApiAuth.mockReset()
  })

  it('lists unread announcements with unread_only query', async () => {
    mockedFetchWithSub2ApiAuth.mockResolvedValue(new Response(JSON.stringify({
      code: 0,
      message: 'ok',
      data: [{ id: 1, title: '公告', content: '内容', notify_mode: 'popup', created_at: '2026-06-27T00:00:00Z' }],
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    }))

    const result = await listSub2ApiAnnouncements(true)

    expect(mockedFetchWithSub2ApiAuth).toHaveBeenCalledWith('/api/v1/announcements?unread_only=1', {
      cache: 'no-store',
    })
    expect(result).toHaveLength(1)
    expect(result[0]?.id).toBe(1)
  })

  it('marks announcement as read', async () => {
    mockedFetchWithSub2ApiAuth.mockResolvedValue(new Response(JSON.stringify({
      code: 0,
      message: 'ok',
      data: { message: 'ok' },
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    }))

    await markSub2ApiAnnouncementRead(12)

    expect(mockedFetchWithSub2ApiAuth).toHaveBeenCalledWith('/api/v1/announcements/12/read', {
      method: 'POST',
      cache: 'no-store',
    })
  })
})
