/**
 * ops/text.ts — 적기 · 칩 · 라벨 (SPEC §6-7)
 *
 * mat.blank 탭 → text.open → 입력 칸(온스크린 키보드) → 바깥 탭 = text.commit {raw, chars, edits, dur} (chars ≤ 3이면 text.abort)
 * 확정 → 칩이 mat.blank 슬롯에 붙는다 (최대 CHIP_MAX, 넘치면 가장 오래된 것 제거)
 * 칩 → 작업 면  : text.place {target:'surface', x, y, raw, ids[], truncated} + note.add {src:'text'} + Label
 * 칩 → 시간축 띠: text.place {target:'axis', x, raw} + Label(onAxis) — 노트 없음
 * absent 슬롯(이미지 패널) → 같은 입력 칸, 확정 시 image.absent {raw, chars}. 칩 없음, 노트 없음
 * 음절 규칙(T12) — 한글 음절 1 = 노트 1 · 로마자 모음 묶음 1 = 노트 1 · 숫자 자릿수 1 = 노트 1 · 공백·문장부호 = 쉼 1칸
 */
import { L, K_T, LEN_DEFAULT, VEL_FIXED, TONE_FIXED, CHIP_MAX, TEXT_ABORT_CHARS } from '../constants'
import { onOfX, pitchOfY, clamp, AXIS, type Fit } from '../layout'
import { nextId, matOf, type Canvas, type Chip, type Label, type Note, type Session } from '../model'
import * as log from '../log'
import * as scope from './scope'

export type Token = 'note' | 'rest'

/** 원문 → 음절 토큰 열. 글자에서 음고·길이·세기 어느 것도 유도하지 않는다 */
export function tokenize(raw: string): Token[] {
  const out: Token[] = []
  const chars = [...raw]
  let i = 0
  while (i < chars.length) {
    const ch = chars[i] as string
    const code = ch.codePointAt(0) ?? 0
    if (code >= 0xac00 && code <= 0xd7a3) {
      out.push('note') // 한글 음절
      i++
    } else if (/[0-9]/.test(ch)) {
      out.push('note') // 숫자 자릿수
      i++
    } else if (/[A-Za-z]/.test(ch)) {
      // 로마자 단어 — 모음 묶음 수만큼, 모음이 없으면 1
      let j = i
      while (j < chars.length && /[A-Za-z]/.test(chars[j] as string)) j++
      const word = chars.slice(i, j).join('')
      const groups = word.match(/[aeiouyAEIOUY]+/g)?.length ?? 0
      for (let k = 0; k < Math.max(1, groups); k++) out.push('note')
      i = j
    } else if (/\s/.test(ch) || /[\p{P}\p{S}]/u.test(ch)) {
      out.push('rest')
      i++
    } else {
      out.push('note') // 그 밖의 문자(한자 · 가나 등) — 글자 1 = 노트 1
      i++
    }
  }
  return out
}

export type InputKind = 'chip' | 'absent'

interface Open {
  kind: InputKind
  el: HTMLInputElement
  openedAt: number
  edits: number
  /** 관측한 visual viewport 끌어올림 최댓값 (px) */
  pan: number
  /** 관측한 키보드 높이 최댓값 (px) */
  kb: number
}

let open: Open | null = null

export function isOpen(): boolean {
  return open !== null
}

export function inputKind(): InputKind | null {
  return open?.kind ?? null
}

/** 입력 칸 — 1206 × 80, x = 160, visualViewport 기준 키보드 바로 위 (§3-4). 어느 상태에서도 열린다
 *
 * iPadOS는 입력에 포커스가 가면 입력이 보이도록 **화면 전체를 위로 끌어올린다**(visual viewport pan). 그러면 작업 면이
 * 밀려 올라가 §3-4 "작업 면 좌표계 불변"이 깨진다(PI-001). 막는 법 셋 —
 *   ① focus({preventScroll}) ② 입력 칸을 처음엔 작업 면 위쪽에 두어 끌어올릴 이유를 없애고, 키보드가 뜬 뒤 그 바로 위로 옮긴다
 *   ③ 그래도 pan이 생기면 캔버스를 offsetTop만큼 되내려(transform) 보이는 자리를 지킨다. 터치 좌표는 캔버스의 실제 rect 기준(session)
 * 열린 동안 관측한 pan · 키보드 높이의 최댓값을 text.commit/abort에 남긴다 — 실기기 로그로 수정이 먹었는지 본다.
 */
export function openInput(kind: InputKind, fit: Fit, onDone: (result: { committed: boolean; raw: string }) => void): void {
  if (open) return
  const el = document.createElement('input')
  el.type = 'text'
  el.autocomplete = 'off'
  el.autocapitalize = 'off'
  el.spellcheck = false
  el.setAttribute('autocorrect', 'off')
  el.setAttribute('enterkeyhint', 'done')
  el.style.cssText =
    'position:fixed;z-index:5;box-sizing:border-box;padding:0 20px;font:32px -apple-system,"Apple SD Gothic Neo",sans-serif;' +
    'background:#222;color:#eee;border:1px solid #555;border-radius:0;outline:none;caret-color:#eee;'
  document.body.appendChild(el)
  open = { kind, el, openedAt: log.now(), edits: 0, pan: 0, kb: 0 }
  el.addEventListener('input', () => {
    if (open) open.edits++
  })
  el.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault()
      closeInput(true, onDone)
    }
  })
  lastFit = fit
  layoutInput(fit, true) // ② 처음엔 작업 면 위쪽
  const vv = window.visualViewport
  vv?.addEventListener('resize', reposition)
  vv?.addEventListener('scroll', reposition)
  log.log('text.open', { source: kind })
  log.spanOpen('text') // 적는 동안은 정지가 아니다 (⑰ · PI-005)
  try {
    el.focus({ preventScroll: true }) // ①
  } catch {
    el.focus()
  }
  // 키보드가 올라오는 동안 몇 번 더 맞춘다 (resize 이벤트가 늦거나 빠지는 기기 대비)
  for (const ms of [50, 250, 600]) window.setTimeout(reposition, ms)
  function reposition(): void {
    layoutInput(fit, false)
  }
  ;(el as HTMLInputElement & { _reposition?: () => void })._reposition = reposition
}

let lastFit: Fit | null = null

function stageEl(): HTMLElement | null {
  return document.getElementById('stage')
}

function layoutInput(fit: Fit, initial: boolean): void {
  if (!open) return
  lastFit = fit
  const vv = window.visualViewport
  const h = 80 * fit.s
  const w = 1206 * fit.s
  const offTop = vv ? vv.offsetTop : 0
  const kb = vv ? Math.max(0, window.innerHeight - vv.height - offTop) : 0
  const keyboardUp = vv ? vv.height < window.innerHeight * 0.85 : false
  // ③ pan 보정 — 끌어올린 만큼 캔버스를 되내린다. 문서를 스크롤할 수 없게 해 둔 상태라 window.scrollTo는 보조
  if (offTop > 0) window.scrollTo(0, 0)
  const stage = stageEl()
  if (stage) stage.style.transform = offTop > 0 ? `translateY(${offTop}px)` : ''
  open.pan = Math.max(open.pan, Math.round(offTop))
  open.kb = Math.max(open.kb, Math.round(kb))
  open.el.style.left = `${fit.ox + 160 * fit.s}px`
  open.el.style.width = `${w}px`
  open.el.style.height = `${h}px`
  open.el.style.fontSize = `${32 * fit.s}px`
  if (initial || !keyboardUp) {
    open.el.style.top = `${offTop + fit.oy + 48 * fit.s}px` // 작업 면 위쪽 — 키보드가 덮지 않는 자리
  } else {
    open.el.style.top = `${offTop + (vv ? vv.height : window.innerHeight) - h}px` // 키보드 바로 위
  }
}

/** 키보드·입력 칸에 가려진 자리가 시작되는 client y (입력 칸의 윗변). 입력 칸이 아직 위쪽에 있으면 null */
export function coveredFromClientY(): number | null {
  if (!open) return null
  const r = open.el.getBoundingClientRect()
  const vv = window.visualViewport
  const keyboardUp = vv ? vv.height < window.innerHeight * 0.85 : false
  return keyboardUp ? r.top : null
}

/** 바깥 탭 = 확정. 내용이 비었거나 TEXT_ABORT_CHARS 이하면 text.abort */
export function closeInput(committed: boolean, onDone: (result: { committed: boolean; raw: string }) => void): void {
  if (!open) return
  const o = open
  open = null
  const raw = o.el.value
  const chars = [...raw].length
  const dur = log.now() - o.openedAt
  const rep = (o.el as HTMLInputElement & { _reposition?: () => void })._reposition
  if (rep) {
    window.visualViewport?.removeEventListener('resize', rep)
    window.visualViewport?.removeEventListener('scroll', rep)
  }
  o.el.blur()
  o.el.remove()
  const stage = stageEl()
  if (stage) stage.style.transform = ''
  window.scrollTo(0, 0)
  log.spanClose('text')
  const aborted = !committed || chars <= TEXT_ABORT_CHARS
  // pan · kb — 열린 동안 관측한 visual viewport 끌어올림 · 키보드 높이의 최댓값 (px). pan이 0이 아니면 보정이 동작한 것
  log.log(aborted ? 'text.abort' : 'text.commit', { source: o.kind, raw, chars, edits: o.edits, dur, pan: o.pan, kb: o.kb })
  onDone({ committed: !aborted, raw })
}

/** 확정된 글 → 칩. 넘치면 가장 오래된 것 제거(원문은 로그에 남는다) */
export function addChip(sess: Session, raw: string): Chip {
  const chip: Chip = { id: nextId('c'), raw, t: log.now() }
  sess.chips.push(chip)
  while (sess.chips.length > CHIP_MAX) sess.chips.shift()
  return chip
}

/** 이미지 패널의 absent — 칩도 노트도 없다 (D13) */
export function absent(raw: string): void {
  log.log('image.absent', { raw, chars: [...raw].length }, 'image')
}

/** 칩을 작업 면에 — 음절마다 노트 + 라벨. 띠에 — 라벨만 */
export function placeChip(sess: Session, cv: Canvas, chip: Chip, target: 'surface' | 'axis', x: number, y: number): Label {
  const i = sess.chips.indexOf(chip)
  if (i >= 0) sess.chips.splice(i, 1)
  if (target === 'axis') {
    const label: Label = { id: nextId('l'), x: Math.round(x), y: AXIS.y + AXIS.h / 2, raw: chip.raw, ids: [], onAxis: true }
    cv.labels.push(label)
    log.log('text.place', { target: 'axis', x: label.x, raw: chip.raw, label: label.id })
    return label
  }
  const interval = L / K_T // 격자 ON이면 시간 눈금, OFF면 L/16 — 지금 둘은 같은 값
  const on0 = onOfX(x)
  const pitch = Math.round(pitchOfY(y) * 1000) / 1000
  const notes: Note[] = []
  let truncated = 0
  let slot = 0
  for (const tok of tokenize(chip.raw)) {
    const on = Math.round(on0 + slot * interval)
    slot++
    if (tok === 'rest') continue
    if (on >= L) {
      truncated++
      continue
    }
    notes.push({ id: nextId('n'), on, pitch, len: LEN_DEFAULT, vel: VEL_FIXED, tone: TONE_FIXED, src: 'text', mat: matOf('text') })
  }
  cv.notes.push(...notes)
  const label: Label = { id: nextId('l'), x: Math.round(x), y: Math.round(clamp(y, 0, 1024)), raw: chip.raw, ids: notes.map((n) => n.id), onAxis: false }
  cv.labels.push(label)
  log.log('text.place', { target: 'surface', x: label.x, y: label.y, raw: chip.raw, ids: label.ids, truncated: truncated || undefined, label: label.id })
  if (notes.length) {
    const vals = notes.map(({ on, pitch: p, len, vel, tone }) => ({ on, pitch: p, len, vel, tone }))
    log.log('note.add', { ids: label.ids, count: notes.length, src: 'text', vals, scope: notes.length === 1 ? 'one' : 'many' })
    cv.selection = new Set(label.ids)
    cv.allOn = false
    log.log('scope.set', { scope: scope.scopeOf(cv), count: cv.selection.size, ids: [...cv.selection] })
  }
  return label
}
