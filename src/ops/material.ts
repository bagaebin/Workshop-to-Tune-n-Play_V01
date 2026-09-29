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

/**
 * 소리 재료 실물 — materials/sound.json (T11 · 09.29 교체). 참여자에게 보이는 소리 재료는 이것 하나뿐이다.
 * on은 첫 이벤트 0 기준 상대 ms · pitch는 0.5 + 반음/48 이라 첫 음과의 음정만 의미가 있다 · vel·tone 0.5 고정.
 *
 * 예비안 — 개발자 상수로만 둔다. 화면에 노출하거나 런타임에 바꾸지 않는다. 쓰려면 sound.json을 갈아끼우고 다시 빌드한다.
 *   예비 1 — S2 (두 덩어리)
 *   on  [0,110,230,1600,1760,2050]  pitch [0.5,0.4792,0.5625,0.6875,0.6042,0.5833]  len [90,90,400,140,160,700]
 *   예비 2 — G4
 *   on  [0,950,1370,1610,2210,2390] pitch [0.5,0.625,0.6875,0.7083,0.5625,0.5208]  len [930,300,220,150,160,800]
 */
const SOUND: Vals[] = (soundMaterial as { vals: Vals[] }).vals

const imageUrls = import.meta.glob('../../materials/img/*.png', { eager: true, query: '?url', import: 'default' }) as Record<string, string>

export const IMAGES = new Map<string, HTMLImageElement>()

let readyPromise: Promise<void> | null = null

/** 다섯 장을 디코드해 둔다 — 로딩 없음 (N1). 참여자가 보는 첫 화면(플래시) 전에 반드시 끝나야 하므로 session.start·tryResume이 ready()를 기다린다 */
export function preload(): Promise<void> {
  if (readyPromise) return readyPromise
  readyPromise = (async () => {
    const jobs: Promise<void>[] = []
    for (const [path, url] of Object.entries(imageUrls)) {
      const name = path.split('/').pop()?.replace(/\.png$/, '') ?? path
      const img = new Image()
      img.decoding = 'sync'
      img.alt = '' // 화면에 이름·설명을 두지 않는다 (§4 — 캔버스에만 그리므로 DOM에 붙지도 않는다)
      img.src = url
      IMAGES.set(name, img)
      jobs.push(img.decode().catch(() => undefined))
    }
    await Promise.all(jobs)
  })()
  return readyPromise
}

export function ready(): Promise<void> {
  return preload()
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
      pitch: Math.round(clamp(basePitch + (v.pitch - first.pitch), 0, 1) * 10000) / 10000, // 넷째 자리 — 원본 음정(반음/48 = 0.0208…)을 그대로 보존
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
