/** 이벤트의 수명이 끝나기 전에 File 객체를 확보한다. FileList는 보관하지 않는다. */
export function assertFile(value: unknown): asserts value is File {
  if (!(value instanceof File)) {
    throw new Error('유효한 이미지 파일을 받지 못했습니다. 파일을 다시 선택해 주세요.')
  }
}

export function singleFile(files: ArrayLike<File> | null): File | null {
  if (!files || files.length === 0) return null
  if (files.length !== 1) throw new Error('이미지는 한 번에 1개만 선택해 주세요.')
  const file = files[0]
  assertFile(file)
  return file
}

export function fileFromInput(input: Pick<HTMLInputElement, 'files' | 'value'>): File | null {
  try {
    // value 초기화로 FileList가 비워지기 전에 실제 File 참조를 꺼낸다.
    return singleFile(input.files)
  } finally {
    // 같은 파일을 다시 선택하는 경우에도 change가 발생하도록 한다.
    input.value = ''
  }
}

interface ClipboardImageData {
  items?: ArrayLike<Pick<DataTransferItem, 'kind' | 'type' | 'getAsFile'>>
  files?: ArrayLike<File>
}

function nameClipboardImage(blob: Blob): File {
  const extensions: Record<string, string> = { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/webp': 'webp' }
  if (blob instanceof File && blob.name.trim() && /\.[^.]+$/.test(blob.name)) return blob
  // 바이트를 변환하지 않는다. 형식·시그니처·해상도 검증은 기존 파이프라인에서 수행한다.
  return new File([blob], `pasted-image.${extensions[blob.type.toLowerCase()] ?? 'bin'}`, {
    type: blob.type, lastModified: blob instanceof File ? blob.lastModified : Date.now(),
  })
}

export function clipboardImage(data: ClipboardImageData | null): File | null {
  if (!data) return null
  const images = Array.from(data.items ?? []).filter((item) => item.kind === 'file' && item.type.toLowerCase().startsWith('image/'))
  if (images.length > 1) throw new Error('이미지는 한 번에 1개만 붙여넣어 주세요.')
  if (images.length === 1) {
    let file: File | null
    try { file = images[0].getAsFile() }
    catch { throw new Error('브라우저가 클립보드 이미지 접근을 허용하지 않았습니다. 파일 선택 또는 드래그를 이용해 주세요.') }
    if (file instanceof Blob) return nameClipboardImage(file)
  }
  // 파일 복사 붙여넣기를 files로만 제공하는 브라우저를 지원한다.
  const files = Array.from(data.files ?? []).filter((file) => file.type.toLowerCase().startsWith('image/'))
  const file = singleFile(files)
  if (file) return nameClipboardImage(file)
  if (images.length) throw new Error('브라우저가 클립보드 이미지 데이터를 제공하지 못했습니다. 파일 선택 또는 드래그를 이용해 주세요.')
  return null
}

export function isTextPasteTarget(target: EventTarget | null) {
  if (!(target instanceof HTMLElement)) return false
  return target.matches('input, textarea, select') || target.isContentEditable || !!target.closest('[role="textbox"]')
}
