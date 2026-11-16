export type Background = 'auto' | 'color' | 'directional-auto' | 'directional-color' | 'blur' | 'crop'
export type Direction = 'top' | 'bottom' | 'left' | 'right'
export type EdgeColors = Record<Direction, string>
export type RGB = [number, number, number]
export type EdgeSamples = Record<Direction, RGB[]>
export type Preset = 'original' | 'square' | 'portrait' | 'landscape' | 'classic' | 'vertical' | 'custom'
export type Format = 'png' | 'jpeg' | 'webp'

export interface ImageAsset {
  file: File
  width: number
  height: number
  preview: HTMLCanvasElement
  edgeColor: string
  edgeColors: EdgeColors
  edgeSamples: EdgeSamples
  colorSamplingFailed: boolean
}

export interface EditSettings {
  preset: Preset
  customWidth: number
  customHeight: number
  background: Background
  color: string
  directionColors: EdgeColors
  connection: 'solid' | 'gradient'
  positionX: number
  positionY: number
  sharpness: number
  originalSize: boolean
}

export const INITIAL_SETTINGS: EditSettings = {
  preset: 'portrait', customWidth: 1080, customHeight: 1920,
  background: 'auto', color: '#252b38', positionX: 50, positionY: 50,
  directionColors: { top: '#252b38', bottom: '#252b38', left: '#252b38', right: '#252b38' },
  connection: 'solid',
  sharpness: 0, originalSize: false,
}

export const PRESETS: { id: Preset; label: string; width: number; height: number }[] = [
  { id: 'original', label: '원본', width: 0, height: 0 },
  { id: 'square', label: '1:1', width: 1440, height: 1440 },
  { id: 'portrait', label: '9:16', width: 1080, height: 1920 },
  { id: 'landscape', label: '16:9', width: 1920, height: 1080 },
  { id: 'classic', label: '4:3', width: 1600, height: 1200 },
  { id: 'vertical', label: '3:4', width: 1200, height: 1600 },
  { id: 'custom', label: '직접 입력', width: 1080, height: 1920 },
]
