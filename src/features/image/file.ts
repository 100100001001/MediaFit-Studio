import { MAX_FILE_BYTES, MAX_INPUT_PIXELS, PREVIEW_EDGE, fitSize } from './limits'
import type { ImageAsset } from './types'
import { assertFile } from './input'
import { analyzeEdges } from './edges'

const invalid = () => new Error('지원하지 않거나 손상된 이미지입니다. JPG, PNG, 정적 WebP 파일을 선택해 주세요.')

/** 디코더 실행 전에 시그니처와 헤더의 크기를 확인한다. */
export async function inspectFile(file: File) {
  assertFile(file)
  if (!file.size || file.size > MAX_FILE_BYTES) throw new Error('파일은 0바이트보다 크고 10MB 이하여야 합니다.')
  if (!/\.(jpe?g|png|webp)$/i.test(file.name)) throw invalid()
  const buffer = await file.arrayBuffer()
  const bytes = new Uint8Array(buffer)
  const view = new DataView(buffer)
  const tag = (at: number, value: string) => [...value].every((char, i) => bytes[at + i] === char.charCodeAt(0))
  let width = 0
  let height = 0
  let kind = ''
  try {
    if (bytes[0] === 137 && tag(1, 'PNG\r\n\x1a\n') && tag(12, 'IHDR') && view.getUint32(8) === 13) {
      kind = 'png'
      width = view.getUint32(16)
      height = view.getUint32(20)
      let at = 8
      while (at + 12 <= bytes.length) {
        const size = view.getUint32(at)
        if (tag(at + 4, 'acTL')) throw new Error('애니메이션 PNG는 지원하지 않습니다. 정적 이미지를 선택해 주세요.')
        if (at + size + 12 > bytes.length) throw invalid()
        at += size + 12
      }
    } else if (bytes[0] === 0xff && bytes[1] === 0xd8) {
      kind = 'jpeg'
      let at = 2
      while (at + 4 <= bytes.length) {
        if (bytes[at] !== 0xff) throw invalid()
        while (bytes[at] === 0xff) at++
        const marker = bytes[at++]
        if (marker === 0xda || marker === 0xd9) break
        if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) continue
        const length = view.getUint16(at)
        if (length < 2 || at + length > bytes.length) throw invalid()
        if ([0xc0, 0xc1, 0xc2].includes(marker)) {
          height = view.getUint16(at + 3)
          width = view.getUint16(at + 5)
          break
        }
        at += length
      }
    } else if (tag(0, 'RIFF') && tag(8, 'WEBP')) {
      kind = 'webp'
      let at = 12
      while (at + 8 <= bytes.length) {
        const length = view.getUint32(at + 4, true)
        if (at + 8 + length > bytes.length) throw invalid()
        const data = at + 8
        if (tag(at, 'ANIM') || tag(at, 'ANMF') || (tag(at, 'VP8X') && (bytes[data] & 2))) {
          throw new Error('애니메이션 WebP는 지원하지 않습니다. 정적 이미지를 선택해 주세요.')
        }
        if (tag(at, 'VP8X') && length >= 10) {
          width = 1 + bytes[data + 4] + bytes[data + 5] * 256 + bytes[data + 6] * 65536
          height = 1 + bytes[data + 7] + bytes[data + 8] * 256 + bytes[data + 9] * 65536
        } else if (tag(at, 'VP8 ') && length >= 10 && tag(data + 3, '\x9d\x01\x2a')) {
          const frameWidth = view.getUint16(data + 6, true) & 0x3fff
          const frameHeight = view.getUint16(data + 8, true) & 0x3fff
          if (width && (width !== frameWidth || height !== frameHeight)) throw invalid()
          width = frameWidth; height = frameHeight
        } else if (tag(at, 'VP8L') && length >= 5 && bytes[data] === 0x2f) {
          const bits = view.getUint32(data + 1, true)
          const frameWidth = (bits & 0x3fff) + 1
          const frameHeight = ((bits >>> 14) & 0x3fff) + 1
          if (width && (width !== frameWidth || height !== frameHeight)) throw invalid()
          width = frameWidth; height = frameHeight
        }
        at += 8 + length + (length % 2)
      }
    }
  } catch (error) {
    if (error instanceof RangeError) throw invalid()
    throw error
  }
  const extension = file.name.split('.').pop()?.toLowerCase()
  if (!width || !height || (kind === 'jpeg' ? !['jpg', 'jpeg'].includes(extension ?? '') : extension !== kind)) throw invalid()
  if (width * height > MAX_INPUT_PIXELS || Math.max(width, height) > 16384) {
    throw new Error('원본은 최대 12MP(1,200만 픽셀), 긴 변 16,384px까지 지원합니다. 더 작은 이미지로 줄여 주세요.')
  }
  return { width, height }
}

export function context2d(canvas: HTMLCanvasElement, read = false) {
  const context = canvas.getContext('2d', { willReadFrequently: read })
  if (!context) throw new Error('이 브라우저에서 Canvas 2D를 사용할 수 없습니다.')
  return context
}

export function releaseCanvas(canvas: HTMLCanvasElement) {
  canvas.width = 1
  canvas.height = 1
}

export async function withDecodedImage<T>(file: File, action: (image: HTMLImageElement) => T | Promise<T>): Promise<T> {
  const url = URL.createObjectURL(file)
  const image = new Image()
  let timer: ReturnType<typeof setTimeout> | undefined
  try {
    await new Promise<void>((resolve, reject) => {
      image.onload = () => resolve()
      image.onerror = () => reject(new Error('이미지를 디코딩하지 못했습니다. 파일 손상 또는 브라우저 메모리 부족일 수 있습니다.'))
      timer = setTimeout(() => reject(new Error('이미지 열기 시간이 초과되었습니다. 더 작은 파일을 선택해 주세요.')), 15_000)
      image.src = url
    })
    if (!image.naturalWidth || image.naturalWidth * image.naturalHeight > MAX_INPUT_PIXELS || Math.max(image.naturalWidth, image.naturalHeight) > 16384) throw invalid()
    return await action(image)
  } finally {
    clearTimeout(timer)
    image.onload = null
    image.onerror = null
    image.removeAttribute('src')
    URL.revokeObjectURL(url)
  }
}

export async function loadAsset(file: File): Promise<ImageAsset> {
  await inspectFile(file)
  return withDecodedImage(file, (image) => {
    const preview = document.createElement('canvas')
    try {
      const size = fitSize(image.naturalWidth, image.naturalHeight, PREVIEW_EDGE)
      preview.width = size.width; preview.height = size.height
      const ctx = context2d(preview)
      ctx.imageSmoothingEnabled = true
      ctx.imageSmoothingQuality = 'high'
      ctx.drawImage(image, 0, 0, size.width, size.height)
      return { file, width: image.naturalWidth, height: image.naturalHeight, preview, ...analyzeEdges(preview) }
    } catch (error) { releaseCanvas(preview); throw error }
  })
}
