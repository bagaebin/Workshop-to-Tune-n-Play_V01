# §9 마이크

> **정본** — [SPEC.md](../../SPEC.md) §9
> **근거** — 구현 명세 V0.3 §7-3 (⑯) · 기능 명세 G2
> **대응 코드** — `src/mic.ts`
>
> 이 파일은 스펙을 다시 쓰는 자리가 아니라 **이 절을 구현하며 쌓이는 것**(메모 · 구현 결정 · 교정값 · 상위 문서에 되돌릴 정정)을 두는 자리다. 규칙·수치가 SPEC과 어긋나면 SPEC(볼트 원본)을 먼저 고친다.

## 이 절이 정하는 것

- `getUserMedia({ audio: { echoCancellation: true, noiseSuppression: false, autoGainControl: false } })`
- 녹음 트랙 — `MediaRecorder` 세션 전체 · 브라우저 기본 MIME → 파일 2 · 게이트와 무관
- 입력 채널 — `AnalyserNode` 60 Hz · RMS > `MIC_THR` 40 ms → 온셋 · 50 ms 자기상관 f0 → pitch · < THR 150 ms → 노트 끝 · 1 500 ms 무음 → `mic.span` 끝
- 놓는 위치 — span 첫 노트는 `playFrom` · 이후 실시간 경과만큼 오른쪽 · `L`에서 span 종료 · `src:'mic'`
- 게이트 — 마스터 출력 RMS ≥ 임계 동안 입력 닫힘 · `mic.gate {on}` · `gated_ms` 합산
- 권한은 준비 화면에서 · 임계는 레벨 미터로 진행자 조정 → 헤더 `mic_threshold`

## 열린 항목

- [ ] **절단 후보 1순위** — 09.25 밤 판정. 잘리면 녹음 트랙만 남기고 헤더 `mic_input:false` · `cuts:["mic_input"]`
- [ ] 자기상관 피치 추정의 최소 구현 범위 (E2–E6 클램프)
- [ ] 게이트 임계값 — SPEC에 수치 없음 (저장소 결정 R-번호 후보, 파일럿 교정)

## 구현 메모

- 09.22 (2단계) — 권한·레벨 미터·임계 슬라이더·MediaRecorder 녹음 트랙까지. 청크는 1 s마다 IndexedDB `audio`에 append, 녹음기를 다시 시작하면 `part`가 늘고 part마다 파일 하나(`.audio.2.m4a`)
- 09.22 — 개발 브라우저 패널은 마이크가 막혀 있어 **거부 경로만** 확인했다(헤더 `mic_recording:false` · `audio_mime:null`). 실제 녹음·MIME은 iPad에서
- 09.22 — 헤더에 `mic_recording`(녹음 트랙 여부)을 추가했다. `mic_input`은 입력 채널(4단계)용으로 남겨 둔다 → 상위 문서 정정 후보

- 09.22 (4단계) — 입력 채널 구현: 60 Hz 폴링 · RMS 온셋/종료 · 온셋 후 50 ms 자기상관 f0(E2–E6) · span의 첫 노트는 playFrom, 이후 실시간 경과 · L에 닿으면 span 종료 · 게이트 = 마스터 출력 RMS ≥ 마이크 임계(`mic.gate`, `gated_ms`). **브라우저 패널이 마이크를 막아 실측 못 함 — iPad에서** 헛노트·게이트 빈도·피치 추정 품질을 본다
- 09.22 — 절단 시(`CUTS`에 `mic_input`) 입력 채널만 빠지고 녹음 트랙은 남는다. 헤더 `mic_input:false`

## 상위 문서에 되돌릴 것

_(없음)_
