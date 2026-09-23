/**
 * session.ts — 세션 흐름 (SPEC §7) · 모듈 배선
 *
 * seg −1 준비 → [시작] → 흰 플래시 3프레임(t = 0) → seg 0 튜토리얼 원 → [구간 1 시작] → seg 1 자유
 *   → +SEG1_APPEAR done.appear(FADE_IN) → done(by user|cap) → seg.end 1 → 잠금 계산·적용 → snapshot seg → canvas.new lock → seg.start 2
 *   → +SEG2_LEN seg.end 2 (시트로 조기 종료 가능) → seg 3 회고(UI 동결 · 접촉 acted:false)
 * 4단계 — 생성 방식·슬라이더 · 적기·칩·라벨 · 타이머·done · 잠금 · 이미지 손잡이 · 마이크 입력 채널 · 회고 지원.
 */
import {
  FLASH_FRAMES, TUTORIAL_NOTE, TUTORIAL_OUT_MS, VEL_FIXED, TONE_FIXED, LEN_DEFAULT,
  W, H, L, K_P, K_T, TAU, STEP_DEFAULT, SPREAD_DEFAULT, SEG1_APPEAR, SEG1_CAP, SEG2_LEN, FADE_IN, IDLE_LIST_MIN, CUTS, LOCK_RULE, MIC_THR,
} from './constants'
import {
  computeFit, toVirtual, shuffledSlots, hitTest, pitchOfY, inFacRect, inRect, panelBlocks, sliderValue, slotRects,
  SURFACE, AXIS, PANEL, BOTTOM_RIGHT, quantPitch, type Fit,
} from './layout'
import {
  INITIAL_STATE, newCanvas, matOf, bumpId, type Canvas, type Session, type Seg, type Src, type Vals, type Image, type Label, type Chip, type Note, type Gen, type LockAxis,
} from './model'
import { attach, type DownInfo, type MoveInfo, type Gesture } from './input'
import { draw, type View, type Ghost, type ReviewOverlay } from './render'
import { phaseNow, loopIndex } from './preview'
import { compute as lockCompute, type LockResult, type LockRule } from './lock'
import * as log from './log'
import * as audio from './audio'
import * as mic from './mic'
import * as notes from './ops/notes'
import * as scope from './ops/scope'
import * as grid from './ops/grid'
import * as buttons from './ops/buttons'
import * as play from './ops/play'
import * as material from './ops/material'
import * as canvasOps from './ops/canvas'
import * as gen from './ops/gen'
import * as text from './ops/text'
import * as imageOps from './ops/image'

declare const __BUILD__: string | undefined

export interface Checks {
  guided_access: boolean
  silent_mode_off: boolean
  lock_rule?: LockRule
}

export interface Status {
  seg: Seg
  pid: string
  /** seg.start seg:1 기준 경과 ms. 구간 1 전이면 null */
  elapsedSeg1: number | null
  /** 구간 2 남은 ms */
  remainSeg2: number | null
  doneVisible: boolean
  canvas: number
  canvases: number
  listed: number
  notes: number
  images: number
  marks: number
  build: string
  resumed: boolean
  recording: boolean
  micInput: boolean
  grid: boolean
  gen: Gen
  playing: boolean
  mat: string
  lock: string | null
  lockRule: LockRule
  cuts: readonly string[]
}

export interface ReviewMark {
  t: number
  id: string
  canvas: number
  notes: Note[]
  images: Image[]
  labels: Label[]
  n_before: number | null
}

export interface ReviewData {
  marks: ReviewMark[]
  unusedSlots: string[]
  unadopted: string[]
  chipsMade: number
  chipsPlaced: number
  idles: Array<{ t: number; dur: number }>
  firstTouch: Record<string, number | null>
  lock: Record<string, unknown> | null
}

function freshSession(): Session {
  return {
    pid: '',
    seed: '',
    build: typeof __BUILD__ === 'string' ? __BUILD__ : 'probe-dev',
    seg: -1,
    t0: 0,
    state: { ...INITIAL_STATE },
    canvases: [newCanvas(1)],
    current: 0,
    chips: [],
    slots: { bottom: [], drawer: [], panel: [] },
    cuts: [...CUTS],
  }
}

let sess: Session = freshSession()
let canvasEl: HTMLCanvasElement
let ctx2d: CanvasRenderingContext2D
let fit: Fit = computeFit(W, H, 1)
let date = ''
let flashLeft = 0
let pendingChecks: Checks | null = null
let lockRule: LockRule = LOCK_RULE
let seg1At: number | null = null
let seg1Perf: number | null = null
let seg2At: number | null = null
let doneAppearAt: number | null = null
let opsInSeg = 0
let marks = 0
let resumed = false
let panelOpen = false
let ghost: Ghost | null = null
let params = gen.defaultParams()
let lockBlankPending = false
let review: ReviewOverlay | null = null
let micSpan: { startT: number; startPerf: number; from: number; canvasN: number } | null = null
const gone = new Set<string>()
const held = new Map<number, { h: audio.Handle; at: number }>()
const drags = new Map<number, notes.Edit>()
const imageDrags = new Map<number, imageOps.ImageEdit>()
const sliderDrags = new Map<number, { name: 'step' | 'spread'; prev: number }>()
let openSheet: () => void = () => {}

const cur = (): Canvas => sess.canvases[sess.current] as Canvas
const cut = (name: string): boolean => sess.cuts.includes(name)

/** 개발 전용 — `?fast`로 열면 구간 타이머를 초 단위로 줄인다 (8 s · 15 s · 10 s). 빌드에는 없다 (R-004) */
const FAST = import.meta.env.DEV && new URLSearchParams(location.search).has('fast')
const T_APPEAR = FAST ? 8_000 : SEG1_APPEAR
const T_CAP = FAST ? 15_000 : SEG1_CAP
const T_SEG2 = FAST ? 10_000 : SEG2_LEN

log.setContext(() => ({ seg: sess.seg, canvas: cur().n, state: { ...sess.state } }))

export function setSheetOpener(fn: () => void): void {
  openSheet = fn
}

export function init(canvas: HTMLCanvasElement, ctx: CanvasRenderingContext2D): void {
  canvasEl = canvas
  ctx2d = ctx
  resize()
  window.addEventListener('resize', resize)
  window.visualViewport?.addEventListener('resize', resize)
  void material.preload()

  attach(canvasEl, {
    toVirtual: (cx, cy) => {
      // 캔버스의 실제 자리 기준 — 키보드 pan 보정(transform)이 걸려 있어도 맞는다 (PI-001)
      const r = canvasEl.getBoundingClientRect()
      return toVirtual(fit, cx - r.left, cy - r.top)
    },
    target: (x, y) => {
      if (sess.seg === 0) return inFacRect(x, y) || fit.oy + y * fit.s <= 60 && fit.ox + x * fit.s <= 60 ? 'none' : 'surface' // 튜토리얼 — 어디를 닿아도 같다 (N4). 진행자 모서리만 예외
      return hitTest(x, y, {
        slots: sess.slots,
        notes: cur().notes,
        gone,
        doneVisible: sess.seg === 1 && doneAppearAt !== null,
        grid: sess.state.grid,
        panelOpen,
        panel: sess.slots.panel,
        images: cur().images,
        list: canvasOps.listOrder,
        chips: sess.chips,
        labels: cur().labels,
        sliderVisible: !cut('rule_slider') && (sess.state.gen === 'rule' || sess.state.gen === 'random'),
        imageSizeCut: cut('image_size'),
      })
    },
    actionable: (t) => {
      if (!(sess.seg === 0 || sess.seg === 1 || sess.seg === 2)) return false
      if (t === 'none' || t.startsWith('slot.gone') || t.startsWith('label:')) return false
      if (lockReason(t)) return false
      return true
    },
    lockReason,
    blocked: (x, y) => {
      if (sess.seg < 1) return false
      if (panelOpen && panelBlocks(sess.slots.panel, x, y)) return true
      const covered = text.coveredFromClientY()
      if (covered === null) return false
      const clientY = canvasEl.getBoundingClientRect().top + fit.oy + y * fit.s
      return clientY >= covered // 키보드 · 입력 칸에 가려진 자리 (§3-4)
    },
    logging: () => sess.seg >= 0,
    onDown,
    onMove,
    onGesture,
    onCancel,
    onFacilitatorTaps: () => openSheet(),
  })

  requestAnimationFrame(frame)
  // rAF는 탭이 가려지거나 무거운 순간 멈춘다 — 구간 타이머는 20 ms 인터벌로도 본다 (판정 기준은 어느 쪽이든 log.now())
  window.setInterval(tickTimers, 20)
}

/** §7 타이머 — 기준은 seg.start의 t. rAF와 인터벌 양쪽에서 호출되고, 멱등이다 */
function tickTimers(): void {
  if (sess.seg === 1 && seg1At !== null) {
    const el = log.now() - seg1At
    if (doneAppearAt === null && el >= T_APPEAR) {
      doneAppearAt = log.now()
      log.log('done.appear', {})
    }
    if (el >= T_CAP) endSeg1('cap')
  } else if (sess.seg === 2 && seg2At !== null && log.now() - seg2At >= T_SEG2) {
    endSeg2('timer')
  }
}

/** 잠금 위반 — slot.gone · 구간 2에서 채택 전 surface (§11-2) */
function lockReason(target: string): string | null {
  if (target.startsWith('slot.gone')) return 'lock'
  if (sess.seg === 2 && lockBlankPending && target === 'surface') return 'lock'
  return null
}

function resize(): void {
  fit = computeFit(window.innerWidth, window.innerHeight, window.devicePixelRatio || 1)
  canvasEl.width = Math.round(fit.vw * fit.dpr)
  canvasEl.height = Math.round(fit.vh * fit.dpr)
  canvasEl.style.width = `${fit.vw}px`
  canvasEl.style.height = `${fit.vh}px`
}

// ── 진행자 조작 (§7-1). 모든 조작은 facilitator {action}
export async function start(pid: string, checks: Checks): Promise<void> {
  if (sess.seg !== -1) return
  sess.pid = pid
  sess.seed = pid
  sess.slots = shuffledSlots(pid)
  date = log.localDate()
  pendingChecks = checks
  lockRule = checks.lock_rule ?? LOCK_RULE
  params = gen.defaultParams()
  canvasOps.restoreList([])
  await log.begin(pid, date, new Date().toISOString())
  audio.ensure()
  audio.warm()
  flashLeft = FLASH_FRAMES // 다음 프레임에서 플래시 시작 → onFlashStart
}

function headerFields(wall: string): Record<string, unknown> {
  const ua = navigator.userAgent
  const standalone =
    window.matchMedia('(display-mode: standalone)').matches || (navigator as Navigator & { standalone?: boolean }).standalone === true
  const micInput = mic.hasPermission() && !cut('mic_input')
  return {
    pid: sess.pid,
    date,
    build: sess.build,
    device: deviceName(ua),
    os: osName(ua),
    ua,
    standalone,
    viewport: [W, H],
    scale: round3(fit.s),
    letterbox: [fit.ox, fit.oy],
    vel_source: 'fixed',
    tone_source: 'fixed',
    audio_mime: mic.hasPermission() ? mic.mimeType() : null,
    seed: sess.seed,
    slots_bottom: sess.slots.bottom.slice(0, 6),
    slots_drawer: sess.slots.drawer,
    slots_panel: sess.slots.panel,
    loop_ms: L,
    grid_div: [K_P, K_T],
    tau_ms: TAU,
    len_default_ms: LEN_DEFAULT,
    step_default_ms: STEP_DEFAULT,
    spread_default: SPREAD_DEFAULT,
    mic_threshold: mic.hasPermission() ? mic.getThreshold() : MIC_THR,
    mic_input: micInput,
    mic_recording: mic.hasPermission(),
    lock_rule: lockRule,
    cuts: sess.cuts,
    dev_fast: FAST || undefined,
    guided_access: pendingChecks?.guided_access ?? false,
    silent_mode_off: pendingChecks?.silent_mode_off ?? false,
    wall,
  }
}

function onFlashStart(): void {
  const wall = new Date().toISOString()
  sess.t0 = performance.now()
  log.setT0(sess.t0)
  mic.startRecording() // 녹음 트랙은 플래시부터 (§9)
  log.writeHeader(headerFields(wall))
  sess.seg = 0
  log.log('session.flash', { wall })
  log.log('facilitator', { action: 'start' })
}

export function startSeg1(): void {
  if (sess.seg !== 0) return
  log.log('facilitator', { action: 'seg1.start' })
  sess.seg = 1
  seg1At = log.now()
  seg1Perf = performance.now()
  opsInSeg = 0
  log.log('seg.start', { seg: 1, by: 'facilitator' })
  startMicInput()
}

const tOf = (perf: number): number => Math.round(perf - sess.t0)

/** 마이크 입력 채널 — 권한이 있고 잘리지 않았을 때 (§9)。 span의 첫 노트는 playFrom, 이후 실시간 경과만큼 오른쪽 */
function startMicInput(): void {
  if (!mic.hasPermission() || cut('mic_input') || mic.isInputOn()) return
  mic.startInput({
    onSpanStart: (at) => {
      const cv = cur()
      micSpan = { startT: tOf(at), startPerf: at, from: cv.playFrom, canvasN: cv.n }
      log.spanOpen('mic')
    },
    onNote: (n) => {
      if (!micSpan || sess.seg < 1 || sess.seg > 2) return
      const cv = cur()
      const on = Math.round(micSpan.from + (n.onsetAt - micSpan.startPerf))
      if (on >= L || cv.n !== micSpan.canvasN) return // L에 닿으면 span은 곧 닫힌다
      const note: Note = { id: nextNoteId(), on, pitch: n.pitch, len: n.len, vel: n.vel, tone: TONE_FIXED, src: 'mic', mat: matOf('mic') }
      cv.notes.push(note)
      const { on: o, pitch, len, vel, tone } = note
      log.log('note.add', { ids: [note.id], count: 1, src: 'mic', vals: [{ on: o, pitch, len, vel, tone }], scope: scope.scopeOf(cv) })
    },
    onSpanEnd: (at, n, gatedMs) => {
      if (!micSpan) return
      log.log('mic.span', { from: micSpan.startT, to: tOf(at), n, gated_ms: gatedMs })
      micSpan = null
      log.spanClose('mic')
    },
    onGate: (on) => {
      if (sess.seg >= 1 && sess.seg <= 2) log.log('mic.gate', { on })
    },
  })
}

function nextNoteId(): string {
  return notes.newId()
}

// ── 구간 전환 (§7)
function endSeg1(by: 'user' | 'cap'): void {
  if (sess.seg !== 1) return
  const cv = cur()
  if (play.isPlaying()) play.stop(cv)
  if (text.isOpen()) text.closeInput(false, () => undefined)
  panelOpen = false
  ghost = null
  log.log('done', { by, since_appear: doneAppearAt === null ? null : log.now() - doneAppearAt })
  log.closeActivity() // 마지막 간격을 닫는다 — τ를 넘으면 idle이 seg.end 앞에 남는다
  log.log('seg.end', { seg: 1, by: by === 'cap' ? 'timer' : 'user' })
  const res = lockCompute(log.getDwell(), lockRule)
  sess.seg = 2
  seg2At = log.now()
  opsInSeg = 0
  log.log('lock.apply', { ...res }) // 판정 기록 → 그로 인한 전이(gen.set · grid.* by:lock) → snapshot seg → canvas.new lock
  applyLock(res)
  sess.lock = { axis: res.axis, value: res.value }
  canvasOps.keep(sess, 'lock') // snapshot reason:seg → canvas.new reason:lock
  if (sess.lock.axis === 'mat' && sess.lock.value === 'blank') lockBlankPending = true
  log.log('seg.start', { seg: 2, by: by === 'cap' ? 'timer' : 'user' })
}

/** §11-2 — 잠긴 것은 사라진다. 빈 자리는 메우지 않는다 */
function applyLock(res: LockResult): void {
  const { axis, value } = res
  if (axis === 'mat') {
    if (value === 'sound' || value === 'image') gone.add(`mat.${value}`)
    // blank — 제거할 슬롯 없음. 구간 2 캔버스의 첫 조작은 채택이어야 한다 (lockBlankPending)
  } else if (axis === 'gen') {
    gone.add(`gen.${value}`)
    if (sess.state.gen === value) gen.setGen(sess.state, value === 'hand' ? 'rule' : 'hand', 'lock')
  } else {
    gone.add('grid')
    grid.set(sess.state, value === 'off', 'lock') // off가 잠기면 ON 고정, on이 잠기면 OFF 고정
  }
}

function endSeg2(by: 'timer' | 'facilitator'): void {
  if (sess.seg !== 2) return
  const cv = cur()
  if (play.isPlaying()) play.stop(cv)
  if (text.isOpen()) text.closeInput(false, () => undefined)
  panelOpen = false
  ghost = null
  log.closeActivity()
  log.log('seg.end', { seg: 2, by })
  sess.seg = 3
  mic.stopInput()
  void mic.stopRecording() // 녹음은 회고 모드 진입까지 (§9)
}

export function endSeg2Early(): void {
  log.log('facilitator', { action: 'seg2.end' })
  endSeg2('facilitator')
}

/** 비상 정지 — 지금 구간을 진행자가 끝내고 회고 모드로. 로그·녹음은 남는다 (R-007) */
export function emergencyStop(): void {
  if (sess.seg < 1 || sess.seg === 3) return
  log.log('facilitator', { action: 'emergency_stop' })
  if (sess.seg === 1) {
    const cv = cur()
    if (play.isPlaying()) play.stop(cv)
    log.closeActivity()
    log.log('seg.end', { seg: 1, by: 'facilitator' })
    sess.seg = 3
    mic.stopInput()
    void mic.stopRecording()
  } else endSeg2('facilitator')
}

export async function exportNow(): Promise<log.ExportResult> {
  if (sess.seg < 0) return { ok: false, method: 'none', files: [], error: '세션 전' }
  log.log('facilitator', { action: 'export' })
  if (play.isPlaying()) play.stop(cur())
  log.closeActivity()
  await mic.stopRecording()
  const blobs = await mic.exportBlobs()
  const r = await log.exportSession(blobs)
  log.log('facilitator', { action: 'export.result', ok: r.ok, method: r.method, files: r.files, error: r.error ?? null })
  return r
}

/** 복구된 세션을 버리고 준비 화면으로. 데이터는 IndexedDB에 그대로 남는다 */
export async function abandon(): Promise<void> {
  if (play.isPlaying()) play.stop(cur())
  if (text.isOpen()) text.closeInput(false, () => undefined)
  if (sess.seg >= 0) log.log('facilitator', { action: 'abandon' })
  await log.flush()
  mic.stopInput()
  await mic.stopRecording()
  sess = freshSession()
  seg1At = null
  seg1Perf = null
  seg2At = null
  doneAppearAt = null
  opsInSeg = 0
  marks = 0
  resumed = false
  panelOpen = false
  ghost = null
  review = null
  micSpan = null
  lockBlankPending = false
  params = gen.defaultParams()
  gone.clear()
  held.clear()
  drags.clear()
  imageDrags.clear()
  sliderDrags.clear()
  canvasOps.restoreList([])
}

export function status(): Status {
  const cv = cur()
  return {
    seg: sess.seg,
    pid: sess.pid,
    elapsedSeg1: seg1At === null ? null : log.now() - seg1At,
    remainSeg2: sess.seg === 2 && seg2At !== null ? Math.max(0, T_SEG2 - (log.now() - seg2At)) : null,
    doneVisible: doneAppearAt !== null,
    canvas: cv.n,
    canvases: sess.canvases.length,
    listed: canvasOps.listOrder.length,
    notes: cv.notes.length,
    images: cv.images.length,
    marks,
    build: sess.build,
    resumed,
    recording: mic.isRecording(),
    micInput: mic.isInputOn(),
    grid: sess.state.grid,
    gen: sess.state.gen,
    playing: play.isPlaying(),
    mat: sess.state.mat,
    lock: sess.lock ? `${sess.lock.axis}=${sess.lock.value}` : null,
    lockRule,
    cuts: sess.cuts,
  }
}

export function dwell(): ReturnType<typeof log.getDwell> {
  return log.getDwell()
}

/** 파일럿 비교용 — 준비 화면에서 v0.2를 고를 수 있다 (§11-1 병기) */
export function previewLock(): LockResult {
  return lockCompute(log.getDwell(), lockRule)
}

// ── 회고 지원 (§7-1 회고) — 로그에서 계산한다
export async function reviewData(): Promise<ReviewData> {
  const lines = await log.allLines()
  const ev = lines.filter((l) => l.type !== 'session.header')
  const marksList: ReviewMark[] = []
  const snaps = new Map<string, log.Line>()
  for (const e of ev) if (e.type === 'snapshot') snaps.set(String(e.id), e)
  for (const e of ev) {
    if (e.type !== 'mark') continue
    const s = snaps.get(String(e.snapshot))
    if (!s) continue
    marksList.push({
      t: Number(e.t),
      id: String(e.snapshot),
      canvas: Number(s.canvas),
      notes: (s.notes as Note[]) ?? [],
      images: (s.images as Image[]) ?? [],
      labels: (s.labels as Label[]) ?? [],
      n_before: typeof e.n_before === 'number' ? e.n_before : null,
    })
  }
  const touched = new Set<string>()
  const firstTouch: Record<string, number | null> = { mark: null, 'canvas.keep': null, 'canvas.discard': null, done: null }
  for (const e of ev) {
    if (e.type !== 'touch.down') continue
    const t = String(e.target)
    if (t.startsWith('slot:')) {
      const name = t.slice(5)
      touched.add(name)
      if (name in firstTouch && firstTouch[name] === null) firstTouch[name] = Number(e.t)
    }
  }
  const allSlots = slotRects(sess.slots).map((s) => s.name)
  const unusedSlots = allSlots.filter((s) => !touched.has(s))
  const adopted = new Set(ev.filter((e) => e.type === 'mat.adopt').map((e) => String(e.mat)))
  const unadopted = ['sound', 'image'].filter((m) => !adopted.has(m))
  const chipsMade = ev.filter((e) => e.type === 'text.commit' && e.source === 'chip').length
  const chipsPlaced = ev.filter((e) => e.type === 'text.place').length
  const idles = ev.filter((e) => e.type === 'idle' && Number(e.dur) >= IDLE_LIST_MIN).map((e) => ({ t: Number(e.t), dur: Number(e.dur) }))
  const lockLine = ev.find((e) => e.type === 'lock.apply') ?? null
  return { marks: marksList, unusedSlots, unadopted, chipsMade, chipsPlaced, idles, firstTouch, lock: lockLine }
}

/** 마킹 탭 — 그 스냅샷을 작업 면에 불러와 0부터 1회 재생. 회고 모드라 조작은 불가 */
export function reviewPlay(m: ReviewMark): void {
  log.log('facilitator', { action: 'review.play', snapshot: m.id })
  review = { notes: m.notes, images: m.images, labels: m.labels, canvas: m.canvas }
  void audio.resume()
  const now = audio.currentTime()
  for (const n of m.notes) audio.play(n, now + n.on / 1000)
}

export function reviewClear(): void {
  review = null
}

// ── 복구 (§10-4) — 페이지 로드 시 한 번. IndexedDB의 미내보내기 세션을 이어 붙인다
export async function tryResume(): Promise<boolean> {
  const r = await log.findResumable()
  if (!r) return false
  const h = r.header
  sess = freshSession()
  sess.pid = String(h.pid ?? r.pid)
  sess.seed = String(h.seed ?? sess.pid)
  sess.build = String(h.build ?? sess.build)
  sess.cuts = Array.isArray(h.cuts) ? (h.cuts as string[]) : []
  lockRule = h.lock_rule === 'v0.2' ? 'v0.2' : 'v0.3'
  sess.slots = {
    bottom: [...((h.slots_bottom as string[] | undefined) ?? shuffledSlots(sess.pid).bottom.slice(0, 6)), ...BOTTOM_RIGHT],
    drawer: (h.slots_drawer as string[] | undefined) ?? shuffledSlots(sess.pid).drawer,
    panel: (h.slots_panel as string[] | undefined) ?? shuffledSlots(sess.pid).panel,
  }
  date = r.date
  replay(r.events)
  const gap = log.resume(r)
  if (seg1At !== null) seg1Perf = performance.now() - Math.max(TUTORIAL_OUT_MS, log.now() - seg1At)
  resumed = true
  log.log('session.resume', { gap_ms: gap })
  if (sess.seg === 1 || sess.seg === 2) startMicInput()
  return true
}

/** 이벤트 재생 — 노트 · 이미지 · 라벨 · 칩 · 캔버스 · 목록 · 구간 · 잠금 · 마킹 수 · 상태를 되살린다 */
function replay(events: log.Line[]): void {
  const byN = new Map<number, Canvas>()
  const canvasOf = (n: number): Canvas => {
    let c = byN.get(n)
    if (!c) {
      c = newCanvas(n)
      byN.set(n, c)
    }
    return c
  }
  const list: number[] = []
  const chips: Chip[] = []
  let maxNoteId = 0
  let maxImgId = 0
  let maxLabelId = 0
  let maxChipId = 0
  let lastSeg: Seg = 0
  let lastState = { ...INITIAL_STATE }
  let currentN = 1
  seg1At = null
  seg2At = null
  doneAppearAt = null
  opsInSeg = 0
  marks = 0
  gone.clear()
  lockBlankPending = false
  params = gen.defaultParams()
  for (const e of events) {
    const type = String(e.type)
    const n = Number(e.canvas ?? 1)
    const cv = canvasOf(n)
    switch (type) {
      case 'note.add': {
        const ids = e.ids as string[]
        const vals = e.vals as Vals[]
        const src = e.src as Src
        ids.forEach((id, i) => {
          const v = vals[i]
          if (!v) return
          cv.notes.push({ id, ...v, src, mat: matOf(src) })
          maxNoteId = Math.max(maxNoteId, Number(id.slice(1)) || 0)
        })
        opsInSeg++
        if (lockBlankPending && src === 'material') lockBlankPending = false
        break
      }
      case 'note.edit': {
        const ids = e.ids as string[]
        const vals = e.vals as Vals[]
        ids.forEach((id, i) => {
          const nt = cv.notes.find((x) => x.id === id)
          const v = vals[i]
          if (nt && v) Object.assign(nt, v)
        })
        opsInSeg++
        break
      }
      case 'note.remove': {
        const set = new Set(e.ids as string[])
        cv.notes = cv.notes.filter((x) => !set.has(x.id))
        opsInSeg++
        break
      }
      case 'mat.adopt':
        cv.mat = e.mat as Canvas['mat']
        lockBlankPending = false
        break
      case 'image.place': {
        const im: Image = { id: String(e.id), img: String(e.img), x: Number(e.x), y: Number(e.y), w: Number(e.w), h: Number(e.h) }
        cv.images.push(im)
        maxImgId = Math.max(maxImgId, Number(im.id.slice(1)) || 0)
        break
      }
      case 'image.move':
      case 'image.size': {
        const im = cv.images.find((i) => i.id === String(e.id))
        if (im) Object.assign(im, { x: Number(e.x), y: Number(e.y), w: Number(e.w), h: Number(e.h) })
        break
      }
      case 'image.remove':
        cv.images = cv.images.filter((i) => i.id !== String(e.id))
        break
      case 'text.commit':
        if (e.source === 'chip') {
          const chip: Chip = { id: `c${++maxChipId}`, raw: String(e.raw), t: Number(e.t) }
          chips.push(chip)
          while (chips.length > 3) chips.shift()
        }
        break
      case 'text.place': {
        const i = chips.findIndex((c) => c.raw === String(e.raw))
        if (i >= 0) chips.splice(i, 1)
        const label: Label = {
          id: String(e.label ?? `l${maxLabelId + 1}`),
          x: Number(e.x),
          y: e.target === 'axis' ? AXIS.y + AXIS.h / 2 : Number(e.y),
          raw: String(e.raw),
          ids: (e.ids as string[] | undefined) ?? [],
          onAxis: e.target === 'axis',
        }
        cv.labels.push(label)
        maxLabelId = Math.max(maxLabelId, Number(label.id.slice(1)) || 0)
        break
      }
      case 'rule.param':
        if (e.name === 'step' || e.name === 'spread') params[e.name] = Number(e.value)
        break
      case 'play.seek':
        cv.playFrom = Number(e.at)
        break
      case 'canvas.new': {
        const from = canvasOf(Number(e.from))
        from.kept = true
        if (!list.includes(from.n)) list.push(from.n)
        canvasOf(Number(e.to))
        currentN = Number(e.to)
        if (lastSeg === 2 && sess.lock?.axis === 'mat' && sess.lock.value === 'blank') lockBlankPending = true
        break
      }
      case 'canvas.discard': {
        canvasOf(Number(e.from)).kept = false
        canvasOf(Number(e.to))
        currentN = Number(e.to)
        if (lastSeg === 2 && sess.lock?.axis === 'mat' && sess.lock.value === 'blank') lockBlankPending = true
        break
      }
      case 'canvas.switch': {
        const from = canvasOf(Number(e.from))
        from.kept = true
        if (!list.includes(from.n)) list.push(from.n)
        const i = list.indexOf(Number(e.to))
        if (i >= 0) list.splice(i, 1)
        currentN = Number(e.to)
        break
      }
      case 'canvas.evict': {
        const i = list.indexOf(Number(e.n))
        if (i >= 0) list.splice(i, 1)
        break
      }
      case 'seg.start':
        opsInSeg = 0
        if (e.seg === 1) seg1At = Number(e.t)
        if (e.seg === 2) seg2At = Number(e.t)
        break
      case 'done.appear':
        doneAppearAt = Number(e.t)
        break
      case 'lock.apply': {
        const axis = e.axis as LockAxis
        const value = String(e.value)
        sess.lock = { axis, value }
        if (axis === 'mat' && (value === 'sound' || value === 'image')) gone.add(`mat.${value}`)
        else if (axis === 'gen') gone.add(`gen.${value}`)
        else if (axis === 'grid') gone.add('grid')
        if (axis === 'mat' && value === 'blank') lockBlankPending = true
        break
      }
      case 'mark':
        marks++
        break
      default:
        break
    }
    if (typeof e.seg === 'number') lastSeg = e.seg as Seg
    if (e.state && typeof e.state === 'object') lastState = { ...(e.state as typeof lastState) }
    if (!['canvas.new', 'canvas.discard', 'canvas.switch'].includes(type)) currentN = n
  }
  if (byN.size === 0) byN.set(1, newCanvas(1))
  sess.canvases = [...byN.values()].sort((a, b) => a.n - b.n)
  sess.current = Math.max(0, sess.canvases.findIndex((c) => c.n === currentN))
  sess.state = { ...lastState, mat: cur().mat }
  sess.seg = lastSeg
  sess.chips = chips
  canvasOps.restoreList(list.filter((n) => n !== currentN))
  bumpId('n', maxNoteId)
  bumpId('g', maxImgId)
  bumpId('l', maxLabelId)
  bumpId('c', maxChipId)
}

// ── 입력 → 동작
function soundPitch(pitch: number): number {
  return sess.state.grid ? quantPitch(pitch) : pitch
}

function imageById(cv: Canvas, id: string): Image | undefined {
  return cv.images.find((i) => i.id === id)
}

function chipById(id: string): Chip | undefined {
  return sess.chips.find((c) => c.id === id)
}

/** 서랍·패널·칩에서 끌어오는 중의 잔상 — 끌기가 확정된 뒤에만 */
function ghostFor(target: string, x: number, y: number): Ghost | null {
  if (target === 'slot:mat.sound') return { kind: 'sound', x, y }
  if (target.startsWith('panel:') && target !== 'panel:absent') return { kind: 'image', img: target.slice(6), x, y }
  if (target.startsWith('chip:')) return { kind: 'chip', raw: chipById(target.slice(5))?.raw ?? '', x, y }
  return null
}

function onDown(d: DownInfo): void {
  // 입력 칸이 열려 있으면 바깥 접촉 = 확정 (§6-7). 패널 밖 접촉 = 닫힘 (§3-3). 그 접촉 자체는 평소대로 동작한다
  if (text.isOpen()) text.closeInput(true, onTextDone)
  if (panelOpen && !inRect(PANEL, d.x, d.y) && d.target !== 'slot:mat.image') panelOpen = false
  if (!d.acted) return
  void audio.resume() // 첫 접촉이 AudioContext.resume()을 겸한다 (§7 · N1)
  if (sess.seg === 0) {
    audio.play({ on: 0, ...TUTORIAL_NOTE })
    return
  }
  const cv = cur()
  if (d.target === 'surface' || d.target.startsWith('image:')) {
    if (d.target.startsWith('image:')) {
      const im = imageById(cv, d.target.slice(6))
      if (im) material.imageTouch(im, d.x, d.y)
    }
    // 손 모드 — 손 노트는 놓는 즉시 발음. 규칙·난수는 뗄 때 열이 놓이며 1회 재생된다
    if (sess.state.gen === 'hand') {
      const at = audio.currentTime()
      held.set(d.pointerId, { h: audio.noteOn({ pitch: soundPitch(pitchOfY(d.y)), vel: VEL_FIXED, tone: TONE_FIXED }, at), at })
    }
    return
  }
  if (d.target === 'slider') {
    const name: 'step' | 'spread' = sess.state.gen === 'random' ? 'spread' : 'step'
    sliderDrags.set(d.pointerId, { name, prev: params[name] })
    params[name] = gen.paramFromSlider(name, sliderValue(d.y))
  }
}

function onMove(m: MoveInfo): void {
  if (sess.seg < 1) return
  const sd = sliderDrags.get(m.pointerId)
  if (sd) {
    params[sd.name] = gen.paramFromSlider(sd.name, sliderValue(m.y))
    return
  }
  if (!m.dragging) return
  const g = ghostFor(m.target, m.x, m.y)
  if (g) {
    ghost = g
    return
  }
  const cv = cur()
  if (m.target.startsWith('image.move:') || m.target.startsWith('image.size:')) {
    let e = imageDrags.get(m.pointerId)
    if (!e) {
      const kind = m.target.startsWith('image.move:') ? 'move' : 'size'
      e = imageOps.begin(cv, m.target.slice(kind === 'move' ? 11 : 11), kind) ?? undefined
      if (!e) return
      imageDrags.set(m.pointerId, e)
    }
    imageOps.apply(cv, e, m.x - m.x0, m.y - m.y0)
    return
  }
  let e = drags.get(m.pointerId)
  if (!e) {
    if (m.target.startsWith('note.edge:')) e = notes.beginEdit(cv, m.target.slice(10), 'len') ?? undefined
    else if (m.target.startsWith('note:')) e = notes.beginEdit(cv, m.target.slice(5), 'pos') ?? undefined
    if (!e) return
    drags.set(m.pointerId, e)
  }
  notes.applyDrag(cv, e, m.x - m.x0, m.y - m.y0)
}

function releaseHeld(pointerId: number, minLenMs = 0): void {
  const v = held.get(pointerId)
  if (!v) return
  held.delete(pointerId)
  v.h.off(Math.max(audio.currentTime(), v.at + minLenMs / 1000))
}

function onCancel(pointerId: number): void {
  releaseHeld(pointerId)
  ghost = null
  const cv = cur()
  const e = drags.get(pointerId)
  if (e) {
    notes.cancelEdit(cv, e)
    drags.delete(pointerId)
  }
  const ie = imageDrags.get(pointerId)
  if (ie) {
    imageOps.cancel(cv, ie)
    imageDrags.delete(pointerId)
  }
  const sd = sliderDrags.get(pointerId)
  if (sd) {
    params[sd.name] = sd.prev
    sliderDrags.delete(pointerId)
  }
}

function stopIfPlaying(cv: Canvas): void {
  if (play.isPlaying()) play.stop(cv)
}

function onTextDone(r: { committed: boolean; raw: string }): void {
  const kind = text.inputKind()
  void kind
  if (!r.committed) return
  if (lastInputKind === 'absent') text.absent(r.raw)
  else text.addChip(sess, r.raw)
}
let lastInputKind: text.InputKind = 'chip'

function afterAdopt(): void {
  if (lockBlankPending && cur().mat !== 'blank') lockBlankPending = false
}

function onGesture(g: Gesture): void {
  ghost = null
  if (sess.seg === 0) return // 소리는 down에서 났다. 노트는 남기지 않는다
  const cv = cur()
  const t = g.target
  const inSurface = inRect(SURFACE, g.x1, g.y1)
  const inAxis = inRect(AXIS, g.x1, g.y1)

  // 슬라이더 — 뗄 때 한 번 기록
  const sd = sliderDrags.get(g.pointerId)
  if (sd) {
    sliderDrags.delete(g.pointerId)
    const v = params[sd.name]
    params[sd.name] = sd.prev
    gen.setParam(params, sd.name, v)
    return
  }

  // 이미지 손잡이
  if (t.startsWith('image.move:') || t.startsWith('image.size:')) {
    const e = imageDrags.get(g.pointerId)
    imageDrags.delete(g.pointerId)
    if (g.kind === 'drag' && e) {
      if (e.kind === 'move' && !inSurface) imageOps.remove(cv, e)
      else imageOps.commit(cv, e)
      opsInSeg++
    }
    return
  }

  // 노트 위 — 선택 토글 / 고치기 / 지우기
  if (t.startsWith('note:') || t.startsWith('note.edge:')) {
    const id = t.startsWith('note:') ? t.slice(5) : t.slice(10)
    const e = drags.get(g.pointerId)
    drags.delete(g.pointerId)
    if (g.kind === 'drag' && e) {
      if (!inSurface) {
        notes.cancelEdit(cv, e) // 원값으로 되돌린 뒤 지운다 — 지우기는 이동이 아니다
        notes.remove(cv, e.ids)
      } else {
        notes.commitEdit(cv, e)
      }
      opsInSeg++
      return
    }
    const n = notes.noteById(cv, id)
    if (n) audio.play({ ...n, pitch: soundPitch(n.pitch) })
    scope.toggleNote(cv, id)
    return
  }

  // 빈 면 · 이미지 몸통 — 더하기 (손: 노트 하나 · 규칙/난수: 열)
  if (t === 'surface' || t.startsWith('image:')) {
    releaseHeld(g.pointerId, g.kind === 'tap' ? LEN_DEFAULT : 0)
    if (sess.state.gen === 'hand') notes.addFromGesture(cv, g, t.startsWith('image:') ? 'image' : null)
    else gen.column(cv, sess.state, params, sess.seed, g)
    opsInSeg++
    return
  }

  // 칩 — 끌어 면에 놓으면 음절 노트 + 라벨, 띠에 놓으면 라벨만. 탭은 빈 면 슬롯과 같이 적기를 연다 (칩이 슬롯을 덮으므로, R-007)
  if (t.startsWith('chip:')) {
    const chip = chipById(t.slice(5))
    if (g.kind !== 'drag') {
      if (!text.isOpen()) {
        lastInputKind = 'chip'
        text.openInput('chip', fit, onTextDone)
      }
      return
    }
    if (chip) {
      if (inSurface) {
        text.placeChip(sess, cv, chip, 'surface', g.x1, g.y1)
        opsInSeg++
      } else if (inAxis) text.placeChip(sess, cv, chip, 'axis', g.x1, g.y1)
    }
    return
  }

  // 재료 — 열람(탭) · 채택(면으로 끌어 놓기) · 적기
  if (t === 'slot:mat.sound') {
    if (g.kind === 'drag') {
      if (inSurface) {
        material.adoptSound(cv, sess.state, g.x1, g.y1)
        afterAdopt()
        opsInSeg++
      }
    } else material.peekSound()
    return
  }
  if (t === 'slot:mat.image') {
    if (g.kind !== 'drag') {
      panelOpen = !panelOpen
      if (panelOpen) material.peekImage()
    }
    return
  }
  if (t === 'slot:mat.blank') {
    if (g.kind !== 'drag' && !text.isOpen()) {
      lastInputKind = 'chip'
      text.openInput('chip', fit, onTextDone)
    }
    return
  }
  if (t.startsWith('panel:')) {
    const img = t.slice(6)
    if (img === 'absent') {
      if (g.kind !== 'drag' && !text.isOpen()) {
        lastInputKind = 'absent'
        text.openInput('absent', fit, onTextDone)
      }
      return
    }
    if (g.kind === 'drag' && inSurface) {
      material.placeImage(cv, sess.state, img, g.x1, g.y1)
      afterAdopt()
      panelOpen = false
      opsInSeg++
    }
    return
  }

  // 캔버스 목록
  if (t.startsWith('canvas:')) {
    if (g.kind !== 'drag') {
      stopIfPlaying(cv)
      canvasOps.switchTo(sess, Number(t.slice(7)))
      afterAdoptOnSwitch()
    }
    return
  }

  // 시간축 띠 — 탭 = 재생 시작점 (끌기는 N2, input에서 acted:false)
  if (t === 'axis') {
    if (g.kind !== 'drag') play.seek(cv, g.x0)
    return
  }

  if (g.kind === 'drag') return
  switch (t) {
    case 'slot:mark':
      buttons.mark(cv, opsInSeg)
      marks++
      return
    case 'slot:done':
      endSeg1('user')
      return
    case 'slot:grid':
      grid.toggle(sess.state, 'user')
      return
    case 'slot:all':
      scope.toggleAll(cv)
      return
    case 'slot:play':
      play.toggle(cv)
      return
    case 'slot:gen.hand':
    case 'slot:gen.rule':
    case 'slot:gen.random':
      gen.setGen(sess.state, t.slice(9) as Gen, 'user')
      return
    case 'slot:canvas.keep':
      stopIfPlaying(cv)
      canvasOps.keep(sess)
      onNewCanvasInSeg2()
      return
    case 'slot:canvas.discard':
      stopIfPlaying(cv)
      canvasOps.discard(sess)
      onNewCanvasInSeg2()
      return
    default:
      return
  }
}

/** 구간 2에서 새 캔버스 — mat=blank 잠금이면 다시 첫 조작이 채택이어야 한다 */
function onNewCanvasInSeg2(): void {
  if (sess.seg === 2 && sess.lock?.axis === 'mat' && sess.lock.value === 'blank') lockBlankPending = true
}

function afterAdoptOnSwitch(): void {
  if (sess.seg === 2 && sess.lock?.axis === 'mat' && sess.lock.value === 'blank') lockBlankPending = cur().mat === 'blank'
}

// ── 프레임
function frame(): void {
  if (flashLeft > 0) {
    if (flashLeft === FLASH_FRAMES) onFlashStart()
    flashLeft--
  }
  const nowPerf = performance.now()
  const cv = cur()
  play.tick(cv, sess.state.grid)

  tickTimers()

  const out = seg1Perf === null ? 0 : Math.min(1, Math.max(0, (nowPerf - seg1Perf) / TUTORIAL_OUT_MS))
  const active = new Set<string>()
  if (sess.state.grid) active.add('grid')
  if (cv.allOn) active.add('all')
  if (play.isPlaying()) active.add('play')
  active.add(`gen.${sess.state.gen}`)
  const list = canvasOps.listOrder
    .map((n) => sess.canvases.find((c) => c.n === n))
    .filter((c): c is Canvas => !!c)
    .map((c) => ({ n: c.n, notes: c.notes, images: c.images }))
  const sliderName: 'step' | 'spread' | null = sess.state.gen === 'rule' ? 'step' : sess.state.gen === 'random' ? 'spread' : null
  const view: View = {
    seg: sess.seg,
    flash: flashLeft > 0,
    tutorialAlpha: sess.seg === 0 ? 1 : sess.seg >= 1 ? 1 - out : 0,
    uiAlpha: sess.seg >= 1 ? out : 0,
    notes: cv.notes,
    images: cv.images,
    labels: cv.labels,
    imageEls: material.IMAGES,
    selection: cv.selection,
    slots: sess.slots,
    gone,
    active,
    doneVisible: sess.seg === 1 && doneAppearAt !== null,
    doneAlpha: doneAppearAt === null ? 0 : Math.min(1, (log.now() - doneAppearAt) / FADE_IN),
    grid: sess.state.grid,
    panelOpen,
    playFrom: cv.playFrom,
    playPos: play.position(),
    list,
    ghost,
    previewPhase: phaseNow(nowPerf),
    previewLoop: loopIndex(nowPerf),
    previewStatic: cut('preview_loop'),
    seed: sess.seed,
    chips: sess.chips,
    slider: sliderName && !cut('rule_slider') ? { name: sliderName, value: gen.sliderFromParam(sliderName, params) } : null,
    imageSizeCut: cut('image_size'),
    labelsCut: cut('text_label'),
    review,
    build: sess.build,
  }
  draw(ctx2d, fit, view)
  requestAnimationFrame(frame)
}

function deviceName(ua: string): string {
  if (/iPad/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1)) return 'iPad'
  if (/iPhone/.test(ua)) return 'iPhone'
  if (/Macintosh/.test(ua)) return 'Mac'
  return navigator.platform || 'unknown'
}

function osName(ua: string): string {
  // iPadOS Safari는 데스크톱 UA(Macintosh · Mac OS X 10_15_7 고정)를 보낸다 — OS 버전은 알 수 없고 Safari 버전만 남긴다
  if (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1) {
    const v = /Version\/(\d+(?:\.\d+)?)/.exec(ua)
    return `iPadOS (Safari ${v ? v[1] : '?'})`
  }
  const m = /OS (\d+)[_.](\d+)/.exec(ua)
  if (m && /iPad|iPhone/.test(ua)) return `iPadOS ${m[1]}.${m[2]}`
  const mac = /Mac OS X (\d+)[_.](\d+)/.exec(ua)
  if (mac) return `macOS ${mac[1]}.${mac[2]}`
  return 'unknown'
}

function round3(n: number): number {
  return Math.round(n * 1000) / 1000
}
