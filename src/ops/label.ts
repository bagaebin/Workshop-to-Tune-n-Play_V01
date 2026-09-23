/**
 * ops/label.ts — 시간축 띠 라벨 옮기기 · 지우기 (R-011 · PI-009)
 *
 * 띠 라벨(onAxis) 끌기 = 옮기기(x만, 띠 안) → label.move {id, x, raw}
 * 끌어서 **시간축 띠 밖에서 뗌** = 지우기 → label.remove {id, raw}   — 노트 지우기(§6-1 면 밖에서 뗌)와 같은 몸짓
 * 면 위 라벨은 자기 노트를 따라가므로(R-010) 조작 대상이 아니다 — 접촉은 acted:false로 남는다
 * 끌기 중 실시간, 뗄 때 한 번 기록. 움직이지 않았으면 남기지 않는다.
 */
import { AXIS, clamp } from '../layout'
import type { Canvas } from '../model'
import * as log from '../log'

export interface LabelEdit {
  id: string
  prevX: number
}

export function isAxisLabel(cv: Canvas, id: string): boolean {
  return cv.labels.some((l) => l.id === id && l.onAxis)
}

export function begin(cv: Canvas, id: string): LabelEdit | null {
  const l = cv.labels.find((x) => x.id === id && x.onAxis)
  return l ? { id, prevX: l.x } : null
}

export function apply(cv: Canvas, e: LabelEdit, dx: number): void {
  const l = cv.labels.find((x) => x.id === e.id)
  if (l) l.x = Math.round(clamp(e.prevX + dx, AXIS.x, AXIS.x + AXIS.w - 24))
}

export function cancel(cv: Canvas, e: LabelEdit): void {
  const l = cv.labels.find((x) => x.id === e.id)
  if (l) l.x = e.prevX
}

export function commit(cv: Canvas, e: LabelEdit): boolean {
  const l = cv.labels.find((x) => x.id === e.id)
  if (!l || l.x === e.prevX) return false
  log.log('label.move', { id: l.id, x: l.x, raw: l.raw })
  return true
}

export function remove(cv: Canvas, e: LabelEdit): void {
  cancel(cv, e)
  const l = cv.labels.find((x) => x.id === e.id)
  if (!l) return
  cv.labels = cv.labels.filter((x) => x.id !== e.id)
  log.log('label.remove', { id: l.id, x: l.x, raw: l.raw })
}
