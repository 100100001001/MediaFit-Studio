import { rgb } from './edges'
import type { Direction, EdgeColors, ImageAsset, RGB } from './types'

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
