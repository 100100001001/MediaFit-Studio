import { useRef, useState } from 'react'
import { Icon } from './Icon'
import { fileFromInput, singleFile } from '../features/image/input'

export function UploadZone({ disabled, onFile, onError, compact = false }: {
  disabled: boolean; onFile: (file: File) => void; onError: (message: string) => void; compact?: boolean
}) {
  const input = useRef<HTMLInputElement>(null)
  const [dragging, setDragging] = useState(false)
  function submit(readFile: () => File | null) {
    if (disabled) return
    try {
      const file = readFile()
      if (file) onFile(file)
    } catch (cause) {
      onError(cause instanceof Error ? cause.message : '파일을 읽지 못했습니다. 다시 선택해 주세요.')
    }
  }
  return <div className={`${compact ? 'upload-compact' : 'upload-zone'} ${dragging ? 'dragging' : ''}`}
    onDragOver={(event) => { event.preventDefault(); if (!disabled) setDragging(true) }}
    onDragLeave={() => setDragging(false)}
    onDrop={(event) => { event.preventDefault(); setDragging(false); submit(() => singleFile(event.dataTransfer.files)) }}>
    <input ref={input} type="file" accept="image/jpeg,image/png,image/webp,.jpg,.jpeg,.png,.webp" disabled={disabled}
      className="sr-only" tabIndex={-1} aria-label="이미지 파일 선택" onChange={(event) => { submit(() => fileFromInput(event.currentTarget)) }} />
    {compact ? <button className="button secondary" disabled={disabled} onClick={() => input.current?.click()}><Icon name="upload" size={16} /> 파일 변경</button> : <>
      <div className="upload-symbol"><Icon name="image" size={38} /></div>
      <h2>이미지를 위한 새로운 프레임</h2>
      <p>이미지를 선택하거나 드래그하세요. Ctrl+V 붙여넣기도 지원합니다.</p>
      <button className="button primary" disabled={disabled} onClick={() => input.current?.click()}><Icon name="upload" size={18} /> 이미지 선택</button>
      <span className="upload-formats">JPG · PNG · WebP <span>최대 10MB / 12MP / 1개</span></span>
      <p className="helper" style={{ margin: '12px 0 0' }}>브라우저가 클립보드 이미지를 제공하는 경우 지원됩니다.<br />붙여넣기가 안 되면 파일 선택 또는 드래그를 이용해 주세요.</p>
    </>}
  </div>
}
