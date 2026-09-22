# public/ — standalone 설치 자산 (SPEC §1)

- `manifest.webmanifest` — 홈 화면 추가용. `display: standalone` · `orientation: landscape`
- 아이콘(`apple-touch-icon`) — 미정. 글자·상징 없는 단색이 맞다(N5와 무관하지만 홈 화면에서 도구를 설명하지 않게)
- 서비스 워커는 `src/sw.ts`에서 빌드된다
