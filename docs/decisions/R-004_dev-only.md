# R-004 — 개발 전용 장치: `/__dump` · `window.__probe` · 다운로드 폴백

| | |
| --- | --- |
| 날짜 | 2026-09-22 |
| 상태 | 승인 |
| SPEC | §1 (내보내기는 `navigator.share`) · §12-1 #7 (로그 검증 스크립트를 매일 밤) |
| 코드 | `vite.config.ts` `devDump` · `src/main.ts` (`import.meta.env.DEV`) · `src/log.ts` `exportSession` |

## 정한 것
1. **`POST /__dump?name=<sid>`** — 개발 서버만. 본문을 `sessions/<sid>.jsonl`에 쓴다. 데스크톱 테스트 로그를 곧바로 `chain.py`에 넣기 위한 것. `apply: 'serve'`라 빌드에 없다
2. **`window.__probe`** — `import.meta.env.DEV`일 때만. `jsonl` · `status` · `openSheet` · `exportNow` · `dump`
2-1. **Shift+F** — 개발 모드에서 진행자 시트를 여는 단축키. 데스크톱은 레터박스 때문에 좌상단 5연타 자리가 보이지 않는다
3. **내보내기 폴백** — `navigator.share`가 파일을 못 받으면 `<a download>`. 세션 기기(iPad standalone)에서는 share가 정본이고, 폴백은 데스크톱용이다. 결과의 `method`를 `facilitator {action:'export.result'}`에 남긴다

## 주의
`sessions/`는 `.gitignore`에 있다. 참여자 로그를 저장소에 올리지 않는다.
