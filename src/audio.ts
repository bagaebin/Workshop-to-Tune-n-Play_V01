/**
 * audio.ts — 오디오 (SPEC §8)
 *
 * note → scheduler → voice[VOICES] → master(리미터) → destination
 * voice: Oscillator(sawtooth) → BiquadFilter(lowpass LPF_HZ, Q 0.7) → Gain(ADSR × vel)
 * 악기는 하나뿐(N3). 손 노트는 즉시, 재생·규칙 열은 스케줄(3단계).
 */
import { VOICES, ENV, LPF_HZ, LEN_DEFAULT } from './constants'
import { hzOf } from './layout'
import type { Vals } from './model'

let ctx: AudioContext | null = null
let master: DynamicsCompressorNode | null = null
let masterTap: AnalyserNode | null = null
let tapBuf: Float32Array<ArrayBuffer> | null = null

interface Voice {
  osc: OscillatorNode
  gain: GainNode
  startedAt: number
  released: boolean
}

const active: Voice[] = []

export function ensure(): AudioContext {
  if (ctx) return ctx
  ctx = new AudioContext({ latencyHint: 'interactive' })
  master = ctx.createDynamicsCompressor()
  master.threshold.value = -6
  master.knee.value = 6
  master.ratio.value = 12
  master.attack.value = 0.003
  master.release.value = 0.1
  master.connect(ctx.destination)
  masterTap = ctx.createAnalyser()
  masterTap.fftSize = 1024
  master.connect(masterTap)
  tapBuf = new Float32Array(masterTap.fftSize)
  return ctx
}

/** 마스터 출력 RMS — 마이크 게이트(§9)가 본다. 신디가 나는 동안 입력 채널을 닫는다 */
export function outputRms(): number {
  if (!masterTap || !tapBuf) return 0
  masterTap.getFloatTimeDomainData(tapBuf)
  let sum = 0
  for (let i = 0; i < tapBuf.length; i++) sum += (tapBuf[i] as number) ** 2
  return Math.sqrt(sum / tapBuf.length)
}

export async function resume(): Promise<void> {
  const c = ensure()
  if (c.state !== 'running') await c.resume()
}

/** 준비 화면에서 무음 버퍼 1회 — 컨텍스트 워밍 */
export function warm(): void {
  const c = ensure()
  const buf = c.createBuffer(1, 1, c.sampleRate)
  const src = c.createBufferSource()
  src.buffer = buf
  src.connect(c.destination)
  src.start()
}

export function currentTime(): number {
  return ensure().currentTime
}

export interface Handle {
  off: (when?: number) => void
}

function reclaim(): void {
  while (active.length >= VOICES) {
    const v = active.shift()
    if (v) hardStop(v)
  }
}

function hardStop(v: Voice): void {
  try {
    v.gain.gain.cancelScheduledValues(0)
    v.gain.gain.setValueAtTime(v.gain.gain.value, ctx!.currentTime)
    v.gain.gain.linearRampToValueAtTime(0, ctx!.currentTime + 0.005)
    v.osc.stop(ctx!.currentTime + 0.01)
  } catch {
    /* 이미 멈춤 */
  }
}

/** 소리 시작. 길이를 모를 때(누르기·끌기 중) 쓰고, 뗄 때 off */
export function noteOn(v: { pitch: number; vel: number; tone: number }, when = currentTime()): Handle {
  const c = ensure()
  reclaim()
  const osc = c.createOscillator()
  osc.type = 'sawtooth'
  osc.frequency.setValueAtTime(hzOf(v.pitch), when)
  const filt = c.createBiquadFilter()
  filt.type = 'lowpass'
  filt.Q.value = 0.7
  filt.frequency.value = LPF_HZ // tone 상수 (⑭ 보류)
  const gain = c.createGain()
  const peak = 0.25 * v.vel
  const a = ENV.a / 1000
  const d = ENV.d / 1000
  gain.gain.setValueAtTime(0, when)
  gain.gain.linearRampToValueAtTime(peak, when + a)
  gain.gain.linearRampToValueAtTime(peak * ENV.s, when + a + d)
  osc.connect(filt).connect(gain).connect(master!)
  osc.start(when)
  const voice: Voice = { osc, gain, startedAt: when, released: false }
  active.push(voice)
  return {
    off: (at = currentTime()) => {
      if (voice.released) return
      voice.released = true
      const t = Math.max(at, when + a)
      const r = ENV.r / 1000
      gain.gain.cancelScheduledValues(t)
      gain.gain.setValueAtTime(gain.gain.value, t)
      gain.gain.linearRampToValueAtTime(0, t + r)
      osc.stop(t + r + 0.02)
      osc.onended = () => {
        const i = active.indexOf(voice)
        if (i >= 0) active.splice(i, 1)
        osc.disconnect()
      }
    },
  }
}

/** 길이를 아는 노트 1회 발음 (탭 · 스케줄) */
export function play(v: Vals, when = currentTime()): void {
  const h = noteOn(v, when)
  h.off(when + Math.max(v.len, LEN_DEFAULT / 4) / 1000)
}
