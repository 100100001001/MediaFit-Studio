import { useEffect, useId, useState, type Dispatch, type SetStateAction } from 'react'
import { PRESETS, type EditSettings, type Background, type EdgeColors } from './types'
import { DIRECTIONS } from './edges'

export function EditorPanel({ settings, setSettings, disabled, edgeColor, edgeColors, colorSamplingFailed, compareBefore, onCompare }: {
  settings: EditSettings; setSettings: Dispatch<SetStateAction<EditSettings>>; disabled: boolean; edgeColor?: string
  edgeColors?: EdgeColors; colorSamplingFailed?: boolean; compareBefore: boolean; onCompare: () => void
}) {
  const update = <K extends keyof EditSettings>(key: K, value: EditSettings[K]) => setSettings((previous) => ({ ...previous, [key]: value }))
  const backgrounds: { id: Background; label: string; glyph: string }[] = [
    { id: 'auto', label: '단일 자동 색상', glyph: '◐' }, { id: 'color', label: '단일 직접 지정', glyph: '◒' },
    { id: 'directional-auto', label: '방향별 자동 색상', glyph: '◴' }, { id: 'directional-color', label: '방향별 직접 지정', glyph: '◲' },
    { id: 'blur', label: '블러 배경', glyph: '◉' }, { id: 'crop', label: '크롭', glyph: '⌗' },
  ]
  return <aside className="settings-panel">
    <div className="panel-heading"><span>편집 설정</span><span className="eyebrow">IMAGE</span></div>
    <fieldset disabled={disabled}>
      <section className="control-section">
        <h2><span className="section-number">01</span> 화면 비율</h2>
        <div className="preset-grid">{PRESETS.map((preset) => <button key={preset.id}
          className={`preset ${settings.preset === preset.id && !settings.originalSize ? 'selected' : ''}`}
          aria-pressed={settings.preset === preset.id && !settings.originalSize}
          onClick={() => setSettings((previous) => ({ ...previous, preset: preset.id, originalSize: false }))}>
          <span className={`ratio-icon ratio-${preset.id}`} />{preset.label}
        </button>)}</div>
        {settings.preset === 'custom' && !settings.originalSize && <div className="dimension-inputs">
          <label>너비 (px)<input type="number" min="1" max="9999" value={settings.customWidth} onChange={(event) => update('customWidth', Math.max(1, Math.min(9999, Math.round(Number(event.target.value) || 1))))} /></label>
          <span>×</span><label>높이 (px)<input type="number" min="1" max="9999" value={settings.customHeight} onChange={(event) => update('customHeight', Math.max(1, Math.min(9999, Math.round(Number(event.target.value) || 1))))} /></label>
        </div>}
      </section>
      <section className="control-section">
        <h2><span className="section-number">02</span> 배경 채우기</h2>
        <div className="background-grid">{backgrounds.map((item) => <button key={item.id} className={`background-option ${settings.background === item.id ? 'selected' : ''}`} aria-pressed={settings.background === item.id} onClick={() => update('background', item.id)}><span>{item.glyph}</span>{item.label}</button>)}</div>
        {settings.background === 'auto' && <div className="color-info"><span className="color-swatch" style={{ backgroundColor: edgeColor ?? '#252b38' }} /><span>가장자리에서 추출한 색상</span><code>{edgeColor ?? '—'}</code></div>}
        {settings.background === 'color' && <div className="color-fields"><input aria-label="배경 컬러 피커" type="color" value={settings.color} onChange={(event) => update('color', event.target.value)} /><HexColorInput color={settings.color} onColor={(value) => update('color', value)} /></div>}
        {settings.background === 'directional-auto' && <div className="direction-swatches">{DIRECTIONS.map(({ id, label }) => <div key={id}><span className="color-swatch" style={{ backgroundColor: edgeColors?.[id] ?? '#252b38' }} /><span>{label}</span><code>{edgeColors?.[id] ?? '—'}</code></div>)}</div>}
        {settings.background === 'directional-color' && <div className="direction-colors">
          {DIRECTIONS.map(({ id, label }) => <div key={id} className="color-fields direction-color-row">
            <input aria-label={`${label} 색상 선택`} type="color" value={settings.directionColors[id]}
              onChange={(event) => update('directionColors', { ...settings.directionColors, [id]: event.target.value })} />
            <HexColorInput label={`${label} HEX 색상`} color={settings.directionColors[id]}
              onColor={(value) => update('directionColors', { ...settings.directionColors, [id]: value })} />
          </div>)}
          <button className="text-button" onClick={() => { if (edgeColors) update('directionColors', { ...edgeColors }) }}>자동 추출 색상으로 되돌리기</button>
        </div>}
        {(settings.background === 'directional-auto' || settings.background === 'directional-color') && <div className="connection-control"><label>색상 연결 방식<select value={settings.connection} onChange={(event) => update('connection', event.target.value as EditSettings['connection'])}><option value="solid">단색 채우기</option><option value="gradient">부드러운 색상 연결 (그라데이션)</option></select></label>
          <p className="helper">그라데이션은 이미지 가장자리 색상에서 바깥 배경색으로 연결합니다. 원본 이미지에는 적용하지 않습니다.</p>
        </div>}
        {colorSamplingFailed && <p className="helper" role="status">가장자리 색상을 읽지 못해 안전한 기본 색상을 사용합니다. 직접 지정할 수 있습니다.</p>}
        {settings.background === 'blur' && <p className="helper">축소한 배경에만 블러를 적용해 처리량을 줄입니다.</p>}
        {settings.background === 'crop' && <div className="position-controls">
          <label>가로 위치 <span>{settings.positionX}%</span><input type="range" min="0" max="100" value={settings.positionX} onChange={(event) => update('positionX', Number(event.target.value))} /></label>
          <label>세로 위치 <span>{settings.positionY}%</span><input type="range" min="0" max="100" value={settings.positionY} onChange={(event) => update('positionY', Number(event.target.value))} /></label>
          <button className="text-button" onClick={() => setSettings((previous) => ({ ...previous, positionX: 50, positionY: 50 }))}>가운데로 맞추기</button>
        </div>}
      </section>
      <section className="control-section">
        <h2><span className="section-number">03</span> 이미지 개선 <span className="small-badge">기본</span></h2>
        <label className="range-label">선명도 <span>{settings.sharpness}%</span><input type="range" min="0" max="100" step="5" value={settings.sharpness} onChange={(event) => update('sharpness', Number(event.target.value))} /></label>
        <button className="button secondary compare-button" aria-pressed={compareBefore} onClick={onCompare}>{compareBefore ? '개선 결과 보기' : '보정 전과 비교하기'}</button>
        <p className="helper">{compareBefore ? '비교 중: 같은 크기·배경에서 선명도 0으로 표시합니다. 저장에는 설정한 선명도를 적용합니다.' : '비교는 축소 미리보기만 전환합니다. 색상·밝기·채도는 보정하지 않습니다.'}</p>
        <label className="checkbox-label"><input type="checkbox" checked={settings.originalSize} onChange={(event) => update('originalSize', event.target.checked)} /> 원본 해상도 유지 <span>안전 한도 내</span></label>
        <p className="helper">고품질 보간과 가벼운 선명도 조정입니다.<br />AI 업스케일링이나 실제 디테일 복원이 아닙니다.</p>
      </section>
    </fieldset>
  </aside>
}

function HexColorInput({ color, onColor, label = 'HEX 색상' }: { color: string; onColor: (value: string) => void; label?: string }) {
  const [text, setText] = useState(color)
  const [invalid, setInvalid] = useState(false)
  const errorId = useId()
  useEffect(() => { setText(color); setInvalid(false) }, [color])
  return <label>{label}<input aria-label={label} type="text" value={text} maxLength={7} spellCheck={false}
    aria-invalid={invalid} aria-describedby={invalid ? errorId : undefined}
    onChange={(event) => {
      setText(event.target.value); setInvalid(false)
      if (/^#[\da-f]{6}$/i.test(event.target.value)) onColor(event.target.value)
    }} onBlur={() => { if (!/^#[\da-f]{6}$/i.test(text)) { setInvalid(true); setText(color) } }} />
    {invalid && <span id={errorId} className="helper" role="alert">#252b38처럼 입력해 주세요.</span>}
  </label>
}
