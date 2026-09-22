# §1 실행 환경 · 스택 · 배포

> **정본** — [SPEC.md](../../SPEC.md) §1
> **근거** — 구현 명세 V0.3 §12 · §12-1 · 기능 명세 §1-2
> **대응 코드** — `src/sw.ts` · `public/manifest.webmanifest` · `vite.config.ts` · `index.html`
>
> 이 파일은 스펙을 다시 쓰는 자리가 아니라 **이 절을 구현하며 쌓이는 것**(메모 · 구현 결정 · 교정값 · 상위 문서에 되돌릴 정정)을 두는 자리다. 규칙·수치가 SPEC과 어긋나면 SPEC(볼트 원본)을 먼저 고친다.

## 이 절이 정하는 것

- 기기 iPad Pro 12.9 5세대 · iPadOS 26.8 · 1366 × 1024 pt · 손가락 압력 없음
- Safari **홈 화면에 추가(standalone)** · 가로 고정 · 세션 내내 페이지 이동 없음
- 서비스 워커가 정적 자산 전부 프리캐시 · 세션 전날 캐시 굳힘 · 현장 새로고침 금지
- 정적 호스팅(GitHub Pages) · 프레임워크 없음 · Canvas 2D + Web Audio + Pointer Events · TypeScript · Vite 단일 진입 · 외부 라이브러리 0(필요 시 `fflate`까지)
- 저장 IndexedDB · 내보내기 `navigator.share({ files })` · 실패 시 보존 후 시트에서 재시도
- OS 회전 잠금 + Guided Access · `wakeLock` · 블루투스 스피커 금지 · 무음 모드 해제
- 빌드 식별 `probe-<semver>+<git short hash>`

## 열린 항목

- [ ] GitHub Pages 저장소·경로 확정 (base path → `vite.config.ts`)
- [ ] standalone에서 마이크 권한이 Safari와 별도로 저장되는지 실기기 확인 (V0.3 §12-1 #3)
- [ ] `navigator.share({ files })`가 standalone Safari에서 파일 앱으로 저장되는지 실기기 확인
- [x] 빌드 시 git short hash를 헤더 `build`에 넣는 방법 (Vite `define`) — 09.22. 단, 폴더가 아직 git 저장소가 아니라 `nogit`

## 구현 메모

- 09.22 — Node v24.21.0 LTS를 `~/.local/node`에 두고 `~/bin`에 링크(관리자 권한 없음). `npm run dev` · `npm run dev:host`(같은 Wi-Fi의 iPad에서 열 때)
- 09.22 — `vite.config.ts`: `base './'` · `__BUILD__` = `probe-<package.json version>+<git short hash>`(저장소가 아니면 `nogit`) · 개발 전용 `/__dump`

- 09.22 (2단계) — `src/sw.ts`를 별도 Rollup 입력(`sw.js`)으로 빌드하고, `vite.config.ts`의 `swPrecache` 플러그인이 산출물 목록을 `'__PRECACHE_JSON__'` 자리에 넣는다. 캐시 이름 = 빌드 식별자. 개발 서버에서는 등록하지 않는다
- 09.22 — 확인 방법: `npm run build && npm run preview` → 첫 로드 후 `caches.keys()`에 빌드 이름, 이후 서버를 끄고 새로고침해도 뜨는지. **기내 모드 실측은 iPad**

## 상위 문서에 되돌릴 것

_(없음)_
