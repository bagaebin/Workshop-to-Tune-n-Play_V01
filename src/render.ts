/**
 * render.ts — Canvas 2D 렌더 (SPEC §3 · §6 · §12)
 *
 * 순서 — 영역 → 격자 → 이미지(노트 아래) → 노트 → 재생 헤드 → 캔버스 목록 → 슬롯(+미리보기) → 이미지 패널 → 끌기 잔상.
 * 격자 양자화(비파괴)는 noteRect(n, grid) 한 곳. 라벨·손잡이·슬라이더는 4단계.
 */
import { W, H, TUTORIAL_CENTER, TUTORIAL_DIAMETER, SLOT, K_P, K_T, L, IMG_DEFAULT, HANDLE } from './constants'
import {
  DRAWER, AXIS, SURFACE, BOTTOM, PANEL, SLIDER, slotRects, noteRect, panelRects, listRect, chipRects, labelRect, xOfOn, SLOT_LABEL, type Fit, type Rect,
} from './layout'
import type { Chip, Image, Label, Note, Seg, Slots } from './model'
import { drawPreview, PREVIEW_STATIC_PHASE } from './preview'

export interface Thumb {
  n: number
  notes: readonly Note[]
  images: readonly Image[]
}

export interface Ghost {
  kind: 'sound' | 'image' | 'chip'
  img?: string
  raw?: string
  x: number
  y: number
}

/** 회고 모드 — 마킹 스냅샷을 작업 면에 불러온 것 */
export interface ReviewOverlay {
  canvas: number
  notes: readonly Note[]
  images: readonly Image[]
  labels: readonly Label[]
}

export interface View {
  seg: Seg
  flash: boolean
  /** 0–1. 튜토리얼 원 */
  tutorialAlpha: number
  /** 0–1. 전체 UI */
  uiAlpha: number
  notes: readonly Note[]
  images: readonly Image[]
  labels: readonly Label[]
  imageEls: ReadonlyMap<string, HTMLImageElement>
  selection: ReadonlySet<string>
  slots: Slots
  gone: ReadonlySet<string>
  /** 켜져 있는 슬롯 (grid ON · all ON · 현재 gen · 재생 중 play) */
  active: ReadonlySet<string>
  doneVisible: boolean
  doneAlpha: number
  grid: boolean
  panelOpen: boolean
  playFrom: number
  playPos: number | null
  list: readonly Thumb[]
  ghost: Ghost | null
  previewPhase: number
  previewLoop: number
  previewStatic: boolean
  seed: string
  chips: readonly Chip[]
  /** gen ∈ {rule, random}일 때만. value 0–1 */
  slider: { name: 'step' | 'spread'; value: number } | null
  imageSizeCut: boolean
  labelsCut: boolean
  review: ReviewOverlay | null
}

const C = {
  letterbox: '#000',
  surface: '#141414',
  axis: '#1b1b1b',
  drawer: '#0e0e0e',
  bottom: '#0e0e0e',
  slotFill: '#1c1c1c',
  slotFillActive: '#3a3a3a',
  slotLine: '#3a3a3a',
  slotLineActive: '#8a8a8a',
  label: '#c8c8c8',
  note: '#d9d9d9',
  noteSel: '#ffffff',
  circle: '#dcdcdc',
  gridMinor: 'rgba(255,255,255,0.05)',
  gridMajor: 'rgba(255,255,255,0.12)',
  head: 'rgba(255,255,255,0.75)',
  fromTick: 'rgba(255,255,255,0.45)',
  panel: '#1a1a1a',
  panelLine: '#444',
  thumb: '#1c1c1c',
  thumbLine: '#3a3a3a',
  thumbNote: '#bdbdbd',
  ghost: 'rgba(255,255,255,0.35)',
  textLabel: '#9a9a9a',
  chip: '#2a2a2a',
  chipText: '#ddd',
  handle: 'rgba(255,255,255,0.55)',
  slider: '#2a2a2a',
  knob: '#bdbdbd',
  review: 'rgba(255,255,255,0.08)',
}

export function draw(ctx: CanvasRenderingContext2D, fit: Fit, v: View): void {
  ctx.setTransform(fit.dpr, 0, 0, fit.dpr, 0, 0)
  ctx.fillStyle = v.flash ? '#fff' : C.letterbox
  ctx.fillRect(0, 0, fit.vw, fit.vh)
  if (v.flash) return

  ctx.setTransform(fit.dpr * fit.s, 0, 0, fit.dpr * fit.s, fit.ox * fit.dpr, fit.oy * fit.dpr)
  ctx.fillStyle = '#000'
  ctx.fillRect(0, 0, W, H)

  if (v.seg < 0) return // 준비 — 검은 화면

  if (v.uiAlpha > 0) {
    ctx.globalAlpha = v.uiAlpha
    const shown = v.review ?? { notes: v.notes, images: v.images, labels: v.labels }
    drawRegions(ctx)
    if (v.review) fillRect(ctx, SURFACE, C.review)
    if (v.grid) drawGrid(ctx)
    drawImages(ctx, shown.images, v)
    drawNotes(ctx, shown.notes, v)
    if (!v.labelsCut) drawLabels(ctx, shown.labels)
    drawHead(ctx, v)
    drawList(ctx, v)
    if (v.slider) drawSlider(ctx, v.slider.value)
    drawSlots(ctx, v)
    drawChips(ctx, v)
    if (v.panelOpen) drawPanel(ctx, v)
    if (v.ghost) drawGhost(ctx, v.ghost)
    ctx.globalAlpha = 1
  }

  if (v.tutorialAlpha > 0) {
    ctx.globalAlpha = v.tutorialAlpha
    ctx.fillStyle = C.circle
    ctx.beginPath()
    ctx.arc(TUTORIAL_CENTER.x, TUTORIAL_CENTER.y, TUTORIAL_DIAMETER / 2, 0, Math.PI * 2)
    ctx.fill()
    ctx.globalAlpha = 1
  }
}

function fillRect(ctx: CanvasRenderingContext2D, r: Rect, color: string): void {
  ctx.fillStyle = color
  ctx.fillRect(r.x, r.y, r.w, r.h)
}

function drawRegions(ctx: CanvasRenderingContext2D): void {
  fillRect(ctx, DRAWER, C.drawer)
  fillRect(ctx, AXIS, C.axis)
  fillRect(ctx, SURFACE, C.surface)
  fillRect(ctx, BOTTOM, C.bottom)
}

/** 격자 ON — 시간축 띠와 작업 면에 눈금 (§6-3) */
function drawGrid(ctx: CanvasRenderingContext2D): void {
  ctx.lineWidth = 1
  ctx.strokeStyle = C.gridMinor
  ctx.beginPath()
  for (let i = 1; i < K_P; i++) {
    const y = SURFACE.y + (i / K_P) * SURFACE.h
    ctx.moveTo(SURFACE.x, y)
    ctx.lineTo(SURFACE.x + SURFACE.w, y)
  }
  ctx.stroke()
  ctx.strokeStyle = C.gridMajor
  ctx.beginPath()
  for (let i = 1; i < K_T; i++) {
    const x = SURFACE.x + (i / K_T) * SURFACE.w
    ctx.moveTo(x, AXIS.y)
    ctx.lineTo(x, SURFACE.y + SURFACE.h)
  }
  ctx.stroke()
}

function clipSurface(ctx: CanvasRenderingContext2D): void {
  ctx.beginPath()
  ctx.rect(SURFACE.x, SURFACE.y, SURFACE.w, SURFACE.h)
  ctx.clip()
}

function drawImageEl(ctx: CanvasRenderingContext2D, el: HTMLImageElement | undefined, r: Rect): void {
  if (el && el.complete && el.naturalWidth > 0) ctx.drawImage(el, r.x, r.y, r.w, r.h)
  else fillRect(ctx, r, '#333')
}

/** 이미지는 노트 아래. 나중에 놓은 것이 위. 손잡이는 작은 모서리 표시로 상시 (§6-8) */
function drawImages(ctx: CanvasRenderingContext2D, images: readonly Image[], v: View): void {
  if (images.length === 0) return
  ctx.save()
  clipSurface(ctx)
  for (const im of images) {
    drawImageEl(ctx, v.imageEls.get(im.img), im)
    ctx.strokeStyle = C.handle
    ctx.lineWidth = 2
    ctx.beginPath()
    ctx.moveTo(im.x + 2, im.y + HANDLE / 2)
    ctx.lineTo(im.x + 2, im.y + 2)
    ctx.lineTo(im.x + HANDLE / 2, im.y + 2)
    ctx.stroke()
    if (!v.imageSizeCut) {
      ctx.beginPath()
      ctx.moveTo(im.x + im.w - 2, im.y + im.h - HANDLE / 2)
      ctx.lineTo(im.x + im.w - 2, im.y + im.h - 2)
      ctx.lineTo(im.x + im.w - HANDLE / 2, im.y + im.h - 2)
      ctx.stroke()
    }
  }
  ctx.restore()
}

function drawNotes(ctx: CanvasRenderingContext2D, notes: readonly Note[], v: View): void {
  ctx.save()
  clipSurface(ctx)
  for (const n of notes) fillRect(ctx, noteRect(n, v.grid), v.selection.has(n.id) ? C.noteSel : C.note)
  ctx.restore()
}

/** 적기 라벨 — 면 위는 노트 열 위에 원문, 띠 위는 띠 안에 (§6-7) */
function drawLabels(ctx: CanvasRenderingContext2D, labels: readonly Label[]): void {
  if (labels.length === 0) return
  ctx.font = '15px -apple-system, "Apple SD Gothic Neo", sans-serif'
  ctx.textAlign = 'left'
  ctx.textBaseline = 'middle'
  ctx.fillStyle = C.textLabel
  for (const l of labels) {
    const r = labelRect(l)
    ctx.fillText(l.raw, r.x + 4, r.y + r.h / 2)
  }
}

/** 칩 — 빈 면 슬롯 안에 원문 한 줄씩 (§6-7) */
function drawChips(ctx: CanvasRenderingContext2D, v: View): void {
  const rs = chipRects(v.slots, v.chips.length)
  ctx.font = '13px -apple-system, "Apple SD Gothic Neo", sans-serif'
  ctx.textAlign = 'left'
  ctx.textBaseline = 'middle'
  rs.forEach((r, i) => {
    const c = v.chips[i]
    if (!c) return
    fillRect(ctx, { x: r.x + 3, y: r.y + 2, w: r.w - 6, h: r.h - 4 }, C.chip)
    ctx.fillStyle = C.chipText
    ctx.save()
    ctx.beginPath()
    ctx.rect(r.x + 3, r.y, r.w - 6, r.h)
    ctx.clip()
    ctx.fillText(c.raw, r.x + 8, r.y + r.h / 2)
    ctx.restore()
  })
}

/** 규칙 값 슬라이더 — 세로. 글자 없음 (§3-3) */
function drawSlider(ctx: CanvasRenderingContext2D, value: number): void {
  fillRect(ctx, SLIDER, C.slider)
  const trackX = SLIDER.x + SLIDER.w / 2
  ctx.strokeStyle = C.slotLine
  ctx.lineWidth = 2
  ctx.beginPath()
  ctx.moveTo(trackX, SLIDER.y + 12)
  ctx.lineTo(trackX, SLIDER.y + SLIDER.h - 12)
  ctx.stroke()
  const ky = SLIDER.y + SLIDER.h - 12 - value * (SLIDER.h - 24)
  fillRect(ctx, { x: SLIDER.x + 14, y: ky - 6, w: SLIDER.w - 28, h: 12 }, C.knob)
}

/** 재생 시작점 표시(띠) · 재생 중이면 헤드가 띠와 작업 면을 지난다 */
function drawHead(ctx: CanvasRenderingContext2D, v: View): void {
  const fx = xOfOn(v.playFrom)
  ctx.fillStyle = C.fromTick
  ctx.beginPath()
  ctx.moveTo(fx - 7, AXIS.y)
  ctx.lineTo(fx + 7, AXIS.y)
  ctx.lineTo(fx, AXIS.y + 12)
  ctx.closePath()
  ctx.fill()
  if (v.playPos === null) return
  const x = xOfOn(Math.min(L, v.playPos))
  ctx.strokeStyle = C.head
  ctx.lineWidth = 2
  ctx.beginPath()
  ctx.moveTo(x, AXIS.y)
  ctx.lineTo(x, SURFACE.y + SURFACE.h)
  ctx.stroke()
}

/** 캔버스 목록 — 축소판 */
function drawList(ctx: CanvasRenderingContext2D, v: View): void {
  v.list.forEach((t, i) => {
    const r = listRect(i)
    fillRect(ctx, r, C.thumb)
    ctx.strokeStyle = C.thumbLine
    ctx.lineWidth = 1
    ctx.strokeRect(r.x + 0.5, r.y + 0.5, r.w - 1, r.h - 1)
    ctx.save()
    ctx.beginPath()
    ctx.rect(r.x, r.y, r.w, r.h)
    ctx.clip()
    for (const im of t.images) {
      fillRect(ctx, {
        x: r.x + ((im.x - SURFACE.x) / SURFACE.w) * r.w,
        y: r.y + ((im.y - SURFACE.y) / SURFACE.h) * r.h,
        w: (im.w / SURFACE.w) * r.w,
        h: (im.h / SURFACE.h) * r.h,
      }, '#2e2e2e')
    }
    for (const n of t.notes) {
      fillRect(ctx, {
        x: r.x + (n.on / L) * r.w,
        y: r.y + (1 - n.pitch) * r.h - 1,
        w: Math.max(2, (n.len / L) * r.w),
        h: 2,
      }, C.thumbNote)
    }
    ctx.restore()
  })
}

function drawSlots(ctx: CanvasRenderingContext2D, v: View): void {
  ctx.lineWidth = 2
  ctx.font = '20px -apple-system, "Apple SD Gothic Neo", sans-serif'
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  const base = ctx.globalAlpha
  const phase = v.previewStatic ? PREVIEW_STATIC_PHASE : v.previewPhase
  for (const s of slotRects(v.slots)) {
    if (v.gone.has(s.name)) continue // 빈 자리는 메우지 않는다 (§11-2)
    const isDone = s.name === 'done'
    if (isDone && !v.doneVisible) continue // 등장 전에는 자리만 비운다 (§3-2)
    ctx.globalAlpha = base * (isDone ? v.doneAlpha : 1)
    const on = v.active.has(s.name)
    fillRect(ctx, s.rect, on ? C.slotFillActive : C.slotFill)
    ctx.strokeStyle = on ? C.slotLineActive : C.slotLine
    ctx.strokeRect(s.rect.x + 1, s.rect.y + 1, s.rect.w - 2, s.rect.h - 2)
    const label = SLOT_LABEL[s.name]
    if (label) {
      ctx.fillStyle = C.label
      ctx.fillText(label, s.rect.x + SLOT / 2, s.rect.y + SLOT / 2)
    } else {
      drawPreview(ctx, s.rect, s.name, phase, v.seed, v.previewLoop, s.name === 'mat.blank' ? v.chips.length : 0)
    }
  }
  ctx.globalAlpha = base
}

/** 이미지 패널 — 5장(셔플) + absent. 작업 면 왼쪽 끝을 덮는다 (§3-3) */
function drawPanel(ctx: CanvasRenderingContext2D, v: View): void {
  fillRect(ctx, PANEL, C.panel)
  ctx.strokeStyle = C.panelLine
  ctx.lineWidth = 1
  ctx.strokeRect(PANEL.x + 0.5, PANEL.y + 0.5, PANEL.w - 1, PANEL.h - 1)
  for (const p of panelRects(v.slots.panel)) {
    if (p.name === 'panel:absent') {
      ctx.setLineDash([6, 6])
      ctx.strokeStyle = '#666'
      ctx.lineWidth = 2
      ctx.strokeRect(p.rect.x + 1, p.rect.y + 1, p.rect.w - 2, p.rect.h - 2)
      ctx.setLineDash([])
      continue
    }
    drawImageEl(ctx, v.imageEls.get(p.name.slice(6)), p.rect)
  }
}

/** 서랍에서 끌어오는 중 — 손가락 아래 잔상. 소리는 점 덩어리, 이미지는 IMG_DEFAULT 윤곽, 칩은 원문 */
function drawGhost(ctx: CanvasRenderingContext2D, g: Ghost): void {
  ctx.strokeStyle = C.ghost
  ctx.fillStyle = C.ghost
  ctx.lineWidth = 2
  if (g.kind === 'chip') {
    ctx.font = '15px -apple-system, "Apple SD Gothic Neo", sans-serif'
    ctx.textAlign = 'left'
    ctx.textBaseline = 'middle'
    ctx.fillStyle = 'rgba(255,255,255,0.7)'
    ctx.fillText(g.raw ?? '', g.x + 10, g.y - 10)
  } else if (g.kind === 'image') {
    ctx.strokeRect(g.x - IMG_DEFAULT.w / 2, g.y - IMG_DEFAULT.h / 2, IMG_DEFAULT.w, IMG_DEFAULT.h)
  } else {
    for (let i = 0; i < 5; i++) {
      ctx.beginPath()
      ctx.arc(g.x + i * 18, g.y + (i % 2 ? -6 : 6), 4, 0, Math.PI * 2)
      ctx.fill()
    }
  }
}
