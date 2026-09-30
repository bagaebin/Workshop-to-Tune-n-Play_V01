/**
 * intro.ts — 기능 소개 · 단계별 튜토리얼 (09.30 결정 · R-014 · docs/spec/15_briefing-steps.md)
 *
 * 자유 탐색과 기대 회고 뒤, 창작 전에 한 번. 진행자는 읽지 않는다 — 화면이 한 단계에 **동작 하나**를 알리고,
 * 참여자가 그 동작을 하면 [다음]이 켜진다.
 *   1 동작만 말한다, 용도는 말하지 않는다      2 순서는 그 참여자 화면의 배치 순서 (좌 6 · 서랍 3은 셔플돼 있다)
 *   3 판정하지 않는다 — 동작을 하면 [다음]이 켜질 뿐. 칭찬 · 체크 표시 · 소리 없음 (K3)
 *   4 시범을 보이지 않는다 — 움직이는 손가락 · 예시 배치 · 자동 재생 없음. 어디에 놓는지는 참여자의 선택이다
 *   5 마킹은 기준을 주지 않는다 — 누르지 않아도 [다음]이 켜져 있다
 * 소개하지 않는 것 — 이미지 패널의 「여기 없다」 칸. 마킹은 뜻(지목)만 말하고 기준(언제)은 주지 않는다 (PI-019).
 * 글자는 이 단계에만 있다. 끝나면 화면은 다시 글자 없는 상태로 돌아간다(우 3 제외).
 * 소개 중에도 모든 기능은 평소대로 동작한다 — 밝히는 것은 표시일 뿐이다.
 */
import { AXIS, SURFACE, SLIDER, LIST, PANEL, slotRects, type Fit, type Rect } from './layout'
import type { Slots } from './model'

type Line = Record<string, unknown>

export interface Step {
  key: string
  rects: Rect[]
  text: string
  /** 이 사건이 나오면 [다음]이 켜진다. null이면 처음부터 켜져 있다 */
  need: ((l: Line) => boolean) | null
  /** 띠의 자리 — 키보드가 뜨는 단계는 위 */
  pos: 'top' | 'bottom'
}

const isTap = (l: Line): boolean => l.type === 'touch.up' && l.acted === true && Number(l.path_len ?? 0) < 8
const on = (type: string, more: (l: Line) => boolean = () => true) => (l: Line): boolean => l.type === type && more(l)
const tapOn = (target: string) => (l: Line): boolean => isTap(l) && l.target === target

interface Def {
  text: string
  name: string
  need: Step['need']
  pos?: 'top'
}

/**
 * 고정 문장 — 진행자 스크립트 V02 4/5장의 15문장을 동작 하나씩으로 쪼갠 것. 옮기기 · 소리 듣기 · 남긴 것으로 돌아가기는 스크립트 V02에 없던 문장(09.30 두기로 결정).
 * 바꾸려면 볼트 「기능 소개 단계표」를 먼저 고친다.
 */
const DEFS: Readonly<Record<string, Def>> = {
  'surface.tap': { name: '면 — 대기', text: '여기 넓은 면에 손가락을 대면 소리가 하나 납니다. 한 번 해보시겠어요?', need: on('note.add', (l) => l.src === 'touch' || l.src === 'rule' || l.src === 'random') },
  'surface.drag': { name: '면 — 끌기', text: '대고 옆으로 끌면 길게 이어집니다.', need: (l) => l.type === 'touch.up' && l.acted === true && l.target === 'surface' && Number(l.path_len ?? 0) >= 8 },
  select: { name: '선택', text: '면에 놓인 걸 누르면 선택됩니다. 한 번 더 누르면 풀려요.', need: (l) => isTap(l) && String(l.target).startsWith('note') },
  'select.many': { name: '여러 개 선택', text: '잇달아 누르면 여러 개가 같이 선택됩니다.', need: on('scope.set', (l) => l.scope === 'many' && Number(l.count) >= 2) },
  length: { name: '길이', text: '선택하면 양 끝에 손잡이가 생기는데, 그걸 끌면 길이가 바뀝니다.', need: on('note.edit', (l) => l.field === 'len') },
  move: { name: '옮기기', text: '놓인 걸 끌면 옮겨집니다.', need: on('note.edit', (l) => l.field === 'pos') },
  remove: { name: '지우기', text: '놓인 걸 없애려면 면 밖으로 끌어내시면 됩니다.', need: on('note.remove') },

  'mat.blank': { name: '빈 면 — 열기', text: '이걸 누르면 글자를 적는 칸이 나옵니다.', need: on('text.open', (l) => l.source === 'chip'), pos: 'top' },
  'mat.blank.commit': { name: '빈 면 — 적기', text: '적고 나면 작은 조각으로 이 칸에 붙습니다.', need: on('text.commit', (l) => l.source === 'chip'), pos: 'top' },
  'mat.blank.place': { name: '빈 면 — 조각 놓기', text: '그 조각을 면이나 위쪽 띠로 끌어다 놓을 수 있어요.', need: on('text.place'), pos: 'top' },

  'mat.sound': { name: '소리 — 열기', text: '이걸 누르면 미리 만들어 둔 소리들이 나옵니다.', need: on('mat.peek', (l) => l.mat === 'sound' && l.id === undefined) },
  'mat.sound.peek': { name: '소리 — 듣기', text: '하나를 누르면 그 소리가 들립니다.', need: on('mat.peek', (l) => l.mat === 'sound' && typeof l.id === 'string') },
  'mat.sound.place': { name: '소리 — 놓기', text: '하나를 면으로 끌어다 놓으면 그 소리가 놓여요.', need: on('note.add', (l) => l.src === 'material') },

  'mat.image': { name: '이미지 — 열기', text: '이걸 누르면 이미지가 여러 장 나옵니다.', need: on('mat.peek', (l) => l.mat === 'image') },
  'mat.image.place': { name: '이미지 — 놓기', text: '마찬가지로 면으로 끌어다 놓으실 수 있어요.', need: on('image.place') },
  'mat.image.move': { name: '이미지 — 옮기기', text: '놓은 이미지는 끌면 옮겨집니다.', need: on('image.move') },
  'mat.image.size': { name: '이미지 — 크기', text: '모서리의 손잡이를 끌면 크기가 바뀝니다.', need: on('image.size') },
  'mat.image.touch': { name: '이미지 — 위에 놓기', text: '이미지 위를 누르면 그 위에 소리가 놓여요.', need: on('image.touch') },

  grid: { name: '격자', text: '이걸 누르면 화면에 눈금이 생기고, 한 번 더 누르면 사라집니다.', need: (l) => (l.type === 'grid.on' || l.type === 'grid.off') && l.by === 'user' },
  'gen.hand': { name: '손 — 켜기', text: '이걸 누르면 켜집니다.', need: tapOn('slot:gen.hand') },
  'gen.hand.use': { name: '손 — 면에 대기', text: '이게 켜져 있으면 면에 댈 때 하나씩 놓입니다.', need: on('note.add', (l) => l.src === 'touch') },
  'gen.rule': { name: '규칙 — 켜기', text: '이걸 켜면 옆에 간격을 조절하는 막대가 나옵니다.', need: tapOn('slot:gen.rule') },
  'gen.rule.use': { name: '규칙 — 면에 대기', text: '면에 대면 일정한 간격으로 여러 개가 놓입니다.', need: on('note.add', (l) => l.src === 'rule') },
  'gen.random': { name: '난수 — 켜기', text: '이걸 켜면 옆에 흩어지는 정도를 조절하는 막대가 나옵니다.', need: tapOn('slot:gen.random') },
  'gen.random.use': { name: '난수 — 면에 대기', text: '면에 댈 때마다 불규칙하게 놓입니다.', need: on('note.add', (l) => l.src === 'random') },
  play: { name: '재생 — 시작', text: '이걸 누르면 지금까지 놓인 게 처음부터 재생됩니다.', need: on('play.start') },
  'play.stop': { name: '재생 — 멈춤', text: '재생 중에 다시 누르면 멈춰요.', need: on('play.stop') },
  'play.seek': { name: '재생 — 띠', text: '위쪽 띠를 누르면 거기서부터 재생됩니다.', need: on('play.seek') },
  all: { name: '전체', text: '이걸 누르면 면에 있는 게 전부 선택됩니다. 한 번 더 누르면 풀려요.', need: tapOn('slot:all') },

  mark: { name: '마킹', text: '이건 마킹이에요. 지금 이 순간을 표시해 두고 싶을 때 누릅니다. 누르면 버튼이 잠깐 밝아졌다 돌아오고 화면은 그대로예요. 아무 때나, 몇 번이든 누르셔도 되고 안 누르셔도 됩니다.', need: null },
  'canvas.keep': { name: '남기고 새로', text: '지금 화면을 남겨두고 빈 면에서 새로 시작합니다.', need: on('canvas.new', (l) => l.reason === 'keep') },
  'canvas.keep.back': { name: '남긴 것으로', text: '남긴 건 왼쪽 목록에 쌓여요. 누르면 그 화면으로 돌아갑니다.', need: on('canvas.switch') },
  'canvas.discard': { name: '지우고 새로', text: '지금 화면을 지우고 빈 면에서 새로 시작합니다.', need: on('canvas.discard') },
  end: { name: '맺음', text: '이게 전부예요. 더 없습니다.', need: null },
}

export const STEP_NAME = (key: string): string => DEFS[key]?.name ?? key

/** 순서 — 면 7 → 서랍 3(화면 순서) → 좌 6(화면 순서) → 우 3(고정) → 맺음 */
export function buildSteps(slots: Slots): Step[] {
  const rects = new Map(slotRects(slots).map((s) => [s.name, s.rect]))
  const out: Step[] = []
  const add = (key: string, r: Rect[]): void => {
    const d = DEFS[key]
    if (d) out.push({ key, rects: r, text: d.text, need: d.need, pos: d.pos ?? 'bottom' })
  }
  const slot = (name: string): Rect[] => {
    const r = rects.get(name)
    return r ? [r] : []
  }
  for (const k of ['surface.tap', 'surface.drag', 'select', 'select.many', 'length', 'move', 'remove']) add(k, [SURFACE])
  for (const name of slots.drawer) {
    const s = slot(`mat.${name}`)
    if (name === 'blank') {
      add('mat.blank', s)
      add('mat.blank.commit', s)
      add('mat.blank.place', [...s, SURFACE, AXIS])
    } else if (name === 'sound') {
      add('mat.sound', s)
      add('mat.sound.peek', [...s, PANEL])
      add('mat.sound.place', [...s, SURFACE])
    } else {
      add('mat.image', s)
      add('mat.image.place', [...s, SURFACE])
      for (const k of ['mat.image.move', 'mat.image.size', 'mat.image.touch']) add(k, [SURFACE])
    }
  }
  for (const name of slots.bottom.slice(0, 6)) {
    const s = slot(name)
    if (name === 'gen.hand') {
      add('gen.hand', s)
      add('gen.hand.use', [...s, SURFACE])
    } else if (name === 'gen.rule' || name === 'gen.random') {
      add(name, [...s, SLIDER])
      add(`${name}.use`, [...s, SLIDER, SURFACE])
    } else if (name === 'play') {
      add('play', s)
      add('play.stop', s)
      add('play.seek', [AXIS])
    } else add(name, s)
  }
  add('mark', slot('mark'))
  add('canvas.keep', slot('canvas.keep'))
  add('canvas.keep.back', [LIST])
  add('canvas.discard', slot('canvas.discard'))
  add('end', [])
  return out
}

export interface Hooks {
  onStep(i: number, step: Step): void
  /** 그 단계의 동작을 처음 했다 */
  onMet(i: number, step: Step, since: number): void
  /** 단계를 떠난다 — 머문 시간 · 동작을 했는지 · 누가 넘겼는지 */
  onLeave(i: number, step: Step, info: { dwell: number; met: boolean; by: 'participant' | 'facilitator'; dir: 1 | -1 }): void
  onFinish(): void
  now(): number
}

interface Shown {
  steps: Step[]
  i: number
  met: Set<number>
  shownAt: number
  el: HTMLDivElement
  textEl: HTMLDivElement
  countEl: HTMLSpanElement
  prevBtn: HTMLButtonElement
  nextBtn: HTMLButtonElement
  hooks: Hooks
  fit: Fit
}

let shown: Shown | null = null

export function isShown(): boolean {
  return shown !== null
}

export function current(): Step | null {
  return shown ? (shown.steps[shown.i] ?? null) : null
}

export function progress(): { i: number; n: number; met: boolean; key: string; metKeys: string[] } | null {
  if (!shown) return null
  const st = shown.steps[shown.i]
  return { i: shown.i, n: shown.steps.length, met: canGo(), key: st?.key ?? '', metKeys: [...shown.met].map((k) => shown?.steps[k]?.key ?? '') }
}

function canGo(): boolean {
  if (!shown) return false
  const st = shown.steps[shown.i]
  return !st || st.need === null || shown.met.has(shown.i)
}

/** 안내 띠 — 작업 면 안, 패널 오른쪽. DOM이라 이 띠 위의 접촉은 캔버스에 닿지 않는다 */
export function show(fit: Fit, steps: Step[], startAt: number, metKeys: readonly string[], hooks: Hooks): void {
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
  const met = new Set<number>()
  steps.forEach((s, i) => {
    if (metKeys.includes(s.key)) met.add(i)
  })
  shown = { steps, i: Math.min(Math.max(0, startAt), steps.length - 1), met, shownAt: hooks.now(), el, textEl, countEl, prevBtn, nextBtn, hooks, fit }
  prevBtn.addEventListener('click', () => go(-1, 'participant'))
  nextBtn.addEventListener('click', () => {
    if (canGo()) go(1, 'participant')
  })
  paint(true)
}

/** 로그의 모든 줄이 지나간다 — 지금 단계의 동작이면 [다음]이 켜진다. 표시는 그것뿐이다 */
export function feed(line: Line): void {
  if (!shown || shown.met.has(shown.i)) return
  const st = shown.steps[shown.i]
  if (!st || st.need === null) return
  let ok = false
  try {
    ok = st.need(line)
  } catch {
    ok = false
  }
  if (!ok) return
  shown.met.add(shown.i)
  const s = shown
  // 로그 기록 도중에 다시 기록하지 않게 한 박자 뒤에
  window.setTimeout(() => {
    s.hooks.onMet(s.i, st, s.hooks.now() - s.shownAt)
    if (shown === s) paint(false)
  }, 0)
}

/** 진행자가 시트에서 넘긴다 — 동작을 하지 않았어도 */
export function skip(): void {
  go(1, 'facilitator')
}

function go(d: 1 | -1, by: 'participant' | 'facilitator'): void {
  if (!shown) return
  const n = shown.i + d
  if (n < 0) return
  const st = shown.steps[shown.i]
  if (st) shown.hooks.onLeave(shown.i, st, { dwell: shown.hooks.now() - shown.shownAt, met: st.need === null || shown.met.has(shown.i), by, dir: d })
  if (n >= shown.steps.length) {
    const fin = shown.hooks.onFinish
    hide()
    fin()
    return
  }
  shown.i = n
  shown.shownAt = shown.hooks.now()
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
  const ok = canGo()
  shown.nextBtn.disabled = !ok
  shown.nextBtn.style.opacity = ok ? '1' : '0.35'
  layout(shown.fit)
  if (notify) shown.hooks.onStep(shown.i, st)
}

export function layout(fit: Fit): void {
  if (!shown) return
  shown.fit = fit
  const st = shown.steps[shown.i]
  const H = 112
  const stage = document.getElementById('stage')?.getBoundingClientRect()
  // 패널(이미지 · 소리 목록)을 가리지 않게 그 오른쪽에서 시작한다
  const x = PANEL.x + PANEL.w + 24
  const y = st?.pos === 'top' ? SURFACE.y + 110 : // 입력 칸(처음엔 면 맨 위 80)을 가리지 않게 그 아래
    SURFACE.y + SURFACE.h - H - 16
  shown.el.style.left = `${(stage?.left ?? 0) + fit.ox + x * fit.s}px`
  shown.el.style.top = `${(stage?.top ?? 0) + fit.oy + y * fit.s}px`
  shown.el.style.width = `${(SURFACE.x + SURFACE.w - 24 - x) * fit.s}px`
  shown.el.style.height = `${H * fit.s}px`
  shown.el.style.fontSize = `${Math.max(13, 24 * fit.s)}px`
}

export function hide(): void {
  if (!shown) return
  shown.el.remove()
  shown = null
}
