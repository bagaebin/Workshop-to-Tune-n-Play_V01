/**
 * intro.ts — 기능 소개 (기능 명세 V1.0 §4-4 · 진행자 스크립트 V02 4/5장)
 *
 * 자유 탐색과 기대 회고 뒤, 창작 전에 한 번. 진행자가 고정 문장을 읽고 참여자가 자기 손으로 한 번씩 눌러 본다.
 * 화면에는 지금 소개하는 자리만 밝히고(나머지는 어둡게) 같은 문장을 띠에 보인다 — 순서가 참여자마다 달라 진행자가 놓치지 않게.
 *   1 동작만 말한다, 용도는 말하지 않는다      2 순서는 그 참여자 화면의 배치 순서 (좌 6 · 서랍 3은 셔플돼 있다)
 *   3 전부 한 번씩, 같은 길이로                 4 진행자가 시연하지 않는다 — 참여자 손으로
 *   5 마킹은 기준을 주지 않는다
 * 소개하지 않는 것 — 이미지 패널의 「여기 없다」 칸 · 마킹을 언제 누르는지.
 * 글자는 이 단계에만 있다. 끝나면 화면은 다시 글자 없는 상태로 돌아간다(우 3 제외).
 * 소개 중에도 모든 기능은 평소대로 동작한다 — 밝히는 것은 표시일 뿐이다.
 */
import { AXIS, SURFACE, SLIDER, LIST, slotRects, type Fit, type Rect } from './layout'
import type { Slots } from './model'

export interface Step {
  key: string
  rects: Rect[]
  text: string
}

/** 고정 문장 15 + 맺음 1 — 진행자 스크립트 V02 4/5장 그대로. 바꾸려면 볼트 스크립트를 먼저 고친다 */
const TEXT: Readonly<Record<string, string>> = {
  surface: '여기 넓은 면에 손가락을 대면 소리가 하나 납니다. 끌면 이어지고요. 한 번 해보시겠어요?',
  select: '면에 놓인 걸 누르면 선택됩니다. 잇달아 누르면 여러 개가 같이 선택되고요. 선택하면 양 끝에 손잡이가 생기는데, 그걸 끌면 길이가 바뀝니다.',
  remove: '놓인 걸 없애려면 면 밖으로 끌어내시면 됩니다.',
  'mat.blank': '이걸 누르면 글자를 적는 칸이 나옵니다. 적고 나면 작은 조각으로 붙고, 그 조각을 면이나 위쪽 띠로 끌어다 놓을 수 있어요.',
  'mat.sound': '이걸 누르면 미리 만들어 둔 소리들이 나옵니다. 하나를 면으로 끌어다 놓으면 그 소리가 놓여요.',
  'mat.image': '이걸 누르면 이미지가 여러 장 나옵니다. 마찬가지로 면으로 끌어다 놓으실 수 있어요. 놓은 이미지를 누르면 모서리에 손잡이가 생기는데, 가운데를 끌면 옮겨지고 모서리를 끌면 크기가 바뀝니다.',
  grid: '이걸 누르면 화면에 눈금이 생기고, 한 번 더 누르면 사라집니다.',
  'gen.hand': '이게 켜져 있으면 면에 댈 때 하나씩 놓입니다.',
  'gen.rule': '이걸 켜면 옆에 값 조절이 나오고, 면에 대면 일정한 간격으로 여러 개가 놓입니다.',
  'gen.random': '이걸 켜면 면에 댈 때마다 불규칙하게 놓입니다.',
  play: '이걸 누르면 지금까지 놓인 게 처음부터 재생됩니다. 재생 중에 다시 누르면 멈춰요. 위쪽 띠를 누르면 거기서부터 재생됩니다.',
  all: '이걸 누르면 면에 있는 게 전부 선택됩니다. 한 번 더 누르면 풀려요.',
  mark: '이건 마킹이에요. 누르면 버튼이 잠깐 밝아졌다 돌아오고 화면은 그대로입니다. 아무 때나 누르셔도 되고, 안 누르셔도 됩니다.',
  'canvas.keep': '지금 화면을 남겨두고 빈 면에서 새로 시작합니다. 남긴 건 왼쪽 목록에 쌓여요.',
  'canvas.discard': '지금 화면을 지우고 빈 면에서 새로 시작합니다.',
  end: '이게 전부예요. 더 없습니다.',
}

/** 진행자용 짧은 이름 — 시트에 순서를 보일 때 */
export const STEP_NAME: Readonly<Record<string, string>> = {
  surface: '넓은 면', select: '선택 · 길이', remove: '지우기',
  'mat.blank': '빈 면(적기)', 'mat.sound': '소리 재료', 'mat.image': '이미지',
  grid: '격자', 'gen.hand': '손', 'gen.rule': '규칙', 'gen.random': '난수', play: '재생', all: '전체',
  mark: '마킹', 'canvas.keep': '남기고 새로', 'canvas.discard': '지우고 새로', end: '맺음',
}

/** 순서 — 면 3 → 서랍 3(화면 순서) → 좌 6(화면 순서) → 우 3(고정) → 맺음. 스크립트 4/5장의 순서 */
export function buildSteps(slots: Slots): Step[] {
  const rects = new Map(slotRects(slots).map((s) => [s.name, s.rect]))
  const out: Step[] = []
  const slot = (name: string, extra: Rect[] = []): void => {
    const r = rects.get(name)
    const text = TEXT[name]
    if (r && text) out.push({ key: name, rects: [r, ...extra], text })
  }
  out.push({ key: 'surface', rects: [SURFACE], text: TEXT.surface as string })
  out.push({ key: 'select', rects: [SURFACE], text: TEXT.select as string })
  out.push({ key: 'remove', rects: [SURFACE], text: TEXT.remove as string })
  for (const name of slots.drawer) slot(`mat.${name}`)
  for (const name of slots.bottom.slice(0, 6)) {
    if (name === 'gen.rule' || name === 'gen.random') slot(name, [SLIDER])
    else if (name === 'play') slot(name, [AXIS])
    else slot(name)
  }
  slot('mark')
  slot('canvas.keep', [LIST])
  slot('canvas.discard')
  out.push({ key: 'end', rects: [], text: TEXT.end as string })
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
