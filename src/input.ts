/**
 * input.ts — 입력 처리 (SPEC §5)
 *
 * Pointer Events → 제스처(탭 · 누르기 · 끌기) → target. 한 손가락만 작동한다.
 * N2(§5-3) — 두 번째 이후 포인터 · none · slot.gone · axis 끌기 · 비활성 구간 접촉은 acted:false로 기록만.
 * 가려진 영역(키보드 · 이미지 패널)은 blocked:true — 훅 `blocked(x,y)`가 판정한다.
 * 진행자 시트 열기(FAC_RECT 5연타)도 여기서 센다 — 그 접촉은 target:none acted:false.
 */
import { TAP_MOVE_PX, TAP_MAX_MS, MOVE_COALESCE, FAC_TAPS, FAC_WINDOW } from './constants'
import { inFacRect } from './layout'
import * as log from './log'

export type GestureKind = 'tap' | 'press' | 'drag'

export interface DownInfo {
  pointerId: number
  target: string
  x: number
  y: number
  acted: boolean
}

export interface MoveInfo {
  pointerId: number
  target: string
  x: number
  y: number
  x0: number
  y0: number
  /** 시작점에서 TAP_MOVE_PX 이상 벗어난 적이 있는가 — 끌기 확정 */
  dragging: boolean
}

export interface Gesture {
  pointerId: number
  kind: GestureKind
  target: string
  x0: number
  y0: number
  x1: number
  y1: number
  /** ms */
  dur: number
  pathLen: number
}

export interface Hooks {
  toVirtual(clientX: number, clientY: number): { x: number; y: number }
  target(x: number, y: number): string
  /** 이 target에 지금 구간에서 동작이 걸리는가 */
  actionable(target: string): boolean
  /** 잠금 위반이면 'lock' — touch.*에 reason으로 남는다 (§11-3) */
  lockReason(target: string): string | null
  /** 다른 것(키보드 · 패널)에 가려진 자리인가 */
  blocked(x: number, y: number): boolean
  /** 헤더가 쓰인 뒤에만 true */
  logging(): boolean
  onDown(d: DownInfo): void
  onMove(m: MoveInfo): void
  onGesture(g: Gesture): void
  onCancel(pointerId: number): void
  onFacilitatorTaps(): void
}

interface P {
  id: number
  x0: number
  y0: number
  t0: number
  lx: number
  ly: number
  maxDist: number
  path: number
  target: string
  acted: boolean
  blocked: boolean
  reason: string | null
  lastMoveLog: number
}

export function attach(el: HTMLElement, h: Hooks): void {
  const ps = new Map<number, P>()
  let primary: number | null = null
  const facTaps: number[] = []

  const r = (n: number) => Math.round(n)
  const touchFields = (e: PointerEvent, p: P, acted = p.acted) => ({
    id: p.id,
    force: e.pressure,
    size: [r(e.width), r(e.height)],
    pointers: ps.size,
    target: p.target,
    acted,
    blocked: p.blocked,
    reason: p.reason ?? undefined,
  })

  el.addEventListener('pointerdown', (e) => {
    e.preventDefault()
    el.setPointerCapture(e.pointerId)
    const { x, y } = h.toVirtual(e.clientX, e.clientY)
    const isPrimary = primary === null
    if (isPrimary) primary = e.pointerId
    const blocked = h.blocked(x, y)
    const target = blocked ? 'none' : h.target(x, y)
    const acted = isPrimary && !blocked && h.actionable(target)
    const reason = !acted && !blocked ? h.lockReason(target) : null
    const p: P = { id: e.pointerId, x0: x, y0: y, t0: performance.now(), lx: x, ly: y, maxDist: 0, path: 0, target, acted, blocked, reason, lastMoveLog: 0 }
    ps.set(e.pointerId, p)
    if (h.logging()) log.log('touch.down', { ...touchFields(e, p), x: r(x), y: r(y) })
    h.onDown({ pointerId: e.pointerId, target, x, y, acted })
  })

  el.addEventListener('pointermove', (e) => {
    const p = ps.get(e.pointerId)
    if (!p) return
    const { x, y } = h.toVirtual(e.clientX, e.clientY)
    p.path += Math.hypot(x - p.lx, y - p.ly)
    p.maxDist = Math.max(p.maxDist, Math.hypot(x - p.x0, y - p.y0))
    p.lx = x
    p.ly = y
    const now = performance.now()
    if (h.logging() && now - p.lastMoveLog >= MOVE_COALESCE) {
      p.lastMoveLog = now
      log.log('touch.move', { ...touchFields(e, p), x: r(x), y: r(y) })
    }
    if (p.acted) h.onMove({ pointerId: p.id, target: p.target, x, y, x0: p.x0, y0: p.y0, dragging: p.maxDist >= TAP_MOVE_PX })
  })

  const finish = (e: PointerEvent, cancelled: boolean) => {
    const p = ps.get(e.pointerId)
    if (!p) return
    const { x, y } = h.toVirtual(e.clientX, e.clientY)
    const dur = performance.now() - p.t0
    const still = p.maxDist < TAP_MOVE_PX
    const kind: GestureKind = !still ? 'drag' : dur < TAP_MAX_MS ? 'tap' : 'press'
    // N2 — axis에서 끌기는 작동하지 않는다. down은 탭이었을 수 있어 acted:true, up에서 false로 닫는다
    const acted = p.acted && !(p.target === 'axis' && kind === 'drag')
    if (h.logging()) {
      log.log('touch.up', { ...touchFields(e, p, acted), x: r(x), y: r(y), dur: r(dur), path_len: r(p.path), cancelled: cancelled || undefined })
    }
    ps.delete(e.pointerId)
    if (primary === e.pointerId) primary = null

    // 진행자 시트 — 좌상단 5연타 (§7-1). 시도 자체는 target:none으로 남는다
    if (still && inFacRect(p.x0, p.y0)) {
      const now = performance.now()
      facTaps.push(now)
      while (facTaps.length && now - (facTaps[0] as number) > FAC_WINDOW) facTaps.shift()
      if (facTaps.length >= FAC_TAPS) {
        facTaps.length = 0
        h.onFacilitatorTaps()
      }
    }

    if (cancelled || !acted) {
      if (p.acted) h.onCancel(e.pointerId)
      return
    }
    h.onGesture({ pointerId: e.pointerId, kind, target: p.target, x0: p.x0, y0: p.y0, x1: x, y1: y, dur, pathLen: p.path })
  }

  el.addEventListener('pointerup', (e) => finish(e, false))
  el.addEventListener('pointercancel', (e) => finish(e, true))

  // 브라우저 제스처 차단 (N2 — 핀치 · 더블탭 확대 · 길게 눌러 메뉴)
  for (const type of ['gesturestart', 'gesturechange', 'gestureend'] as const) {
    el.addEventListener(type, (e) => e.preventDefault(), { passive: false })
  }
  el.addEventListener('dblclick', (e) => e.preventDefault())
  el.addEventListener('contextmenu', (e) => e.preventDefault())
  el.addEventListener('touchstart', (e) => e.preventDefault(), { passive: false })
}
