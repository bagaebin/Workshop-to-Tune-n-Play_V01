/**
 * ops/play.ts — 시간축 띠 · 재생 (SPEC §6-5)
 *
 * axis 탭 = playFrom(그 x의 on) · play 슬롯 탭 = 시작/정지 · L에서 0으로 순환 · 재생 중 모든 조작 가능.
 * play.stop {at, heard[][], matches_scope} — heard = 실제로 지나간 구간들, matches_scope = 들은 구간이 선택 노트의 [on, on+len]을 전부 덮는가(선택 없으면 null).
 * 스케줄 — 매 프레임 커서부터 pos + LOOKAHEAD까지의 노트를 예약. 재생 중 놓은 노트는 다음 바퀴에 들린다.
 * 격자 ON이면 on·pitch를 양자화해 재생한다(비파괴, §6-3).
 */
import { L, LOOKAHEAD } from '../constants'
import { onOfX, quantOn, quantPitch } from '../layout'
import type { Canvas, Note } from '../model'
import * as audio from '../audio'
import * as log from '../log'

interface Run {
  /** pos = base + (ctxNow − baseCtx) · 1000 */
  base: number
  baseCtx: number
  /** 지금 지나가는 heard 구간의 시작 */
  segStart: number
  heard: Array<[number, number]>
  /** 이번 바퀴에 이미 예약한 노트 */
  scheduled: Set<string>
  /** 예약이 끝난 위치 — 여기부터 다음 예약 */
  cursor: number
  lastPos: number
}

let run: Run | null = null

export function isPlaying(): boolean {
  return run !== null
}

export function position(): number | null {
  if (!run) return null
  return posAt(audio.currentTime())
}

function posAt(ctxNow: number): number {
  if (!run) return 0
  return run.base + (ctxNow - run.baseCtx) * 1000
}

/** 띠 탭 — 재생 시작점. 재생 중이면 헤드 점프 */
export function seek(cv: Canvas, x: number): void {
  const at = Math.round(onOfX(x))
  cv.playFrom = at
  if (run) {
    const now = audio.currentTime()
    const pos = Math.min(L, posAt(now))
    run.heard.push([Math.round(run.segStart), Math.round(pos)])
    run.base = at
    run.baseCtx = now
    run.segStart = at
    run.cursor = at
    run.lastPos = at
    run.scheduled.clear()
  }
  log.log('play.seek', { at })
}

export function toggle(cv: Canvas): void {
  if (run) stop(cv)
  else start(cv)
}

export function start(cv: Canvas): void {
  if (run) return
  const now = audio.currentTime()
  const from = cv.playFrom
  run = { base: from, baseCtx: now, segStart: from, heard: [], scheduled: new Set(), cursor: from, lastPos: from }
  log.spanOpen('play')
  log.log('play.start', { from })
}

export function stop(cv: Canvas): void {
  if (!run) return
  const pos = Math.round(Math.min(L, posAt(audio.currentTime())))
  run.heard.push([Math.round(run.segStart), pos])
  const heard = run.heard.filter(([a, b]) => b > a)
  const matches = matchesScope(cv, heard)
  run = null
  log.spanClose('play')
  log.log('play.stop', { at: pos, heard, matches_scope: matches })
}

/** 매 프레임 — 위치 갱신 · 순환 · 예약 */
export function tick(cv: Canvas, grid: boolean): void {
  if (!run) return
  const now = audio.currentTime()
  let pos = posAt(now)
  // 순환 — 바퀴가 넘어가면 heard를 끊고 예약 집합을 비운다
  while (pos >= L) {
    scheduleRange(cv, grid, run.cursor, L, now, pos)
    run.heard.push([Math.round(run.segStart), L])
    run.base -= L
    pos -= L
    run.segStart = 0
    run.cursor = 0
    run.scheduled.clear()
  }
  scheduleRange(cv, grid, run.cursor, Math.min(L, pos + LOOKAHEAD), now, pos)
  run.cursor = Math.min(L, pos + LOOKAHEAD)
  run.lastPos = pos
}

/** [from, to) 안에서 시작하는 노트를 예약. now·pos는 시각 환산용 */
function scheduleRange(cv: Canvas, grid: boolean, from: number, to: number, ctxNow: number, pos: number): void {
  if (!run || to <= from) return
  for (const n of cv.notes) {
    const on = grid ? quantOn(n.on) : n.on
    if (on < from || on >= to || run.scheduled.has(n.id)) continue
    run.scheduled.add(n.id)
    const when = ctxNow + Math.max(0, on - pos) / 1000
    audio.play({ ...n, pitch: grid ? quantPitch(n.pitch) : n.pitch }, when)
  }
}

/** 들은 구간의 합집합이 선택 노트 구간을 전부 덮는가. 선택 없으면 null */
export function matchesScope(cv: Canvas, heard: Array<[number, number]>): boolean | null {
  if (cv.selection.size === 0) return null
  const merged = mergeRanges(heard)
  const covered = (a: number, b: number): boolean => merged.some(([x, y]) => x <= a && b <= y)
  const sel: Note[] = cv.notes.filter((n) => cv.selection.has(n.id))
  return sel.every((n) => covered(n.on, Math.min(L, n.on + n.len)))
}

function mergeRanges(rs: Array<[number, number]>): Array<[number, number]> {
  const s = [...rs].sort((a, b) => a[0] - b[0])
  const out: Array<[number, number]> = []
  for (const [a, b] of s) {
    const last = out[out.length - 1]
    if (last && a <= last[1]) last[1] = Math.max(last[1], b)
    else out.push([a, b])
  }
  return out
}
