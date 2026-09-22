/**
 * ops/grid.ts — 격자 토글 (SPEC §6-3)
 *
 * 비파괴 — 저장은 원값, 렌더·재생·규칙 열 생성에서만 양자화(layout.quantPitch · quantOn).
 * grid.on / grid.off {by: 'user' | 'lock'}. 전역 모드 — 캔버스와 무관.
 */
import type { State } from '../model'
import * as log from '../log'

export function toggle(state: State, by: 'user' | 'lock' = 'user'): void {
  set(state, !state.grid, by)
}

export function set(state: State, on: boolean, by: 'user' | 'lock'): void {
  state.grid = on
  log.log(on ? 'grid.on' : 'grid.off', { by })
}
