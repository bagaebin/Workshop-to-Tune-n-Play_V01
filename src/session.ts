/**
 * session.ts — 세션 흐름 (기능 명세 V1.0 §4 · SPEC §7) · 모듈 배선
 *
 * seg −1 준비 → [소리 확인] → [시작] → 흰 플래시 3프레임(t = 0)
 *   → seg 0  explore 자유 탐색(SEG0_LEN) → recall 기대 회고(동결) → briefing 기능 소개 → [화면 비우기] canvas.new reason:seg1
 *   → seg 1  create1 (SEG1_LEN · 진행자가 말로 끊고 시트 [구간 1 종료]) → seg.end 1 → 잠금 계산·적용 → snapshot seg → canvas.new lock
 *   → hold(동결 · 구두 확인 · 구간 2 과제문) → 시트 [구간 2 시작] → seg 2 create2 (+SEG2_LEN seg.end 2)
 *   → seg 3 회고(UI 동결 · 접촉 acted:false)
 * 튜토리얼 원 · 「여기까지」(done)는 없다 (V1.0 §4-1 · §2-1).
 */
import {
  FLASH_FRAMES, UI_IN_MS, VEL_FIXED, TONE_FIXED, LEN_DEFAULT,
  W, H, L, K_P, K_T, TAU, STEP_DEFAULT, SPREAD_DEFAULT, SEG0_LEN, SEG1_LEN, SEG2_LEN, MARK_FLASH, SEG2_GATED, BRIEFING_BANNER, IDLE_LIST_MIN, CUTS, LOCK_RULE, MIC_THR, TEXT_ABORT_CHARS,
} from './constants'
import {
  computeFit, toVirtual, shuffledSlots, hitTest, pitchOfY, inRect, panelBlocks, panelRects, soundRects, sliderValue, slotRects, resolveLabels,
  SURFACE, AXIS, PANEL, BOTTOM_RIGHT, quantPitch, type Fit, type Corner,
} from './layout'
import {
  INITIAL_STATE, SEG_OF, PHASE_ALIAS, newCanvas, matOf, bumpId, resetIds, type Phase, type Canvas, type Session, type Seg, type Src, type Vals, type Image, type Label, type Chip, type Note, type Gen, type LockAxis,
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
import * as labelOps from './ops/label'
import * as intro from './intro'

declare const __BUILD__: string | undefined

export interface Checks {
  guided_access: boolean
  silent_mode_off: boolean
  lock_rule?: LockRule
}

export interface Status {
  seg: Seg
  phase: Phase
  /** 자유 탐색 남은 ms */
  exploreRemain: number | null
  /** 기능 소개 진행 · 지금 단계 이름 · 전체 순서(진행자용) */
  introStep: { i: number; n: number } | null
  introDone: boolean
  introOrder: string[]
  /** 구간 1 앞의 화면 비우기가 끝났는가 */
  cleared: boolean
  /** [소리 확인]을 눌러 오디오가 열렸는가 */
  audioReady: boolean
  pid: string
  /** seg.start seg:1 기준 경과 ms. 구간 1 전이면 null */
  elapsedSeg1: number | null
  /** 구간 2 남은 ms */
  remainSeg2: number | null
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
  /** 탐색 4분 동안 접촉 0 — 몰랐다 (V1.0 §7-1 unused.explore) */
  unusedExplore: string[]
  /** 구간 1 · 2에서 접촉 0 — 알고도 안 썼다 (unused.create) */
  unusedCreate: string[]
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
    phase: 'prep',
    t0: 0,
    state: { ...INITIAL_STATE },
    canvases: [newCanvas(1)],
    current: 0,
    chips: [],
    slots: { bottom: [], drawer: [], panel: [], sounds: [] },
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
/** 전체 UI가 처음 나타난 시각 — 플래시 뒤 UI가 한 번에 나타나는 전환의 기준 */
let uiPerf: number | null = null
/** [소리 확인]을 누른 시각 (ISO). 헤더 뒤에 audio.unlock으로 남긴다 */
let unlockWall: string | null = null
/** 구간 1 앞의 화면 비우기가 끝났다 — 구간 1 시작까지 화면은 멈춰 있다 */
let cleared = false
/** 선택된 이미지 — 손잡이가 보인다. 캔버스를 떠나면 풀린다 */
let imageSel: string | null = null
let exploreAt: number | null = null
let introFinished = false
let introLastStep = 0
/** 마킹 눌림 확인 (G10 개정) — 이름 → 밝기가 끝나는 시각 */
const acks = new Map<string, number>()
let seg2At: number | null = null
let opsInSeg = 0
let marks = 0
let resumed = false
let panelOpen: 'image' | 'sound' | null = null
let ghost: Ghost | null = null
let params = gen.defaultParams()
let lockBlankPending = false
let review: ReviewOverlay | null = null
let micSpan: { startT: number; startPerf: number; from: number; canvasN: number } | null = null
const gone = new Set<string>()
const held = new Map<number, { h: audio.Handle; at: number }>()
const drags = new Map<number, notes.Edit>()
const imageDrags = new Map<number, imageOps.ImageEdit>()
/** 이미지 몸통에서 시작한 접촉 — 탭·누르기면 그 위에 노트(D4), 끌기면 옮기기 (R-013 #4 안 B) */
const imageTouches = new Map<number, { id: string; x: number; y: number }>()
const sliderDrags = new Map<number, { name: 'step' | 'spread'; prev: number }>()
const closedInput = new Set<number>()
const labelDrags = new Map<number, labelOps.LabelEdit>()
let openSheet: () => void = () => {}

const cur = (): Canvas => sess.canvases[sess.current] as Canvas
const cut = (name: string): boolean => sess.cuts.includes(name)

/** 개발 전용 — `?fast`로 열면 타이머를 초 단위로 줄인다 (탐색 8 s · 구간 1 10 s · 구간 2 10 s). 빌드에는 없다 (R-004) */
const FAST = import.meta.env.DEV && new URLSearchParams(location.search).has('fast')
const T_SEG1 = FAST ? 10_000 : SEG1_LEN
const T_SEG2 = FAST ? 10_000 : SEG2_LEN
const T_EXPLORE = FAST ? 8_000 : SEG0_LEN

function setPhase(p: Phase): void {
  sess.phase = p
  sess.seg = SEG_OF[p]
}

/** 참여자 조작이 동작하는 단계 — 전체 UI가 살아 있다. 화면을 비운 뒤 구간 1 시작까지는 멈춘다 */
const uiLive = (): boolean =>
  sess.phase === 'explore' || (sess.phase === 'briefing' && !cleared) || sess.phase === 'create1' || sess.phase === 'create2'

/** 멈춘 화면의 접촉에 남기는 이유 (V1.0 §4-3 reason:'recall') */
function frozenReason(): string | null {
  if (sess.phase === 'recall') return 'recall'
  if (sess.phase === 'briefing' && cleared) return 'wait'
  if (sess.phase === 'hold') return 'hold'
  if (sess.phase === 'review') return 'review'
  return null
}

const openRects = () => (panelOpen === 'sound' ? soundRects(sess.slots.sounds) : panelRects(sess.slots.panel))

log.setContext(() => ({ seg: sess.seg, phase: sess.phase, canvas: cur().n, state: { ...sess.state } }))

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
      return hitTest(x, y, {
        slots: sess.slots,
        notes: cur().notes,
        gone,
        selection: cur().selection,
        imageSel,
        grid: sess.state.grid,
        panelOpen,
        panel: sess.slots.panel,
        sounds: sess.slots.sounds,
        images: cur().images,
        list: canvasOps.listOrder,
        chips: sess.chips,
        labels: resolveLabels(cur().labels, cur().notes, sess.state.grid),
        sliderVisible: !cut('rule_slider') && (sess.state.gen === 'rule' || sess.state.gen === 'random'),
        imageSizeCut: cut('image_size'),
      })
    },
    actionable: (t) => {
      if (!uiLive()) return false // 준비 · 기대 회고 · 대기 · 회고 — 접촉은 기록만
      if (t === 'none' || t.startsWith('slot.gone')) return false
      if (t.startsWith('label:') && !labelOps.isAxisLabel(cur(), t.slice(6))) return false // 면 위 라벨은 노트를 따라간다 (R-010)
      if (lockReason(t)) return false
      return true
    },
    lockReason,
    blocked: (x, y) => {
      if (!uiLive()) return false
      if (panelOpen && panelBlocks(openRects(), x, y)) return true
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
  if (sess.phase === 'explore' && exploreAt !== null && log.now() - exploreAt >= T_EXPLORE) {
    endExplore('timer')
    return
  }
  // 구간 1은 자동으로 끝나지 않는다 — 진행자가 말로 끊고 시트에서 끝낸다 (V1.0 §4-5)
  if (sess.phase === 'create2' && seg2At !== null && log.now() - seg2At >= T_SEG2) endSeg2('timer')
}

/** 작동하지 않는 이유 — 멈춘 화면(recall · wait · hold · review) · 잠금 위반(slot.gone · 구간 2에서 채택 전 surface, §11-2) */
function lockReason(target: string): string | null {
  const fr = frozenReason()
  if (fr) return fr
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
  intro.layout(fit)
}

// ── 진행자 조작 (§7-1). 모든 조작은 facilitator {action}
/** [소리 확인] — 준비 화면에서 진행자가 누른다. 오디오를 열고 짧은 노트 하나. 이것 없이는 [시작]이 눌리지 않는다 (V1.0 §4-1) */
/** 이번 세션을 위해 [소리 확인]을 눌렀고 오디오가 열려 있다 — 세션마다 다시 누른다 */
const audioReady = (): boolean => unlockWall !== null && audio.isRunning()

export async function soundCheck(): Promise<boolean> {
  audio.ensure()
  await audio.resume()
  audio.warm()
  if (!audio.isRunning()) return false
  audio.play({ on: 0, pitch: 0.5, len: 400, vel: 0.6, tone: TONE_FIXED })
  unlockWall = new Date().toISOString()
  return true
}

export async function start(pid: string, checks: Checks): Promise<void> {
  if (sess.seg !== -1) return
  if (!audioReady()) return // 빠뜨림을 사람 기억에 맡기지 않는다
  sess.pid = pid
  sess.seed = pid
  sess.slots = shuffledSlots(pid)
  date = log.localDate()
  pendingChecks = checks
  lockRule = checks.lock_rule ?? LOCK_RULE
  params = gen.defaultParams()
  resetIds() // 새 세션 — 노트·이미지 id를 1부터
  canvasOps.restoreList([])
  await log.begin(pid, date, new Date().toISOString())
  await material.ready() // 사진 다섯 장이 디코드된 뒤에야 참여자 화면(플래시)이 뜬다 (N1)
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
    text_abort_chars: TEXT_ABORT_CHARS,
    cuts: sess.cuts,
    slots_sounds: sess.slots.sounds,
    session_structure: 'd15', // 탐색 → 기대 회고 → 기능 소개 → 창작 (V1.0 §7)
    spec: 'V1.0',
    seg0_len_ms: T_EXPLORE,
    seg1_len_ms: T_SEG1,
    seg2_len_ms: T_SEG2,
    seg2_gated: SEG2_GATED,
    briefing_banner: BRIEFING_BANNER,
    mark_flash_ms: MARK_FLASH,
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
  log.log('session.flash', { wall }) // 아직 seg −1
  log.log('audio.unlock', { by: 'facilitator', at: 'seg-1', wall: unlockWall })
  log.log('facilitator', { action: 'start' })
  // 튜토리얼 원은 없다 — 플래시 뒤 곧바로 전체 화면, 자유 탐색 (V1.0 §4-1 · §4-2)
  setPhase('explore')
  exploreAt = log.now()
  uiPerf = performance.now()
  opsInSeg = 0
  log.log('phase.start', { phase: 'explore', by: 'facilitator' })
  startMicInput()
}

// ── 창작 전 단계 (V1.0 §4) — 자유 탐색 → 기대 회고 → 기능 소개 → (화면 비우기 · 과제문) → 구간 1

function quiet(): void {
  const cv = cur()
  if (play.isPlaying()) play.stop(cv)
  if (text.isOpen()) text.closeInput(false, () => undefined)
  panelOpen = null
  ghost = null
  imageSel = null
  for (const id of [...held.keys()]) releaseHeld(id)
  drags.clear()
  imageDrags.clear()
  imageTouches.clear()
  sliderDrags.clear()
  labelDrags.clear()
}

/**
 * 화면 비우기 — 탐색·소개에서 만든 것은 구간 1로 넘어가지 않는다 (V1.0 §4-2). canvas.new reason:'seg1'.
 * 떠나는 캔버스는 스냅샷으로만 남고 목록에 들어가지 않는다. 목록 · 칩 · 상태(빈면 · OFF · 손) · 규칙 값도 처음으로.
 */
function clearForSeg1(): void {
  quiet()
  intro.hide()
  const from = cur()
  log.snapshot('phase', from)
  const n = sess.canvases.reduce((m, c) => Math.max(m, c.n), 0) + 1
  sess.canvases.push(newCanvas(n))
  sess.current = sess.canvases.length - 1
  canvasOps.restoreList([])
  sess.chips = []
  sess.state = { ...INITIAL_STATE }
  params = gen.defaultParams()
  cleared = true
  log.log('canvas.new', { from: from.n, to: n, reason: 'seg1' })
}

/** 시트 [화면 비우기] — "화면을 새로 비우겠습니다." 참여자가 비는 장면을 본다 */
export function clearWorkspace(): void {
  if (sess.seg !== 0 || cleared) return
  log.log('facilitator', { action: 'workspace.clear' })
  if (sess.phase === 'explore') endExplore('facilitator')
  clearForSeg1()
}

function endExplore(by: 'timer' | 'facilitator'): void {
  if (sess.phase !== 'explore') return
  quiet()
  log.snapshot('phase', cur())
  log.log('phase.end', { phase: 'explore', by })
  setPhase('recall') // 기대 회고 — 화면은 그대로, 접촉은 기록만
  log.log('phase.start', { phase: 'recall', by })
}

export function endExploreEarly(): void {
  log.log('facilitator', { action: 'explore.end' })
  endExplore('facilitator')
}

/** 기능 소개 — 탐색에서 만든 화면 그대로, 참여자 손으로 (V1.0 §4-4) */
export function startIntro(): void {
  if (sess.phase === 'explore') endExplore('facilitator')
  if (sess.phase !== 'recall') return
  log.log('facilitator', { action: 'briefing.start' })
  log.log('phase.end', { phase: 'recall', by: 'facilitator' })
  setPhase('briefing')
  introFinished = false
  introLastStep = 0
  log.log('phase.start', { phase: 'briefing', by: 'facilitator' })
  showIntro(0)
}

function showIntro(at: number): void {
  const steps = intro.buildSteps(sess.slots)
  if (!BRIEFING_BANNER) return
  intro.show(
    fit,
    steps,
    at,
    (i, st) => {
      introLastStep = i
      log.log('intro.step', { i, key: st.key })
    },
    () => {
      introFinished = true
      log.log('intro.done', {})
    },
  )
}

/** 과제문 낭독 뒤 — 구간 1. 화면을 비우지 않았으면 여기서 비운다. 어느 창작 전 단계에서든 넘어갈 수 있다(건너뛴 단계는 로그에 그대로 남는다) */
export function startSeg1(): void {
  if (sess.seg !== 0) return
  log.log('facilitator', { action: 'seg1.start' })
  if (sess.phase === 'explore') endExplore('facilitator')
  if (!cleared) clearForSeg1()
  intro.hide()
  log.log('phase.end', { phase: sess.phase, by: 'facilitator' })
  setPhase('create1')
  cleared = false
  seg1At = log.now()
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
      if (!micSpan || !uiLive()) return
      if (sess.phase === 'briefing') return // 소개 중 말소리가 노트가 되지 않게
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
      if (uiLive()) log.log('mic.gate', { on })
    },
  })
}

function nextNoteId(): string {
  return notes.newId()
}

// ── 구간 전환 (V1.0 §4-5 · SPEC §7)
/** 구간 1 끝 — 진행자가 말로 끊고 시트에서 누른다. 잠금이 곧바로 적용되고, 구간 2는 시트 [구간 2 시작]에서 (SEG2_GATED) */
function endSeg1(by: 'facilitator'): void {
  if (sess.phase !== 'create1') return
  quiet()
  log.closeActivity() // 마지막 간격을 닫는다 — τ를 넘으면 idle이 seg.end 앞에 남는다
  log.log('seg.end', { seg: 1, by })
  const res = lockCompute(log.getDwell(), lockRule)
  setPhase('hold')
  opsInSeg = 0
  log.log('lock.apply', { ...res }) // 판정 기록 → 그로 인한 전이(gen.set · grid.* by:lock) → snapshot seg → canvas.new lock
  applyLock(res)
  sess.lock = { axis: res.axis, value: res.value }
  canvasOps.keep(sess, 'lock') // snapshot reason:seg → canvas.new reason:lock
  if (sess.lock.axis === 'mat' && sess.lock.value === 'blank') lockBlankPending = true
  if (!SEG2_GATED) beginSeg2('timer')
}

export function endSeg1Now(): void {
  if (sess.phase !== 'create1') return
  log.log('facilitator', { action: 'seg1.end' })
  endSeg1('facilitator')
}

function beginSeg2(by: 'facilitator' | 'timer'): void {
  if (sess.phase !== 'hold') return
  setPhase('create2')
  seg2At = log.now()
  opsInSeg = 0
  log.log('seg.start', { seg: 2, by })
}

/** 구두 확인과 구간 2 과제문 뒤 — 시트 [구간 2 시작] */
export function startSeg2(): void {
  if (sess.phase !== 'hold') return
  log.log('facilitator', { action: 'seg2.start' })
  beginSeg2('facilitator')
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
  const started = sess.phase === 'create2'
  quiet()
  if (started) {
    log.closeActivity()
    log.log('seg.end', { seg: 2, by })
  }
  setPhase('review')
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
    quiet()
    log.closeActivity()
    log.log('seg.end', { seg: 1, by: 'facilitator' })
    setPhase('review')
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
  uiPerf = null
  seg2At = null
  exploreAt = null
  introFinished = false
  introLastStep = 0
  cleared = false
  imageSel = null
  unlockWall = null
  imageTouches.clear()
  acks.clear()
  intro.hide()
  opsInSeg = 0
  marks = 0
  resumed = false
  panelOpen = null
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
    phase: sess.phase,
    exploreRemain: sess.phase === 'explore' && exploreAt !== null ? Math.max(0, T_EXPLORE - (log.now() - exploreAt)) : null,
    introStep: intro.progress(),
    introDone: introFinished,
    introOrder: sess.slots.bottom.length ? intro.buildSteps(sess.slots).map((x) => intro.STEP_NAME[x.key] ?? x.key) : [],
    cleared,
    audioReady: audioReady(),
    pid: sess.pid,
    elapsedSeg1: seg1At === null ? null : log.now() - seg1At,
    remainSeg2: sess.phase === 'create2' && seg2At !== null ? Math.max(0, T_SEG2 - (log.now() - seg2At)) : null,
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
    if (e.type !== 'mark' || !(e.seg === 1 || e.seg === 2)) continue // 창작 전 마킹은 집계하지 않는다
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
  // 미사용은 둘로 나눈다 — 탐색에서 안 만진 것(몰랐다) · 창작에서 안 쓴 것(알고도 안 썼다) (V1.0 §7-1)
  const touchedExplore = new Set<string>()
  const touchedCreate = new Set<string>()
  const firstTouch: Record<string, number | null> = { mark: null, 'canvas.keep': null, 'canvas.discard': null }
  for (const e of ev) {
    if (e.type !== 'touch.down') continue
    const t = String(e.target)
    if (!t.startsWith('slot:')) continue
    const name = t.slice(5)
    if (e.phase === 'explore') touchedExplore.add(name)
    if (e.seg === 1 || e.seg === 2) {
      touchedCreate.add(name)
      if (name in firstTouch && firstTouch[name] === null) firstTouch[name] = Number(e.t)
    }
  }
  const allSlots = slotRects(sess.slots).map((s) => s.name)
  const ko = (n: string): string => SLOT_NAME_KO[n] ?? n
  const unusedExplore = allSlots.filter((n) => !touchedExplore.has(n)).map(ko)
  const unusedCreate = allSlots.filter((n) => !touchedCreate.has(n) && !gone.has(n)).map(ko)
  const adopted = new Set(ev.filter((e) => e.type === 'mat.adopt' && (e.seg === 1 || e.seg === 2)).map((e) => String(e.mat)))
  const unadopted = ['sound', 'image'].filter((m) => !adopted.has(m))
  const inCreate = (e: log.Line): boolean => e.seg === 1 || e.seg === 2
  const chipsMade = ev.filter((e) => inCreate(e) && e.type === 'text.commit' && e.source === 'chip').length
  const chipsPlaced = ev.filter((e) => inCreate(e) && e.type === 'text.place').length
  const idles = ev.filter((e) => e.type === 'idle' && Number(e.dur) >= IDLE_LIST_MIN).map((e) => ({ t: Number(e.t), dur: Number(e.dur) }))
  const lockLine = ev.find((e) => e.type === 'lock.apply') ?? null
  return { marks: marksList, unusedExplore, unusedCreate, unadopted, chipsMade, chipsPlaced, idles, firstTouch, lock: lockLine }
}

export interface ExpectRow {
  name: string
  label: string
  /** 자유 탐색 중 접촉 수 */
  count: number
  /** 첫 접촉 — 탐색 시작 기준 ms */
  first: number | null
}

/** 진행자용 이름 — 참여자 화면에는 나오지 않는다 */
const SLOT_NAME_KO: Readonly<Record<string, string>> = {
  grid: '격자', 'gen.hand': '손', 'gen.rule': '규칙', 'gen.random': '난수', play: '재생', all: '전체',
  'mat.blank': '빈 면(적기)', 'mat.sound': '소리 재료', 'mat.image': '이미지',
  mark: '마킹', 'canvas.keep': '남기고 새로', 'canvas.discard': '지우고 새로',
}

/** 잠긴 것을 진행자가 읽을 말로 — 구간 2 과제문의 ○○ 자리 */
export function lockName(axis: string, value: string): string {
  if (axis === 'gen') return SLOT_NAME_KO[`gen.${value}`] ?? value
  if (axis === 'mat') return value === 'blank' ? '빈 면에서 바로 시작하기 (재료를 먼저 놓아야 한다)' : (SLOT_NAME_KO[`mat.${value}`] ?? value)
  return value === 'on' ? '격자 (꺼진 채 고정)' : '격자 끄기 (켜진 채 고정)'
}

/** ② 기대 회고 자료 — 자유 탐색에서 무엇을 눌렀고 무엇을 안 눌렀나. 화면 배치 순서대로 */
export async function expectData(): Promise<{ slots: ExpectRow[]; acts: Array<{ label: string; count: number }> }> {
  const lines = await log.allLines()
  const ev = lines.filter((l) => l.phase === 'explore')
  const t0 = Number(lines.find((l) => l.type === 'phase.start' && l.phase === 'explore')?.t ?? 0)
  const rows: ExpectRow[] = slotRects(sess.slots)
    .map((s) => ({ name: s.name, label: SLOT_NAME_KO[s.name] ?? s.name, count: 0, first: null }))
  const byName = new Map(rows.map((r) => [r.name, r]))
  for (const e of ev) {
    if (e.type !== 'touch.down') continue
    const t = String(e.target)
    if (!t.startsWith('slot:')) continue
    const r = byName.get(t.slice(5))
    if (!r) continue
    r.count++
    if (r.first === null) r.first = Number(e.t) - t0
  }
  const n = (f: (e: log.Line) => boolean): number => ev.filter(f).length
  const acts = [
    { label: '면에 놓기(손)', count: n((e) => e.type === 'note.add' && e.src === 'touch') },
    { label: '열 놓기(규칙·난수)', count: n((e) => e.type === 'note.add' && (e.src === 'rule' || e.src === 'random')) },
    { label: '노트 선택', count: n((e) => e.type === 'scope.set') },
    { label: '노트 옮기기·길이', count: n((e) => e.type === 'note.edit') },
    { label: '노트 지우기(밖으로)', count: n((e) => e.type === 'note.remove') },
    { label: '띠 탭(재생 시작점)', count: n((e) => e.type === 'play.seek') },
    { label: '소리 들어 보기', count: n((e) => e.type === 'mat.peek' && e.mat === 'sound' && typeof e.id === 'string') },
    { label: '소리 재료 놓기', count: n((e) => e.type === 'note.add' && e.src === 'material') },
    { label: '이미지 놓기', count: n((e) => e.type === 'image.place') },
    { label: '이미지 선택', count: n((e) => e.type === 'image.select' && e.on === true) },
    { label: '이미지 옮기기·크기·제거', count: n((e) => e.type === 'image.move' || e.type === 'image.size' || e.type === 'image.remove') },
    { label: '"여기 없다" 슬롯', count: n((e) => e.type === 'touch.down' && e.target === 'panel:absent') },
    { label: '적기(확정)', count: n((e) => e.type === 'text.commit') },
    { label: '칩 놓기', count: n((e) => e.type === 'text.place') },
    { label: '작동하지 않은 접촉', count: n((e) => e.type === 'touch.down' && e.acted === false && !(Number(e.x) < 80 && Number(e.y) < 80)) },
  ]
  return { slots: rows, acts }
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
  await material.ready()
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
    sounds: (h.slots_sounds as string[] | undefined) ?? shuffledSlots(sess.pid).sounds,
  }
  date = r.date
  replay(r.events)
  const gap = log.resume(r)
  if (sess.phase !== 'prep') uiPerf = performance.now() - UI_IN_MS // 전환은 이미 끝난 것으로
  resumed = true
  log.log('session.resume', { gap_ms: gap })
  if (uiLive()) startMicInput()
  if (sess.phase === 'briefing' && !introFinished && !cleared) showIntro(introLastStep)
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
  let lastPhase: Phase | null = null
  let lastState = { ...INITIAL_STATE }
  let currentN = 1
  seg1At = null
  seg2At = null
  exploreAt = null
  introFinished = false
  introLastStep = 0
  cleared = false
  imageSel = null
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
      case 'label.move': {
        const l = cv.labels.find((x) => x.id === String(e.id))
        if (l) l.x = Number(e.x)
        break
      }
      case 'label.remove':
        cv.labels = cv.labels.filter((x) => x.id !== String(e.id))
        break
      case 'rule.param':
        if (e.name === 'step' || e.name === 'spread') params[e.name] = Number(e.value)
        break
      case 'play.seek':
        cv.playFrom = Number(e.at)
        break
      case 'canvas.new': {
        if (e.reason === 'seg1') {
          // 화면 비우기 — 떠난 캔버스는 목록에 들어가지 않는다. 목록 · 칩 · 규칙 값도 처음으로
          canvasOf(Number(e.to))
          currentN = Number(e.to)
          list.length = 0
          chips.length = 0
          params = gen.defaultParams()
          cleared = true
          break
        }
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
      case 'phase.start':
        opsInSeg = 0
        if (e.phase === 'explore') exploreAt = Number(e.t)
        break
      case 'intro.step':
        introLastStep = Number(e.i)
        break
      case 'intro.done':
        introFinished = true
        break
      case 'workspace.reset':
        canvasOf(Number(e.to))
        currentN = Number(e.to)
        list.length = 0
        chips.length = 0
        params = gen.defaultParams()
        break
      case 'seg.start':
        opsInSeg = 0
        if (e.seg === 1) {
          seg1At = Number(e.t)
          cleared = false
        }
        if (e.seg === 2) seg2At = Number(e.t)
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
        if (Number(e.seg) >= 1) marks++
        break
      default:
        break
    }
    if (typeof e.seg === 'number') lastSeg = e.seg as Seg
    if (typeof e.phase === 'string') lastPhase = PHASE_ALIAS[e.phase] ?? (e.phase as Phase)
    if (e.state && typeof e.state === 'object') lastState = { ...(e.state as typeof lastState) }
    if (!['canvas.new', 'canvas.discard', 'canvas.switch', 'workspace.reset', 'seg.end', 'lock.apply', 'seg.start', 'phase.start', 'phase.end', 'facilitator'].includes(type)) currentN = n
  }
  if (byN.size === 0) byN.set(1, newCanvas(1))
  sess.canvases = [...byN.values()].sort((a, b) => a.n - b.n)
  sess.current = Math.max(0, sess.canvases.findIndex((c) => c.n === currentN))
  sess.state = { ...lastState, mat: cur().mat }
  // 옛 로그(phase 없음)는 seg에서 단계를 되짚는다
  setPhase(lastPhase ?? (lastSeg === 1 ? 'create1' : lastSeg === 2 ? 'create2' : lastSeg === 3 ? 'review' : 'explore'))
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
  if (target.startsWith('sound:')) return { kind: 'sound', x, y }
  if (target.startsWith('panel:') && target !== 'panel:absent') return { kind: 'image', img: target.slice(6), x, y }
  if (target.startsWith('chip:')) return { kind: 'chip', raw: chipById(target.slice(5))?.raw ?? '', x, y }
  return null
}

/** 이미지 선택을 푼다 — 손잡이가 사라진다 */
function deselectImage(): void {
  if (imageSel === null) return
  const im = imageById(cur(), imageSel)
  imageSel = null
  if (im) imageOps.select(im, false)
}

function selectImage(im: Image): void {
  if (imageSel === im.id) return
  deselectImage()
  imageSel = im.id
  imageOps.select(im, true)
}

function onDown(d: DownInfo): void {
  // 입력 칸이 열려 있으면 바깥 접촉 = 확정 (§6-7). 패널 밖 접촉 = 닫힘 (§3-3). 그 접촉 자체는 평소대로 동작한다
  closedInput.delete(d.pointerId) // 포인터 id는 재사용된다 — 지난 접촉의 흔적을 지운다
  imageTouches.delete(d.pointerId)
  if (text.isOpen()) {
    text.closeInput(true, onTextDone)
    closedInput.add(d.pointerId) // 이 접촉은 입력 칸을 닫는 데 쓰였다 — 빈 면 슬롯·칩이어도 다시 열지 않는다 (PI-004)
  }
  if (panelOpen && !inRect(PANEL, d.x, d.y) && d.target !== `slot:mat.${panelOpen}`) panelOpen = null
  if (!d.acted) return
  void audio.resume()
  const cv = cur()
  // 선택된 이미지 밖을 닿으면 선택이 풀린다
  if (imageSel !== null && d.target !== `image:${imageSel}` && !d.target.startsWith(`image.size:${imageSel}`)) deselectImage()
  // 이미지 몸통 — 탭·누르기면 노트, 끌기면 옮기기. 뗄 때(또는 끌기가 확정될 때) 갈린다
  if (d.target.startsWith('image:')) imageTouches.set(d.pointerId, { id: d.target.slice(6), x: d.x, y: d.y })
  if (d.target === 'surface' || d.target.startsWith('image:')) {
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
  if (!uiLive()) return
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
  if (m.target.startsWith('label:')) {
    let le = labelDrags.get(m.pointerId)
    if (!le) {
      le = labelOps.begin(cv, m.target.slice(6)) ?? undefined
      if (!le) return
      labelDrags.set(m.pointerId, le)
    }
    labelOps.apply(cv, le, m.x - m.x0)
    return
  }
  if (m.target.startsWith('image:') || m.target.startsWith('image.size:')) {
    let e = imageDrags.get(m.pointerId)
    if (!e) {
      if (m.target.startsWith('image:')) {
        // 끌기가 확정됐다 — 옮기기. 닿을 때 난 소리는 끊고, 옮기는 이미지가 선택된다(손잡이가 보인다)
        releaseHeld(m.pointerId)
        imageTouches.delete(m.pointerId)
        e = imageOps.begin(cv, m.target.slice(6), 'move') ?? undefined
        const im = imageById(cv, m.target.slice(6))
        if (e && im) selectImage(im)
      } else {
        const [id, corner] = m.target.slice(11).split(':')
        e = imageOps.begin(cv, id ?? '', 'size', (corner as Corner | undefined) ?? null) ?? undefined
      }
      if (!e) return
      imageDrags.set(m.pointerId, e)
    }
    imageOps.apply(cv, e, m.x - m.x0, m.y - m.y0)
    return
  }
  let e = drags.get(m.pointerId)
  if (!e) {
    if (m.target.startsWith('note.edgeL:')) e = notes.beginEdit(cv, m.target.slice(11), 'len', 'l') ?? undefined
    else if (m.target.startsWith('note.edge:')) e = notes.beginEdit(cv, m.target.slice(10), 'len', 'r') ?? undefined
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
  closedInput.delete(pointerId)
  imageTouches.delete(pointerId)
  const le = labelDrags.get(pointerId)
  if (le) {
    labelOps.cancel(cur(), le)
    labelDrags.delete(pointerId)
  }
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
  try {
    handleGesture(g)
  } finally {
    closedInput.delete(g.pointerId)
  }
}

function handleGesture(g: Gesture): void {
  ghost = null
  const cv = cur()
  const t = g.target
  const inSurface = inRect(SURFACE, g.x1, g.y1)
  const inAxis = inRect(AXIS, g.x1, g.y1)

  // 띠 라벨 — 끌어 옮기기 · 띠 밖에서 뗌 = 지우기 (R-011)
  if (t.startsWith('label:')) {
    const le = labelDrags.get(g.pointerId)
    labelDrags.delete(g.pointerId)
    if (g.kind === 'drag' && le) {
      if (!inAxis) labelOps.remove(cv, le)
      else labelOps.commit(cv, le)
    }
    return
  }

  // 슬라이더 — 뗄 때 한 번 기록
  const sd = sliderDrags.get(g.pointerId)
  if (sd) {
    sliderDrags.delete(g.pointerId)
    const v = params[sd.name]
    params[sd.name] = sd.prev
    gen.setParam(params, sd.name, v)
    return
  }

  // 이미지 모서리 손잡이 — 크기
  if (t.startsWith('image.size:')) {
    const e = imageDrags.get(g.pointerId)
    imageDrags.delete(g.pointerId)
    if (g.kind === 'drag' && e) {
      imageOps.commit(cv, e)
      opsInSeg++
    }
    return
  }

  // 이미지 몸통 — 끌기 = 옮기기(면 밖에서 떼면 제거) · 탭·누르기 = 그 위에 손으로 친다 (D4 · R-013 #4 안 B)
  if (t.startsWith('image:')) {
    const it = imageTouches.get(g.pointerId)
    imageTouches.delete(g.pointerId)
    const e = imageDrags.get(g.pointerId)
    imageDrags.delete(g.pointerId)
    if (g.kind === 'drag') {
      releaseHeld(g.pointerId)
      if (!e) return
      if (!inSurface) {
        imageOps.remove(cv, e)
        imageSel = null
      } else imageOps.commit(cv, e)
      opsInSeg++
      return
    }
    const im = imageById(cv, t.slice(6))
    releaseHeld(g.pointerId, g.kind === 'tap' ? LEN_DEFAULT : 0)
    if (!im) return
    material.imageTouch(im, it?.x ?? g.x0, it?.y ?? g.y0)
    if (sess.state.gen === 'hand') notes.addFromGesture(cv, g, 'image')
    else gen.column(cv, sess.state, params, sess.seed, g)
    opsInSeg++
    return
  }

  // 노트 위 — 선택 토글 / 고치기 / 지우기
  if (t.startsWith('note:') || t.startsWith('note.edge:') || t.startsWith('note.edgeL:')) {
    const id = t.slice(t.indexOf(':') + 1)
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

  // 빈 면 — 더하기 (손: 노트 하나 · 규칙/난수: 열)
  if (t === 'surface') {
    releaseHeld(g.pointerId, g.kind === 'tap' ? LEN_DEFAULT : 0)
    if (sess.state.gen === 'hand') notes.addFromGesture(cv, g, null)
    else gen.column(cv, sess.state, params, sess.seed, g)
    opsInSeg++
    return
  }

  // 칩 — 끌어 면에 놓으면 음절 노트 + 라벨, 띠에 놓으면 라벨만. 탭은 빈 면 슬롯과 같이 적기를 연다 (칩이 슬롯을 덮으므로, R-007)
  if (t.startsWith('chip:')) {
    const chip = chipById(t.slice(5))
    if (g.kind !== 'drag') {
      if (!text.isOpen() && !closedInput.has(g.pointerId)) {
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
  // 소리 · 이미지 — 같은 몸짓. 슬롯 탭 = 목록이 열린다 · 목록의 칸을 면으로 끌어 놓는다 (V1.0 §3)
  if (t === 'slot:mat.sound') {
    if (g.kind !== 'drag') {
      panelOpen = panelOpen === 'sound' ? null : 'sound'
      if (panelOpen) material.peekSounds()
    }
    return
  }
  if (t === 'slot:mat.image') {
    if (g.kind !== 'drag') {
      panelOpen = panelOpen === 'image' ? null : 'image'
      if (panelOpen) material.peekImage()
    }
    return
  }
  if (t.startsWith('sound:')) {
    const id = t.slice(6)
    if (g.kind === 'drag') {
      if (inSurface && !inRect(PANEL, g.x1, g.y1)) {
        material.adoptSound(cv, sess.state, id, g.x1, g.y1)
        afterAdopt()
        panelOpen = null
        opsInSeg++
      }
    } else material.peekSound(id)
    return
  }
  if (t === 'slot:mat.blank') {
    if (g.kind !== 'drag' && !text.isOpen() && !closedInput.has(g.pointerId)) {
      lastInputKind = 'chip'
      text.openInput('chip', fit, onTextDone)
    }
    return
  }
  if (t.startsWith('panel:')) {
    const img = t.slice(6)
    if (img === 'absent') {
      if (g.kind !== 'drag' && !text.isOpen() && !closedInput.has(g.pointerId)) {
        lastInputKind = 'absent'
        text.openInput('absent', fit, onTextDone)
      }
      return
    }
    if (g.kind === 'drag' && inSurface) {
      const im = material.placeImage(cv, sess.state, img, g.x1, g.y1)
      afterAdopt()
      panelOpen = null
      selectImage(im) // 놓은 것이 선택 — 노트와 같다. 손잡이가 보인다
      opsInSeg++
    }
    return
  }

  // 캔버스 목록
  if (t.startsWith('canvas:')) {
    if (g.kind !== 'drag') {
      deselectImage()
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
      ack('mark') // 버튼만 밝아진다. 작업 면 · 슬롯 · 목록은 바뀌지 않고 소리도 없다 (G10 개정)
      buttons.mark(cv, opsInSeg)
      if (sess.seg >= 1) marks++ // 탐색·소개 중의 마킹은 로그에만 (phase로 구분)
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
      deselectImage()
      stopIfPlaying(cv)
      canvasOps.keep(sess)
      onNewCanvasInSeg2()
      return
    case 'slot:canvas.discard':
      deselectImage()
      stopIfPlaying(cv)
      canvasOps.discard(sess)
      onNewCanvasInSeg2()
      return
    default:
      return
  }
}

/** 마킹 눌림 확인 (G10 개정) — 버튼만 MARK_FLASH 동안 밝아진다 */
function ack(name: string): void {
  acks.set(name, performance.now() + MARK_FLASH)
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

  const out = uiPerf === null ? 0 : Math.min(1, Math.max(0, (nowPerf - uiPerf) / UI_IN_MS))
  const active = new Set<string>()
  if (sess.state.grid) active.add('grid')
  if (cv.allOn) active.add('all')
  if (play.isPlaying()) active.add('play')
  active.add(`gen.${sess.state.gen}`)
  const list = canvasOps.listOrder
    .map((n) => sess.canvases.find((c) => c.n === n))
    .filter((c): c is Canvas => !!c)
    .map((c) => ({ n: c.n, notes: c.notes, images: c.images }))
  const pressed = new Set<string>()
  for (const [name, until] of acks) {
    if (until > nowPerf) pressed.add(name)
    else acks.delete(name)
  }
  const sliderName: 'step' | 'spread' | null = sess.state.gen === 'rule' ? 'step' : sess.state.gen === 'random' ? 'spread' : null
  const view: View = {
    seg: sess.seg,
    flash: flashLeft > 0,
    uiAlpha: sess.phase === 'prep' ? 0 : out,
    notes: cv.notes,
    images: cv.images,
    labels: resolveLabels(cv.labels, cv.notes, sess.state.grid),
    imageEls: material.IMAGES,
    selection: cv.selection,
    imageSel,
    soundVals: material.SOUNDS,
    slots: sess.slots,
    gone,
    active,
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
    pressed,
    spotlight: spotlightNow(),
  }
  draw(ctx2d, fit, view)
  requestAnimationFrame(frame)
}

/** 기능 소개 — 지금 단계의 자리를 밝힌다. 패널이 열려 있으면 패널도. 맺음 문장에서는 어둡게 하지 않는다 */
function spotlightNow(): View['spotlight'] {
  if (sess.phase !== 'briefing' || cleared) return null
  const rects = intro.current()?.rects
  if (!rects || rects.length === 0) return null
  return panelOpen ? [...rects, PANEL] : rects
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
