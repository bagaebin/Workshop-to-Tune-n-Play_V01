/**
 * sw.ts — 서비스 워커 (SPEC §1 오프라인)
 *
 * 정적 자산 전부를 설치 시 프리캐시한다. 목록(__PRECACHE_JSON__)은 vite.config.ts가 빌드 산출물로 채운다.
 * 세션 전날 한 번 띄워 캐시를 굳히고, 현장에서는 새로고침하지 않는다. 캐시 이름에 빌드가 들어가 빌드가 바뀌면 통째로 교체된다.
 * 개발 서버(vite dev)에서는 등록하지 않는다 — main.ts.
 */
declare const __BUILD__: string

const sw = self as unknown as ServiceWorkerGlobalScope
const CACHE = typeof __BUILD__ === 'string' ? __BUILD__ : 'probe-dev' // 예: probe-0.0.0+a1b2c3d
const PRECACHE: string[] = JSON.parse('__PRECACHE_JSON__') as string[]

const abs = (p: string): string => new URL(p, sw.registration.scope).href

sw.addEventListener('install', (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(CACHE)
      await cache.addAll(PRECACHE.map(abs))
      await sw.skipWaiting()
    })(),
  )
})

sw.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys()
      await Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))
      await sw.clients.claim()
    })(),
  )
})

sw.addEventListener('fetch', (event) => {
  const req = event.request
  if (req.method !== 'GET') return
  const url = new URL(req.url)
  if (url.origin !== sw.location.origin) return
  event.respondWith(
    (async () => {
      const cache = await caches.open(CACHE)
      if (req.mode === 'navigate') {
        const page = await cache.match(abs('index.html'))
        if (page) return page
      }
      const hit = await cache.match(req, { ignoreSearch: true })
      if (hit) return hit
      const res = await fetch(req)
      if (res.ok) void cache.put(req, res.clone())
      return res
    })(),
  )
})

export {}
