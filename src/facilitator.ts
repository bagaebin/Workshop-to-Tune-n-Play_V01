/**
 * facilitator.ts — 진행자 시트 (기능 명세 V1.0 §4 · SPEC §7-1)
 *
 * 준비(pid · 마이크 · 체크리스트 · 잠금식 · [소리 확인] · [시작]) ·
 * 창작 전(자유 탐색 → 기대 회고 목록 → [기능 소개 시작] → [화면 비우기] → 과제문 → [구간 1 시작]) ·
 * 창작(구간 1 경과 · [구간 1 종료] → 잠긴 것 · 구두 확인 · 구간 2 과제문 · [구간 2 시작] · [구간 2 조기 종료] · [비상 정지]) ·
 * 회고(마킹 목록 → 재생 · 미사용 둘 · 정지 목록 · 버튼 인지 · [내보내기] · [재시도]) · 복구 표시 · [새 세션으로].
 * DOM 오버레이라 열린 동안 캔버스 접촉은 닿지 않는다. 모든 조작은 session이 facilitator {action}으로 남긴다.
 */
import type { Checks, Status, ReviewData, ReviewMark, ExpectRow } from './session'
import type { ExportResult } from './log'
import type { LockRule } from './lock'
import * as mic from './mic'
import * as update from './update'

export interface FacApi {
  status(): Status
  start(pid: string, checks: Checks): Promise<void>
  soundCheck(): Promise<boolean>
  endExploreEarly(): void
  startIntro(): void
  skipIntroStep(): void
  expectData(): Promise<{ slots: ExpectRow[]; acts: Array<{ label: string; count: number }> }>
  clearWorkspace(): void
  startSeg1(): void
  endSeg1Now(): void
  startSeg2(): void
  lockName(axis: string, value: string): string
  endSeg2Early(): void
  emergencyStop(): void
  exportNow(): Promise<ExportResult>
  abandon(): Promise<void>
  reviewData(): Promise<ReviewData>
  reviewPlay(m: ReviewMark): void
  reviewClear(): void
}

const CHECKLIST: Array<{ key: string; text: string }> = [
  { key: 'offline', text: '기내 모드 또는 Wi-Fi 끔 · 앱이 standalone으로 뜸' },
  { key: 'rotation', text: '회전 잠금 켬 · 알림 요약 끔' },
  { key: 'silent_mode_off', text: '무음 모드 해제' },
  { key: 'speaker', text: '스피커 내장/유선 · 볼륨 70 %' },
  { key: 'camera', text: 'pid 입력 · 카메라 2대 녹화 시작 · 카메라 시계 확인' },
  { key: 'guided_access', text: 'Guided Access 시작 (마지막)' },
]

export function initFacilitator(api: FacApi): { open: () => void; close: () => void } {
  let root: HTMLDivElement | null = null
  let panel: HTMLDivElement | null = null
  let timer: number | null = null
  let lastExport: ExportResult | null = null
  let micMsg = ''
  let updateMsg = ''
  let soundMsg = ''
  let statusEl: HTMLElement | null = null
  let meterEl: HTMLElement | null = null
  let meterThrEl: HTMLElement | null = null
  let reviewEl: HTMLElement | null = null
  let reviewLoaded = false
  let expectEl: HTMLElement | null = null
  let introEl: HTMLElement | null = null
  const checks: Record<string, boolean> = {}
  let lockRule: LockRule = 'v0.3'
  let pid = ''
  let skipArmed = false

  const phaseName: Record<string, string> = { prep: '준비', explore: '자유 탐색', recall: '기대 회고', briefing: '기능 소개', create1: '구간 1', hold: '구간 1 끝 · 구간 2 전', create2: '구간 2 잠금', review: '회고' }
  const segName = (s: number) => ({ '-1': '준비', '0': '창작 전', '1': '구간 1 자유', '2': '구간 2 잠금', '3': '회고' })[String(s)] ?? String(s)
  const mmss = (ms: number) => {
    const s = Math.floor(ms / 1000)
    return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`
  }

  function ensure(): void {
    if (root) return
    root = document.createElement('div')
    root.id = 'fac'
    root.style.cssText = 'position:fixed;inset:0;z-index:10;display:none;'
    const backdrop = document.createElement('div')
    backdrop.style.cssText = 'position:absolute;inset:0;background:transparent;'
    backdrop.addEventListener('pointerdown', (e) => {
      e.stopPropagation()
      close()
    })
    panel = document.createElement('div')
    panel.style.cssText =
      'position:absolute;top:0;right:0;bottom:0;width:380px;max-width:90vw;background:#202020;color:#ddd;' +
      'font:15px/1.5 -apple-system,"Apple SD Gothic Neo",sans-serif;padding:20px;overflow:auto;box-sizing:border-box;' +
      'border-left:1px solid #444;-webkit-user-select:text;user-select:text;'
    panel.addEventListener('pointerdown', (e) => e.stopPropagation())
    root.append(backdrop, panel)
    document.body.appendChild(root)
  }

  function button(text: string, onClick: () => void | Promise<void>, opts: { disabled?: boolean; danger?: boolean; small?: boolean } = {}): HTMLButtonElement {
    const b = document.createElement('button')
    b.textContent = text
    b.disabled = opts.disabled ?? false
    b.style.cssText =
      `display:block;width:100%;margin:${opts.small ? 4 : 8}px 0;padding:${opts.small ? 8 : 12}px;font:inherit;font-size:${opts.small ? 14 : 16}px;` +
      `background:${opts.danger ? '#4a2323' : '#333'};color:#eee;border:1px solid ${opts.danger ? '#a55' : '#555'};border-radius:6px;text-align:left;`
    if (b.disabled) b.style.opacity = '0.4'
    b.addEventListener('click', () => void Promise.resolve(onClick()).then(render))
    return b
  }

  function h(text: string, size = 16): HTMLElement {
    const el = document.createElement('div')
    el.textContent = text
    el.style.cssText = `font-size:${size}px;font-weight:600;margin:14px 0 6px;`
    return el
  }

  function p(text: string): HTMLElement {
    const el = document.createElement('div')
    el.textContent = text
    el.style.cssText = 'color:#aaa;font-size:13px;margin:4px 0;white-space:pre-wrap;'
    return el
  }

  function checkbox(text: string, checked: boolean, onChange: (v: boolean) => void): HTMLElement {
    const row = document.createElement('label')
    row.style.cssText = 'display:flex;gap:10px;align-items:flex-start;margin:6px 0;font-size:14px;'
    const cb = document.createElement('input')
    cb.type = 'checkbox'
    cb.checked = checked
    cb.addEventListener('change', () => onChange(cb.checked))
    const span = document.createElement('span')
    span.textContent = text
    row.append(cb, span)
    return row
  }

  function micBlock(): HTMLElement {
    const wrap = document.createElement('div')
    wrap.append(h('마이크'))
    if (!mic.hasPermission()) {
      wrap.append(
        button('마이크 권한 요청', async () => {
          const r = await mic.requestPermission()
          micMsg = r.ok ? `허용됨 · ${mic.mimeType() || 'MediaRecorder 없음'}` : `실패 — ${r.error ?? ''}`
        }),
      )
      if (micMsg) wrap.append(p(micMsg))
      wrap.append(p('참여자 앞에서 권한 창이 뜨면 안 된다 (N1). 여기서 미리 허용한다'))
      return wrap
    }
    wrap.append(p(`허용됨 · ${mic.mimeType() || '—'}`))
    const bar = document.createElement('div')
    bar.style.cssText = 'position:relative;height:14px;background:#111;border:1px solid #444;border-radius:3px;margin:6px 0;'
    meterEl = document.createElement('div')
    meterEl.style.cssText = 'height:100%;width:0%;background:#7c7;'
    meterThrEl = document.createElement('div')
    meterThrEl.style.cssText = 'position:absolute;top:-3px;bottom:-3px;width:2px;background:#e66;left:0%;'
    bar.append(meterEl, meterThrEl)
    wrap.append(bar)
    const row = document.createElement('div')
    row.style.cssText = 'display:flex;gap:10px;align-items:center;font-size:13px;color:#aaa;'
    const slider = document.createElement('input')
    slider.type = 'range'
    slider.min = '0.002'
    slider.max = '0.1'
    slider.step = '0.001'
    slider.value = String(mic.getThreshold())
    slider.style.flex = '1'
    const val = document.createElement('span')
    val.textContent = mic.getThreshold().toFixed(3)
    slider.addEventListener('input', () => {
      mic.setThreshold(Number(slider.value))
      val.textContent = mic.getThreshold().toFixed(3)
    })
    row.append(document.createTextNode('임계'), slider, val)
    wrap.append(row, p('레벨 미터의 방 소음 위로 임계를 둔다 → 헤더 mic_threshold. 입력 채널의 게이트도 이 값'))
    return wrap
  }

  function render(): void {
    if (!panel) return
    const st = api.status()
    panel.replaceChildren()
    statusEl = null
    expectEl = null
    introEl = null
    meterEl = null
    meterThrEl = null
    reviewEl = null
    panel.append(h('진행자 시트', 18), p(`${st.build} · ${phaseName[st.phase] ?? segName(st.seg)}${st.cuts.length ? ` · cuts ${st.cuts.join(',')}` : ''}`))

    if (st.seg === -1) {
      panel.append(h('pid'))
      const input = document.createElement('input')
      input.value = pid
      input.placeholder = 'P07'
      input.autocapitalize = 'characters'
      input.autocomplete = 'off'
      input.spellcheck = false
      input.style.cssText = 'width:100%;padding:10px;font:inherit;font-size:18px;background:#111;color:#fff;border:1px solid #555;border-radius:6px;box-sizing:border-box;'
      input.addEventListener('input', () => {
        pid = input.value.trim().toUpperCase()
        startBtn.disabled = pid.length === 0 || !api.status().audioReady
        startBtn.style.opacity = startBtn.disabled ? '0.4' : '1'
      })
      panel.append(input)
      panel.append(micBlock())
      panel.append(h('체크리스트 (§16)'))
      for (const item of CHECKLIST) {
        panel.append(checkbox(item.text, checks[item.key] ?? false, (v) => {
          checks[item.key] = v
        }))
      }
      panel.append(h('잠금 판정식 (§11-1 · D14 비교용)'))
      panel.append(checkbox('원식 v0.2를 실제 잠금으로 (기본은 v0.3, 다른 식은 alt로 병기)', lockRule === 'v0.2', (v) => {
        lockRule = v ? 'v0.2' : 'v0.3'
      }))
      panel.append(p(`vel_source: fixed · tone_source: fixed · audio_mime: ${mic.hasPermission() ? mic.mimeType() || '—' : '—'}`))
      panel.append(h('빌드'))
      panel.append(p(`지금 빌드 ${update.CURRENT}`))
      panel.append(button('새 빌드 확인 (Wi-Fi 필요)', async () => {
        updateMsg = '확인 중…'
        render()
        const r = await update.check()
        if (!r.ok) {
          updateMsg = `확인 못 함 — 오프라인이거나 서버 오류 (${r.error}). 아무것도 바꾸지 않았다`
          return
        }
        if (!r.newer) {
          updateMsg = `최신이다 — 서버도 ${r.remote}`
          return
        }
        updateMsg = `새 빌드 ${r.remote} — 받는 중. 화면이 다시 뜬다`
        render()
        await update.reloadFresh()
      }))
      if (updateMsg) panel.append(p(updateMsg))
      panel.append(h('소리 확인'))
      panel.append(p('기기를 건네기 전 마지막 동작. 누르면 짧은 소리가 하나 난다. 누르지 않으면 [시작]이 눌리지 않는다 — 첫 접촉이 무음이 되지 않게.'))
      panel.append(button(st.audioReady ? '소리 확인 ✔ (다시 듣기)' : '소리 확인', async () => {
        const ok = await api.soundCheck()
        soundMsg = ok ? '소리가 났으면 준비됐다. 안 들렸으면 무음 모드 · 볼륨을 확인한다' : '오디오를 열지 못했다 — 다시 누른다'
      }))
      if (soundMsg) panel.append(p(soundMsg))
      panel.append(p('[시작]을 누르면 플래시 뒤 곧바로 전체 화면이 나오고 자유 탐색 4분이 시작된다.\n말 — "이제 이걸 4분 동안 편하게 만져 보세요. 뭘 만들지 않으셔도 됩니다." (소리가 난다는 말도 하지 않는다)'))
      const startBtn = button('시작 → 플래시 → 자유 탐색 (4분)', async () => {
        await api.start(pid, { guided_access: checks.guided_access ?? false, silent_mode_off: checks.silent_mode_off ?? false, lock_rule: lockRule })
        close()
      }, { disabled: pid.length === 0 || !st.audioReady })
      panel.append(startBtn)
      return
    }

    panel.append(h(`pid ${st.pid}`))
    if (st.resumed) panel.append(p('⟲ 새로고침 뒤 복구된 세션 — 로그는 이어진다 (session.resume)'))
    statusEl = p('')
    panel.append(statusEl)
    updateStatus()

    // ── 창작 전 (V1.0 §4) — 자유 탐색 4 → 기대 회고 3 → 기능 소개 7 → 과제문 1 → 구간 1
    if (st.phase === 'explore') {
      panel.append(h('① 자유 탐색 (4분)'))
      panel.append(p('개입 0. 질문받으면 "편하신 대로 하세요"만. 4분에 화면이 저절로 멈추고 기대 회고로 넘어간다 — 누를 것이 없다.\n일찍 끝내야 할 때만 아래를 누른다.'))
      panel.append(button('탐색 종료 → ② 기대 회고', () => {
        api.endExploreEarly()
      }))
    }
    if (st.phase === 'recall') {
      panel.append(h('② 기대 회고 (3분)'))
      panel.append(p('화면은 멈춰 있다. 슬롯을 하나씩 가리키며 묻는다. 안 누른 것을 먼저.\n(안 누른 것) "이건 안 눌러보셨는데, 뭐라고 생각하셨어요?"\n(누른 것) "이건 뭘 할 것 같았어요?"\n답을 말 그대로 받아 적는다. 맞다 · 틀리다를 말하지 않는다.'))
      expectEl = document.createElement('div')
      panel.append(expectEl)
      void loadExpect()
      panel.append(button('③ 기능 소개 시작 (7분)', () => {
        api.startIntro()
        close()
      }))
    }
    if (st.phase === 'briefing' && !st.cleared) {
      panel.append(h('③ 기능 소개 (7분)'))
      panel.append(p('여는 말 한 문장만 — "이제 이게 뭘 하는 건지 화면이 하나씩 알려드릴 거예요. 직접 한 번씩 해보시고 [다음]을 누르시면 됩니다."\n그 뒤로는 읽지 않는다. 질문받으면 화면의 문장을 가리킨다. 시연하지 않는다. 용도는 말하지 않는다.\n참여자가 그 동작을 하면 [다음]이 켜진다(마킹 · 맺음은 처음부터 켜져 있다).'))
      introEl = p('')
      panel.append(introEl)
      panel.append(button('이 단계 넘기기 (막혔을 때만)', () => {
        api.skipIntroStep()
      }, { small: true, disabled: st.introDone }))
    }
    // 구간 1로 가는 버튼은 기능 소개가 끝난 뒤에만 보인다. 그 전 단계에서는 맨 아래 「건너뛰기」 안에 숨긴다 (PI-016 — 점검 4에서 탐색 중에 눌러 소개를 건너뛰었다)
    if (st.phase === 'briefing') {
      panel.append(h('④ 구간 1 (1 + 10분)', 14))
      panel.append(p('① "화면을 새로 비우겠습니다. 이제부터 10분이에요." → [화면 비우기]\n② 과제문 — "떠오르는 것을 만들어 보세요. 정답도, 끝나는 기준도 없습니다. 완성하지 않으셔도 됩니다."\n③ [구간 1 시작]'))
      panel.append(button(st.cleared ? '화면 비움 ✔' : '화면 비우기', () => {
        api.clearWorkspace()
      }, { disabled: st.cleared || !st.introDone }))
      if (!st.introDone && !st.cleared) panel.append(p('소개가 끝나면(맺음 [끝]) 켜진다'))
      panel.append(button('구간 1 시작 (10분)', () => {
        api.startSeg1()
        close()
      }, { disabled: !st.cleared }))
    }
    if (st.phase === 'create1') {
      panel.append(p('구간 1 — 개입 0. 10분이 되면 말로 끊는다 — "여기까지 할게요." 그리고 [구간 1 종료].\n화면은 자동으로 끝나지 않는다. 2분 이상 정지 시 한 번만 "지금 무슨 생각 하고 계세요?"'))
      panel.append(button('구간 1 종료 → 잠금', () => {
        api.endSeg1Now()
      }))
    }
    if (st.phase === 'hold') {
      const [axis, value] = (st.lock ?? '=').split('=')
      panel.append(h('구간 1 끝 — 참여자 화면은 멈춰 있다', 14))
      panel.append(p('아래 [구간 2 시작]을 누르기 전까지 참여자가 무엇을 눌러도 반응하지 않는다(접촉은 기록된다). 말할 것을 다 말한 뒤 누른다.'))
      panel.append(p('끊은 직후 — "지금 멈추라고 해서 멈춘 건가요, 하실 만큼 하신 건가요?" (답을 기록지에)'))
      panel.append(h(`잠긴 것 — ${api.lockName(axis ?? '', value ?? '')}`, 15))
      panel.append(p(`${st.lock ?? '—'} · 기록지에 적는다\n"이번에는 ○○만 빼고 해보시겠어요? 나머지는 그대로예요. 10분입니다."`))
      panel.append(button('구간 2 시작 (10분)', () => {
        api.startSeg2()
        close()
      }))
    }
    if (st.phase === 'create2') {
      panel.append(p(`잠금 ${st.lock ?? '—'} · 개입 0. 10분 뒤 화면이 멈추고 회고로 넘어간다.`))
      panel.append(button('구간 2 조기 종료 → 회고', () => {
        api.endSeg2Early()
      }))
    }
    if (st.seg === 1 || st.seg === 2) {
      panel.append(button('비상 정지 (지금 구간을 끝내고 회고 모드로)', () => {
        api.emergencyStop()
      }, { danger: true }))
    }

    if (st.seg === 3) {
      panel.append(h('회고'))
      reviewEl = document.createElement('div')
      panel.append(reviewEl)
      reviewLoaded = false
      void loadReview()
    }

    // 건너뛰기 — 비상용. 창작 전 단계를 건너뛰고 구간 1로. 되돌릴 수 없다
    if (st.seg === 0 && st.phase !== 'briefing') {
      panel.append(h('건너뛰기 (비상용)', 13))
      const row = checkbox('남은 창작 전 단계를 건너뛰고 곧바로 구간 1로 간다 — 이 회차는 기능 소개 없이 진행된다', skipArmed, (v) => {
        skipArmed = v
        render()
      })
      panel.append(row)
      if (skipArmed) {
        panel.append(button('구간 1 시작 — 남은 단계를 건너뛴다', () => {
          skipArmed = false
          api.startSeg1()
          close()
        }, { danger: true, small: true }))
      }
    }

    panel.append(h('내보내기'))
    panel.append(button(lastExport ? '재시도' : '내보내기 (jsonl + 오디오)', async () => {
      lastExport = await api.exportNow()
    }))
    if (lastExport) {
      panel.append(p(lastExport.ok ? `완료 — ${lastExport.method} · ${lastExport.files.join(' · ')}` : `실패 — ${lastExport.method} · ${lastExport.error ?? ''}`))
    }

    panel.append(h('세션 버리기'))
    panel.append(p('준비 화면으로 돌아간다. 이 세션의 로그·오디오는 IndexedDB에 남고 내보내기 전까지 다음 로드에서 다시 복구된다'))
    panel.append(button('새 세션으로', async () => {
      await api.abandon()
      lastExport = null
    }))
  }

  /** 회고 화면 (§7-1) — 마킹 목록 · 미사용 · 정지 · 버튼 인지 */
  async function loadReview(): Promise<void> {
    if (!reviewEl || reviewLoaded) return
    reviewLoaded = true
    const d = await api.reviewData()
    if (!reviewEl) return
    reviewEl.replaceChildren()
    reviewEl.append(h('마킹 — 탭하면 그 순간을 불러와 0부터 1회 재생', 14))
    if (d.marks.length === 0) reviewEl.append(p('마킹 0 — 만족선 측정 불가'))
    d.marks.forEach((m, i) => {
      reviewEl?.append(button(`★ ${i + 1}  ${mmss(m.t)}  캔버스 #${m.canvas} · 노트 ${m.notes.length}${m.n_before !== null ? ` · 앞 조작 ${m.n_before}` : ''}`, () => api.reviewPlay(m), { small: true }))
    })
    if (d.marks.length) reviewEl.append(button('화면을 마지막 상태로', () => api.reviewClear(), { small: true }))
    reviewEl.append(h('미사용 — 탐색 (몰랐다)', 14))
    reviewEl.append(p(`탐색 4분 동안 접촉 0: ${d.unusedExplore.length ? d.unusedExplore.join(' · ') : '없음'}`))
    reviewEl.append(h('미사용 — 창작 (알고도 안 썼다)', 14))
    reviewEl.append(p(`구간 1 · 2에서 접촉 0: ${d.unusedCreate.length ? d.unusedCreate.join(' · ') : '없음'}\n채택 0인 재료: ${d.unadopted.length ? d.unadopted.join(' · ') : '없음'}\n칩 ${d.chipsMade}개 중 놓은 것 ${d.chipsPlaced}`))
    reviewEl.append(h('정지 (≥ 60 s)', 14))
    reviewEl.append(p(d.idles.length ? d.idles.map((x) => `${mmss(x.t - x.dur)} → ${mmss(x.t)} (${Math.round(x.dur / 1000)} s)`).join('\n') : '없음'))
    reviewEl.append(h('우 3 첫 접촉 (창작 구간)', 14))
    const names: Record<string, string> = { mark: '마킹', 'canvas.keep': '남기고 새로', 'canvas.discard': '지우고 새로' }
    reviewEl.append(p(Object.entries(d.firstTouch).map(([k, t]) => `${names[k] ?? k}: ${t === null ? '—' : mmss(t)}`).join(' · ')))
    if (d.lock) {
      const l = d.lock
      reviewEl.append(h('잠금', 14))
      reviewEl.append(p(`${String(l.rule)} → ${String(l.axis)}=${String(l.value)} · alt ${JSON.stringify(l.alt)}\np ${JSON.stringify(l.p)}\np_norm ${JSON.stringify(l.p_norm)}\ncandidates ${JSON.stringify(l.candidates)} · T_active ${String(l.T_active)} ms\npn_margin ${String(l.pn_margin)}${typeof l.pn_margin === 'number' && l.pn_margin < 0.08 ? ' — 잠금 근거 약함 (분석에서 표시)' : ''}`))
    }
  }

  /** 기대 회고 목록 — 자유 탐색에서 누른 것 · 안 누른 것, 화면 배치 순서 */
  async function loadExpect(): Promise<void> {
    if (!expectEl) return
    const d = await api.expectData()
    if (!expectEl) return
    expectEl.replaceChildren()
    const sec = (ms: number | null) => (ms === null ? '' : ` · 첫 접촉 ${mmss(ms)}`)
    const where = (i: number): string => (i < 6 ? `아래 오른쪽 ${i + 1}번째` : i < 9 ? `아래 왼쪽 ${i - 5}번째` : `왼쪽 서랍 위에서 ${i - 8}번째`) // 09.30 배치 — 기능 6 오른쪽 · 세션 버튼 3 왼쪽
    const rows = d.slots.map((r, i) => ({ ...r, where: where(i) }))
    const untouched = rows.filter((r) => r.count === 0)
    const touched = rows.filter((r) => r.count > 0)
    expectEl.append(h(`먼저 — 안 누른 것 ${untouched.length}`, 13))
    expectEl.append(p(untouched.length ? untouched.map((r) => `${r.where} — ${r.label}`).join('\n') : '없음'))
    expectEl.append(h(`다음 — 누른 것 ${touched.length}`, 13))
    expectEl.append(p(touched.length ? touched.map((r) => `${r.where} — ${r.label} · ${r.count}회${sec(r.first)}`).join('\n') : '없음'))
    expectEl.append(h('면 위에서 한 것', 13))
    expectEl.append(p(d.acts.map((a) => `${a.label} ${a.count}`).join(' · ')))
  }

  /** 주기 갱신은 이 줄과 미터만 — 전체를 다시 그리면 입력 중인 pid가 날아간다 */
  function updateStatus(): void {
    if (meterEl && meterThrEl) {
      const pct = Math.min(100, (mic.getLevel() / 0.2) * 100)
      meterEl.style.width = `${pct.toFixed(1)}%`
      meterThrEl.style.left = `${Math.min(100, (mic.getThreshold() / 0.2) * 100).toFixed(1)}%`
    }
    if (introEl) {
      const s = api.status()
      const head = s.introDone ? '소개 끝.' : s.introStep ? `진행 ${s.introStep.i + 1} / ${s.introStep.n} · ${s.introStep.met ? '[다음] 켜짐' : '동작을 기다리는 중'}` : '—'
      const el = s.introElapsed === null ? '' : ` · 경과 ${mmss(s.introElapsed)} / 7:00`
      introEl.textContent = `${head}${el}\n${s.introOrder.map((o, i) => `${o.met ? '●' : '○'} ${i + 1}. ${o.name}${s.introStep && s.introStep.i === i && !s.introDone ? '  ◀' : ''}`).join('\n')}`
    }
    if (!statusEl) return
    const st = api.status()
    const parts = [
      `캔버스 #${st.canvas} (전체 ${st.canvases} · 목록 ${st.listed}) · 노트 ${st.notes} · 이미지 ${st.images} · 마킹 ${st.marks}`,
      `재료 ${st.mat} · 격자 ${st.grid ? 'ON' : 'OFF'} · 생성 ${st.gen} · ${st.playing ? '▶ 재생 중' : '■ 정지'}`,
    ]
    if (st.exploreRemain !== null) parts.push(`자유 탐색 남음 ${mmss(st.exploreRemain)}`)
    if (st.elapsedSeg1 !== null && st.phase === 'create1') parts.push(`구간 1 경과 ${mmss(st.elapsedSeg1)} / 10:00${st.elapsedSeg1 >= 600_000 ? ' — 끊을 시간' : ''}`)
    if (st.remainSeg2 !== null) parts.push(`구간 2 남음 ${mmss(st.remainSeg2)}`)
    parts.push(`${st.recording ? '● 녹음 중' : '○ 녹음 없음'} · 입력 채널 ${st.micInput ? 'ON' : 'OFF'} · 잠금식 ${st.lockRule}`)
    statusEl.textContent = parts.join('\n')
  }

  function open(): void {
    ensure()
    if (!root) return
    skipArmed = false // 건너뛰기는 열 때마다 다시 잠근다
    root.style.display = 'block'
    render()
    if (timer === null) timer = window.setInterval(updateStatus, 100)
  }

  function close(): void {
    if (!root) return
    root.style.display = 'none'
    if (timer !== null) {
      clearInterval(timer)
      timer = null
    }
  }

  return { open, close }
}
