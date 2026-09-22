/**
 * ops/buttons.ts — 세션 버튼 (SPEC §6-10)
 *
 * 1단계 — mark: 화면 변화 없음 · snapshot reason:mark · mark {snapshot, n_before}.
 * done은 4단계(타이머와 함께).
 *
 * n_before = 이 구간에서 마킹 전까지의 노트 조작 수(note.add · edit · remove 건수). 마킹 앞뒤 조작 비율(F3 만족선)의 분모.
 */
import type { Canvas } from '../model'
import * as log from '../log'

export function mark(cv: Canvas, nBefore: number): string {
  const id = log.snapshot('mark', cv)
  log.log('mark', { snapshot: id, n_before: nBefore })
  return id
}
