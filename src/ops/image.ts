/**
 * ops/image.ts — 이미지 손잡이 (기능 명세 V1.0 §3 · §3-2 · SPEC §6-8) — 크기 조정은 절단 후보 #2
 *
 * 몸통 끌기 = 옮기기(선택돼 있지 않아도) · 작업 면 밖에서 뗌 = 제거   → image.move · image.remove
 * 놓거나 옮기면 선택 → 네 모서리에 손잡이(HANDLE). 다른 곳을 닿으면 풀린다 → image.select {id, img, on}
 * 몸통 탭 · 누르기 = 그 위에 노트 (D4 — session.ts)                   → image.touch + note.add
 * 이미지 선택은 하나뿐. 복수 선택 · 「전체」에 들어가지 않는다 (09.30 결정)
 * 모서리 끌기 = 크기. 3:2 고정, [IMG_MIN, IMG_MAX], 맞은편 모서리 고정  → image.size {corner}
 * 끌기 중 실시간, 뗄 때 한 번 기록 (노트 고치기와 같은 방식).
 */
import { IMG_MIN, IMG_MAX } from '../constants'
import { clamp, type Corner } from '../layout'
import type { Canvas, Image } from '../model'
import * as log from '../log'

export interface ImageEdit {
  id: string
  kind: 'move' | 'size'
  corner: Corner | null
  prev: { x: number; y: number; w: number; h: number }
}

export function begin(cv: Canvas, id: string, kind: 'move' | 'size', corner: Corner | null = null): ImageEdit | null {
  const im = cv.images.find((i) => i.id === id)
  if (!im) return null
  return { id, kind, corner: kind === 'size' ? (corner ?? 'se') : null, prev: { x: im.x, y: im.y, w: im.w, h: im.h } }
}

export function apply(cv: Canvas, e: ImageEdit, dx: number, dy: number): void {
  const im = cv.images.find((i) => i.id === e.id)
  if (!im) return
  if (e.kind === 'move') {
    im.x = Math.round(e.prev.x + dx)
    im.y = Math.round(e.prev.y + dy)
    return
  }
  const c = e.corner ?? 'se'
  const west = c === 'nw' || c === 'sw'
  const north = c === 'nw' || c === 'ne'
  // 가로 이동량이 크기를 정한다 — 바깥으로 끌면 커진다. 맞은편 모서리는 그 자리에
  const w = Math.round(clamp(e.prev.w + (west ? -dx : dx), IMG_MIN.w, IMG_MAX.w))
  const h = Math.round(w / 1.5)
  im.w = w
  im.h = h
  im.x = west ? e.prev.x + e.prev.w - w : e.prev.x
  im.y = north ? e.prev.y + e.prev.h - h : e.prev.y
}

export function cancel(cv: Canvas, e: ImageEdit): void {
  const im = cv.images.find((i) => i.id === e.id)
  if (im) Object.assign(im, e.prev)
}

const fields = (im: Image) => ({ id: im.id, img: im.img, x: im.x, y: im.y, w: im.w, h: im.h })

export function commit(cv: Canvas, e: ImageEdit): boolean {
  const im = cv.images.find((i) => i.id === e.id)
  if (!im) return false
  const changed = im.x !== e.prev.x || im.y !== e.prev.y || im.w !== e.prev.w || im.h !== e.prev.h
  if (!changed) return false
  if (e.kind === 'move') log.log('image.move', fields(im), 'image')
  else log.log('image.size', { ...fields(im), corner: e.corner }, 'image')
  return true
}

/** 옮기기 끌기를 면 밖에서 뗌 — 제거. 되돌린 자리를 기록한다 */
export function remove(cv: Canvas, e: ImageEdit): void {
  cancel(cv, e)
  const im = cv.images.find((i) => i.id === e.id)
  if (!im) return
  cv.images = cv.images.filter((i) => i.id !== e.id)
  log.log('image.remove', fields(im), 'image')
}

/** 선택 · 해제 — 손잡이가 보이고 사라진다 */
export function select(im: Image, on: boolean): void {
  log.log('image.select', { id: im.id, img: im.img, on }, 'image')
}
