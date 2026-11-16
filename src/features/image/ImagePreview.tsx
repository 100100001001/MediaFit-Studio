import { useCallback, useEffect, useLayoutEffect, useRef, useState, type Dispatch, type SetStateAction } from 'react'
import { clamp, customSettings, imageTransform, MAX_ZOOM, MIN_ZOOM } from './transform'
import type { EditSettings, ImageAsset } from './types'

export interface PreviewPair {
  before: HTMLCanvasElement
  after: HTMLCanvasElement
  asset: ImageAsset
  settings: EditSettings
  fast: boolean
}
interface Point { x: number; y: number }
const distance = (a: Point, b: Point) => Math.hypot(a.x - b.x, a.y - b.y)
const midpoint = (a: Point, b: Point) => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 })

export function ImagePreview({ pair, asset, settings, setSettings, disabled, pending, error, onInteractive }: {
  pair: PreviewPair | null; asset: ImageAsset; settings: EditSettings
  setSettings: Dispatch<SetStateAction<EditSettings>>; disabled: boolean
  pending: boolean; error: string; onInteractive: (value: boolean) => void
}) {
  const surface = useRef<HTMLDivElement>(null)
  const host = useRef<HTMLDivElement>(null)
  const [comparing, setComparing] = useState(false)
  const held = useRef<'surface' | 'button' | 'keyboard' | null>(null)
  const latest = useRef({ settings, asset, disabled, pending, pair, onInteractive, setSettings, error })
  latest.current = { settings, asset, disabled, pending, pair, onInteractive, setSettings, error }
  const pointers = useRef(new Map<number, Point>())
  const session = useRef<{ origin: Point; last: Point; draft: EditSettings; moving: boolean; gap: number; mid: Point } | null>(null)
  const holdTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const updateTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const wheelTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const queued = useRef<EditSettings | null>(null)

  const flush = useCallback(() => {
    clearTimeout(updateTimer.current); updateTimer.current = undefined
    if (queued.current) { latest.current.setSettings(queued.current); queued.current = null }
  }, [])
  const queue = useCallback((next: EditSettings) => {
    queued.current = next
    if (!updateTimer.current) updateTimer.current = setTimeout(flush, 33)
  }, [flush])
  const releaseComparison = useCallback(() => { held.current = null; setComparing(false) }, [])
  const canCompare = useCallback(() => {
    const value = latest.current
    return !value.disabled && !value.pending && !value.error && !!value.pair && !value.pair.fast && value.pair.settings === value.settings
  }, [])
  const compare = useCallback((source: 'surface' | 'button' | 'keyboard') => {
    if (!canCompare()) return
    held.current = source; setComparing(true)
  }, [canCompare])
  const cancel = useCallback(() => {
    clearTimeout(holdTimer.current); clearTimeout(updateTimer.current); clearTimeout(wheelTimer.current)
    holdTimer.current = undefined; updateTimer.current = undefined; wheelTimer.current = undefined
    queued.current = null
    const ids = [...pointers.current.keys()]
    pointers.current.clear(); session.current = null
    for (const id of ids) if (surface.current?.hasPointerCapture(id)) surface.current.releasePointerCapture(id)
    releaseComparison(); latest.current.onInteractive(false)
  }, [releaseComparison])

  useLayoutEffect(() => {
    if (!pair || !host.current) return
    pair.before.className = 'comparison-before'
    pair.after.className = 'comparison-after'
    pair.before.setAttribute('aria-hidden', 'true')
    pair.after.setAttribute('aria-hidden', 'true')
    host.current.replaceChildren(pair.before, pair.after)
    return () => { host.current?.replaceChildren() }
  }, [pair])

  useEffect(() => {
    const visibility = () => { if (document.hidden) cancel() }
    window.addEventListener('blur', cancel)
    document.addEventListener('visibilitychange', visibility)
    if (disabled) cancel()
    return () => {
      cancel()
      window.removeEventListener('blur', cancel)
      document.removeEventListener('visibilitychange', visibility)
    }
  }, [asset, disabled, cancel])
  useEffect(() => { if (pending || error) releaseComparison() }, [pending, error, releaseComparison])

  function zoomAt(draft: EditSettings, factor: number, from: Point, to = from) {
    const bounds = surface.current!.getBoundingClientRect()
    const nextZoom = clamp(draft.zoom * factor, MIN_ZOOM, MAX_ZOOM)
    const ratio = nextZoom / draft.zoom
    const t = imageTransform(asset.width, asset.height, bounds.width, bounds.height, draft)
    const cx = t.bounds.x + t.bounds.w / 2; const cy = t.bounds.y + t.bounds.h / 2
    return { ...draft, zoom: nextZoom,
      offsetX: clamp(draft.offsetX + (to.x - from.x + (1 - ratio) * (from.x - bounds.left - cx)) / bounds.width, -2, 2),
      offsetY: clamp(draft.offsetY + (to.y - from.y + (1 - ratio) * (from.y - bounds.top - cy)) / bounds.height, -2, 2),
    }
  }

  useEffect(() => {
    const node = surface.current
    if (!node) return
    const wheel = (event: WheelEvent) => {
      const value = latest.current
      if (event.ctrlKey || event.metaKey || value.disabled || value.error || !value.pair || pointers.current.size) return
      event.preventDefault()
      clearTimeout(holdTimer.current); releaseComparison()
      const draft = customSettings(queued.current ?? value.settings)
      const unit = event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? node.clientHeight : 1
      const factor = Math.exp(-clamp(event.deltaY * unit, -100, 100) * 0.002)
      value.onInteractive(true)
      queue(zoomAt(draft, factor, { x: event.clientX, y: event.clientY }))
      clearTimeout(wheelTimer.current)
      wheelTimer.current = setTimeout(() => { flush(); latest.current.onInteractive(false) }, 160)
    }
    node.addEventListener('wheel', wheel, { passive: false })
    return () => node.removeEventListener('wheel', wheel)
    // 최신 값은 latest ref로 읽고, 좌표 계산의 asset은 동일 파일 수명 동안 유지한다.
  }, [asset, pair !== null, queue, flush, releaseComparison])

  if (!pair) return <div className="preview-status" role="status">미리보기를 준비하고 있습니다…</div>
  return <><div ref={surface} className={`image-preview-surface ${comparing ? 'show-before' : ''} ${error ? 'preview-failed' : ''}`}
    style={{ aspectRatio: pair.after.width / pair.after.height, width: `min(100%, ${pair.after.width}px, calc(var(--preview-max-height) * ${pair.after.width / pair.after.height}))` }}
    tabIndex={disabled ? -1 : 0} role="group" aria-label="이미지 미리보기. 드래그로 이동, 핀치나 휠로 확대. 스페이스 또는 엔터를 누르는 동안 보정 전 비교. 방향키로 이동, 더하기 빼기로 확대 축소."
    onContextMenu={(event) => event.preventDefault()} onDragStart={(event) => event.preventDefault()}
    onPointerDown={(event) => {
      if ((event.target as HTMLElement).closest('button') || disabled || error || (event.pointerType === 'mouse' && event.button !== 0) || pointers.current.size >= 2) return
      event.preventDefault(); event.currentTarget.focus({ preventScroll: true })
      const startSettings = queued.current ?? latest.current.settings
      clearTimeout(wheelTimer.current); flush()
      if (!pointers.current.size) onInteractive(false)
      const point = { x: event.clientX, y: event.clientY }
      pointers.current.set(event.pointerId, point)
      event.currentTarget.setPointerCapture(event.pointerId)
      if (pointers.current.size === 1) {
        session.current = { origin: point, last: point, draft: customSettings(startSettings), moving: false, gap: 0, mid: point }
        holdTimer.current = setTimeout(() => { if (pointers.current.size === 1 && !session.current?.moving) compare('surface') }, 450)
      } else {
        clearTimeout(holdTimer.current); releaseComparison()
        const [a, b] = [...pointers.current.values()]
        const current = session.current!
        current.moving = true; current.gap = distance(a, b); current.mid = midpoint(a, b)
        onInteractive(true)
      }
    }}
    onPointerMove={(event) => {
      const current = session.current
      if (!current || !pointers.current.has(event.pointerId)) return
      const point = { x: event.clientX, y: event.clientY }
      pointers.current.set(event.pointerId, point)
      if (pointers.current.size === 2) {
        const [a, b] = [...pointers.current.values()]
        const gap = distance(a, b); const mid = midpoint(a, b)
        current.draft = zoomAt(current.draft, current.gap > 1 ? gap / current.gap : 1, current.mid, mid)
        current.gap = gap; current.mid = mid
      } else {
        if (!current.moving && distance(current.origin, point) <= 8) return
        if (!current.moving) {
          current.moving = true; clearTimeout(holdTimer.current); releaseComparison(); onInteractive(true)
        }
        const bounds = event.currentTarget.getBoundingClientRect()
        current.draft = { ...current.draft,
          offsetX: clamp(current.draft.offsetX + (point.x - current.last.x) / bounds.width, -2, 2),
          offsetY: clamp(current.draft.offsetY + (point.y - current.last.y) / bounds.height, -2, 2),
        }
      }
      current.last = point
      queue(current.draft)
    }}
    onPointerUp={(event) => {
      if (!pointers.current.delete(event.pointerId)) return
      clearTimeout(holdTimer.current); releaseComparison()
      if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId)
      if (pointers.current.size === 1 && session.current) {
        const point = [...pointers.current.values()][0]
        session.current.last = point; session.current.origin = point; session.current.gap = 0
      } else if (!pointers.current.size) { flush(); session.current = null; onInteractive(false) }
    }}
    onPointerCancel={cancel}
    onLostPointerCapture={(event) => { if (pointers.current.has(event.pointerId)) cancel() }}
    onKeyDown={(event) => {
      if (event.target !== event.currentTarget || disabled) return
      if (event.key === ' ' || event.key === 'Enter') { event.preventDefault(); if (!event.repeat) compare('keyboard') }
      else if (event.key === 'Escape') cancel()
      else if (['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', '+', '=', '-'].includes(event.key)) {
        event.preventDefault()
        const draft = customSettings(latest.current.settings)
        const step = event.shiftKey ? 0.05 : 0.01
        releaseComparison()
        if (event.key === '+' || event.key === '=' || event.key === '-') {
          setSettings({ ...draft, zoom: clamp(draft.zoom * (event.key === '-' ? 1 / 1.1 : 1.1), MIN_ZOOM, MAX_ZOOM) })
        } else setSettings({ ...draft, offsetX: clamp(draft.offsetX + (event.key === 'ArrowLeft' ? -step : event.key === 'ArrowRight' ? step : 0), -2, 2),
          offsetY: clamp(draft.offsetY + (event.key === 'ArrowUp' ? -step : event.key === 'ArrowDown' ? step : 0), -2, 2) })
      }
    }}
    onKeyUp={(event) => { if (event.key === ' ' || event.key === 'Enter') releaseComparison() }}
    onBlur={(event) => { if (!event.currentTarget.contains(event.relatedTarget as Node | null)) { flush(); cancel() } }}>
    <div className="comparison-canvases" ref={host} role="img" aria-label={comparing ? '보정 전 원본 미리보기' : '개선 결과 미리보기'} />
    <span className="comparison-indicator" aria-live="polite">{comparing ? '보정 전 · 화질 효과만 끔' : pair.fast ? '조작 중 · 선명도는 놓은 뒤 적용' : '개선 결과'}</span>
  </div>
    <button className="preview-compare-button" disabled={disabled || pending || !!error || pair.fast} aria-pressed={comparing}
      aria-label="누르고 있는 동안 보정 전 원본 비교" title="누르고 있는 동안 보정 전 비교 · 스페이스/엔터 지원"
      onContextMenu={(event) => event.preventDefault()}
      onPointerDown={(event) => { event.stopPropagation(); if (event.button !== 0) return; event.preventDefault(); event.currentTarget.focus({ preventScroll: true }); event.currentTarget.setPointerCapture(event.pointerId); compare('button') }}
      onPointerUp={(event) => { event.stopPropagation(); releaseComparison(); if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId) }}
      onPointerCancel={releaseComparison} onLostPointerCapture={releaseComparison}
      onKeyDown={(event) => { if (event.key === ' ' || event.key === 'Enter') { event.preventDefault(); event.stopPropagation(); if (!event.repeat) compare('keyboard') } else if (event.key === 'Escape') releaseComparison() }}
      onKeyUp={(event) => { if (event.key === ' ' || event.key === 'Enter') { event.preventDefault(); event.stopPropagation(); releaseComparison() } }}
      onBlur={releaseComparison}>{comparing ? '보정 전 원본' : '원본 비교 · 누르기'}</button>
  </>
}
