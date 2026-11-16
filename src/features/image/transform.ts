import type { EditSettings } from './types'

export const MIN_ZOOM = 0.25
export const MAX_ZOOM = 4
export const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value))

export function placementMode(settings: EditSettings) {
  return settings.background === 'crop' && settings.placement !== 'custom' ? 'fill' : settings.placement
}

export function customSettings(settings: EditSettings): EditSettings {
  if (placementMode(settings) === 'custom') return settings
  return { ...settings, placement: 'custom', customBase: placementMode(settings) === 'fill' ? 'fill' : 'fit', zoom: 1, offsetX: 0, offsetY: 0 }
}

export function rotateQuarter(settings: EditSettings, degrees: 90 | -90): EditSettings {
  return { ...settings, rotation: (settings.rotation + degrees + 360) % 360, flipX: settings.flipY, flipY: settings.flipX }
}

export function flipImage(settings: EditSettings, axis: 'flipX' | 'flipY'): EditSettings {
  return { ...settings, [axis]: !settings[axis], fineRotation: -settings.fineRotation }
}

/** 모든 위치는 출력 폭/높이의 비율이다. 미리보기 크기에 종속된 픽셀을 저장하지 않는다. */
export function imageTransform(sw: number, sh: number, width: number, height: number, settings: EditSettings) {
  const parity = settings.flipX === settings.flipY ? 1 : -1
  const angle = (settings.rotation + settings.fineRotation * parity) * Math.PI / 180
  const cos = Math.cos(angle); const sin = Math.sin(angle)
  const ac = Math.abs(cos); const absSin = Math.abs(sin)
  const fit = Math.min(width / (ac * sw + absSin * sh), height / (absSin * sw + ac * sh))
  // 출력 사각형을 역회전했을 때도 원본 안에 들어가도록 cover 배율을 계산한다.
  const fill = Math.max((ac * width + absSin * height) / sw, (absSin * width + ac * height) / sh)
  const mode = placementMode(settings)
  const base = mode === 'fill' || (mode === 'custom' && settings.customBase === 'fill') ? fill : fit
  const scale = base * (mode === 'custom' ? clamp(settings.zoom, MIN_ZOOM, MAX_ZOOM) : 1)
  const w = (ac * sw + absSin * sh) * scale
  const h = (absSin * sw + ac * sh) * scale
  const align = mode === 'fill' || (mode === 'custom' && settings.customBase === 'fill')
  const cx = width / 2 + (align ? (width - w) * (settings.positionX - 50) / 100 : 0) + (mode === 'custom' ? settings.offsetX * width : 0)
  const cy = height / 2 + (align ? (height - h) * (settings.positionY - 50) / 100 : 0) + (mode === 'custom' ? settings.offsetY * height : 0)
  const a = cos * scale * (settings.flipX ? -1 : 1)
  const b = sin * scale * (settings.flipY ? -1 : 1)
  const c = -sin * scale * (settings.flipX ? -1 : 1)
  const d = cos * scale * (settings.flipY ? -1 : 1)
  const e = cx - (a * sw + c * sh) / 2
  const f = cy - (b * sw + d * sh) / 2
  const determinant = a * d - b * c
  const inverse = { a: d / determinant / sw, b: -b / determinant / sh, c: -c / determinant / sw, d: a / determinant / sh }
  const point = (x: number, y: number) => ({
    u: inverse.a * (x - e) + inverse.c * (y - f),
    v: inverse.b * (x - e) + inverse.d * (y - f),
  })
  return { a, b, c, d, e, f, scale, angle, inverse, point, sw, sh, bounds: { x: cx - w / 2, y: cy - h / 2, w, h } }
}

export type ImageTransform = ReturnType<typeof imageTransform>
