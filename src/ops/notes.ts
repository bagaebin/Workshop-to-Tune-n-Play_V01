/**
 * ops/notes.ts — 작업 면 노트 (SPEC §6-1)
 *
 * 더하기 — 탭: len = LEN_DEFAULT · 누르기: len = 누른 시간 · 끌기: on·pitch = 시작점, len = max(기본, 가로 이동량→ms)
 * 고치기 — note 끌기 = pos(on·pitch) · note.edge 끌기 = len. 대상은 선택 전체(포함 시) 또는 그 노트. 뗄 때 note.edit prev[] vals[]
 * 지우기 — 끌기 후 작업 면 밖에서 뗌 = note.remove (대상은 고치기와 같다)
 * 새 노트를 놓으면 선택 = 그 노트 하나, allOn = false.
 */
import { LEN_DEFAULT, VEL_FIXED, TONE_FIXED, L } from '../constants'
import { onOfX, pitchOfY, msOfDx, clamp, SURFACE } from '../layout'
import { matOf, nextId, type Canvas, type Note, type Scope, type Vals } from '../model'
import type { Gesture } from '../input'
import * as log from '../log'
import * as scope from './scope'

export function valsFromGesture(g: Gesture): Vals {
  const on = onOfX(g.x0)
  const pitch = pitchOfY(g.y0)
  let len = LEN_DEFAULT
  if (g.kind === 'press') len = Math.round(g.dur)
  else if (g.kind === 'drag') len = Math.round(Math.max(LEN_DEFAULT, msOfDx(g.x1 - g.x0)))
  len = Math.round(clamp(len, 1, L))
  return { on: Math.round(on), pitch: round3(pitch), len, vel: VEL_FIXED, tone: TONE_FIXED }
}

/** 더하기 — note.add src:touch + scope.set(선택이 그 노트 하나로 바뀜) */
export function addFromGesture(cv: Canvas, g: Gesture, targetMat: 'sound' | 'image' | null = null): Note {
  const vals = valsFromGesture(g)
  const note: Note = { id: nextId('n'), ...vals, src: 'touch', mat: matOf('touch') }
  cv.notes.push(note)
  log.log('note.add', { ids: [note.id], count: 1, src: 'touch', vals: [vals], scope: 'one' }, targetMat)
  scope.selectOnly(cv, note.id)
  return note
}

export type EditField = 'pos' | 'len'

export interface Edit {
  field: EditField
  ids: string[]
  prev: Vals[]
  /** 끌기 시작 시점의 편집 범위 값 */
  scope: Scope | null
}

const pick = (n: Note): Vals => ({ on: n.on, pitch: n.pitch, len: n.len, vel: n.vel, tone: n.tone })

/** 끌기 시작 — 대상과 원값을 잡아 둔다 */
export function beginEdit(cv: Canvas, noteId: string, field: EditField): Edit | null {
  const ids = scope.targetsFor(cv, noteId)
  const notes = ids.map((id) => cv.notes.find((n) => n.id === id)).filter((n): n is Note => !!n)
  if (notes.length === 0) return null
  return { field, ids: notes.map((n) => n.id), prev: notes.map(pick), scope: scope.scopeOf(cv) }
}

/** 끌기 중 — 시작점 대비 이동량(px)을 원값에 더한다. 화면은 이것을 그대로 그린다 */
export function applyDrag(cv: Canvas, e: Edit, dx: number, dy: number): void {
  e.ids.forEach((id, i) => {
    const n = cv.notes.find((x) => x.id === id)
    const p = e.prev[i]
    if (!n || !p) return
    if (e.field === 'pos') {
      n.on = Math.round(clamp(p.on + msOfDx(dx), 0, L))
      n.pitch = round3(clamp(p.pitch - dy / SURFACE.h, 0, 1))
    } else {
      n.len = Math.round(clamp(p.len + msOfDx(dx), 1, L))
    }
  })
}

/** 뗌 — 바뀐 것이 있으면 note.edit. 없으면 아무것도 남기지 않는다 */
export function commitEdit(cv: Canvas, e: Edit): boolean {
  const vals = e.ids.map((id) => cv.notes.find((n) => n.id === id)).filter((n): n is Note => !!n).map(pick)
  const changed = vals.some((v, i) => {
    const p = e.prev[i]
    return !p || v.on !== p.on || v.pitch !== p.pitch || v.len !== p.len
  })
  if (!changed) return false
  log.log('note.edit', { ids: e.ids, count: e.ids.length, scope: e.scope, field: e.field, prev: e.prev, vals }, matOfTargets(cv, e.ids))
  return true
}

/** 취소(pointercancel) — 원값으로 되돌린다. 기록 없음 */
export function cancelEdit(cv: Canvas, e: Edit): void {
  e.ids.forEach((id, i) => {
    const n = cv.notes.find((x) => x.id === id)
    const p = e.prev[i]
    if (n && p) Object.assign(n, p)
  })
}

/** 지우기 — 대상 전체. scope는 지우기 직전의 값 */
export function remove(cv: Canvas, ids: readonly string[]): void {
  const sc = scope.scopeOf(cv)
  const tm = matOfTargets(cv, ids)
  const set = new Set(ids)
  cv.notes = cv.notes.filter((n) => !set.has(n.id))
  scope.pruneRemoved(cv, ids)
  log.log('note.remove', { ids: [...ids], count: ids.length, scope: sc }, tm)
}

/** 조작이 향한 재료 — 대상에 소리 재료 노트가 하나라도 있으면 sound (§10-1 target_mat) */
function matOfTargets(cv: Canvas, ids: readonly string[]): 'sound' | null {
  return ids.some((id) => cv.notes.find((n) => n.id === id)?.mat === 'sound') ? 'sound' : null
}

export function noteById(cv: Canvas, id: string): Note | undefined {
  return cv.notes.find((n) => n.id === id)
}

function round3(n: number): number {
  return Math.round(n * 1000) / 1000
}

/** 다른 출처(마이크)가 노트를 만들 때 쓰는 id */
export function newId(): string {
  return nextId('n')
}
