/**
 * ops/material.ts — 재료 열람과 채택 (SPEC §6-6 · §13)
 *
 * mat.sound  탭 = 열람(1회 재생, mat.peek) · 면으로 끌어 놓기 = 채택(첫 이벤트가 놓은 자리) → mat.adopt(상태가 바뀔 때만) + note.add src:material
 * mat.image  탭 = 이미지 패널(mat.peek) · 패널의 장을 끌어 놓기 → mat.adopt(상태가 바뀔 때만) + image.place
 * mat.blank  탭 = 적기 (4단계)
 * 재료는 빌드에 번들된다 — 서비스 워커가 함께 프리캐시한다. 실물 교체는 파일만 (T11).
 */
import { L, IMG_DEFAULT, VEL_FIXED, TONE_FIXED } from '../constants'
import { onOfX, pitchOfY, clamp, SURFACE } from '../layout'
import { nextId, type Canvas, type Image, type Note, type State, type Vals } from '../model'
import * as audio from '../audio'
import * as log from '../log'
import * as scope from './scope'
import soundMaterial from '../../materials/sound.json'

const SOUND: Vals[] = (soundMaterial as { vals: Vals[] }).vals

const imageUrls = import.meta.glob('../../materials/img/*.png', { eager: true, query: '?url', import: 'default' }) as Record<string, string>

export const IMAGES = new Map<string, HTMLImageElement>()

/** 첫 페인트 전에 디코드해 둔다 — 로딩 없음 (N1) */
export async function preload(): Promise<void> {
  const jobs: Promise<void>[] = []
  for (const [path, url] of Object.entries(imageUrls)) {
    const name = path.split('/').pop()?.replace(/\.png$/, '') ?? path
    const img = new Image()
    img.src = url
    IMAGES.set(name, img)
    jobs.push(img.decode().catch(() => undefined))
  }
  await Promise.all(jobs)
}

export function soundDuration(): number {
  return SOUND.reduce((m, v) => Math.max(m, v.on + v.len), 0)
}

/** 열람 — 재료 열을 지금부터 1회 재생. 놓이지 않는다 */
export function peekSound(): void {
  const now = audio.currentTime()
  for (const v of SOUND) audio.play(v, now + v.on / 1000)
  log.log('mat.peek', { mat: 'sound', dur: soundDuration() }, 'sound')
}

export function peekImage(): void {
  log.log('mat.peek', { mat: 'image' }, 'image')
}

/** 채택 — 첫 이벤트가 놓은 (x, y)에 오도록 열 전체 배치. 상대 음고를 유지한다. L을 넘는 이벤트는 버린다 */
export function adoptSound(cv: Canvas, state: State, x: number, y: number): Note[] {
  const first = SOUND[0]
  if (!first) return []
  const baseOn = onOfX(x)
  const basePitch = pitchOfY(y)
  const placed: Note[] = []
  let truncated = 0
  for (const v of SOUND) {
    const on = Math.round(baseOn + v.on)
    if (on >= L) {
      truncated++
      continue
    }
    placed.push({
      id: nextId('n'),
      on,
      pitch: Math.round(clamp(basePitch + (v.pitch - first.pitch), 0, 1) * 1000) / 1000,
      len: v.len,
      vel: VEL_FIXED,
      tone: TONE_FIXED,
      src: 'material',
      mat: 'sound',
    })
  }
  if (cv.mat !== 'sound') {
    cv.mat = 'sound'
    state.mat = 'sound'
    log.log('mat.adopt', { mat: 'sound', x: Math.round(x), y: Math.round(y) }, 'sound')
  }
  cv.notes.push(...placed)
  const vals = placed.map(({ on, pitch, len, vel, tone }) => ({ on, pitch, len, vel, tone }))
  log.log('note.add', { ids: placed.map((n) => n.id), count: placed.length, src: 'material', vals, scope: placed.length === 1 ? 'one' : 'many', truncated: truncated || undefined }, 'sound')
  // 놓은 열이 선택 — 바로 옮기거나 버릴 수 있다. 놓는 즉시 1회 들린다
  cv.selection = new Set(placed.map((n) => n.id))
  cv.allOn = false
  log.log('scope.set', { scope: scope.scopeOf(cv), count: cv.selection.size, ids: [...cv.selection] })
  const now = audio.currentTime()
  for (const n of placed) audio.play(n, now + (n.on - (placed[0]?.on ?? 0)) / 1000)
  return placed
}

/** 패널의 장을 면에 놓기 — 놓은 자리 중심, IMG_DEFAULT. 작업 면 안으로 밀어 넣는다 */
export function placeImage(cv: Canvas, state: State, img: string, x: number, y: number): Image {
  const w = IMG_DEFAULT.w
  const h = IMG_DEFAULT.h
  const im: Image = {
    id: nextId('g'),
    img,
    x: Math.round(clamp(x - w / 2, SURFACE.x, SURFACE.x + SURFACE.w - w)),
    y: Math.round(clamp(y - h / 2, SURFACE.y, SURFACE.y + SURFACE.h - h)),
    w,
    h,
  }
  if (cv.mat !== 'image') {
    cv.mat = 'image'
    state.mat = 'image'
    log.log('mat.adopt', { mat: 'image', x: Math.round(x), y: Math.round(y) }, 'image')
  }
  cv.images.push(im)
  log.log('image.place', { id: im.id, img: im.img, x: im.x, y: im.y, w: im.w, h: im.h }, 'image')
  return im
}

/** 이미지 몸통 접촉 — 노트 조작과 별개로 이미지 내부 좌표(0–1)를 남긴다 (D4) */
export function imageTouch(im: Image, x: number, y: number): void {
  const u = Math.round(((x - im.x) / im.w) * 1000) / 1000
  const v = Math.round(((y - im.y) / im.h) * 1000) / 1000
  log.log('image.touch', { id: im.id, img: im.img, u: clamp(u, 0, 1), v: clamp(v, 0, 1) }, 'image')
}
