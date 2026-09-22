/**
 * log.ts — 로그 (SPEC §10)
 *
 * 봉투(t · seq · seg · canvas · state · target_mat) · 헤더 · 메모리 버퍼 → IndexedDB(FLUSH) · 즉시 flush ·
 * snapshot · 체류/idle(§10-5) · session.resume(§10-4) · navigator.share 내보내기(없으면 다운로드 폴백).
 * IndexedDB 스키마는 docs/decisions/R-003.
 */
import { FLUSH, TAU } from './constants'
import type { Canvas, Seg, State } from './model'

export interface LogCtx {
  seg: Seg
  canvas: number
  state: State
}

export type Line = Record<string, unknown>

let ctxProvider: () => LogCtx = () => ({ seg: -1, canvas: 0, state: { mat: 'blank', grid: false, gen: 'hand' } })
let t0 = 0
let seq = 0
let sid = ''
let header: Line | null = null
const buffer: Line[] = []
let db: IDBDatabase | null = null
let flushTimer: number | null = null
let listenersBound = false
let snapSeq = 0

export function setContext(fn: () => LogCtx): void {
  ctxProvider = fn
}

/** 플래시 시각 = 0점 */
export function setT0(perfNow: number): void {
  t0 = perfNow
}

export function now(): number {
  return Math.round(performance.now() - t0)
}

/** 다음 줄이 받을 seq — 난수 열의 PRNG 시드(hash(seed, seq))에 쓴다 (§6-4) */
export function peekSeq(): number {
  return seq
}

export function localDate(d = new Date()): string {
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`
}

// ── IndexedDB (R-003)
function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open('probe', 2)
    req.onupgradeneeded = () => {
      const d = req.result
      if (!d.objectStoreNames.contains('events')) {
        d.createObjectStore('events', { autoIncrement: true }).createIndex('sid', 'sid')
      }
      if (!d.objectStoreNames.contains('sessions')) d.createObjectStore('sessions', { keyPath: 'sid' })
      if (!d.objectStoreNames.contains('audio')) {
        d.createObjectStore('audio', { autoIncrement: true }).createIndex('sid', 'sid')
      }
    }
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
}

function tx<T>(store: string, mode: IDBTransactionMode, run: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    if (!db) return reject(new Error('db closed'))
    const t = db.transaction(store, mode)
    const r = run(t.objectStore(store))
    r.onsuccess = () => resolve(r.result)
    r.onerror = () => reject(r.error)
  })
}

function bindListeners(): void {
  if (listenersBound) return
  listenersBound = true
  if (flushTimer === null) flushTimer = window.setInterval(() => void flush(), FLUSH)
  document.addEventListener('visibilitychange', () => void flush())
  window.addEventListener('pagehide', () => void flush())
}

/** 세션 시작 — sid 확정, DB 열기, 세션 레코드. 같은 날 같은 pid로 다시 시작하면 `_2` `_3`… 을 붙여 **합치지 않는다** (R-003) */
export async function begin(pid: string, date: string, wall: string): Promise<void> {
  seq = 0
  snapSeq = 0
  header = null
  buffer.length = 0
  resetDwell()
  db = db ?? (await openDb())
  const base = `${pid}_${date}`
  const existing = await tx<Array<{ sid: string }>>('sessions', 'readonly', (s) => s.getAll())
  const taken = new Set(existing.map((r) => r.sid))
  sid = base
  for (let k = 2; taken.has(sid); k++) sid = `${base}_${k}`
  await tx('sessions', 'readwrite', (s) => s.put({ sid, pid, date, wall, exported: false }))
  bindListeners()
}

export function sessionId(): string {
  return sid
}

/** 첫 줄. 봉투 없음 (§10-3) */
export function writeHeader(fields: Line): void {
  header = { type: 'session.header', ...fields }
  buffer.push(header)
  mirror()
}

export function getHeader(): Line | null {
  return header
}

/** 봉투를 씌워 한 줄 남긴다. 반환은 남긴 줄 */
export function log(type: string, fields: Line = {}, targetMat: 'sound' | 'image' | null = null): Line {
  const c = ctxProvider()
  const line: Line = {
    t: now(),
    seq: seq++,
    type,
    seg: c.seg,
    canvas: c.canvas,
    state: { ...c.state },
    target_mat: targetMat,
    ...fields,
  }
  buffer.push(line)
  account(line.t as number, type, c.seg, c.state)
  // touch.move만 FLUSH 주기에 맡기고 나머지는 곧바로 거울 + IndexedDB로 — 새로고침 직전 제스처가 1초 버퍼에서 사라지지 않게 (R-003)
  if (type !== 'touch.move') {
    mirror()
    scheduleFlush()
  }
  return line
}

/** 동기 거울 — IndexedDB 트랜잭션이 언로드 전에 커밋되지 못해도 버퍼가 남게. 다음 로드에서 merge (R-003) */
const mirrorKey = (id = sid): string => `probe.pending.${id}`
function mirror(): void {
  if (!sid) return
  try {
    if (buffer.length) localStorage.setItem(mirrorKey(), JSON.stringify(buffer))
    else localStorage.removeItem(mirrorKey())
  } catch {
    /* 저장소 불가 — IndexedDB만으로 간다 */
  }
}

let flushScheduled = false
function scheduleFlush(): void {
  if (flushScheduled || !db) return
  flushScheduled = true
  queueMicrotask(() => {
    flushScheduled = false
    void flush()
  })
}

/** §10-2 snapshot — 캔버스 전체 덤프. 반환 = 스냅샷 id */
export function snapshot(reason: string, cv: Canvas): string {
  const id = `s${++snapSeq}`
  log('snapshot', {
    id,
    reason,
    canvas: cv.n,
    playFrom: cv.playFrom,
    notes: cv.notes.map((n) => ({ ...n })),
    images: cv.images.map((i) => ({ ...i })),
    labels: cv.labels.map((l) => ({ ...l })),
  })
  return id
}

let flushing: Promise<void> | null = null

export function flush(): Promise<void> {
  if (flushing) return flushing
  if (!db || buffer.length === 0) return Promise.resolve()
  const batch = buffer.splice(0, buffer.length)
  flushing = new Promise<void>((resolve) => {
    const t = db!.transaction('events', 'readwrite')
    const s = t.objectStore('events')
    for (const line of batch) s.add({ sid, seq: typeof line.seq === 'number' ? line.seq : -1, line })
    t.oncomplete = () => {
      mirror() // 남은 버퍼만 거울에
      resolve()
    }
    const fail = () => {
      buffer.unshift(...batch) // 실패 시 되돌린다 — 유실 금지
      mirror()
      resolve()
    }
    t.onerror = fail
    t.onabort = fail
  })
  const p = flushing
  void p.finally(() => {
    if (flushing === p) flushing = null
    if (buffer.length) scheduleFlush() // tx 중에 쌓인 줄은 곧바로 다음 tx로
  })
  return p
}

/** 앞 로드에서 IndexedDB에 못 들어간 줄이 거울에 남아 있으면 지금 넣는다 */
async function mergeMirror(id: string, have: Set<number>): Promise<Line[]> {
  let raw: string | null = null
  try {
    raw = localStorage.getItem(mirrorKey(id))
  } catch {
    return []
  }
  if (!raw) return []
  let pending: Line[] = []
  try {
    pending = JSON.parse(raw) as Line[]
  } catch {
    return []
  }
  const extra = pending.filter((l) => l.type !== 'session.header' && typeof l.seq === 'number' && !have.has(l.seq))
  if (extra.length && db) {
    await new Promise<void>((resolve) => {
      const t = db!.transaction('events', 'readwrite')
      const s = t.objectStore('events')
      for (const line of extra) s.add({ sid: id, seq: line.seq, line })
      t.oncomplete = () => resolve()
      t.onerror = () => resolve()
      t.onabort = () => resolve()
    })
  }
  // 넣은 줄은 거울에서 뺀다 — 같은 줄이 두 번 들어가지 않게. 현재 세션이면 아직 버퍼에 있는 줄만 남긴다
  try {
    if (id !== sid) localStorage.removeItem(mirrorKey(id))
    else mirror()
  } catch {
    /* 무시 */
  }
  return extra
}

/** 같은 seq가 둘 이상이면 첫 것만 — 저장소 경합이 있어도 로그는 한 줄씩 */
function dedupe(lines: Line[]): Line[] {
  const seen = new Set<number>()
  return lines.filter((l) => {
    if (typeof l.seq !== 'number') return true
    if (seen.has(l.seq)) return false
    seen.add(l.seq)
    return true
  })
}

async function linesOf(id: string): Promise<Line[]> {
  const rows = await tx<Array<{ seq: number; line: Line }>>('events', 'readonly', (s) => s.index('sid').getAll(id))
  const lines = rows.map((r) => r.line)
  lines.push(...(await mergeMirror(id, new Set(lines.map((l) => l.seq as number)))))
  const hdr = lines.filter((l) => l.type === 'session.header').slice(0, 1)
  const rest = dedupe(lines.filter((l) => l.type !== 'session.header').sort((a, b) => (a.seq as number) - (b.seq as number)))
  return [...hdr, ...rest]
}

/** 버퍼가 빌 때까지 flush — 진행 중인 tx 동안 쌓인 줄까지. 읽기 전에 반드시 */
async function drain(): Promise<void> {
  for (let i = 0; i < 20 && (buffer.length > 0 || flushing); i++) await flush()
}

/** 지금까지의 줄 전부 (IndexedDB + 버퍼), 헤더 먼저 · seq 순 */
export async function allLines(): Promise<Line[]> {
  await drain()
  return linesOf(sid)
}

export async function toJsonl(): Promise<string> {
  const lines = await allLines()
  return lines.map((l) => JSON.stringify(l)).join('\n') + '\n'
}

// ── 체류 · idle (§10-5)
//   활동 = 터치 이벤트 · 열린 구간(play · mic.span · text) 안
//   연속 활동 사이 Δ ≤ TAU → 그때의 state에 Δ를 더한다 (seg 1만 T_active에)
//   Δ > TAU (구간 밖) → idle {dur}, 체류에 넣지 않는다
export type Dwell = { mat: Record<string, number>; grid: Record<string, number>; gen: Record<string, number> }

let dwell: Dwell = emptyDwell()
let dwellSeg2: Dwell = emptyDwell()
let lastActivityT: number | null = null
let lastState: State | null = null
let lastSeg: Seg = -1
const openSpans = new Set<string>()
let transitions = { mat: 0, grid: 0, gen: 0 }
/** 복구 재생 중 — 체류만 다시 세고 idle은 새로 남기지 않는다(이미 로그에 있다) */
let replaying = false

function emptyDwell(): Dwell {
  return { mat: { blank: 0, sound: 0, image: 0 }, grid: { off: 0, on: 0 }, gen: { hand: 0, rule: 0, random: 0 } }
}

function resetDwell(): void {
  dwell = emptyDwell()
  dwellSeg2 = emptyDwell()
  lastActivityT = null
  lastState = null
  lastSeg = -1
  openSpans.clear()
  transitions = { mat: 0, grid: 0, gen: 0 }
}

function credit(target: Dwell, st: State, ms: number): void {
  target.mat[st.mat] = (target.mat[st.mat] ?? 0) + ms
  const g = st.grid ? 'on' : 'off'
  target.grid[g] = (target.grid[g] ?? 0) + ms
  target.gen[st.gen] = (target.gen[st.gen] ?? 0) + ms
}

/** 모든 로그 줄이 지나간다. 활동만 간격을 닫는다 */
function account(t: number, type: string, seg: Seg, state: State): void {
  if (type === 'idle') return
  // 구간 시작이 활동의 기준점 — 앞 구간 마지막 접촉부터의 간격은 이 구간의 정지가 아니다 (첫 정지 = seg.start → 첫 touch.down, §15)
  if (type === 'seg.start') lastActivityT = t
  // 전이 수 (구간 1 · 잠금 후보 판정 §11-1의 used)
  if (seg === 1 && lastSeg === 1 && lastState) {
    if (lastState.mat !== state.mat) transitions.mat++
    if (lastState.grid !== state.grid) transitions.grid++
    if (lastState.gen !== state.gen) transitions.gen++
  }
  const isActivity = type.startsWith('touch.')
  if (isActivity) {
    if (lastActivityT !== null && lastState !== null && lastSeg >= 1) {
      const gap = t - lastActivityT
      if (openSpans.size > 0 || gap <= TAU) {
        if (lastSeg === 1) credit(dwell, lastState, gap)
        else if (lastSeg === 2) credit(dwellSeg2, lastState, gap)
      } else if (!replaying) {
        // 재귀 방지 — 직접 밀어 넣는다
        const c = ctxProvider()
        buffer.push({ t, seq: seq++, type: 'idle', seg: c.seg, canvas: c.canvas, state: { ...c.state }, target_mat: null, dur: gap })
      }
    }
    lastActivityT = t
  }
  lastState = { ...state }
  lastSeg = seg
}

/** 구간 열림/닫힘 — play.start→stop · mic.span · text.open→commit|abort. 열린 동안은 정지가 아니다 (⑰) */
export function spanOpen(kind: string): void {
  openSpans.add(kind)
  lastActivityT = now()
}

export function spanClose(kind: string): void {
  openSpans.delete(kind)
  const t = now()
  if (lastActivityT !== null && lastState !== null && lastSeg >= 1) {
    const gap = t - lastActivityT
    if (lastSeg === 1) credit(dwell, lastState, gap)
    else if (lastSeg === 2) credit(dwellSeg2, lastState, gap)
  }
  lastActivityT = t
}

/** 구간 끝에서 마지막 간격을 닫는다 (Δ ≤ TAU면 체류, 아니면 idle) */
export function closeActivity(): void {
  const t = now()
  if (lastActivityT !== null && lastState !== null && lastSeg >= 1) {
    const gap = t - lastActivityT
    if (openSpans.size > 0 || gap <= TAU) {
      if (lastSeg === 1) credit(dwell, lastState, gap)
      else if (lastSeg === 2) credit(dwellSeg2, lastState, gap)
    } else {
      log('idle', { dur: gap })
    }
  }
  lastActivityT = t
}

export function getDwell(): { dwell: Dwell; T_active: number; transitions: typeof transitions } {
  const T_active = Object.values(dwell.mat).reduce((a, b) => a + b, 0)
  return { dwell: structuredClone(dwell), T_active, transitions: { ...transitions } }
}

// ── 복구 (§10-4) — 새로고침 시 IndexedDB에서 이어 붙인다
export interface Resumable {
  sid: string
  pid: string
  date: string
  header: Line
  events: Line[]
  lastSeq: number
  lastT: number
}

export async function findResumable(): Promise<Resumable | null> {
  db = db ?? (await openDb())
  const sessions = await tx<Array<{ sid: string; pid: string; date: string; wall: string; exported: boolean }>>(
    'sessions',
    'readonly',
    (s) => s.getAll(),
  )
  const today = localDate()
  const cands = sessions.filter((s) => !s.exported && s.date === today).sort((a, b) => (a.wall < b.wall ? 1 : -1))
  for (const c of cands) {
    const lines = await linesOf(c.sid)
    const hdr = lines.find((l) => l.type === 'session.header')
    const events = lines.filter((l) => l.type !== 'session.header')
    if (!hdr || events.length === 0) continue
    const last = events[events.length - 1] as Line
    return { sid: c.sid, pid: c.pid, date: c.date, header: hdr, events, lastSeq: last.seq as number, lastT: last.t as number }
  }
  return null
}

/** 복구 — sid · seq · t0(헤더 wall로) · 체류를 이벤트 재생으로 되살린다. 반환 = gap_ms */
export function resume(r: Resumable): number {
  sid = r.sid
  header = r.header
  seq = r.lastSeq + 1
  buffer.length = 0
  const wallMs = Date.parse(String(r.header.wall))
  t0 = performance.now() - (Date.now() - wallMs)
  resetDwell()
  snapSeq = r.events.filter((e) => e.type === 'snapshot').length
  replaying = true
  for (const e of r.events) {
    const st = e.state as State | undefined
    if (st) account(e.t as number, String(e.type), e.seg as Seg, st)
  }
  replaying = false
  bindListeners()
  return now() - r.lastT
}

// ── 오디오 청크 (마이크 녹음 트랙 §9) — 세션과 같은 DB에 append
export function audioAppend(chunk: Blob, part: number): Promise<IDBValidKey> {
  return tx('audio', 'readwrite', (s) => s.add({ sid, part, chunk }))
}

export async function audioChunks(): Promise<Array<{ part: number; chunk: Blob }>> {
  const rows = await tx<Array<{ part: number; chunk: Blob }>>('audio', 'readonly', (s) => s.index('sid').getAll(sid))
  return rows.map((r) => ({ part: r.part ?? 1, chunk: r.chunk }))
}

// ── 내보내기 (§10-4)
export interface ExportResult {
  ok: boolean
  method: 'share' | 'download' | 'none'
  files: string[]
  error?: string
}

/** share 우선, 없으면 다운로드(개발용). 실패해도 IndexedDB에는 그대로 남는다 */
/** 파일 이름은 sid — `P07_2026-09-30.jsonl` · 같은 날 재시작이면 `P07_2026-09-30_2.jsonl` */
export async function exportSession(audio: Array<{ blob: Blob; ext: string; part: number }>): Promise<ExportResult> {
  await drain()
  const text = await toJsonl()
  const files = [new File([text], `${sid}.jsonl`, { type: 'application/x-ndjson' })]
  for (const a of audio) {
    if (a.blob.size === 0) continue
    const suffix = a.part > 1 ? `.${a.part}` : ''
    files.push(new File([a.blob], `${sid}.audio${suffix}.${a.ext}`, { type: a.blob.type }))
  }
  const names = files.map((f) => f.name)
  const nav = navigator as Navigator & { share?: Navigator['share']; canShare?: Navigator['canShare'] }
  const canShare = typeof nav.share === 'function' && typeof nav.canShare === 'function' && nav.canShare({ files })
  let result: ExportResult
  try {
    if (canShare) {
      await nav.share({ files })
      result = { ok: true, method: 'share', files: names }
    } else {
      for (const file of files) {
        const url = URL.createObjectURL(file)
        const a = document.createElement('a')
        a.href = url
        a.download = file.name
        document.body.appendChild(a)
        a.click()
        a.remove()
        setTimeout(() => URL.revokeObjectURL(url), 10_000)
      }
      result = { ok: true, method: 'download', files: names }
    }
  } catch (e) {
    result = { ok: false, method: canShare ? 'share' : 'download', files: names, error: e instanceof Error ? e.message : String(e) }
  }
  if (result.ok) {
    const rec = (await tx<{ sid: string } | undefined>('sessions', 'readonly', (s) => s.get(sid))) ?? { sid }
    await tx('sessions', 'readwrite', (s) => s.put({ ...rec, exported: true, exportedAt: new Date().toISOString() }))
  }
  return result
}
