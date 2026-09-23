/**
 * facilitator.ts — 진행자 시트 (SPEC §7-1)
 *
 * 준비(pid · 마이크 · 체크리스트 · 잠금식 · [시작]) · 세션 중(구간 · 경과 · [구간 1 시작] · [구간 2 조기 종료] · [비상 정지]) ·
 * 회고(마킹 목록 → 재생 · 미사용 목록 · 정지 목록 · 버튼 인지 · [내보내기] · [재시도]) · 복구 표시 · [새 세션으로].
 * DOM 오버레이라 열린 동안 캔버스 접촉은 닿지 않는다. 모든 조작은 session이 facilitator {action}으로 남긴다.
 */
import type { Checks, Status, ReviewData, ReviewMark } from './session'
import type { ExportResult } from './log'
import type { LockRule } from './lock'
import * as mic from './mic'
import * as update from './update'

export interface FacApi {
  status(): Status
  start(pid: string, checks: Checks): Promise<void>
  startSeg1(): void
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
  let statusEl: HTMLElement | null = null
  let meterEl: HTMLElement | null = null
  let meterThrEl: HTMLElement | null = null
  let reviewEl: HTMLElement | null = null
  let reviewLoaded = false
  const checks: Record<string, boolean> = {}
  let lockRule: LockRule = 'v0.3'
  let pid = ''

  const segName = (s: number) => ({ '-1': '준비', '0': '튜토리얼', '1': '구간 1 자유', '2': '구간 2 잠금', '3': '회고' })[String(s)] ?? String(s)
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
    meterEl = null
    meterThrEl = null
    reviewEl = null
    panel.append(h('진행자 시트', 18), p(`${st.build} · ${segName(st.seg)}${st.cuts.length ? ` · cuts ${st.cuts.join(',')}` : ''}`))

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
        startBtn.disabled = pid.length === 0
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
      const startBtn = button('시작 → 플래시 → 튜토리얼', async () => {
        await api.start(pid, { guided_access: checks.guided_access ?? false, silent_mode_off: checks.silent_mode_off ?? false, lock_rule: lockRule })
        close()
      }, { disabled: pid.length === 0 })
      panel.append(startBtn)
      return
    }

    panel.append(h(`pid ${st.pid}`))
    if (st.resumed) panel.append(p('⟲ 새로고침 뒤 복구된 세션 — 로그는 이어진다 (session.resume)'))
    statusEl = p('')
    panel.append(statusEl)
    updateStatus()

    if (st.seg === 0) {
      panel.append(p('과제문을 읽은 뒤 누른다. 원이 사라지고 전체 UI가 한 번에 나타난다.'))
      panel.append(button('구간 1 시작', () => {
        api.startSeg1()
        close()
      }))
    }
    if (st.seg === 1) {
      panel.append(p('구간 1 — 8분에 「여기까지」 등장, 15분 상한. 참여자가 누르면 구간 2로 넘어가고 잠금이 적용된다.\n2분 이상 정지 시 한 번만 "지금 무슨 생각 하고 계세요?"'))
    }
    if (st.seg === 2) {
      panel.append(p(`잠금 ${st.lock ?? '—'} · "방금 만드신 것을, 이것 없이 다시 해보세요"`))
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
    reviewEl.append(h('미사용', 14))
    reviewEl.append(p(`접촉 0인 슬롯: ${d.unusedSlots.length ? d.unusedSlots.join(' · ') : '없음'}\n채택 0인 재료: ${d.unadopted.length ? d.unadopted.join(' · ') : '없음'}\n칩 ${d.chipsMade}개 중 놓은 것 ${d.chipsPlaced}`))
    reviewEl.append(h('정지 (≥ 60 s)', 14))
    reviewEl.append(p(d.idles.length ? d.idles.map((x) => `${mmss(x.t - x.dur)} → ${mmss(x.t)} (${Math.round(x.dur / 1000)} s)`).join('\n') : '없음'))
    reviewEl.append(h('우 4 첫 접촉', 14))
    const names: Record<string, string> = { mark: '마킹', 'canvas.keep': '남기고 새로', 'canvas.discard': '지우고 새로', done: '여기까지' }
    reviewEl.append(p(Object.entries(d.firstTouch).map(([k, t]) => `${names[k] ?? k}: ${t === null ? '—' : mmss(t)}`).join(' · ')))
    if (d.lock) {
      const l = d.lock
      reviewEl.append(h('잠금', 14))
      reviewEl.append(p(`${String(l.rule)} → ${String(l.axis)}=${String(l.value)} · alt ${JSON.stringify(l.alt)}\np ${JSON.stringify(l.p)}\np_norm ${JSON.stringify(l.p_norm)}\ncandidates ${JSON.stringify(l.candidates)} · T_active ${String(l.T_active)} ms`))
    }
  }

  /** 주기 갱신은 이 줄과 미터만 — 전체를 다시 그리면 입력 중인 pid가 날아간다 */
  function updateStatus(): void {
    if (meterEl && meterThrEl) {
      const pct = Math.min(100, (mic.getLevel() / 0.2) * 100)
      meterEl.style.width = `${pct.toFixed(1)}%`
      meterThrEl.style.left = `${Math.min(100, (mic.getThreshold() / 0.2) * 100).toFixed(1)}%`
    }
    if (!statusEl) return
    const st = api.status()
    const parts = [
      `캔버스 #${st.canvas} (전체 ${st.canvases} · 목록 ${st.listed}) · 노트 ${st.notes} · 이미지 ${st.images} · 마킹 ${st.marks}`,
      `재료 ${st.mat} · 격자 ${st.grid ? 'ON' : 'OFF'} · 생성 ${st.gen} · ${st.playing ? '▶ 재생 중' : '■ 정지'}`,
    ]
    if (st.elapsedSeg1 !== null && st.seg === 1) parts.push(`구간 1 경과 ${mmss(st.elapsedSeg1)} / 15:00 · 여기까지 ${st.doneVisible ? '등장' : '8:00에'}`)
    if (st.remainSeg2 !== null) parts.push(`구간 2 남음 ${mmss(st.remainSeg2)}`)
    parts.push(`${st.recording ? '● 녹음 중' : '○ 녹음 없음'} · 입력 채널 ${st.micInput ? 'ON' : 'OFF'} · 잠금식 ${st.lockRule}`)
    statusEl.textContent = parts.join('\n')
  }

  function open(): void {
    ensure()
    if (!root) return
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
