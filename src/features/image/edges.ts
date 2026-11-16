import type { Direction, EdgeColors, EdgeSamples, RGB } from './types'

export const DIRECTIONS: { id: Direction; label: string }[] = [
  { id: 'top', label: '위쪽' }, { id: 'bottom', label: '아래쪽' },
  { id: 'left', label: '왼쪽' }, { id: 'right', label: '오른쪽' },
]
const FALLBACK = '#252b38'
const SAMPLE_SIZE = 32

export function rgb(hex: string): RGB {
  return [parseInt(hex.slice(1, 3), 16), parseInt(hex.slice(3, 5), 16), parseInt(hex.slice(5, 7), 16)]
}

function hex(color: RGB) {
  return `#${color.map((value) => Math.round(value).toString(16).padStart(2, '0')).join('')}`
}

/** 파일 로드 시 한 번만 실행. 투명 픽셀은 알파 가중치로 제외한다. */
export function analyzeEdges(source: HTMLCanvasElement) {
  const sample = document.createElement('canvas')
  const fallback = () => ({
    edgeColor: FALLBACK,
    edgeColors: Object.fromEntries(DIRECTIONS.map(({ id }) => [id, FALLBACK])) as EdgeColors,
    edgeSamples: Object.fromEntries(DIRECTIONS.map(({ id }) => [id, Array.from({ length: SAMPLE_SIZE }, () => rgb(FALLBACK))])) as EdgeSamples,
    colorSamplingFailed: true,
  })
  try {
    sample.width = SAMPLE_SIZE; sample.height = SAMPLE_SIZE
    const ctx = sample.getContext('2d', { willReadFrequently: true })
    if (!ctx) return fallback()
    ctx.drawImage(source, 0, 0, SAMPLE_SIZE, SAMPLE_SIZE)
    const { data } = ctx.getImageData(0, 0, SAMPLE_SIZE, SAMPLE_SIZE)
    function mean(indices: number[], defaultColor: string): RGB {
      const sum: RGB = [0, 0, 0]
      let weight = 0
      for (const i of indices) {
        const alpha = data[i + 3] / 255
        weight += alpha
        for (let c = 0; c < 3; c++) sum[c] += data[i + c] * alpha
      }
      return weight ? sum.map((value) => value / weight) as RGB : rgb(defaultColor)
    }
    const border: number[] = []
    for (let y = 0; y < SAMPLE_SIZE; y++) for (let x = 0; x < SAMPLE_SIZE; x++) {
      if (x < 2 || x >= SAMPLE_SIZE - 2 || y < 2 || y >= SAMPLE_SIZE - 2) border.push((y * SAMPLE_SIZE + x) * 4)
    }
    const edgeColor = hex(mean(border, FALLBACK))
    const edgeColors = {} as EdgeColors
    const edgeSamples = {} as EdgeSamples
    for (const { id } of DIRECTIONS) {
      const indices = (position: number) => [0, 1].map((depth) => {
        const x = id === 'left' ? depth : id === 'right' ? SAMPLE_SIZE - 1 - depth : position
        const y = id === 'top' ? depth : id === 'bottom' ? SAMPLE_SIZE - 1 - depth : position
        return (y * SAMPLE_SIZE + x) * 4
      })
      const strip = Array.from({ length: SAMPLE_SIZE }, (_, i) => indices(i))
      edgeColors[id] = hex(mean(strip.flat(), edgeColor))
      edgeSamples[id] = strip.map((pixels) => mean(pixels, edgeColors[id]))
    }
    return { edgeColor, edgeColors, edgeSamples, colorSamplingFailed: false }
  } catch {
    // 색상 샘플 실패 때문에 유효한 이미지 자체를 거절하지 않는다.
    return fallback()
  } finally { sample.width = 1; sample.height = 1 }
}
