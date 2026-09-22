/**
 * mic.ts — 마이크 (SPEC §9)
 *
 * 2단계 — 권한(준비 화면) · 레벨 미터 · 임계(헤더 mic_threshold) · MediaRecorder 녹음 트랙(세션 전체, 게이트와 무관).
 * 입력 채널(온셋 · 피치 → src:mic 노트 · 게이트)은 4단계 — 절단 후보 #1.
 * 청크는 timeslice마다 IndexedDB `audio`에 append(R-003) — 새로고침에도 앞부분이 남는다. 녹음기를 다시 시작하면 part가 는다.
 */
import { MIC_THR, MIC_ON, MIC_OFF, MIC_SPAN_END, MIC_F0_LO, MIC_F0_HI, MIC_VEL_MIN, MIC_POLL_MS, MIDI_LO, MIDI_RANGE } from './constants'
import * as audio from './audio'
import * as log from './log'

let stream: MediaStream | null = null
let analyser: AnalyserNode | null = null
let recorder: MediaRecorder | null = null
let level = 0
let threshold = MIC_THR
let part = 0
let meterTimer: number | null = null
let buf: Float32Array<ArrayBuffer> | null = null

export function hasPermission(): boolean {
  return stream !== null
}

export function isRecording(): boolean {
  return recorder?.state === 'recording'
}

export function getLevel(): number {
  return level
}

export function getThreshold(): number {
  return threshold
}

export function setThreshold(v: number): void {
  threshold = v
}

/** 브라우저가 줄 MIME. Safari audio/mp4 · Chrome audio/webm */
export function mimeType(): string | null {
  if (recorder) return recorder.mimeType || null
  if (typeof MediaRecorder === 'undefined') return null
  for (const m of ['audio/mp4', 'audio/webm;codecs=opus', 'audio/webm']) {
    if (MediaRecorder.isTypeSupported(m)) return m
  }
  return ''
}

export function extOf(mime: string | null): string {
  if (!mime) return 'bin'
  if (mime.includes('mp4')) return 'm4a'
  if (mime.includes('webm')) return 'webm'
  if (mime.includes('ogg')) return 'ogg'
  return 'bin'
}

/** 준비 화면에서 진행자가 누른다. 참여자 앞에서 권한 창이 뜨면 N1 위반 */
export async function requestPermission(): Promise<{ ok: boolean; error?: string }> {
  if (stream) return { ok: true }
  try {
    stream = await navigator.mediaDevices.getUserMedia({
      audio: { echoCancellation: true, noiseSuppression: false, autoGainControl: false },
    })
  } catch (e) {
    return { ok: false, error: e instanceof Error ? `${e.name}: ${e.message}` : String(e) }
  }
  const ctx = audio.ensure()
  const src = ctx.createMediaStreamSource(stream)
  analyser = ctx.createAnalyser()
  analyser.fftSize = 4096 // 피치 추정 창 ≈ 93 ms @44.1k
  src.connect(analyser) // destination에는 붙이지 않는다 — 되울림 방지
  buf = new Float32Array(analyser.fftSize)
  if (meterTimer === null) meterTimer = window.setInterval(poll, MIC_POLL_MS)
  return { ok: true }
}

function poll(): void {
  if (!analyser || !buf) return
  analyser.getFloatTimeDomainData(buf)
  let sum = 0
  for (let i = 0; i < buf.length; i++) sum += (buf[i] as number) ** 2
  level = Math.sqrt(sum / buf.length)
  if (input) stepInput(performance.now())
}

// ── 입력 채널 (§9 · ⑯) — 절단 후보 #1
//   RMS > THR 이 MIC_ON 지속 → 온셋 (span 없으면 span 시작) · 온셋 후 첫 50 ms의 f0 중앙값 → pitch (E2–E6 클램프)
//   RMS < THR 이 MIC_OFF 지속 → 노트 끝. len = 지속, vel = 피크 RMS 정규화 (0.2–1)
//   MIC_SPAN_END 무음 → span 끝. 게이트 — 마스터 출력 RMS ≥ 임계 동안 입력 닫힘

export interface MicNote {
  /** 온셋 시각 (performance.now) */
  onsetAt: number
  pitch: number
  len: number
  vel: number
}

export interface InputHooks {
  onNote(n: MicNote): void
  onSpanStart(at: number): void
  onSpanEnd(at: number, n: number, gatedMs: number): void
  onGate(on: boolean): void
}

interface InputState {
  hooks: InputHooks
  above: number | null // RMS가 임계 위로 올라간 시각
  below: number | null
  note: { onsetAt: number; f0: number[]; peak: number } | null
  span: { startAt: number; n: number; gatedMs: number; lastSoundAt: number } | null
  gated: boolean
  gateSince: number
  lastPoll: number
}

let input: InputState | null = null

export function startInput(hooks: InputHooks): boolean {
  if (!analyser) return false
  input = { hooks, above: null, below: null, note: null, span: null, gated: false, gateSince: 0, lastPoll: performance.now() }
  return true
}

export function stopInput(): void {
  if (input?.span) closeSpan(performance.now())
  input = null
}

export function isInputOn(): boolean {
  return input !== null
}

function closeSpan(now: number): void {
  if (!input?.span) return
  const s = input.span
  if (input.gated) s.gatedMs += now - input.gateSince
  input.hooks.onSpanEnd(now, s.n, Math.round(s.gatedMs))
  input.span = null
}

function stepInput(now: number): void {
  if (!input) return
  const st = input
  const dt = now - st.lastPoll
  st.lastPoll = now
  // 게이트 — 신디가 나는 동안 닫힘. 녹음 트랙과 무관
  const gate = audio.outputRms() >= threshold
  if (gate !== st.gated) {
    if (st.gated && st.span) st.span.gatedMs += now - st.gateSince
    st.gated = gate
    st.gateSince = now
    st.hooks.onGate(gate)
    if (gate) {
      st.above = null
      st.note = null
    }
  }
  if (st.gated) {
    if (st.span && now - st.span.lastSoundAt >= MIC_SPAN_END) closeSpan(now)
    return
  }
  const loud = level > threshold
  if (loud) {
    st.below = null
    if (st.above === null) st.above = now
    if (!st.note && now - st.above >= MIC_ON) {
      st.note = { onsetAt: st.above, f0: [], peak: level }
      if (!st.span) {
        st.span = { startAt: st.above, n: 0, gatedMs: 0, lastSoundAt: now }
        st.hooks.onSpanStart(st.above)
      }
    }
    if (st.note) {
      st.note.peak = Math.max(st.note.peak, level)
      if (now - st.note.onsetAt <= 50 + dt && buf) {
        const f = estimateF0(buf, audio.ensure().sampleRate)
        if (f) st.note.f0.push(f)
      }
      if (st.span) st.span.lastSoundAt = now
    }
  } else {
    st.above = null
    if (st.below === null) st.below = now
    if (st.note && now - st.below >= MIC_OFF) {
      const n = st.note
      st.note = null
      const f0 = median(n.f0)
      const midi = f0 ? 69 + 12 * Math.log2(f0 / 440) : MIDI_LO + MIDI_RANGE / 2
      const pitch = Math.min(1, Math.max(0, (midi - MIDI_LO) / MIDI_RANGE))
      const len = Math.max(1, Math.round(st.below - n.onsetAt))
      const vel = Math.min(1, Math.max(MIC_VEL_MIN, MIC_VEL_MIN + (n.peak / 0.3) * (1 - MIC_VEL_MIN)))
      if (st.span) st.span.n++
      st.hooks.onNote({ onsetAt: n.onsetAt, pitch: Math.round(pitch * 1000) / 1000, len, vel: Math.round(vel * 100) / 100 })
    }
    if (st.span && now - st.span.lastSoundAt >= MIC_SPAN_END) closeSpan(now)
  }
}

function median(xs: number[]): number | null {
  if (xs.length === 0) return null
  const s = [...xs].sort((a, b) => a - b)
  return s[Math.floor(s.length / 2)] as number
}

/** 자기상관 f0 — E2–E6 범위의 lag에서 정규화 상관 최대. 약하면 null */
function estimateF0(x: Float32Array, sr: number): number | null {
  const minLag = Math.floor(sr / MIC_F0_HI)
  const maxLag = Math.min(x.length - 1, Math.ceil(sr / MIC_F0_LO))
  let e0 = 0
  for (let i = 0; i < x.length; i++) e0 += (x[i] as number) ** 2
  if (e0 < 1e-6) return null
  let bestLag = 0
  let best = 0
  for (let lag = minLag; lag <= maxLag; lag++) {
    let sum = 0
    for (let i = 0; i + lag < x.length; i++) sum += (x[i] as number) * (x[i + lag] as number)
    const r = sum / e0
    if (r > best) {
      best = r
      bestLag = lag
    }
  }
  if (best < 0.3 || bestLag === 0) return null
  return sr / bestLag
}

/** 녹음 시작 — 플래시와 함께. timeslice 1 s */
export function startRecording(): boolean {
  if (!stream || typeof MediaRecorder === 'undefined') return false
  if (recorder && recorder.state !== 'inactive') return true
  const mime = mimeType()
  try {
    recorder = mime ? new MediaRecorder(stream, { mimeType: mime }) : new MediaRecorder(stream)
  } catch {
    recorder = new MediaRecorder(stream)
  }
  part += 1
  const thisPart = part
  recorder.ondataavailable = (e) => {
    if (e.data && e.data.size > 0) void log.audioAppend(e.data, thisPart)
  }
  recorder.start(1000)
  return true
}

export function stopRecording(): Promise<void> {
  const r = recorder
  if (!r || r.state === 'inactive') return Promise.resolve()
  return new Promise((resolve) => {
    r.onstop = () => resolve()
    r.stop()
  })
}

/** 내보낼 파일들 — part마다 하나. 새로고침 없이 끝났으면 하나다 */
export async function exportBlobs(): Promise<Array<{ blob: Blob; ext: string; part: number }>> {
  const rows = await log.audioChunks()
  const byPart = new Map<number, Blob[]>()
  for (const r of rows) {
    const arr = byPart.get(r.part) ?? []
    arr.push(r.chunk)
    byPart.set(r.part, arr)
  }
  const mime = mimeType() || 'application/octet-stream'
  return [...byPart.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([p, chunks]) => ({ blob: new Blob(chunks, { type: mime }), ext: extOf(mime), part: p }))
}

/** 복구 뒤 — 새 part로 이어 녹음한다 */
export function resumeRecording(existingParts: number): void {
  part = Math.max(part, existingParts)
}
