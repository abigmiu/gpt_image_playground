import { afterEach, describe, expect, it, vi } from 'vitest'
import { listSub2ApiUsage } from './sub2apiUsage'

vi.mock('./sub2apiAuth', () => ({
  fetchWithSub2ApiAuth: vi.fn(),
}))

import { fetchWithSub2ApiAuth } from './sub2apiAuth'

const mockedFetchWithSub2ApiAuth = vi.mocked(fetchWithSub2ApiAuth)

describe('sub2apiUsage', () => {
  afterEach(() => {
    mockedFetchWithSub2ApiAuth.mockReset()
  })

  it('lists usage with sub2api default sorting', async () => {
    mockedFetchWithSub2ApiAuth.mockResolvedValue(new Response(JSON.stringify({
      code: 0,
      message: 'ok',
      data: {
        items: [{ id: 1, created_at: '2026-06-27T00:00:00Z', actual_cost: 0.123456 }],
        total: 1,
        page: 1,
        page_size: 20,
        pages: 1,
      },
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    }))

    const result = await listSub2ApiUsage()

    expect(mockedFetchWithSub2ApiAuth).toHaveBeenCalledWith('/api/v1/usage?page=1&page_size=20&sort_by=created_at&sort_order=desc', {
      cache: 'no-store',
    })
    expect(result.items[0]?.actual_cost).toBe(0.123456)
  })
})
