/**
 * main.ts — 진입점 (SPEC §7 · §17)
 *
 * 캔버스 마운트 → session.init(입력 · 렌더 루프) → 새로고침 복구 시도 → 진행자 시트 연결 → (빌드에서만) 서비스 워커 등록.
 * 개발 모드에서만 window.__probe(로그 덤프 · 상태)와 Shift+F(시트)를 노출한다.
 */
import * as session from './session'
import { initFacilitator } from './facilitator'
import * as log from './log'

function mount(): { canvas: HTMLCanvasElement; ctx: CanvasRenderingContext2D } {
  const el = document.getElementById('stage')
  if (!(el instanceof HTMLCanvasElement)) throw new Error('#stage 없음')
  const c = el.getContext('2d')
  if (!c) throw new Error('2d 컨텍스트 없음')
  return { canvas: el, ctx: c }
}

const { canvas, ctx } = mount()
session.init(canvas, ctx)

const sheet = initFacilitator({
  status: session.status,
  start: session.start,
  startSeg1: session.startSeg1,
  endSeg2Early: session.endSeg2Early,
  emergencyStop: session.emergencyStop,
  exportNow: session.exportNow,
  abandon: session.abandon,
  reviewData: session.reviewData,
  reviewPlay: session.reviewPlay,
  reviewClear: session.reviewClear,
})
session.setSheetOpener(sheet.open)

// §10-4 — 새로고침돼도 IndexedDB에서 이어 붙인다. 실패해도 준비 화면으로 간다
void session.tryResume().catch((e) => console.warn('resume 실패', e))

if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker
      .register(new URL('sw.js', document.baseURI).href)
      .then((reg) => reg.update()) // 로드마다 새 sw.js가 있는지 본다 — 있으면 뒤에서 받아 두고 다음 실행에 쓰인다
      .catch((e) => console.warn('SW 등록 실패', e))
  })
}

if (import.meta.env.DEV) {
  // 개발 전용 — 데스크톱에서는 레터박스 때문에 좌상단 5연타 자리가 보이지 않는다. Shift+F로 시트를 연다. 빌드에는 없다
  window.addEventListener('keydown', (e) => {
    if (e.key.toLowerCase() === 'f' && (e.shiftKey || e.key === 'F')) sheet.open()
  })
  ;(window as unknown as { __probe: unknown }).__probe = {
    jsonl: log.toJsonl,
    status: session.status,
    dwell: session.dwell,
    previewLock: session.previewLock,
    reviewData: session.reviewData,
    openSheet: sheet.open,
    exportNow: session.exportNow,
    abandon: session.abandon,
    /** 개발 서버의 /__dump로 보내 sessions/<sid>.jsonl에 저장 → tools/chain.py */
    dump: async () => {
      const body = await log.toJsonl()
      const r = await fetch(`/__dump?name=${encodeURIComponent(log.sessionId() || 'session')}`, { method: 'POST', body })
      return r.text()
    },
  }
}
