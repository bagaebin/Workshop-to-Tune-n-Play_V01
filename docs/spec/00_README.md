# docs/spec — 절별 작업 노트

> **정본** — [SPEC.md](../../SPEC.md) §1–§17
> **근거** — 구현 명세 V0.3 · 기능 명세 V0.1
> **대응 코드** — `src/` 전체
>
> 이 파일은 스펙을 다시 쓰는 자리가 아니라 **이 절을 구현하며 쌓이는 것**(메모 · 구현 결정 · 교정값 · 상위 문서에 되돌릴 정정)을 두는 자리다. 규칙·수치가 SPEC과 어긋나면 SPEC(볼트 원본)을 먼저 고친다.

## 이 절이 정하는 것

- 파일 하나가 SPEC 한 절(또는 인접한 두 절)에 대응한다. 파일 번호 = SPEC 절 번호
- SPEC `§0 한 줄` · `§17 파일 구조`는 별도 파일을 두지 않는다 — 각각 [README.md](../../README.md) · `src/`가 그 자리다

| 파일 | SPEC | 주 코드 |
| --- | --- | --- |
| [01_environment.md](01_environment.md) | §1 실행 환경 · 스택 · 배포 | `sw.ts` · `public/` · `vite.config.ts` |
| [02_constants.md](02_constants.md) | §2 상수표 | `constants.ts` |
| [03_layout.md](03_layout.md) | §3 화면과 좌표 | `layout.ts` · `render.ts` |
| [04_data-model.md](04_data-model.md) | §4 데이터 모델 | `model.ts` |
| [05_input.md](05_input.md) | §5 입력 처리 | `input.ts` |
| [06_operations.md](06_operations.md) | §6 조작 규칙 | `ops/*` |
| [07_session-flow.md](07_session-flow.md) | §7 세션 흐름 · 7-1 진행자 시트 | `session.ts` · `facilitator.ts` |
| [08_audio.md](08_audio.md) | §8 오디오 | `audio.ts` |
| [09_mic.md](09_mic.md) | §9 마이크 | `mic.ts` |
| [10_log.md](10_log.md) | §10 로그 | `log.ts` · [../log-schema/](../log-schema/) |
| [11_self-lock.md](11_self-lock.md) | §11 자기 잠금 | `lock.ts` |
| [12_preview.md](12_preview.md) | §12 미리보기 | `preview.ts` |
| [13_materials.md](13_materials.md) | §13 더미 재료 | `materials/` |
| [14_build-order-and-cuts.md](14_build-order-and-cuts.md) | §14 제작 순서와 절단 · §15 수용 테스트 · §16 체크리스트 | [../acceptance/](../acceptance/) · [../../CHANGELOG.md](../../CHANGELOG.md) |

## 열린 항목

- 없음

## 구현 메모

_(비어 있음 — 구현하는 날 채운다)_

## 상위 문서에 되돌릴 것

_(없음)_
