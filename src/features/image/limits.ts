import { PRESETS, type EditSettings, type ImageAsset } from './types'

export const MAX_FILE_BYTES = 10 * 1024 * 1024
export const MAX_INPUT_PIXELS = 12_000_000
// 1920²보다 보수적인 3MP. 세로 배경화면을 위해 긴 변은 2560까지 허용.
export const MAX_OUTPUT_PIXELS = 3_000_000
export const MAX_OUTPUT_EDGE = 2560
export const PREVIEW_EDGE = 960

export function fitSize(width: number, height: number, edge: number, pixels = Infinity) {
  const scale = Math.min(1, edge / Math.max(width, height), Math.sqrt(pixels / (width * height)))
  return { width: Math.max(1, Math.floor(width * scale)), height: Math.max(1, Math.floor(height * scale)) }
}

export function outputSize(asset: ImageAsset, settings: EditSettings) {
  let width: number
  let height: number
  if (settings.originalSize || settings.preset === 'original') {
    width = asset.width
    height = asset.height
  } else if (settings.preset === 'custom') {
    width = settings.customWidth
    height = settings.customHeight
  } else {
    const preset = PRESETS.find((item) => item.id === settings.preset)!
    width = preset.width
    height = preset.height
  }
  const result = fitSize(width, height, MAX_OUTPUT_EDGE, MAX_OUTPUT_PIXELS)
  return { ...result, limited: result.width !== width || result.height !== height }
}

export function fileSize(bytes: number) {
  return bytes < 1024 * 1024 ? `${(bytes / 1024).toFixed(0)} KB` : `${(bytes / 1024 / 1024).toFixed(2)} MB`
}
