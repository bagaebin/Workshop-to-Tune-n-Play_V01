/**
 * preview.ts — 미리보기 (SPEC §12) — 절단 후보 #3
 *
 * 좌 6 · 서랍 3 슬롯 안 미니 캔버스. 무음. 루프 PREVIEW_LOOP. 손가락·경로 없음, 결과만.
 * 아홉의 길이와 움직임의 양을 같은 곡선(appear)으로 묶는다(K2). 난수는 시드 hash(seed, loopIndex)로 매 루프 다르게.
 * 절단 시 phase를 고정값(PREVIEW_STATIC_PHASE)으로 — 정지 프레임 한 장.
 */
import { PREVIEW_LOOP } from './constants'
import { hashSeed, mulberry32, type Rect } from './layout'

export const PREVIEW_INSET = 14
export const PREVIEW_STATIC_PHASE = 0.6

const INK = 'rgba(220,220,220,'
const DOT = 3.2

/** 0→1 나타남 · 유지 · 사라짐 — 아홉이 같은 곡선 */
function appear(phase: number): number {
  if (phase < 0.2) return phase / 0.2
  if (phase < 0.85) return 1
  return Math.max(0, (1 - phase) / 0.15)
}

/** 순서대로 하나씩 — i번째가 보이는 정도 */
function stagger(phase: number, i: number, n: number): number {
  const t0 = 0.1 + (i / n) * 0.5
  if (phase < t0) return 0
  if (phase > 0.85) return appear(phase)
  return Math.min(1, (phase - t0) / 0.08)
}

function dot(ctx: CanvasRenderingContext2D, x: number, y: number, a: number): void {
  if (a <= 0) return
  ctx.fillStyle = `${INK}${a})`
  ctx.beginPath()
  ctx.arc(x, y, DOT, 0, Math.PI * 2)
  ctx.fill()
}

export function phaseNow(perfNow: number): number {
  return (perfNow % PREVIEW_LOOP) / PREVIEW_LOOP
}

export function loopIndex(perfNow: number): number {
  return Math.floor(perfNow / PREVIEW_LOOP)
}

/**
 * name — grid · gen.hand · gen.rule · gen.random · play · all · mat.blank · mat.sound · mat.image
 * chips — mat.blank에 칩이 있으면 칩을 대신 보인다(4단계)
 */
export function drawPreview(ctx: CanvasRenderingContext2D, slot: Rect, name: string, phase: number, seed: string, loop: number, chips = 0): void {
  const r: Rect = { x: slot.x + PREVIEW_INSET, y: slot.y + PREVIEW_INSET, w: slot.w - PREVIEW_INSET * 2, h: slot.h - PREVIEW_INSET * 2 }
  const a = appear(phase)
  ctx.save()
  ctx.beginPath()
  ctx.rect(r.x, r.y, r.w, r.h)
  ctx.clip()
  switch (name) {
    case 'grid': {
      ctx.strokeStyle = `${INK}${0.6 * a})`
      ctx.lineWidth = 1
      ctx.beginPath()
      for (let i = 1; i < 4; i++) {
        const x = r.x + (r.w * i) / 4
        const y = r.y + (r.h * i) / 4
        ctx.moveTo(x, r.y)
        ctx.lineTo(x, r.y + r.h)
        ctx.moveTo(r.x, y)
        ctx.lineTo(r.x + r.w, y)
      }
      ctx.stroke()
      break
    }
    case 'gen.hand':
      dot(ctx, r.x + r.w * 0.35, r.y + r.h * 0.5, a)
      break
    case 'gen.rule': {
      const n = 5
      for (let i = 0; i < n; i++) dot(ctx, r.x + r.w * (0.1 + (0.8 * i) / (n - 1)), r.y + r.h * 0.5, stagger(phase, i, n))
      break
    }
    case 'gen.random': {
      const n = 5
      const rnd = mulberry32(hashSeed(`${seed}:preview:${loop}`))
      for (let i = 0; i < n; i++) {
        const jx = (rnd() - 0.5) * 0.12
        const jy = (rnd() - 0.5) * 0.7
        dot(ctx, r.x + r.w * (0.1 + (0.8 * i) / (n - 1) + jx), r.y + r.h * (0.5 + jy), stagger(phase, i, n))
      }
      break
    }
    case 'play': {
      const pts = [0.15, 0.4, 0.62, 0.85]
      const ys = [0.35, 0.65, 0.45, 0.6]
      const headX = phase < 0.85 ? phase / 0.85 : 1
      pts.forEach((px, i) => dot(ctx, r.x + r.w * px, r.y + r.h * (ys[i] ?? 0.5), (px <= headX ? 1 : 0.3) * (phase > 0.85 ? a : 1)))
      if (phase < 0.85) {
        ctx.strokeStyle = `${INK}0.9)`
        ctx.lineWidth = 1.5
        ctx.beginPath()
        ctx.moveTo(r.x + r.w * headX, r.y)
        ctx.lineTo(r.x + r.w * headX, r.y + r.h)
        ctx.stroke()
      }
      break
    }
    case 'all': {
      const pts: Array<[number, number]> = [[0.2, 0.3], [0.5, 0.7], [0.75, 0.25], [0.35, 0.6], [0.85, 0.65]]
      const on = phase > 0.4 ? 1 : 0.3
      for (const [px, py] of pts) dot(ctx, r.x + r.w * px, r.y + r.h * py, on * (phase > 0.85 ? a : 1))
      break
    }
    case 'mat.blank': {
      if (chips > 0) {
        ctx.fillStyle = `${INK}0.8)`
        for (let i = 0; i < Math.min(chips, 3); i++) ctx.fillRect(r.x + 4, r.y + 8 + i * 22, r.w - 8, 12)
        break
      }
      const blink = Math.floor(phase * 6) % 2 === 0
      const cx = r.x + r.w * 0.25
      if (blink) {
        ctx.fillStyle = `${INK}0.9)`
        ctx.fillRect(cx, r.y + r.h * 0.3, 2, r.h * 0.4)
      }
      const stroke = Math.min(1, Math.max(0, (phase - 0.3) / 0.4))
      if (stroke > 0) {
        ctx.strokeStyle = `${INK}${0.9 * (phase > 0.85 ? a : 1)})`
        ctx.lineWidth = 2
        ctx.beginPath()
        ctx.moveTo(cx + 8, r.y + r.h * 0.5)
        ctx.lineTo(cx + 8 + r.w * 0.5 * stroke, r.y + r.h * 0.5)
        ctx.stroke()
      }
      break
    }
    case 'mat.sound': {
      const pts: Array<[number, number]> = [[0.3, 0.5], [0.42, 0.42], [0.54, 0.58], [0.66, 0.46], [0.78, 0.52]]
      for (const [px, py] of pts) dot(ctx, r.x + r.w * px, r.y + r.h * py, a)
      break
    }
    case 'mat.image': {
      ctx.strokeStyle = `${INK}${0.9 * a})`
      ctx.lineWidth = 2
      ctx.strokeRect(r.x + r.w * 0.2, r.y + r.h * 0.3, r.w * 0.6, r.h * 0.4)
      break
    }
    default:
      break
  }
  ctx.restore()
}
