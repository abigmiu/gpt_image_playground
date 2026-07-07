export interface SizePreset {
  id: string
  name: string
  width: number
  height: number
}

export const CUSTOM_SIZE_PRESETS_STORAGE_KEY = 'gpt-image-playground.custom-size-presets'

export const BUILTIN_SIZE_PRESETS: SizePreset[] = [
  { id: 'wechat-cover', name: '公众号', width: 900, height: 383 },
  { id: 'toutiao-cover', name: '今日头条', width: 1920, height: 1080 },
  { id: 'douyin-horizontal-cover', name: '抖音横屏封面', width: 1920, height: 1080 },
  { id: 'xiaohongshu-cover', name: '小红书', width: 1920, height: 1080 },
  { id: 'bilibili-horizontal-cover', name: '哔哩哔哩横屏', width: 1920, height: 1080 },
  { id: 'douyin-vertical-cover', name: '抖音竖屏', width: 1080, height: 1920 },
]

function normalizePreset(input: Partial<SizePreset> | null | undefined): SizePreset | null {
  const id = typeof input?.id === 'string' ? input.id.trim() : ''
  const name = typeof input?.name === 'string' ? input.name.trim() : ''
  const width = Number(input?.width)
  const height = Number(input?.height)

  if (!id || !name || !Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) {
    return null
  }

  return {
    id,
    name,
    width: Math.round(width),
    height: Math.round(height),
  }
}

export function readCustomSizePresets(storageValue: string | null | undefined): SizePreset[] {
  if (!storageValue) return []

  try {
    const parsed = JSON.parse(storageValue)
    if (!Array.isArray(parsed)) return []
    return parsed.map((item) => normalizePreset(item)).filter((item): item is SizePreset => Boolean(item))
  } catch {
    return []
  }
}

export function loadCustomSizePresets(): SizePreset[] {
  if (typeof window === 'undefined') return []
  return readCustomSizePresets(window.localStorage.getItem(CUSTOM_SIZE_PRESETS_STORAGE_KEY))
}

export function saveCustomSizePresets(presets: SizePreset[]) {
  if (typeof window === 'undefined') return
  window.localStorage.setItem(CUSTOM_SIZE_PRESETS_STORAGE_KEY, JSON.stringify(presets))
}

