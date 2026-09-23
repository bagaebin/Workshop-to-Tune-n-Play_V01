/**
 * update.ts — 새 빌드 확인 (진행자 시트 준비 화면 전용 · R-009)
 *
 * 홈 화면 앱에는 새로고침이 없고, 서비스 워커는 저장해 둔 빌드를 먼저 띄운다. 그래서 진행자가 명시적으로 새 빌드를 받을 길을 둔다.
 * version.json(빌드 때 생성, 서비스 워커가 캐시하지 않음)을 HTTP 캐시 없이 읽어 지금 빌드와 비교한다.
 * 받을 때는 서비스 워커 등록을 풀고 캐시를 지운 뒤 다시 불러온다 — 다음 로드에서 main.ts가 새 빌드로 다시 등록·캐시한다.
 * 오프라인이면 아무것도 지우지 않는다. IndexedDB(세션 로그)는 건드리지 않는다.
 */
declare const __BUILD__: string | undefined

export const CURRENT = typeof __BUILD__ === 'string' ? __BUILD__ : 'probe-dev'

export type Check = { ok: true; remote: string; newer: boolean } | { ok: false; error: string }

export async function check(): Promise<Check> {
  try {
    const url = new URL('version.json', document.baseURI)
    url.searchParams.set('t', String(Date.now()))
    const r = await fetch(url.href, { cache: 'no-store' })
    if (!r.ok) return { ok: false, error: `HTTP ${r.status}` }
    const j = (await r.json()) as { build?: string }
    const remote = String(j.build ?? '')
    return { ok: true, remote, newer: remote !== '' && remote !== CURRENT }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) }
  }
}

/** 캐시를 비우고 새로 받는다. 먼저 check()가 온라인임을 확인한 뒤에만 부른다 */
export async function reloadFresh(): Promise<void> {
  if ('serviceWorker' in navigator) {
    const regs = await navigator.serviceWorker.getRegistrations()
    await Promise.all(regs.map((r) => r.unregister()))
  }
  if ('caches' in window) {
    const keys = await caches.keys()
    await Promise.all(keys.map((k) => caches.delete(k)))
  }
  const url = new URL(document.baseURI)
  url.searchParams.set('v', String(Date.now())) // HTTP 캐시(Pages max-age 600)도 건너뛴다
  location.replace(url.href)
}
