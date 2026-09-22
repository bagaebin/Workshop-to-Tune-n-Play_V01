/**
 * ops/scope.ts — 편집 범위 = 선택 (SPEC §6-2)
 *
 * one = 노트 탭(선택이 정확히 1개) · many = 잇달아 탭(토글 누적, 2개 이상) · all = all 슬롯 토글.
 * 선택이 바뀔 때마다 scope.set {scope, count, ids}. 선택 0개면 scope는 null.
 * 고치기·지우기는 선택 전체에 걸린다 — 대상 집합은 targetsFor().
 */
import type { Canvas, Scope } from '../model'
import * as log from '../log'

export function scopeOf(cv: Canvas): Scope | null {
  if (cv.allOn) return 'all'
  if (cv.selection.size === 0) return null
  return cv.selection.size === 1 ? 'one' : 'many'
}

function emit(cv: Canvas): void {
  log.log('scope.set', { scope: scopeOf(cv), count: cv.selection.size, ids: [...cv.selection] })
}

/** 노트 탭 — 토글 누적. all은 꺼진다 */
export function toggleNote(cv: Canvas, id: string): void {
  if (cv.selection.has(id)) cv.selection.delete(id)
  else cv.selection.add(id)
  cv.allOn = false
  emit(cv)
}

/** all 슬롯 탭 — 토글. 켜지면 전부 선택 */
export function toggleAll(cv: Canvas): void {
  cv.allOn = !cv.allOn
  cv.selection = cv.allOn ? new Set(cv.notes.map((n) => n.id)) : new Set()
  emit(cv)
}

/** 새 노트를 놓으면 선택 = 그 노트 하나, all 꺼짐 */
export function selectOnly(cv: Canvas, id: string): void {
  cv.selection = new Set([id])
  cv.allOn = false
  emit(cv)
}

/** 고치기·지우기 대상 — 그 노트가 선택에 포함돼 있으면 선택 전체, 아니면 그 노트 하나 */
export function targetsFor(cv: Canvas, id: string): string[] {
  return cv.selection.has(id) ? cv.notes.filter((n) => cv.selection.has(n.id)).map((n) => n.id) : [id]
}

/** 지워진 노트를 선택에서 뺀다. all이었는데 남는 게 없으면 all도 끈다 (기록은 남기지 않는다 — 지우기 사건이 이미 말한다) */
export function pruneRemoved(cv: Canvas, ids: readonly string[]): void {
  for (const id of ids) cv.selection.delete(id)
  if (cv.allOn && cv.notes.length === 0) cv.allOn = false
}
