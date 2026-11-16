import { rgb } from './edges'
import type { Direction, EdgeColors, ImageAsset, RGB } from './types'
import type { ImageTransform } from './transform'

export interface ImageRect { x: number; y: number; w: number; h: number }
const GRID = 32
const mix = (a: RGB, b: RGB, t: number): RGB => a.map((value, i) => value * (1 - t) + b[i] * t) as RGB
const smooth = (t: number) => t * t * (3 - 2 * t)

/** 최대 8개의 32×32 여백 패치만 합성한다. 원본 픽셀을 읽거나 변경하지 않는다. */
export function fillDirectional(
  ctx: CanvasRenderingContext2D, rect: ImageRect, width: number, height: number,
  asset: ImageAsset, colors: EdgeColors, gradient: boolean,
) {
  const { x, y, w, h } = rect
  const right = Math.max(0, width - x - w)
  const bottom = Math.max(0, height - y - h)
  if (Math.max(x, y, right, bottom) < 0.001) return
  // 일반 contain 배치는 상하 또는 좌우에만 여백이 있다. 단색은 픽셀 버퍼 없이 채운다.
  if (!gradient && (x < 0.001 || y < 0.001)) {
    const regions: [Direction, number, number, number, number][] = [
      ['top', x, 0, w, y], ['bottom', x, y + h, w, bottom],
      ['left', 0, y, x, h], ['right', x + w, y, right, h],
    ]
    for (const [direction, px, py, pw, ph] of regions) {
      if (pw < 0.001 || ph < 0.001) continue
      ctx.fillStyle = colors[direction]
      ctx.fillRect(px, py, pw, ph)
    }
    return
  }
  const patch = document.createElement('canvas')
  try {
    patch.width = GRID; patch.height = GRID
    const small = patch.getContext('2d')
    if (!small) throw new Error('방향별 배경을 그릴 수 없습니다. 단일 색상을 선택해 주세요.')
    const pixels = small.createImageData(GRID, GRID)
    const targets = Object.fromEntries(Object.entries(colors).map(([key, color]) => [key, rgb(color)])) as Record<Direction, RGB>
    function colorAt(direction: Direction, along: number, outward: number): RGB {
      if (!gradient) return targets[direction]
      const samples = asset.edgeSamples[direction]
      const at = Math.max(0, Math.min(samples.length - 1, along * (samples.length - 1)))
      const boundary = mix(samples[Math.floor(at)], samples[Math.ceil(at)], at % 1)
      return mix(boundary, targets[direction], smooth(outward))
    }
    function draw(px: number, py: number, pw: number, ph: number, color: (u: number, v: number) => RGB) {
      if (pw < 0.001 || ph < 0.001) return
      for (let row = 0; row < GRID; row++) for (let column = 0; column < GRID; column++) {
        const value = color(column / (GRID - 1), row / (GRID - 1))
        const i = (row * GRID + column) * 4
        for (let c = 0; c < 3; c++) pixels.data[i + c] = value[c]
        pixels.data[i + 3] = 255
      }
      small!.putImageData(pixels, 0, 0)
      ctx.drawImage(patch, px, py, pw, ph)
    }
    draw(x, 0, w, y, (u, v) => colorAt('top', u, 1 - v))
    draw(x, y + h, w, bottom, (u, v) => colorAt('bottom', u, v))
    draw(0, y, x, h, (u, v) => colorAt('left', v, 1 - u))
    draw(x + w, y, right, h, (u, v) => colorAt('right', v, u))
    // 모서리는 양쪽 방향을 거리 가중치로 연결해 사각형 경계에 빈틈이 생기지 않게 한다.
    function corner(horizontal: 'left' | 'right', vertical: 'top' | 'bottom') {
      const leftSide = horizontal === 'left'; const topSide = vertical === 'top'
      draw(leftSide ? 0 : x + w, topSide ? 0 : y + h, leftSide ? x : right, topSide ? y : bottom, (u, v) => {
        const dx = leftSide ? 1 - u : u
        const dy = topSide ? 1 - v : v
        const a = colorAt(horizontal, topSide ? 0 : 1, dx)
        const b = colorAt(vertical, leftSide ? 0 : 1, dy)
        return mix(a, b, dx + dy ? dy / (dx + dy) : 0.5)
      })
    }
    corner('left', 'top'); corner('right', 'top'); corner('left', 'bottom'); corner('right', 'bottom')
  } finally { patch.width = 1; patch.height = 1 }
}

/** 이동/회전/반전 시 역변환 좌표로 배경을 채운다. 최대 64² 샘플, 고해상도 픽셀 분석 없음. */
export function fillTransformedDirectional(
  ctx: CanvasRenderingContext2D, transform: ImageTransform, width: number, height: number,
  asset: ImageAsset, colors: EdgeColors, gradient: boolean,
) {
  const rect = transform.bounds
  if (Math.abs(transform.b) < 1e-8 && Math.abs(transform.c) < 1e-8 && transform.a > 0 && transform.d > 0
    && rect.x >= -1e-6 && rect.y >= -1e-6 && rect.x + rect.w <= width + 1e-6 && rect.y + rect.h <= height + 1e-6) {
    fillDirectional(ctx, { ...rect, x: Math.max(0, rect.x), y: Math.max(0, rect.y) }, width, height, asset, colors, gradient)
    return
  }
  const field = document.createElement('canvas')
  try {
    field.width = 64; field.height = 64
    const small = field.getContext('2d')
    if (!small) throw new Error('방향별 배경을 그릴 수 없습니다. 단일 색상을 선택해 주세요.')
    const pixels = small.createImageData(64, 64)
    const targets = Object.fromEntries(Object.entries(colors).map(([key, value]) => [key, rgb(value)])) as Record<Direction, RGB>
    const fallback = rgb(asset.edgeColor)
    const corners = [transform.point(0, 0), transform.point(width, 0), transform.point(0, height), transform.point(width, height)]
    const margins = {
      left: Math.max(0.001, -Math.min(...corners.map((p) => p.u))),
      right: Math.max(0.001, Math.max(...corners.map((p) => p.u)) - 1),
      top: Math.max(0.001, -Math.min(...corners.map((p) => p.v))),
      bottom: Math.max(0.001, Math.max(...corners.map((p) => p.v)) - 1),
    }
    const colorAt = (direction: Direction, along: number, distance: number) => {
      if (!gradient) return targets[direction]
      const strip = asset.edgeSamples[direction]
      const at = Math.max(0, Math.min(1, along)) * (strip.length - 1)
      const boundary = mix(strip[Math.floor(at)], strip[Math.ceil(at)], at % 1)
      return mix(boundary, targets[direction], smooth(Math.min(1, distance / margins[direction])))
    }
    for (let y = 0; y < 64; y++) for (let x = 0; x < 64; x++) {
      const { u, v } = transform.point(x / 63 * width, y / 63 * height)
      const dx = u < 0 ? -u : u > 1 ? u - 1 : 0
      const dy = v < 0 ? -v : v > 1 ? v - 1 : 0
      const horizontal = u < 0 ? 'left' : 'right'
      const vertical = v < 0 ? 'top' : 'bottom'
      let value = fallback
      if (dx > 0 && dy > 0) {
        const wx = dx / margins[horizontal]; const wy = dy / margins[vertical]
        value = mix(colorAt(horizontal, v, dx), colorAt(vertical, u, dy), wy / (wx + wy))
      } else if (dx > 0) value = colorAt(horizontal, v, dx)
      else if (dy > 0) value = colorAt(vertical, u, dy)
      const i = (y * 64 + x) * 4
      for (let c = 0; c < 3; c++) pixels.data[i + c] = value[c]
      pixels.data[i + 3] = 255
    }
    small.putImageData(pixels, 0, 0)
    ctx.drawImage(field, 0, 0, width, height)
  } finally { field.width = 1; field.height = 1 }
}
