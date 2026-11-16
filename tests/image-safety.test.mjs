// 작은 합성 헤더만 검사한다. 실제 이미지 디코딩/브라우저/대용량 처리는 없다.
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { stripTypeScriptTypes } from 'node:module'

async function moduleUrl(path, replacements = {}) {
  let outputText = stripTypeScriptTypes(await readFile(new URL(path, import.meta.url), 'utf8'))
  for (const [specifier, url] of Object.entries(replacements)) {
    outputText = outputText.replaceAll(`'${specifier}'`, JSON.stringify(url))
  }
  return `data:text/javascript;base64,${Buffer.from(outputText).toString('base64')}`
}

const typesUrl = await moduleUrl('../src/features/image/types.ts')
const limitsUrl = await moduleUrl('../src/features/image/limits.ts', { './types': typesUrl })
const inputUrl = await moduleUrl('../src/features/image/input.ts')
const edgesUrl = await moduleUrl('../src/features/image/edges.ts')
const fileUrl = await moduleUrl('../src/features/image/file.ts', { './limits': limitsUrl, './input': inputUrl, './edges': edgesUrl })
const { inspectFile } = await import(fileUrl)
const { assertFile, fileFromInput, singleFile, clipboardImage } = await import(inputUrl)
const { fitSize, outputSize } = await import(limitsUrl)
const { INITIAL_SETTINGS } = await import(typesUrl)

function png(width, height, animated = false) {
  const bytes = new Uint8Array(animated ? 53 : 33)
  bytes.set([137, 80, 78, 71, 13, 10, 26, 10])
  const view = new DataView(bytes.buffer)
  view.setUint32(8, 13)
  bytes.set(Buffer.from('IHDR'), 12)
  view.setUint32(16, width); view.setUint32(20, height)
  if (animated) { view.setUint32(33, 8); bytes.set(Buffer.from('acTL'), 37) }
  return bytes
}

function jpeg(width, height) {
  const bytes = new Uint8Array(15)
  bytes.set([255, 216, 255, 192, 0, 11, 8])
  const view = new DataView(bytes.buffer)
  view.setUint16(7, height); view.setUint16(9, width)
  return bytes
}

function webp(width, height, animated = false) {
  const bytes = new Uint8Array(30)
  const view = new DataView(bytes.buffer)
  bytes.set(Buffer.from('RIFF'), 0); view.setUint32(4, 22, true)
  bytes.set(Buffer.from('WEBPVP8X'), 8); view.setUint32(16, 10, true)
  bytes[20] = animated ? 2 : 0
  const w = width - 1; const h = height - 1
  bytes[24] = w & 255; bytes[25] = (w >> 8) & 255; bytes[26] = w >> 16
  bytes[27] = h & 255; bytes[28] = (h >> 8) & 255; bytes[29] = h >> 16
  return bytes
}

let passed = 0
async function check(name, fn) { await fn(); passed++; process.stdout.write(`PASS ${name}\n`) }
const file = (bytes, name = 'sample.png') => new File([bytes], name)

await check('PNG 12MP 경계 허용', async () => assert.deepEqual(await inspectFile(file(png(4000, 3000))), { width: 4000, height: 3000 }))
await check('PNG 12MP 초과 거절', async () => assert.rejects(inspectFile(file(png(4001, 3000))), /12MP/))
await check('가늘고 긴 원본 거절', async () => assert.rejects(inspectFile(file(png(16385, 1))), /16,384/))
await check('빈 파일 거절', async () => assert.rejects(inspectFile(file(new Uint8Array())), /10MB/))
await check('10MB 초과 시 읽기 전 거절', async () => {
  class OversizeFile extends File {
    get size() { return 10 * 1024 * 1024 + 1 }
    arrayBuffer() { throw new Error('크기 초과 파일을 읽으면 안 됨') }
  }
  await assert.rejects(inspectFile(new OversizeFile([], 'large.png')), /10MB/)
})
await check('손상된 헤더 거절', async () => assert.rejects(inspectFile(file(new Uint8Array([137, 80])))))
await check('확장자 위장 거절', async () => assert.rejects(inspectFile(file(png(10, 10), 'sample.jpg'))))
await check('APNG 거절', async () => assert.rejects(inspectFile(file(png(10, 10, true))), /애니메이션/))
await check('JPEG SOF 해상도 판독', async () => assert.deepEqual(await inspectFile(file(jpeg(640, 480), 'sample.jpg')), { width: 640, height: 480 }))
await check('WebP VP8X 판독', async () => assert.deepEqual(await inspectFile(file(webp(320, 240), 'sample.webp')), { width: 320, height: 240 }))
await check('애니메이션 WebP 거절', async () => assert.rejects(inspectFile(file(webp(320, 240, true), 'sample.webp')), /애니메이션/))
await check('1080×1920 세로 출력 유지', () => assert.deepEqual(outputSize({ width: 4000, height: 3000 }, INITIAL_SETTINGS), { width: 1080, height: 1920, limited: false }))
await check('원본 크기 옵션에도 출력 한도 적용', () => {
  const size = outputSize({ width: 4000, height: 3000 }, { ...INITIAL_SETTINGS, originalSize: true })
  assert.equal(size.limited, true)
  assert.ok(size.width * size.height <= 3_000_000)
  assert.ok(Math.max(size.width, size.height) <= 2560)
})
await check('극단적 사용자 비율에서 0px 방지', () => assert.deepEqual(fitSize(1, 9999, 2560, 3_000_000), { width: 1, height: 2560 }))

// 실제 DOM 대신 value 초기화 시 비워지는 FileList를 모델링한다.
function liveInput(selected) {
  const files = { ...selected, length: selected.length }
  return {
    files,
    set value(_value) {
      for (let i = 0; i < files.length; i++) delete files[i]
      files.length = 0
    },
  }
}

await check('원인 재현: await 후 초기화된 FileList에서 undefined 전달', async () => {
  const input = liveInput([file(png(10, 10))])
  const legacyRead = async (files) => { await Promise.resolve(); return files[0].size }
  const pending = legacyRead(input.files)
  input.value = ''
  await assert.rejects(pending, /reading 'size'/)
})
await check('수정 회귀: 입력 초기화 후 await를 지나도 실제 File 유지', async () => {
  const source = file(png(10, 10))
  const input = liveInput([source])
  const captured = fileFromInput(input)
  assert.equal(input.files.length, 0)
  await Promise.resolve()
  assert.equal(captured, source)
  assert.deepEqual(await inspectFile(captured), { width: 10, height: 10 })
})
await check('JPG/PNG/WebP 입력에서 공통 헤더 검증 연결', async () => {
  for (const source of [file(jpeg(20, 10), 'photo.jpg'), file(png(20, 10)), file(webp(20, 10), 'photo.webp')]) {
    assert.deepEqual(await inspectFile(fileFromInput(liveInput([source]))), { width: 20, height: 10 })
  }
})
await check('파일 선택 취소(null/빈 목록)는 작업 없음', () => {
  assert.equal(fileFromInput({ files: null, value: '' }), null)
  assert.equal(fileFromInput(liveInput([])), null)
})
await check('다중 파일은 거절하고 입력 초기화', () => {
  const input = liveInput([file(png(1, 1)), file(png(1, 1))])
  assert.throws(() => fileFromInput(input), /1개/)
  assert.equal(input.files.length, 0)
})
await check('undefined/이벤트/가짜 File은 size 접근 전에 거절', async () => {
  for (const value of [undefined, null, { target: { files: [] } }, { size: 1, name: 'fake.png' }]) {
    assert.throws(() => assertFile(value), /유효한/)
    await assert.rejects(inspectFile(value), /유효한/)
  }
  assert.throws(() => singleFile({ length: 1 }), /유효한/)
})
await check('드롭 목록을 비우기 전에 File 참조 확보', async () => {
  const source = file(png(10, 20))
  const files = [source]
  const captured = singleFile(files)
  files.length = 0
  await Promise.resolve()
  assert.deepEqual(await inspectFile(captured), { width: 10, height: 20 })
})

const imageItem = (blob) => ({ kind: 'file', type: blob.type, getAsFile: () => blob })
const textItem = { kind: 'string', type: 'text/plain', getAsFile: () => { throw new Error('텍스트를 파일로 읽으면 안 됨') } }
const clipboardPng = new File([png(30, 20)], 'screenshot.png', { type: 'image/png' })

await check('이미지+텍스트: 실제 이미지 File만 추출', async () => {
  const pasted = clipboardImage({ items: [textItem, imageItem(clipboardPng)] })
  assert.equal(pasted, clipboardPng)
  assert.deepEqual(await inspectFile(pasted), { width: 30, height: 20 })
})
await check('텍스트만/HTML만/이미지 URL/빈 클립보드는 무시', () => {
  for (const data of [null, {}, { items: [textItem] }, { items: [{ ...textItem, type: 'text/html' }] }, { items: [{ ...textItem, type: 'text/uri-list' }] }]) {
    assert.equal(clipboardImage(data), null)
  }
})
await check('이름 없는 이미지 File에 pasted-image.png 지정', async () => {
  const unnamed = new File([png(20, 10)], '', { type: 'image/png' })
  const pasted = clipboardImage({ items: [imageItem(unnamed)] })
  assert.equal(pasted.name, 'pasted-image.png')
  assert.deepEqual(await inspectFile(pasted), { width: 20, height: 10 })
})
await check('이미지 Blob을 기본 이름의 File로 변환', async () => {
  const blob = new Blob([jpeg(20, 10)], { type: 'image/jpeg' })
  const pasted = clipboardImage({ items: [imageItem(blob)] })
  assert.ok(pasted instanceof File)
  assert.equal(pasted.name, 'pasted-image.jpg')
  assert.deepEqual(await inspectFile(pasted), { width: 20, height: 10 })
})
await check('파일 복사 붙여넣기의 files 폴백과 항목 중복 방지', () => {
  assert.equal(clipboardImage({ files: [clipboardPng] }), clipboardPng)
  assert.equal(clipboardImage({ items: [imageItem(clipboardPng)], files: [clipboardPng] }), clipboardPng)
})
await check('null 이미지 데이터는 폴백 또는 명확한 안내', () => {
  const empty = { kind: 'file', type: 'image/png', getAsFile: () => null }
  assert.equal(clipboardImage({ items: [empty], files: [clipboardPng] }), clipboardPng)
  assert.throws(() => clipboardImage({ items: [empty] }), /파일 선택/)
})
await check('붙여넣기 다중 이미지 거절', () => {
  assert.throws(() => clipboardImage({ items: [imageItem(clipboardPng), imageItem(clipboardPng)] }), /1개/)
  assert.throws(() => clipboardImage({ files: [clipboardPng, clipboardPng] }), /1개/)
})
await check('붙여넣은 미지원 GIF도 공통 검증에서 거절', async () => {
  const gif = new File(['GIF89a'], 'image.gif', { type: 'image/gif' })
  await assert.rejects(inspectFile(clipboardImage({ items: [imageItem(gif)] })), /지원하지/)
})
await check('붙여넣은 12MP 초과 이미지도 동일하게 거절', async () => {
  const oversized = new File([png(4001, 3000)], '', { type: 'image/png' })
  await assert.rejects(inspectFile(clipboardImage({ items: [imageItem(oversized)] })), /12MP/)
})
await check('클립보드 접근 예외에 파일 선택 대안 안내', () => {
  const blocked = { kind: 'file', type: 'image/png', getAsFile: () => { throw new Error('SecurityError') } }
  assert.throws(() => clipboardImage({ items: [blocked] }), /파일 선택/)
})
process.stdout.write(`${passed} safety checks passed. No images decoded.\n`)
