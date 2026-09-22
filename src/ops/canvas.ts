/**
 * ops/canvas.ts — 캔버스 (SPEC §6-9)
 *
 * canvas.keep    지금 캔버스 스냅샷 → kept → 목록 → 새 빈 캔버스(mat=blank)     canvas.new {from,to,reason}
 * canvas.discard 스냅샷 → 버림(kept=false) → 새 빈 캔버스                       canvas.discard {from,to}
 * 목록 축소판 탭  그 캔버스로. 떠나는 캔버스는 스냅샷 후 목록으로                  canvas.switch {from,to}
 * 11번째 kept    가장 오래된 것이 목록에서만 사라진다                             canvas.evict {n}
 * 캔버스마다 mat · playFrom · 선택을 따로 갖는다. grid · gen은 모드(전역).
 */
import { CANVAS_LIST_MAX } from '../constants'
import { newCanvas, type Canvas, type Session } from '../model'
import * as log from '../log'

/** 목록에 있는 캔버스 번호 — 들어온 순서. 현재 캔버스는 목록에 없다 */
export const listOrder: number[] = []

const cur = (s: Session): Canvas => s.canvases[s.current] as Canvas

function nextN(s: Session): number {
  return s.canvases.reduce((m, c) => Math.max(m, c.n), 0) + 1
}

function enterList(n: number): void {
  if (listOrder.includes(n)) return
  listOrder.push(n)
  while (listOrder.length > CANVAS_LIST_MAX) {
    const gone = listOrder.shift()
    if (gone !== undefined) log.log('canvas.evict', { n: gone })
  }
}

function openNew(s: Session): Canvas {
  const c = newCanvas(nextN(s))
  s.canvases.push(c)
  s.current = s.canvases.length - 1
  s.state.mat = 'blank'
  return c
}

/** 남기고 새로 */
export function keep(s: Session, reason: 'keep' | 'lock' = 'keep'): Canvas {
  const from = cur(s)
  log.snapshot(reason === 'lock' ? 'seg' : 'canvas', from)
  from.kept = true
  enterList(from.n)
  const to = openNew(s)
  log.log('canvas.new', { from: from.n, to: to.n, reason })
  return to
}

/** 지우고 새로 */
export function discard(s: Session): Canvas {
  const from = cur(s)
  log.snapshot('canvas', from)
  from.kept = false
  const to = openNew(s)
  log.log('canvas.discard', { from: from.n, to: to.n, reason: 'discard' })
  return to
}

/** 목록 축소판 탭 — 그 캔버스로 전환 */
export function switchTo(s: Session, n: number): Canvas | null {
  const idx = s.canvases.findIndex((c) => c.n === n)
  if (idx < 0 || idx === s.current) return null
  const from = cur(s)
  log.snapshot('switch', from)
  from.kept = true
  enterList(from.n)
  const i = listOrder.indexOf(n)
  if (i >= 0) listOrder.splice(i, 1)
  s.current = idx
  const to = cur(s)
  s.state.mat = to.mat
  log.log('canvas.switch', { from: from.n, to: to.n, reason: 'user' })
  return to
}

/** 복구용 — 목록을 통째로 되살린다 */
export function restoreList(ns: number[]): void {
  listOrder.length = 0
  listOrder.push(...ns)
}
