import { describe, expect, it } from 'vitest'
import { readCustomSizePresets } from './customSizePresets'

describe('readCustomSizePresets', () => {
  it('returns normalized presets from storage', () => {
    const presets = readCustomSizePresets(JSON.stringify([
      { id: 'a', name: '封面', width: 900, height: 383 },
      { id: 'b', name: '竖屏', width: '1080', height: '1920' },
    ]))

    expect(presets).toEqual([
      { id: 'a', name: '封面', width: 900, height: 383 },
      { id: 'b', name: '竖屏', width: 1080, height: 1920 },
    ])
  })

  it('ignores invalid data', () => {
    const presets = readCustomSizePresets(JSON.stringify([
      { id: '', name: '无效', width: 1, height: 1 },
      { id: 'a', name: '', width: 1, height: 1 },
      { id: 'b', name: '缺失', width: 0, height: 200 },
      { id: 'c', name: '有效', width: 900, height: 383 },
    ]))

    expect(presets).toEqual([
      { id: 'c', name: '有效', width: 900, height: 383 },
    ])
  })

  it('returns empty array for broken storage payload', () => {
    expect(readCustomSizePresets('{')).toEqual([])
    expect(readCustomSizePresets('{"a":1}')).toEqual([])
    expect(readCustomSizePresets(null)).toEqual([])
  })
})

