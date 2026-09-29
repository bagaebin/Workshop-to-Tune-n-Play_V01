/**
 * layout.ts — 화면과 좌표 (SPEC §3) · 히트 테스트 순서 (§5-1) · 배율·레터박스 (§3-1)
 *
 * 1단계 — 영역 4 · 슬롯 좌표 · 셔플(시드 = pid) · 좌표↔값 · 히트 테스트는
 * slot.gone · slot:* · axis · note.edge · note · surface · none 까지. panel · chip · canvas · slider · image · label은 3~4단계.
 */
import { W, H, L, K_P, K_T, MIDI_LO, MIDI_RANGE, SLOT, NOTE_EDGE, FAC_RECT, HANDLE, CHIP_H } from './constants'
import type { Chip, Image, Label, Note, Slots } from './model'

export interface Rect { x: number; y: number; w: number; h: number }

// ── §3-1 영역
export const DRAWER: Rect = { x: 0, y: 0, w: 160, h: 884 }
export const AXIS: Rect = { x: 160, y: 0, w: 1206, h: 48 }
export const SURFACE: Rect = { x: 160, y: 48, w: 1206, h: 836 }
export const BOTTOM: Rect = { x: 0, y: 884, w: 1366, h: 140 }

// ── §3-2 하단 띠 슬롯 9 — 좌 6 + 우 3 (y 904–1004). 기능 명세 V1.0 §2-1 · §5 — `done` 삭제
export const SLOT_Y = 904
export const BOTTOM_LEFT_X = [40, 164, 288, 412, 536, 660] as const
export const BOTTOM_RIGHT_X = [916, 1040, 1164] as const
export const BOTTOM_LEFT_DEFAULT = ['grid', 'gen.hand', 'gen.rule', 'gen.random', 'play', 'all'] as const
export const BOTTOM_RIGHT = ['mark', 'canvas.keep', 'canvas.discard'] as const
/** 우 3만 글자 (D12 개정 · N5 예외) */
export const SLOT_LABEL: Readonly<Record<string, string>> = {
  mark: '마킹',
  'canvas.keep': '남기고 새로',
  'canvas.discard': '지우고 새로',
}

// ── §3-3 재료 서랍
export const DRAWER_SLOT_POS = [{ x: 30, y: 32 }, { x: 30, y: 168 }, { x: 30, y: 304 }] as const
/** 헤더 slots_drawer 표기(접두사 없음). target은 `slot:mat.<name>` */
export const DRAWER_DEFAULT = ['blank', 'sound', 'image'] as const
export const PANEL_DEFAULT = ['i1', 'i2', 'i3', 'i4', 'i5'] as const
export const SOUNDS_DEFAULT = ['s1', 's2', 's3'] as const

// ── §3-3 이미지 패널 — mat.image 슬롯 탭으로 열린다. 작업 면 왼쪽 끝을 덮는다
export const PANEL: Rect = { x: 160, y: 48, w: 200, h: 836 }
export const PANEL_IMG = { w: 150, h: 100 } as const
export const PANEL_ABSENT = 100
export const PANEL_GAP = 24

/** 소리 목록 — mat.sound 슬롯 탭으로 열린다. 이미지 패널과 같은 자리 · 같은 크기의 칸. absent 없음 (V1.0 §2-2는 이미지 패널에만 둔다) */
export function soundRects(sounds: readonly string[]): SlotRect[] {
  const total = sounds.length * PANEL_IMG.h + (sounds.length - 1) * PANEL_GAP
  let y = PANEL.y + Math.floor((PANEL.h - total) / 2)
  const out: SlotRect[] = []
  for (const name of sounds) {
    out.push({ name: `sound:${name}`, rect: { x: PANEL.x + (PANEL.w - PANEL_IMG.w) / 2, y, w: PANEL_IMG.w, h: PANEL_IMG.h } })
    y += PANEL_IMG.h + PANEL_GAP
  }
  return out
}

/** 5장(셔플 순서) + absent. 세로 간격 24, 합 720을 세로 중앙에 */
export function panelRects(panel: readonly string[]): SlotRect[] {
  const total = panel.length * PANEL_IMG.h + PANEL_ABSENT + panel.length * PANEL_GAP
  let y = PANEL.y + Math.floor((PANEL.h - total) / 2)
  const out: SlotRect[] = []
  for (const name of panel) {
    out.push({ name: `panel:${name}`, rect: { x: PANEL.x + (PANEL.w - PANEL_IMG.w) / 2, y, w: PANEL_IMG.w, h: PANEL_IMG.h } })
    y += PANEL_IMG.h + PANEL_GAP
  }
  out.push({ name: 'panel:absent', rect: { x: PANEL.x + (PANEL.w - PANEL_ABSENT) / 2, y, w: PANEL_ABSENT, h: PANEL_ABSENT } })
  return out
}

// ── §3-3 규칙 값 슬라이더 — gen ∈ {rule, random}일 때만. 세로 100 × 160
export const SLIDER: Rect = { x: 30, y: 440, w: 100, h: 160 }

/** 슬라이더 y → 0–1 (위가 1) */
export function sliderValue(y: number): number {
  return clamp(1 - (y - SLIDER.y) / SLIDER.h, 0, 1)
}

// ── §6-7 칩 — 빈 면 슬롯 안에 원문을 한 줄씩, 3개까지 (각 100 × 28)
export function chipRects(slots: Slots, count: number): Rect[] {
  const blank = slotRects(slots).find((s) => s.name === 'mat.blank')
  if (!blank) return []
  const out: Rect[] = []
  const top = blank.rect.y + (SLOT - count * CHIP_H) / 2
  for (let i = 0; i < count; i++) out.push({ x: blank.rect.x, y: top + i * CHIP_H, w: SLOT, h: CHIP_H })
  return out
}

/**
 * 면 위 라벨은 **자기 노트를 따라간다** — 첫 노트(on 최소)의 위쪽. 노트가 다 지워지면 라벨도 보이지 않는다 (R-010 · PI-006)
 * 띠 라벨·노트 없는 라벨은 놓은 자리 그대로. 저장된 Label.x·y는 놓은 순간의 기록이라 바꾸지 않는다
 */
export function resolveLabels(labels: readonly Label[], notes: readonly Note[], grid: boolean): Label[] {
  const out: Label[] = []
  for (const l of labels) {
    if (l.onAxis || l.ids.length === 0) {
      out.push(l)
      continue
    }
    const mine = notes.filter((n) => l.ids.includes(n.id))
    if (mine.length === 0) continue
    const first = mine.reduce((a, b) => (shown(b, grid).on < shown(a, grid).on ? b : a))
    const v = shown(first, grid)
    out.push({ ...l, x: Math.round(xOfOn(v.on)), y: Math.round(yOfPitch(v.pitch)) })
  }
  return out
}

/** 라벨의 글자 상자 — 면 위 라벨은 놓은 점 위쪽, 띠 라벨은 띠 안 */
export function labelRect(l: Label): Rect {
  const w = Math.max(24, l.raw.length * 11 + 8)
  return l.onAxis ? { x: l.x, y: AXIS.y + 6, w, h: 36 } : { x: l.x, y: l.y - NOTE_H / 2 - 22, w, h: 18 }
}

/** 이미지 손잡이 — 선택된 이미지의 네 모서리 (V1.0 §3-2). 가운데는 옮기기 */
export type Corner = 'nw' | 'ne' | 'sw' | 'se'
export const CORNERS: readonly Corner[] = ['nw', 'ne', 'sw', 'se']
export function imageCornerRect(im: Image, c: Corner): Rect {
  return {
    x: c === 'nw' || c === 'sw' ? im.x : im.x + im.w - HANDLE,
    y: c === 'nw' || c === 'ne' ? im.y : im.y + im.h - HANDLE,
    w: HANDLE,
    h: HANDLE,
  }
}

/** 노트 손잡이 — 선택된 노트의 양 끝. 끝에서 바깥으로 NOTE_EDGE/2, 안으로는 몸통의 1/3까지 */
export function noteHandleRects(r: Rect): { l: Rect; r: Rect } {
  const inner = Math.min(NOTE_EDGE / 2, r.w / 3)
  const y = r.y - NOTE_HIT_SLOP
  const h = r.h + NOTE_HIT_SLOP * 2
  return {
    l: { x: r.x - NOTE_EDGE / 2, y, w: NOTE_EDGE / 2 + inner, h },
    r: { x: r.x + r.w - inner, y, w: NOTE_EDGE / 2 + inner, h },
  }
}

// ── §3-3 캔버스 목록 — 60 × 40 축소판, 2열 × 5행, 간격 8
export const LIST: Rect = { x: 16, y: 640, w: 128, h: 244 }
export const THUMB = { w: 60, h: 40 } as const
export const THUMB_GAP = 8

export function listRect(i: number): Rect {
  const col = i % 2
  const row = Math.floor(i / 2)
  return { x: LIST.x + col * (THUMB.w + THUMB_GAP), y: LIST.y + row * (THUMB.h + THUMB_GAP), w: THUMB.w, h: THUMB.h }
}

/** 노트 높이 = 음고 한 칸 (836 / K_P) */
/** 노트를 잡는 여유 — 그려진 막대(≈17 px)보다 위아래로 넓게 잡힌다. 손가락 폭에 맞춘다 (R-010 · PI-007) */
export const NOTE_HIT_SLOP = 8
export const NOTE_H = SURFACE.h / K_P

export function inRect(r: Rect, x: number, y: number): boolean {
  return x >= r.x && x < r.x + r.w && y >= r.y && y < r.y + r.h
}

export function inFacRect(x: number, y: number): boolean {
  return x >= FAC_RECT.x0 && x < FAC_RECT.x1 && y >= FAC_RECT.y0 && y < FAC_RECT.y1
}

// ── 셔플 (G14) — 시드 = pid. 같은 pid면 같은 배열
export function hashSeed(s: string): number {
  let h = 0x811c9dc5
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i)
    h = Math.imul(h, 0x01000193)
  }
  return h >>> 0
}

export function mulberry32(a: number): () => number {
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

export function shuffle<T>(arr: readonly T[], seed: string, salt: string): T[] {
  const out = [...arr]
  const rnd = mulberry32(hashSeed(`${seed}:${salt}`))
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1))
    const a = out[i] as T
    out[i] = out[j] as T
    out[j] = a
  }
  return out
}

export function shuffledSlots(pid: string): Slots {
  return {
    bottom: [...shuffle(BOTTOM_LEFT_DEFAULT, pid, 'bottom'), ...BOTTOM_RIGHT],
    drawer: shuffle(DRAWER_DEFAULT, pid, 'drawer'),
    panel: shuffle(PANEL_DEFAULT, pid, 'panel'),
    sounds: shuffle(SOUNDS_DEFAULT, pid, 'sounds'),
  }
}

export interface SlotRect { name: string; rect: Rect }

/** 하단 9 + 서랍 3의 사각형. name은 target 표기(`mark` · `gen.rule` · `mat.image`) */
export function slotRects(slots: Slots): SlotRect[] {
  const out: SlotRect[] = []
  const xs = [...BOTTOM_LEFT_X, ...BOTTOM_RIGHT_X]
  slots.bottom.forEach((name, i) => {
    const x = xs[i]
    if (x !== undefined) out.push({ name, rect: { x, y: SLOT_Y, w: SLOT, h: SLOT } })
  })
  slots.drawer.forEach((name, i) => {
    const p = DRAWER_SLOT_POS[i]
    if (p) out.push({ name: `mat.${name}`, rect: { x: p.x, y: p.y, w: SLOT, h: SLOT } })
  })
  return out
}

// ── §3-5 좌표 ↔ 값
export const onOfX = (x: number): number => clamp(((x - SURFACE.x) / SURFACE.w) * L, 0, L)
export const xOfOn = (on: number): number => SURFACE.x + (on / L) * SURFACE.w
export const pitchOfY = (y: number): number => clamp(1 - (y - SURFACE.y) / SURFACE.h, 0, 1)
export const yOfPitch = (pitch: number): number => SURFACE.y + (1 - pitch) * SURFACE.h
/** 가로 이동량(px) → ms */
export const msOfDx = (dx: number): number => (dx / SURFACE.w) * L
export const midiOf = (pitch: number): number => MIDI_LO + MIDI_RANGE * pitch
export const hzOf = (pitch: number): number => 440 * Math.pow(2, (midiOf(pitch) - 69) / 12)
export const quantPitch = (pitch: number): number => Math.round(pitch * K_P) / K_P
export const quantOn = (on: number): number => Math.round(on / (L / K_T)) * (L / K_T)

export function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v
}

/** 격자 ON이면 보이는 값(양자화), OFF면 원값. 저장은 언제나 원값 (§6-3 비파괴) */
export function shown(n: Note, grid: boolean): Note {
  return grid ? { ...n, pitch: quantPitch(n.pitch), on: quantOn(n.on) } : n
}

/** 노트의 화면 사각형 — 렌더와 히트 테스트가 같은 함수를 쓴다 */
export function noteRect(n: Note, grid = false): Rect {
  const v = shown(n, grid)
  const x = xOfOn(v.on)
  const w = Math.max(4, xOfOn(v.on + v.len) - x)
  const y = yOfPitch(v.pitch) - NOTE_H / 2
  return { x, y, w, h: NOTE_H }
}

export interface HitCtx {
  slots: Slots
  notes: readonly Note[]
  /** 잠겨 사라진 슬롯 이름 (§11-2) */
  gone: ReadonlySet<string>
  /** 선택된 노트 — 손잡이는 이것들에만 있다 */
  selection: ReadonlySet<string>
  /** 선택된 이미지 (없으면 null) — 손잡이와 옮기기는 이것에만 */
  imageSel: string | null
  /** 격자 ON — 노트를 보이는 자리(양자화)로 맞춘다 */
  grid: boolean
  /** 열린 패널 — 이미지 패널 · 소리 목록 (한 번에 하나) */
  panelOpen: 'image' | 'sound' | null
  panel: readonly string[]
  sounds: readonly string[]
  /** 면 위 이미지 (노트 아래) */
  images: readonly Image[]
  /** 캔버스 목록에 있는 캔버스 번호, 목록 순서 */
  list: readonly number[]
  /** 빈 면 슬롯의 칩 (0–3) */
  chips: readonly Chip[]
  /** 면·띠 위 라벨 */
  labels: readonly Label[]
  /** gen ∈ {rule, random} — 슬라이더가 보인다 */
  sliderVisible: boolean
  /** 이미지 크기 조정이 잘렸으면 size 손잡이가 없다 */
  imageSizeCut: boolean
}

/** §5-1 순서. 1단계 범위 밖의 target은 아직 나오지 않는다 */
export function hitTest(x: number, y: number, c: HitCtx): string {
  // 칩은 빈 면 슬롯 안에 있으므로 슬롯보다 먼저 본다 (SPEC 순서의 유일한 예외 — R-007)
  const chipRs = chipRects(c.slots, c.chips.length)
  for (let i = 0; i < chipRs.length; i++) {
    const r = chipRs[i]
    const chip = c.chips[i]
    if (r && chip && inRect(r, x, y)) return `chip:${chip.id}`
  }
  for (const s of slotRects(c.slots)) {
    if (!inRect(s.rect, x, y)) continue
    if (c.gone.has(s.name)) return `slot.gone:${s.name}`
    return `slot:${s.name}`
  }
  if (c.panelOpen) {
    const rs = c.panelOpen === 'image' ? panelRects(c.panel) : soundRects(c.sounds)
    for (const p of rs) if (inRect(p.rect, x, y)) return p.name
    if (inRect(PANEL, x, y)) return 'none' // 패널 안 빈 곳 — 가려진 자리(blocked)는 session이 판정한다
  }
  for (let i = 0; i < c.list.length; i++) {
    if (inRect(listRect(i), x, y)) return `canvas:${c.list[i]}`
  }
  if (c.sliderVisible && inRect(SLIDER, x, y)) return 'slider'
  if (inRect(AXIS, x, y)) {
    for (const l of c.labels) if (l.onAxis && inRect(labelRect(l), x, y)) return `label:${l.id}`
    return 'axis'
  }
  // 선택된 이미지의 모서리 손잡이는 노트보다 먼저 (§5-1)
  const sel = c.imageSel ? c.images.find((im) => im.id === c.imageSel) : undefined
  if (sel && !c.imageSizeCut) {
    for (const k of CORNERS) if (inRect(imageCornerRect(sel, k), x, y)) return `image.size:${sel.id}:${k}`
  }
  // 선택된 노트의 양 끝 손잡이 — 몸통보다 먼저. 나중에 놓은 것이 위
  for (let i = c.notes.length - 1; i >= 0; i--) {
    const n = c.notes[i]
    if (!n || !c.selection.has(n.id)) continue
    const h = noteHandleRects(noteRect(n, c.grid))
    if (inRect(h.r, x, y)) return `note.edge:${n.id}`
    if (inRect(h.l, x, y)) return `note.edgeL:${n.id}`
  }
  for (let i = c.notes.length - 1; i >= 0; i--) {
    const n = c.notes[i]
    if (!n) continue
    const r0 = noteRect(n, c.grid)
    const r = { x: r0.x - 4, y: r0.y - NOTE_HIT_SLOP, w: r0.w + 8, h: r0.h + NOTE_HIT_SLOP * 2 }
    if (inRect(r, x, y)) return `note:${n.id}`
  }
  for (const l of c.labels) if (!l.onAxis && inRect(labelRect(l), x, y)) return `label:${l.id}`
  // 이미지 몸통은 노트 아래 — 나중에 놓은 것이 위. 선택된 이미지의 몸통은 옮기기
  for (let i = c.images.length - 1; i >= 0; i--) {
    const im = c.images[i]
    if (im && inRect(im, x, y)) return im.id === c.imageSel ? `image.move:${im.id}` : `image:${im.id}`
  }
  if (inRect(SURFACE, x, y)) return 'surface'
  return 'none'
}

/** 패널이 열린 동안 패널 안이지만 장·absent가 아닌 자리 — blocked:true (§3-3) */
export function panelBlocks(rects: readonly SlotRect[], x: number, y: number): boolean {
  if (!inRect(PANEL, x, y)) return false
  return !rects.some((p) => inRect(p.rect, x, y))
}

// ── §3-1 배율 · 레터박스
export interface Fit {
  /** s = min(vw/W, vh/H) */
  s: number
  ox: number
  oy: number
  vw: number
  vh: number
  dpr: number
}

export function computeFit(vw: number, vh: number, dpr: number): Fit {
  const s = Math.min(vw / W, vh / H)
  return { s, ox: Math.floor((vw - W * s) / 2), oy: Math.floor((vh - H * s) / 2), vw, vh, dpr }
}

/** 화면 CSS px → 가상 좌표. 로그 좌표는 언제나 이것 */
export function toVirtual(f: Fit, clientX: number, clientY: number): { x: number; y: number } {
  return { x: (clientX - f.ox) / f.s, y: (clientY - f.oy) / f.s }
}
