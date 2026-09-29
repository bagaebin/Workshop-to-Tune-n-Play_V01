/**
 * intro.ts — 기능 소개 · 튜토리얼 페이지 (D15 안 2 ③)
 *
 * 자유 탐색과 기대 회고 뒤, 창작 전에 한 번. 기능을 하나씩 밝히고(나머지는 어둡게) 한 줄로 **동작만** 알린다.
 * 규칙 (볼트 결정 요청 §3) —
 *   1 동작만 말한다, 용도는 말하지 않는다      2 순서는 그 참여자 화면의 배치 순서 (좌 6 · 서랍 3은 셔플돼 있다)
 *   3 전부 한 번씩, 같은 길이로                 4 진행자가 시연하지 않는다 — 참여자 손으로
 *   5 마킹 · 여기까지는 존재만 알리고 기준은 주지 않는다 (D12 ②)
 * 글자는 이 단계에만 있다. 끝나면 화면은 다시 글자 없는 상태로 돌아간다(우 4 제외).
 * 소개 중에도 모든 기능은 평소대로 동작한다 — 밝히는 것은 표시일 뿐이다.
 */
import { SLOT } from './constants'
import { AXIS, SURFACE, SLIDER, LIST, slotRects, type Fit, type Rect } from './layout'
import type { Slots } from './model'

export interface Step {
  key: string
  rects: Rect[]
  text: string
}

/** 고정 문장 — 동작만. 바꾸려면 볼트 진행자 스크립트를 먼저 고친다 */
const TEXT: Readonly<Record<string, string>> = {
  grid: '누르면 눈금이 생깁니다. 다시 누르면 사라집니다.',
  'gen.hand': '이것이 켜져 있으면, 면을 누를 때 소리가 하나 놓입니다.',
  'gen.rule': '이것이 켜져 있으면, 면을 누를 때 같은 간격으로 여러 개가 놓입니다. 왼쪽 막대로 간격이 바뀝니다.',
  'gen.random': '이것이 켜져 있으면, 면을 누를 때 흩어진 여러 개가 놓입니다. 왼쪽 막대로 흩어지는 정도가 바뀝니다.',
  play: '누르면 들려줍니다. 다시 누르면 멈춥니다. 위쪽 띠를 누르면 거기서부터 들려줍니다.',
  all: '누르면 놓인 것이 전부 선택됩니다. 다시 누르면 풀립니다.',
  'mat.blank': '누르면 글을 적을 수 있습니다. 적은 글은 이 칸에 남고, 끌어서 면이나 위쪽 띠에 놓을 수 있습니다.',
  'mat.sound': '누르면 소리가 들립니다. 끌어서 면에 놓을 수 있습니다.',
  'mat.image': '누르면 사진이 펼쳐집니다. 끌어서 면에 놓을 수 있습니다. 맨 아래 빈 칸은 찾는 사진이 없을 때 누릅니다.',
  surface: '면을 누르면 소리가 놓입니다. 오래 누르거나 옆으로 끌면 길어집니다.',
  select: '놓인 것을 누르면 선택됩니다. 다시 누르면 풀립니다. 여러 개를 차례로 누르면 함께 선택됩니다.',
  edit: '놓인 것을 끌면 옮겨집니다. 오른쪽 끝을 끌면 길이가 바뀝니다. 면 밖으로 끌어내면 지워집니다.',
  image: '사진은 왼쪽 위 모서리를 끌면 옮겨지고, 오른쪽 아래 모서리를 끌면 크기가 바뀝니다. 사진 위를 누르면 소리가 놓입니다.',
  mic: '소리를 내면 — 목소리, 두드림 — 그 소리가 면에 놓입니다.',
  mark: '아무 때나 눌러도 되고 안 눌러도 됩니다. 누르면 그 순간이 기록됩니다.',
  'canvas.keep': '지금 것을 남겨 두고 빈 면에서 새로 시작합니다. 남긴 것은 왼쪽 아래에 작게 보이고, 누르면 돌아갑니다.',
  'canvas.discard': '지금 것을 지우고 빈 면에서 새로 시작합니다.',
  done: '나중에 이 자리에 「여기까지」가 나타납니다. 누르면 이 단계가 끝납니다.',
}

/** 순서 — 좌 6(화면 순서) → 서랍 3(화면 순서) → 면 위 동작 → 우 4. 잘린 기능은 뺀다 */
export function buildSteps(slots: Slots, opts: { mic: boolean; gone?: ReadonlySet<string> }): Step[] {
  const rects = new Map(slotRects(slots).map((s) => [s.name, s.rect]))
  const out: Step[] = []
  const slot = (name: string, extra: Rect[] = []): void => {
    const r = rects.get(name)
    const text = TEXT[name]
    if (r && text) out.push({ key: name, rects: [r, ...extra], text })
  }
  for (const name of slots.bottom.slice(0, 6)) {
    if (name === 'gen.rule' || name === 'gen.random') slot(name, [SLIDER])
    else if (name === 'play') slot(name, [AXIS])
    else slot(name)
  }
  for (const name of slots.drawer) slot(`mat.${name}`)
  out.push({ key: 'surface', rects: [SURFACE], text: TEXT.surface as string })
  out.push({ key: 'select', rects: [SURFACE], text: TEXT.select as string })
  out.push({ key: 'edit', rects: [SURFACE], text: TEXT.edit as string })
  out.push({ key: 'image', rects: [SURFACE], text: TEXT.image as string })
  if (opts.mic) out.push({ key: 'mic', rects: [SURFACE], text: TEXT.mic as string })
  slot('mark')
  slot('canvas.keep', [LIST])
  slot('canvas.discard')
  // done은 아직 보이지 않는다 — 빈 자리를 밝힌다
  out.push({ key: 'done', rects: [{ x: 1226, y: 904, w: SLOT, h: SLOT }], text: TEXT.done as string })
  return out
}

interface Shown {
  steps: Step[]
  i: number
  el: HTMLDivElement
  textEl: HTMLDivElement
  countEl: HTMLSpanElement
  prevBtn: HTMLButtonElement
  nextBtn: HTMLButtonElement
  onStep: (i: number, step: Step) => void
  onFinish: () => void
}

let shown: Shown | null = null

export function isShown(): boolean {
  return shown !== null
}

export function current(): Step | null {
  return shown ? (shown.steps[shown.i] ?? null) : null
}

export function progress(): { i: number; n: number } | null {
  return shown ? { i: shown.i, n: shown.steps.length } : null
}

/** 안내 띠 — 작업 면 아래쪽, 하단 띠 바로 위. DOM이라 이 띠 위의 접촉은 캔버스에 닿지 않는다 */
export function show(fit: Fit, steps: Step[], startAt: number, onStep: Shown['onStep'], onFinish: () => void): void {
  hide()
  const el = document.createElement('div')
  el.id = 'intro'
  el.style.cssText =
    'position:fixed;z-index:6;box-sizing:border-box;display:flex;align-items:center;gap:16px;padding:0 20px;' +
    'background:rgba(24,24,24,0.96);color:#eee;border:1px solid #666;border-radius:10px;' +
    'font-family:-apple-system,"Apple SD Gothic Neo",sans-serif;-webkit-user-select:none;user-select:none;'
  const textEl = document.createElement('div')
  textEl.style.cssText = 'flex:1;line-height:1.4;'
  const countEl = document.createElement('span')
  countEl.style.cssText = 'color:#999;white-space:nowrap;'
  const mk = (label: string): HTMLButtonElement => {
    const b = document.createElement('button')
    b.textContent = label
    b.style.cssText = 'font:inherit;padding:10px 18px;background:#3a3a3a;color:#eee;border:1px solid #777;border-radius:8px;white-space:nowrap;'
    return b
  }
  const prevBtn = mk('이전')
  const nextBtn = mk('다음')
  el.append(textEl, countEl, prevBtn, nextBtn)
  el.addEventListener('pointerdown', (e) => e.stopPropagation())
  document.body.appendChild(el)
  shown = { steps, i: Math.min(Math.max(0, startAt), steps.length - 1), el, textEl, countEl, prevBtn, nextBtn, onStep, onFinish }
  prevBtn.addEventListener('click', () => go(-1))
  nextBtn.addEventListener('click', () => go(1))
  layout(fit)
  paint(true)
}

function go(d: number): void {
  if (!shown) return
  const n = shown.i + d
  if (n >= shown.steps.length) {
    const fin = shown.onFinish
    hide()
    fin()
    return
  }
  if (n < 0) return
  shown.i = n
  paint(true)
}

function paint(notify: boolean): void {
  if (!shown) return
  const st = shown.steps[shown.i]
  if (!st) return
  shown.textEl.textContent = st.text
  shown.countEl.textContent = `${shown.i + 1} / ${shown.steps.length}`
  shown.prevBtn.disabled = shown.i === 0
  shown.prevBtn.style.opacity = shown.i === 0 ? '0.35' : '1'
  shown.nextBtn.textContent = shown.i === shown.steps.length - 1 ? '끝' : '다음'
  if (notify) shown.onStep(shown.i, st)
}

export function layout(fit: Fit): void {
  if (!shown) return
  const h = 112 * fit.s
  const stage = document.getElementById('stage')?.getBoundingClientRect()
  const left = (stage?.left ?? 0) + fit.ox + (SURFACE.x + 24) * fit.s
  const top = (stage?.top ?? 0) + fit.oy + (SURFACE.y + SURFACE.h - 112 - 16) * fit.s
  shown.el.style.left = `${left}px`
  shown.el.style.top = `${top}px`
  shown.el.style.width = `${(SURFACE.w - 48) * fit.s}px`
  shown.el.style.height = `${h}px`
  shown.el.style.fontSize = `${Math.max(13, 24 * fit.s)}px`
}

export function hide(): void {
  if (!shown) return
  shown.el.remove()
  shown = null
}
