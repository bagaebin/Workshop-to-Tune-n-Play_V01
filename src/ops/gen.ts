/**
 * ops/gen.ts — 생성 방식 (SPEC §6-4)
 *
 * gen.* 슬롯 탭 → gen.set {gen, by}. 규칙·난수일 때 슬라이더(§3-3) — 이동 → rule.param {name, value}.
 * 규칙  — 접촉 x부터 L까지 간격 step, 같은 pitch, len = LEN_DEFAULT(끌기면 이동량)의 열. 놓인 간격 그대로 지금부터 1회 재생
 * 난수  — 같은 개수. on += U(−spread·step, +spread·step), pitch += U(−spread·0.25, +spread·0.25) 클램프. PRNG 시드 = hash(seed, seq)
 * 열은 note.add {src, count, ids[], vals[]} 한 건. 놓은 열이 선택(R-006 #2).
 */
import { L, LEN_DEFAULT, VEL_FIXED, TONE_FIXED, STEP_DEFAULT, STEP_RANGE, SPREAD_DEFAULT } from '../constants'
import { onOfX, pitchOfY, msOfDx, clamp, quantOn, hashSeed, mulberry32 } from '../layout'
import { nextId, matOf, type Canvas, type Gen, type Note, type State } from '../model'
import type { Gesture } from '../input'
import * as audio from '../audio'
import * as log from '../log'
import * as scope from './scope'

export interface GenParams {
  step: number
  spread: number
}

export function defaultParams(): GenParams {
  return { step: STEP_DEFAULT, spread: SPREAD_DEFAULT }
}

export function setGen(state: State, gen: Gen, by: 'user' | 'lock' = 'user'): void {
  if (state.gen === gen && by === 'user') return
  state.gen = gen
  log.log('gen.set', { gen, by })
}

/** 슬라이더 0–1 → 값. step은 [L/32, L/4] 선형, spread는 0–1 */
export function paramFromSlider(name: 'step' | 'spread', v: number): number {
  if (name === 'spread') return Math.round(clamp(v, 0, 1) * 100) / 100
  const [lo, hi] = STEP_RANGE
  return Math.round(lo + clamp(v, 0, 1) * (hi - lo))
}

export function sliderFromParam(name: 'step' | 'spread', p: GenParams): number {
  if (name === 'spread') return p.spread
  const [lo, hi] = STEP_RANGE
  return (p.step - lo) / (hi - lo)
}

export function setParam(params: GenParams, name: 'step' | 'spread', value: number): void {
  if (params[name] === value) return
  params[name] = value
  log.log('rule.param', { name, value })
}

/** 규칙·난수 열 — surface 접촉 1회로 */
export function column(cv: Canvas, state: State, params: GenParams, seed: string, g: Gesture): Note[] {
  const src = state.gen === 'random' ? 'random' : 'rule'
  let on0 = onOfX(g.x0)
  if (state.grid) on0 = quantOn(on0)
  const pitch0 = pitchOfY(g.y0)
  const len = g.kind === 'drag' ? Math.round(clamp(Math.max(LEN_DEFAULT, msOfDx(g.x1 - g.x0)), 1, L)) : LEN_DEFAULT
  const step = Math.max(1, params.step)
  const seq = log.peekSeq()
  const rnd = mulberry32(hashSeed(`${seed}:${seq}`))
  const U = (a: number): number => (rnd() * 2 - 1) * a
  const placed: Note[] = []
  for (let on = on0; on < L; on += step) {
    let o = on
    let p = pitch0
    if (src === 'random') {
      o = clamp(on + U(params.spread * step), 0, L - 1)
      p = clamp(pitch0 + U(params.spread * 0.25), 0, 1)
    }
    placed.push({ id: nextId('n'), on: Math.round(o), pitch: Math.round(p * 1000) / 1000, len, vel: VEL_FIXED, tone: TONE_FIXED, src, mat: matOf(src) })
  }
  if (placed.length === 0) return placed
  cv.notes.push(...placed)
  const vals = placed.map(({ on, pitch, len: l, vel, tone }) => ({ on, pitch, len: l, vel, tone }))
  log.log('note.add', { ids: placed.map((n) => n.id), count: placed.length, src, vals, scope: placed.length === 1 ? 'one' : 'many', step, spread: src === 'random' ? params.spread : undefined })
  cv.selection = new Set(placed.map((n) => n.id))
  cv.allOn = false
  log.log('scope.set', { scope: scope.scopeOf(cv), count: cv.selection.size, ids: [...cv.selection] })
  // 놓인 간격 그대로 지금부터 1회
  const now = audio.currentTime()
  const first = Math.min(...placed.map((n) => n.on))
  for (const n of placed) audio.play(n, now + (n.on - first) / 1000)
  return placed
}
