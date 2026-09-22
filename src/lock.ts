/**
 * lock.ts — 자기 잠금 계산 (SPEC §11-1) — 순수 함수. 적용은 session.ts (§11-2)
 *
 *   k = {mat:3, grid:2, gen:3}
 *   p[axis]  = max_v dwell[axis][v] / T_active
 *   pn[axis] = (p − 1/k) / (1 − 1/k)
 *   used     = 구간 1에 그 축 전이 ≥ 1
 *   candidates = used인 축 (없으면 전부) · axis = argmax pn (동점 gen > mat > grid) · value = argmax dwell
 *   alt = 원식(v0.2) — argmax p over 전 축 (기록만). lock_rule이 v0.2면 역할이 바뀐다
 * tools/chain.py가 같은 식을 dwell에서 다시 계산해 대조한다.
 */
import type { Dwell } from './log'
import type { LockAxis } from './model'

export type LockRule = 'v0.3' | 'v0.2'

export interface LockInput {
  dwell: Dwell
  T_active: number
  transitions: Record<LockAxis, number>
}

export interface LockPick {
  rule: LockRule
  axis: LockAxis
  value: string
}

export interface LockResult extends LockPick {
  candidates: LockAxis[]
  p: Record<LockAxis, number>
  p_norm: Record<LockAxis, number>
  alt: LockPick
  dwell: Dwell
  T_active: number
}

const AXES: LockAxis[] = ['mat', 'grid', 'gen']
const K: Record<LockAxis, number> = { mat: 3, grid: 2, gen: 3 }
/** 동점 우선순위 — gen > mat > grid */
const PRIORITY: Record<LockAxis, number> = { gen: 0, mat: 1, grid: 2 }

function argmaxValue(d: Record<string, number>): { value: string; ms: number } {
  let best = { value: Object.keys(d)[0] ?? '', ms: -1 }
  for (const [v, ms] of Object.entries(d)) if (ms > best.ms) best = { value: v, ms }
  return best
}

function pickAxis(score: Record<LockAxis, number>, among: LockAxis[]): LockAxis {
  return [...among].sort((a, b) => score[b] - score[a] || PRIORITY[a] - PRIORITY[b])[0] as LockAxis
}

const r4 = (n: number): number => Math.round(n * 10000) / 10000

export function compute(input: LockInput, rule: LockRule = 'v0.3'): LockResult {
  const { dwell, T_active, transitions } = input
  const p = { mat: 0, grid: 0, gen: 0 } as Record<LockAxis, number>
  const pn = { mat: 0, grid: 0, gen: 0 } as Record<LockAxis, number>
  for (const a of AXES) {
    const top = argmaxValue(dwell[a]).ms
    p[a] = T_active > 0 ? top / T_active : 1 / K[a]
    pn[a] = (p[a] - 1 / K[a]) / (1 - 1 / K[a])
    p[a] = r4(p[a])
    pn[a] = r4(pn[a])
  }
  const used = AXES.filter((a) => (transitions[a] ?? 0) >= 1)
  const candidates = used.length ? used : [...AXES]

  const v03: LockPick = { rule: 'v0.3', axis: 'gen', value: '' }
  v03.axis = pickAxis(pn, candidates)
  v03.value = argmaxValue(dwell[v03.axis]).value

  const v02: LockPick = { rule: 'v0.2', axis: 'gen', value: '' }
  v02.axis = pickAxis(p, [...AXES])
  v02.value = argmaxValue(dwell[v02.axis]).value

  const main = rule === 'v0.3' ? v03 : v02
  const alt = rule === 'v0.3' ? v02 : v03
  return { ...main, candidates, p, p_norm: pn, alt, dwell, T_active }
}
