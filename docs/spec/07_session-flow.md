# §7 세션 흐름 · §7-1 진행자 시트

> **정본** — [SPEC.md](../../SPEC.md) §7 · §7-1
> **근거** — 구현 명세 V0.3 §10 · 기능 명세 G13 · G16 · N1 · 세션 계획 V03 §6 · §10
> **대응 코드** — `src/session.ts`(구간·타이머·잠금 적용) · `src/facilitator.ts`(시트)
>
> 이 파일은 스펙을 다시 쓰는 자리가 아니라 **이 절을 구현하며 쌓이는 것**(메모 · 구현 결정 · 교정값 · 상위 문서에 되돌릴 정정)을 두는 자리다. 규칙·수치가 SPEC과 어긋나면 SPEC(볼트 원본)을 먼저 고친다.

## 이 절이 정하는 것

- `seg −1` 준비(시트: pid · 마이크 · 체크리스트 · [시작]) → 흰 플래시 3프레임 `session.flash {wall}` · `t0`
- `seg 0` 튜토리얼 — 원 하나(중심 763,466 · 지름 240) · 어떤 접촉이든 같은 소리 · 첫 접촉이 `AudioContext.resume()` · 노트 없음
- `seg 1` 자유 — `seg.start` 기준 +480 000 `done.appear`(3초 페이드) · +900 000 `done by:cap`
- `done` → `seg.end{1}` → 잠금 계산·적용 → `snapshot reason:seg` → `canvas.new reason:lock` → `seg.start{2}` 지연 없음
- `seg 2` 잠금 7분 → `seg.end{2, by:timer}`(시트로 조기 종료 가능)
- `seg 3` 회고 — UI 동결 · 접촉 `acted:false` · 시트: 마킹 재생 · 미사용 · 정지 · 버튼 인지 · 내보내기
- 시트 열기 — 좌상단 (0,0)–(30,32)를 1.5초 안에 5연타 · 모든 조작 `facilitator {action}`

## 열린 항목

- [ ] 타이머 기준을 `seg.start seg:1`의 `t`로 — 플래시·첫 터치가 아님을 테스트로 고정
- [ ] 회고 모드에서 마킹 스냅샷을 작업 면에 불러와 0부터 1회 재생하는 경로 (조작 불가 상태 유지)
- [ ] [비상 정지]의 정의 — 무엇을 멈추고 무엇을 남기는가 (SPEC에 미기재 → 저장소 결정 R-번호 후보)

## 구현 메모

- 09.22 — 플래시는 rAF 3프레임. 첫 프레임에서 `t0` · 헤더 · `session.flash` 순으로 쓴다(헤더 `wall` = 플래시 `wall`)
- 09.22 — 헤더 `standalone`은 `display-mode: standalone` 매치 또는 `navigator.standalone`. `device`·`os`는 UA에서 대략 추정 — iPadOS Safari는 UA가 Mac처럼 보이므로 `maxTouchPoints > 1`로 iPad 판정
- 09.22 — 진행자 시트는 DOM 오버레이. 열린 동안 캔버스는 접촉을 받지 않는다(가려진 접촉 `blocked:true` 기록은 하지 않는다 — 시트는 참여자 화면이 아니다)

- 09.22 (4단계) — 타이머 기준은 `seg.start`의 `t`(플래시·첫 터치가 아님). `done.appear`는 rAF 프레임에서 판정하므로 ±16 ms. `?fast`(개발 전용)로 8 s · 15 s · 10 s
- 09.22 — done → seg.end 1 → lock.apply → (by:lock 전이) → snapshot seg → canvas.new lock → seg.start 2. 구간 2 종료 → seg 3: 재생 정지 · 입력 칸 닫기 · 마이크 입력 정지 · 녹음 정지
- 09.22 — 회고 화면 자료는 로그에서 계산한다(R-007 #13). 마킹 탭 = 스냅샷을 작업 면에 불러와(회고 오버레이) 0부터 1회 재생, `facilitator {action:'review.play'}`
- 09.22 — 비상 정지 정의는 R-007 #11

- 09.23 — iPad에서 5연타가 안 잡힘 → 인정 범위를 화면 기준 왼쪽 위 60 pt로 넓힘(R-008). 상태 표시줄(`black` 스타일)이 위 24 pt를 차지하고 Safari 툴바가 있으면 레터박스가 생겨 가상 (0,0)이 물리 모서리에서 밀린다

## 상위 문서에 되돌릴 것

_(없음)_
