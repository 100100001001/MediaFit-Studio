import { useCallback, useEffect, useRef, useState } from 'react'
import { Icon } from './components/Icon'
import { UploadZone } from './components/UploadZone'
import { EditorPanel } from './features/image/EditorPanel'
import { context2d, loadAsset, releaseCanvas, withDecodedImage } from './features/image/file'
import { fileSize, fitSize, outputSize, PREVIEW_EDGE } from './features/image/limits'
import { encodeCanvas, renderImage } from './features/image/render'
import { INITIAL_SETTINGS, type Format, type ImageAsset } from './features/image/types'
import { assertFile, clipboardImage, isTextPasteTarget } from './features/image/input'

interface ExportResult { url: string; name: string; bytes: number; width: number; height: number }

export default function App() {
  const [asset, setAsset] = useState<ImageAsset | null>(null)
  const [settings, setSettings] = useState(INITIAL_SETTINGS)
  const [compareBefore, setCompareBefore] = useState(false)
  const [format, setFormat] = useState<Format>('png')
  const [quality, setQuality] = useState(90)
  const [name, setName] = useState('mediafit-image')
  const [busy, setBusy] = useState('')
  const [error, setError] = useState('')
  const [previewError, setPreviewError] = useState('')
  const [previewPending, setPreviewPending] = useState(false)
  const [result, setResult] = useState<ExportResult | null>(null)
  const [visible, setVisible] = useState(!document.hidden)
  const previewCanvas = useRef<HTMLCanvasElement>(null)
  const previewWork = useRef<Promise<void>>(Promise.resolve())
  const lastPreview = useRef<{ asset: ImageAsset; settings: typeof settings; compareBefore: boolean } | null>(null)
  const generation = useRef(0)
  const locked = useRef(false)
  const mounted = useRef(true)
  const assetRef = useRef<ImageAsset | null>(null)
  const closeButton = useRef<HTMLButtonElement>(null)
  const exportButton = useRef<HTMLButtonElement>(null)
  const size = asset ? outputSize(asset, settings) : null

  useEffect(() => {
    const handleVisibility = () => setVisible(!document.hidden)
    document.addEventListener('visibilitychange', handleVisibility)
    return () => {
      mounted.current = false
      generation.current++
      document.removeEventListener('visibilitychange', handleVisibility)
      if (assetRef.current) releaseCanvas(assetRef.current.preview)
    }
  }, [])

  useEffect(() => {
    if (!result) return
    closeButton.current?.focus()
    const handleKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setResult(null)
      if (event.key === 'Tab') {
        const controls = document.querySelectorAll<HTMLElement>('[role="dialog"] button, [role="dialog"] a')
        const first = controls[0]; const last = controls[controls.length - 1]
        if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus() }
        else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus() }
      }
    }
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    document.addEventListener('keydown', handleKey)
    return () => {
      URL.revokeObjectURL(result.url)
      document.body.style.overflow = previousOverflow
      document.removeEventListener('keydown', handleKey)
      exportButton.current?.focus()
    }
  }, [result])

  useEffect(() => {
    const current = ++generation.current
    if (!asset || busy || !visible) return
    setPreviewError('')
    if (lastPreview.current?.asset === asset && lastPreview.current.settings === settings && lastPreview.current.compareBefore === compareBefore) {
      setPreviewPending(false)
      return
    }
    setPreviewPending(true)
    const timer = setTimeout(() => {
      // 이전 축소 렌더가 끝난 뒤 하나만 실행. 오래된 요청은 시작하지 않는다.
      previewWork.current = previewWork.current.then(async () => {
        const cancelled = () => generation.current !== current || document.hidden || !mounted.current
        if (cancelled()) return
        const canvas = document.createElement('canvas')
        try {
          const output = outputSize(asset, settings)
          const small = fitSize(output.width, output.height, PREVIEW_EDGE)
          const previewSettings = compareBefore ? { ...settings, sharpness: 0 } : settings
          await renderImage(canvas, asset.preview, asset.width, asset.height, asset, previewSettings, small.width, small.height, cancelled)
          if (cancelled() || !previewCanvas.current) return
          const display = previewCanvas.current
          display.width = canvas.width; display.height = canvas.height
          context2d(display).drawImage(canvas, 0, 0)
          lastPreview.current = { asset, settings, compareBefore }
        } catch (cause) {
          if (!cancelled()) setPreviewError(message(cause))
        } finally {
          releaseCanvas(canvas)
          if (!cancelled()) setPreviewPending(false)
        }
      })
    }, 180)
    return () => { clearTimeout(timer); generation.current++ }
  }, [asset, settings, busy, visible, compareBefore])

  const openFile = useCallback(async (file: File) => {
    if (locked.current) return
    locked.current = true
    generation.current++
    setBusy('이미지를 확인하고 있습니다…')
    setError('')
    try {
      assertFile(file)
      await previewWork.current
      if (document.hidden) throw new Error('탭으로 돌아온 후 파일을 다시 선택해 주세요.')
      const next = await loadAsset(file)
      if (!mounted.current) { releaseCanvas(next.preview); return }
      if (assetRef.current) releaseCanvas(assetRef.current.preview)
      lastPreview.current = null
      assetRef.current = next
      setAsset(next)
      setSettings({ ...INITIAL_SETTINGS, directionColors: { ...next.edgeColors } })
      setCompareBefore(false)
      setName(file.name.replace(/\.[^.]+$/, '') + '-mediafit')
      setResult(null)
    } catch (cause) { if (mounted.current) setError(message(cause)) }
    finally { locked.current = false; if (mounted.current) setBusy('') }
  }, [])

  useEffect(() => {
    function handlePaste(event: ClipboardEvent) {
      if (event.defaultPrevented || busy || result || locked.current || document.hidden) return
      if (isTextPasteTarget(event.target) || isTextPasteTarget(document.activeElement)) return
      try {
        const file = clipboardImage(event.clipboardData)
        if (!file) return
        event.preventDefault()
        void openFile(file)
      } catch (cause) { setError(message(cause)) }
    }
    document.addEventListener('paste', handlePaste)
    return () => document.removeEventListener('paste', handlePaste)
  }, [openFile, busy, result])

  async function removeFile() {
    if (locked.current) return
    locked.current = true
    generation.current++
    setBusy('이미지를 정리하고 있습니다…')
    await previewWork.current
    if (assetRef.current) releaseCanvas(assetRef.current.preview)
    assetRef.current = null
    lastPreview.current = null
    setAsset(null); setResult(null); setError(''); setPreviewError(''); setPreviewPending(false); setCompareBefore(false)
    if (previewCanvas.current) releaseCanvas(previewCanvas.current)
    locked.current = false; setBusy('')
  }

  async function prepareExport() {
    if (!asset || !size || locked.current || document.hidden) return
    locked.current = true
    generation.current++
    setBusy('저장 결과를 만들고 있습니다…')
    setError('')
    const canvas = document.createElement('canvas')
    const cancelled = () => document.hidden || !mounted.current
    try {
      await previewWork.current
      const blob = await withDecodedImage(asset.file, async (image) => {
        if (cancelled()) throw new Error('탭이 비활성화되어 작업을 중단했습니다. 다시 요청해 주세요.')
        await renderImage(canvas, image, image.naturalWidth, image.naturalHeight, asset, settings, size.width, size.height, cancelled)
        return encodeCanvas(canvas, format, quality)
      })
      if (cancelled()) throw new Error('탭이 비활성화되어 결과를 취소했습니다. 다시 요청해 주세요.')
      const filename = (name.trim().replace(/[<>:"/\\|?*\x00-\x1f]/g, '-').replace(/[. ]+$/, '').slice(0, 120) || 'mediafit-image') + (format === 'jpeg' ? '.jpg' : `.${format}`)
      setResult({ url: URL.createObjectURL(blob), name: filename, bytes: blob.size, width: size.width, height: size.height })
    } catch (cause) { if (mounted.current) setError(message(cause)) }
    finally { releaseCanvas(canvas); locked.current = false; if (mounted.current) setBusy('') }
  }

  const disabled = !!busy || !!result
  return <div className="app-shell">
    <header className="app-header" inert={!!result}>
      <a href={import.meta.env.BASE_URL} className="brand" aria-label="MediaFit Studio Lite 홈"><span className="brand-icon"><Icon name="image" size={23} /></span><span>MediaFit <strong>Studio</strong><span className="lite-tag">LITE</span></span></a>
      <div className="header-meta">나만의 화면을 만드는 작은 스튜디오</div>
      <span className="privacy-pill"><span className="status-dot" /> 브라우저 안에서만 처리</span>
    </header>

    <main inert={!!result}>
      <div className="workspace-heading"><div><span className="eyebrow accent">YOUR PERSONAL CANVAS</span><h1>이미지 스튜디오<span>작은 편집, 새로운 분위기.</span></h1></div><span className="phase-tag">이미지 편집 · Phase 1</span></div>
      <div className="editor-layout">
        <EditorPanel settings={settings} setSettings={setSettings} disabled={disabled || !asset} edgeColor={asset?.edgeColor}
          edgeColors={asset?.edgeColors} colorSamplingFailed={asset?.colorSamplingFailed} compareBefore={compareBefore} onCompare={() => setCompareBefore((previous) => !previous)} />
        <section className="preview-panel" aria-label="이미지 미리보기">
          <div className="preview-toolbar"><span><Icon name="image" size={17} /> 미리보기</span><span className="preview-scale">축소 보기 · 최대 960px</span></div>
          <div className={`preview-stage ${asset ? 'has-image' : ''}`}>
            {asset ? <>
              <canvas ref={previewCanvas} aria-label="편집 결과 축소 미리보기" className={previewError ? 'preview-failed' : ''} />
              <span className="canvas-label">{compareBefore ? '보정 전 · 비교용' : settings.originalSize ? '원본 해상도' : settings.preset === 'custom' ? '사용자 지정' : PRESET_LABELS[settings.preset]}<span> {size?.width} × {size?.height}</span></span>
              {(previewPending || !visible || previewError) && <div className="preview-status" role="status">{previewError || (!visible ? '탭이 비활성화되어 미리보기를 멈췄습니다.' : '미리보기 업데이트 중…')}</div>}
            </> : <UploadZone disabled={disabled} onFile={openFile} onError={setError} />}
          </div>
          <div className="file-bar">{asset ? <>
            <div className="file-details"><span className="file-mini-icon"><Icon name="image" size={19} /></span><div><strong title={asset.file.name}>{asset.file.name}</strong><span>{asset.width.toLocaleString()} × {asset.height.toLocaleString()} px <i>·</i> {fileSize(asset.file.size)}</span></div></div>
            <div className="file-actions"><UploadZone compact disabled={disabled} onFile={openFile} onError={setError} /><button className="icon-button" disabled={disabled} onClick={removeFile} aria-label="이미지 제거"><Icon name="close" size={18} /></button></div>
          </> : <><span>아직 선택한 이미지가 없습니다</span><span className="local-note"><Icon name="shield" size={15} /> 파일 외부 전송 없음</span></>}</div>
        </section>
      </div>

      <section className="export-panel" aria-label="출력 설정">
        <div className="export-title"><span className="section-number">04</span><div><h2>내보내기</h2><span>나만의 화면으로 저장하세요</span></div></div>
        <fieldset disabled={disabled || !asset} className="export-fields">
          <label className="filename-field">파일 이름<input type="text" value={name} maxLength={120} onChange={(event) => setName(event.target.value)} /></label>
          <label>형식<select value={format} onChange={(event) => setFormat(event.target.value as Format)}><option value="png">PNG</option><option value="jpeg">JPG</option><option value="webp">WebP</option></select></label>
          {format !== 'png' && <label className="quality-field">품질 <span>{quality}%</span><input type="range" min="40" max="100" step="5" value={quality} onChange={(event) => setQuality(Number(event.target.value))} /></label>}
        </fieldset>
        <div className="output-size"><span>출력 해상도</span><strong>{size ? `${size.width} × ${size.height}` : '— × —'}<small> px</small></strong><span>{size ? `${(size.width * size.height / 1_000_000).toFixed(2)}MP` : '최대 3MP'} · 고품질 보간</span></div>
        <div className="save-area"><button ref={exportButton} className="button primary save-button" disabled={disabled || !asset || !visible} onClick={prepareExport}><Icon name="download" size={19} />{busy ? '처리 중…' : '저장 결과 확인'}</button><span>결과를 확인한 뒤 다운로드</span></div>
      </section>
      {size?.limited && <p className="notice">안정적인 처리를 위해 요청한 해상도를 {size.width} × {size.height}px로 줄였습니다. 원본 해상도 유지 옵션에도 3MP · 긴 변 2560px 제한이 적용됩니다.</p>}
      {error && <div className="error-message" role="alert"><span>{error}</span><button className="icon-button" aria-label="오류 메시지 닫기" onClick={() => setError('')}><Icon name="close" size={16} /></button></div>}
      <div className="work-status" role="status" aria-live="polite">{busy}</div>
      <footer className="app-footer"><span><Icon name="shield" size={15} /> 내 파일은 내 기기에. 서버 업로드 없이 안전 한도 내에서 편집합니다.</span><span>가볍게 만들고, 오래 쓰기.</span></footer>
    </main>

    {result && <div className="modal-backdrop"><section role="dialog" aria-modal="true" aria-labelledby="result-title" className="result-modal">
      <div className="modal-heading"><div><span className="eyebrow accent">READY TO SAVE</span><h2 id="result-title">저장 결과 미리보기</h2></div><button ref={closeButton} className="icon-button" aria-label="결과 미리보기 닫기" onClick={() => setResult(null)}><Icon name="close" /></button></div>
      <div className="result-image"><img src={result.url} alt="다운로드할 최종 이미지" /></div>
      <p className="result-name">{result.name}</p><p className="helper">{result.width} × {result.height}px · {fileSize(result.bytes)} · {format === 'jpeg' ? 'JPG' : format.toUpperCase()}</p>
      <div className="modal-actions"><button className="button secondary" onClick={() => setResult(null)}>계속 편집</button><a className="button primary" href={result.url} download={result.name}><Icon name="download" size={18} /> 다운로드</a></div>
      <p className="helper">모바일에서는 브라우저의 다운로드 또는 공유 메뉴에서 저장해 주세요.</p>
    </section></div>}
  </div>
}

const PRESET_LABELS: Record<string, string> = { original: '원본 비율', square: '1:1', portrait: '9:16', landscape: '16:9', classic: '4:3', vertical: '3:4' }
function message(error: unknown) { return error instanceof Error ? error.message : '처리하지 못했습니다. 파일 크기를 줄이거나 다른 이미지를 선택해 주세요.' }
