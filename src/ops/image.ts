/**
 * ops/image.ts — 이미지 손잡이 (SPEC §6-8) — 크기 조정은 절단 후보 #2
 *
 * image.move (좌상단 48 × 48) 끌기 = 옮기기 · 작업 면 밖에서 뗌 = 제거 → image.move · image.remove
 * image.size (우하단 48 × 48) 끌기 = 크기. 3:2 고정, [IMG_MIN, IMG_MAX]        → image.size
 * 끌기 중 실시간, 뗄 때 한 번 기록 (노트 고치기와 같은 방식).
 */
import { IMG_MIN, IMG_MAX } from '../constants'
import { clamp } from '../layout'
import type { Canvas, Image } from '../model'
import * as log from '../log'

export interface ImageEdit {
  id: string
  kind: 'move' | 'size'
  prev: { x: number; y: number; w: number; h: number }
}

export function begin(cv: Canvas, id: string, kind: 'move' | 'size'): ImageEdit | null {
  const im = cv.images.find((i) => i.id === id)
  if (!im) return null
  return { id, kind, prev: { x: im.x, y: im.y, w: im.w, h: im.h } }
}

export function apply(cv: Canvas, e: ImageEdit, dx: number, dy: number): void {
  const im = cv.images.find((i) => i.id === e.id)
  if (!im) return
  if (e.kind === 'move') {
    im.x = Math.round(e.prev.x + dx)
    im.y = Math.round(e.prev.y + dy)
  } else {
    const w = Math.round(clamp(e.prev.w + dx, IMG_MIN.w, IMG_MAX.w))
    im.w = w
    im.h = Math.round(w / 1.5)
  }
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
  log.log(e.kind === 'move' ? 'image.move' : 'image.size', fields(im), 'image')
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
