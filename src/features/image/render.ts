import { context2d, releaseCanvas } from './file'
import { fitSize } from './limits'
import type { EditSettings, ImageAsset, Format } from './types'
import { fillTransformedDirectional } from './background'
import { imageTransform, type ImageTransform } from './transform'

function placement(sw: number, sh: number, width: number, height: number, cover: boolean, x = 50, y = 50) {
  const scale = cover ? Math.max(width / sw, height / sh) : Math.min(width / sw, height / sh)
  const w = sw * scale; const h = sh * scale
  return { x: (width - w) * x / 100, y: (height - h) * y / 100, w, h }
}

async function sharpen(canvas: HTMLCanvasElement, amount: number, transform: ImageTransform, cancelled: () => boolean) {
  if (cancelled()) throw new Error('작업이 중단되었습니다.')
  const ctx = context2d(canvas, true)
  // 이미지와 여백의 경계는 처리하지 않고 보이는 이미지 내부만 읽는다.
  const rect = transform.bounds
  const left = Math.max(0, Math.ceil(rect.x))
  const top = Math.max(0, Math.ceil(rect.y))
  const width = Math.min(canvas.width, Math.floor(rect.x + rect.w)) - left
  const height = Math.min(canvas.height, Math.floor(rect.y + rect.h)) - top
  if (width < 3 || height < 3) return
  const original = ctx.getImageData(left, top, width, height)
  const result = ctx.createImageData(width, height)
  result.data.set(original.data)
  const input = original.data; const output = result.data
  const strength = amount / 100 * 0.18
  const maxChange = amount / 100 * 6
  // sRGB 코드값의 근사 밝기. 별도 밝기 버퍼나 선형 색공간 변환은 만들지 않는다.
  const luma = (i: number) => (54 * input[i] + 183 * input[i + 1] + 19 * input[i + 2]) / 256
  const insetU = 2 / (transform.scale * transform.sw)
  const insetV = 2 / (transform.scale * transform.sh)
  // 밝기 하나로 계산한 정수 변화량을 RGB에 공통 적용해 채널별 색 테두리를 줄인다.
  for (let y = 1; y < height - 1; y++) {
    if (y % 64 === 0) {
      if (cancelled()) throw new Error('작업이 중단되었습니다. 탭으로 돌아온 후 다시 요청해 주세요.')
      await new Promise<void>((resolve) => setTimeout(resolve, 0))
      if (cancelled()) throw new Error('작업이 중단되었습니다.')
    }
    const start = transform.point(left + 1.5, top + y + 0.5)
    let u = start.u; let v = start.v
    for (let x = 1; x < width - 1; x++, u += transform.inverse.a, v += transform.inverse.b) {
      // 회전한 이미지 밖의 배경과 이미지 경계는 샤프닝하지 않는다.
      if (u <= insetU || u >= 1 - insetU || v <= insetV || v >= 1 - insetV) continue
      const i = (y * width + x) * 4
      const center = luma(i)
      const a = luma(i - 4); const b = luma(i + 4)
      const d = luma(i - width * 4); const e = luma(i + width * 4)
      const detail = center - (a + b + d + e) / 4
      if (Math.abs(detail) < 3) continue
      const red = input[i]; const green = input[i + 1]; const blue = input[i + 2]
      const lower = Math.ceil(Math.max(-maxChange, Math.min(center, a, b, d, e) - center, -red, -green, -blue))
      const upper = Math.floor(Math.min(maxChange, Math.max(center, a, b, d, e) - center, 255 - red, 255 - green, 255 - blue))
      const delta = Math.max(lower, Math.min(upper, Math.round(detail * 4 * strength)))
      output[i] = red + delta; output[i + 1] = green + delta; output[i + 2] = blue + delta
    }
  }
  if (cancelled()) throw new Error('작업이 중단되었습니다.')
  ctx.putImageData(result, left, top)
}

export async function renderImage(
  canvas: HTMLCanvasElement, source: CanvasImageSource,
  sourceWidth: number, sourceHeight: number, asset: ImageAsset,
  settings: EditSettings, width: number, height: number,
  cancelled: () => boolean,
  before?: HTMLCanvasElement,
  fast = false,
) {
  canvas.width = width; canvas.height = height
  const ctx = context2d(canvas, !fast && settings.sharpness > 0)
  ctx.imageSmoothingEnabled = true
  ctx.imageSmoothingQuality = 'high'
  ctx.fillStyle = settings.background === 'color' ? settings.color : asset.edgeColor
  ctx.fillRect(0, 0, width, height)
  const transform = imageTransform(sourceWidth, sourceHeight, width, height, settings)
  if (settings.background === 'directional-auto' || settings.background === 'directional-color') {
    fillTransformedDirectional(ctx, transform, width, height, asset,
      settings.background === 'directional-auto' ? asset.edgeColors : settings.directionColors,
      settings.connection === 'gradient')
  }
  if (settings.background === 'blur') {
    if (!('filter' in ctx)) throw new Error('이 브라우저는 Canvas 블러를 지원하지 않습니다. 자동 색상 또는 크롭을 선택해 주세요.')
    const blur = document.createElement('canvas')
    try {
      const small = fitSize(width, height, 480)
      blur.width = small.width; blur.height = small.height
      const blurCtx = context2d(blur)
      blurCtx.fillStyle = asset.edgeColor
      blurCtx.fillRect(0, 0, blur.width, blur.height)
      const p = placement(asset.preview.width, asset.preview.height, blur.width, blur.height, true)
      blurCtx.filter = 'blur(12px)'
      // 가장자리를 넘겨 그려 블러의 투명한 테두리를 줄인다.
      blurCtx.drawImage(asset.preview, p.x - 24, p.y - 24, p.w + 48, p.h + 48)
      ctx.drawImage(blur, 0, 0, width, height)
    } finally { releaseCanvas(blur) }
  }
  ctx.save()
  ctx.setTransform(transform.a, transform.b, transform.c, transform.d, transform.e, transform.f)
  ctx.drawImage(source, 0, 0, sourceWidth, sourceHeight)
  ctx.restore()
  if (before) {
    before.width = width; before.height = height
    context2d(before).drawImage(canvas, 0, 0)
  }
  if (!fast && settings.sharpness > 0) await sharpen(canvas, settings.sharpness, transform, cancelled)
  if (cancelled()) throw new Error('작업이 중단되었습니다. 다시 요청해 주세요.')
}

export function encodeCanvas(canvas: HTMLCanvasElement, format: Format, quality: number) {
  const mime = `image/${format}`
  return new Promise<Blob>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('저장 변환 시간이 초과되었습니다. 출력 크기를 줄여 주세요.')), 15_000)
    try {
      canvas.toBlob((blob) => {
        clearTimeout(timer)
        if (!blob) reject(new Error('파일을 만들지 못했습니다. 브라우저 메모리가 부족할 수 있습니다.'))
        else if (blob.type !== mime) reject(new Error('선택한 저장 형식을 지원하지 않는 브라우저입니다. PNG로 저장해 주세요.'))
        else resolve(blob)
      }, mime, quality / 100)
    } catch (error) { clearTimeout(timer); reject(error) }
  })
}
