import { afterEach, describe, expect, it, vi } from 'vitest'
import { parseRedeemCodesInput, redeemSub2ApiCode } from './sub2apiRedeem'

vi.mock('./sub2apiAuth', () => ({
  fetchWithSub2ApiAuth: vi.fn(),
}))

import { fetchWithSub2ApiAuth } from './sub2apiAuth'

const mockedFetchWithSub2ApiAuth = vi.mocked(fetchWithSub2ApiAuth)

describe('sub2apiRedeem', () => {
  afterEach(() => {
    mockedFetchWithSub2ApiAuth.mockReset()
  })

  it('parses multiline codes and removes blank lines', () => {
    expect(parseRedeemCodesInput(' CODE-1 \n\nCODE-2\r\n  CODE-3  ')).toEqual([
      'CODE-1',
      'CODE-2',
      'CODE-3',
    ])
  })

  it('redeems code with authenticated request', async () => {
    mockedFetchWithSub2ApiAuth.mockResolvedValue(new Response(JSON.stringify({
      code: 0,
      message: 'ok',
      data: {
        message: '兑换成功',
        type: 'balance',
        value: 10,
        new_balance: 25,
      },
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    }))

    const result = await redeemSub2ApiCode(' CODE-1 ')

    expect(mockedFetchWithSub2ApiAuth).toHaveBeenCalledWith('/api/v1/redeem', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      cache: 'no-store',
      body: JSON.stringify({
        code: 'CODE-1',
      }),
    })
    expect(result.new_balance).toBe(25)
  })
})
