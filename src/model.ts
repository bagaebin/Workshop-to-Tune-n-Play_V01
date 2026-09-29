/**
 * model.ts — 데이터 모델 (SPEC §4)
 *
 * 규칙 — state.mat은 mat.adopt로만 바뀌고 새 캔버스에서 'blank'. grid·gen은 캔버스와 무관(모드).
 * 노트의 mat은 src === 'material'이면 'sound', 그 외 'blank'. vel·tone은 상수(constants.ts).
 */

export type Mat = 'blank' | 'sound' | 'image'
export type Gen = 'hand' | 'rule' | 'random'
export type Src = 'touch' | 'rule' | 'random' | 'material' | 'text' | 'mic'
export type Scope = 'one' | 'many' | 'all'

/** 18칸 상태 좌표. grid·gen은 전역, mat은 캔버스별 */
export interface State {
  mat: Mat
  grid: boolean
  gen: Gen
}

export const INITIAL_STATE: Readonly<State> = { mat: 'blank', grid: false, gen: 'hand' }

/** 이벤트 값 다섯 (§4-3) — on ms · pitch/vel/tone 0–1 · len ms */
export interface Vals {
  on: number
  pitch: number
  len: number
  vel: number
  tone: number
}

export interface Note extends Vals {
  id: string
  src: Src
  mat: Mat
}

/** 3:2 고정. `img`는 재료 이름(i1..i5), `id`는 놓인 인스턴스(g1, g2…) — 같은 장을 여러 번 놓을 수 있다 */
export interface Image {
  id: string
  img: string
  x: number
  y: number
  w: number
  h: number
}

/** 적기 라벨 — 면 위(노트 열 위, ids = 그 노트들) 또는 시간축 띠 위(onAxis, ids 없음) */
export interface Label {
  id: string
  x: number
  y: number
  raw: string
  ids: string[]
  onAxis: boolean
}

/** 빈 면 슬롯의 칩. 최대 CHIP_MAX */
export interface Chip {
  id: string
  raw: string
  t: number
}

export interface Canvas {
  n: number
  mat: Mat
  notes: Note[]
  images: Image[]
  labels: Label[]
  /** 재생 시작점 (ms). 캔버스별 */
  playFrom: number
  selection: Set<string>
  allOn: boolean
  /** 목록에 있는가 */
  kept: boolean
}

/** -1 준비 · 0 창작 전(원 · 탐색 · 기대 회고 · 기능 소개) · 1 구간 1 · 2 구간 2(잠금) · 3 회고 */
export type Seg = -1 | 0 | 1 | 2 | 3

/**
 * 단계 (D15 안 2). seg는 분석 호환을 위해 그대로 두고, 창작 전의 네 단계는 모두 seg 0이다.
 *   prep(−1) → circle → explore → expect → intro (0) → create1 (1) → create2 (2) → review (3)
 */
export type Phase = 'prep' | 'circle' | 'explore' | 'expect' | 'intro' | 'create1' | 'create2' | 'review'

export const SEG_OF: Readonly<Record<Phase, Seg>> = {
  prep: -1, circle: 0, explore: 0, expect: 0, intro: 0, create1: 1, create2: 2, review: 3,
}

export type LockAxis = 'mat' | 'grid' | 'gen'

export interface Lock {
  axis: LockAxis
  value: string
}

export interface Slots {
  bottom: string[]
  drawer: string[]
  panel: string[]
}

export interface Session {
  pid: string
  seed: string
  build: string
  seg: Seg
  phase: Phase
  /** 플래시 시각 (performance.now) */
  t0: number
  state: State
  canvases: Canvas[]
  current: number
  chips: Chip[]
  slots: Slots
  lock?: Lock
  cuts: string[]
}

/** 노트의 mat 파생 규칙 (§4) */
export function matOf(src: Src): Mat {
  return src === 'material' ? 'sound' : 'blank'
}

export function newCanvas(n: number): Canvas {
  return {
    n,
    mat: 'blank',
    notes: [],
    images: [],
    labels: [],
    playFrom: 0,
    selection: new Set(),
    allOn: false,
    kept: false,
  }
}

const idCounters = new Map<string, number>()

/** id 생성 — 노트 `n1` · 라벨 `l1` · 칩 `c1`. 스냅샷 `s<k>`는 log.ts가 따로 센다 */
export function nextId(prefix: 'n' | 'l' | 'c' | 'g'): string {
  const k = (idCounters.get(prefix) ?? 0) + 1
  idCounters.set(prefix, k)
  return `${prefix}${k}`
}

/** 새 세션 — id를 1부터 다시 센다. 같은 페이지에서 세션을 이어 시작해도 n1부터 (TEST3에서 n32부터 시작) */
export function resetIds(): void {
  idCounters.clear()
}

/** 복구(session.resume) 시 — 로그의 마지막 번호에서 이어 센다 */
export function bumpId(prefix: 'n' | 'l' | 'c' | 'g', atLeast: number): void {
  idCounters.set(prefix, Math.max(idCounters.get(prefix) ?? 0, atLeast))
}
