import type { Dispatch, SetStateAction, PointerEvent } from 'react'
import { INITIAL_TRANSFORM, type EditSettings, type Placement } from './types'
import { customSettings, flipImage, MAX_ZOOM, MIN_ZOOM, placementMode, rotateQuarter } from './transform'

export function TransformPanel({ settings, setSettings, onInteractive }: {
  settings: EditSettings; setSettings: Dispatch<SetStateAction<EditSettings>>; onInteractive: (value: boolean) => void
}) {
  const mode = placementMode(settings)
  const update = (key: 'zoom' | 'offsetX' | 'offsetY', value: number) => setSettings((previous) => ({ ...customSettings(previous), [key]: value }))
  const rangeEvents = {
    onPointerDown: (event: PointerEvent<HTMLInputElement>) => { event.currentTarget.setPointerCapture(event.pointerId); onInteractive(true) },
    onPointerUp: () => onInteractive(false), onPointerCancel: () => onInteractive(false), onLostPointerCapture: () => onInteractive(false),
    onBlur: () => onInteractive(false),
  }
  function selectMode(next: Placement) {
    setSettings((previous) => next === 'custom' ? customSettings(previous) : {
      ...previous, placement: next, customBase: next, zoom: 1, offsetX: 0, offsetY: 0, positionX: 50, positionY: 50,
      background: previous.background === 'crop' && next === 'fit' ? 'auto' : previous.background,
    })
  }
  return <section className="control-section transform-section">
    <h2><span className="section-number">02</span> 이미지 배치·변형</h2>
    <div className="placement-options" role="group" aria-label="이미지 배치 모드">
      {([{ id: 'fit', label: 'Fit · 맞춤' }, { id: 'fill', label: 'Fill · 채우기' }, { id: 'custom', label: 'Custom · 조절' }] as const).map(({ id, label }) =>
        <button key={id} className={mode === id ? 'selected' : ''} aria-pressed={mode === id} onClick={() => selectMode(id)}>{label}</button>)}
    </div>
    <div className="transform-buttons" role="group" aria-label="회전과 반전">
      <button aria-label="왼쪽 90도 회전" onClick={() => setSettings((previous) => rotateQuarter(previous, -90))}>↶ 왼쪽 90°</button>
      <button aria-label="오른쪽 90도 회전" onClick={() => setSettings((previous) => rotateQuarter(previous, 90))}>↷ 오른쪽 90°</button>
      <button aria-pressed={settings.flipX} className={settings.flipX ? 'selected' : ''} onClick={() => setSettings((previous) => flipImage(previous, 'flipX'))}>↔ 좌우 반전</button>
      <button aria-pressed={settings.flipY} className={settings.flipY ? 'selected' : ''} onClick={() => setSettings((previous) => flipImage(previous, 'flipY'))}>↕ 상하 반전</button>
    </div>
    <label className="range-label">미세 회전 <span>{settings.fineRotation}°</span>
      <input {...rangeEvents} type="range" min="-15" max="15" step="0.5" value={settings.fineRotation} onChange={(event) => setSettings((previous) => ({ ...previous, fineRotation: Number(event.target.value) }))} />
    </label>
    <label className="range-label">확대·축소 <span>{Math.round((mode === 'custom' ? settings.zoom : 1) * 100)}%</span>
      <input {...rangeEvents} type="range" min={MIN_ZOOM * 100} max={MAX_ZOOM * 100} step="5" value={(mode === 'custom' ? settings.zoom : 1) * 100} onChange={(event) => update('zoom', Number(event.target.value) / 100)} />
    </label>
    {mode === 'custom' && <>
      <label className="range-label">가로 이동 <span>{Math.round(settings.offsetX * 100)}%</span><input {...rangeEvents} type="range" min="-200" max="200" value={settings.offsetX * 100} onChange={(event) => update('offsetX', Number(event.target.value) / 100)} /></label>
      <label className="range-label">세로 이동 <span>{Math.round(settings.offsetY * 100)}%</span><input {...rangeEvents} type="range" min="-200" max="200" value={settings.offsetY * 100} onChange={(event) => update('offsetY', Number(event.target.value) / 100)} /></label>
    </>}
    <button className="button secondary transform-reset" onClick={() => { onInteractive(false); setSettings((previous) => ({ ...previous, ...INITIAL_TRANSFORM, background: previous.background === 'crop' ? 'auto' : previous.background })) }}>변형 초기화</button>
    <p className="helper">드래그·핀치·휠 조작 시 Custom으로 전환합니다. 배율은 시작한 Fit/Fill 배치 기준입니다. 원본 파일은 변경하지 않습니다.</p>
  </section>
}
