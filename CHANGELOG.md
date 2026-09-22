# CHANGELOG

헤더 `build` = `probe-<semver>+<git short hash>`. 세션 전원이 같은 빌드·같은 `cuts`여야 한다 (SPEC §1 · §14-2).

## [Unreleased]

### 2026-09-22 — 5단계 준비
- `tools/chain.py --pilot` — 상수표 ☐ 교정 수치(τ 간격 분포 · 슬롯 근접 오접촉 · 탭 길이 · L 분위 · 규칙 첫 사용 · 마이크 · D1 적기 시간 · 발견 여부 · 버튼 넷 첫 접촉 · radiusX/force 상수 여부) · **D14 두 잠금식 비교**
- `docs/acceptance/pilot-protocol.md` 신설 — 09.26 2회 진행 절차 · 로그 검사 · 교정 반영 순서 · 대안
- 절단 판정 — 자른 것 없음. `CUTS = []`. 마이크 입력 채널은 파일럿 당일 판정

### 2026-09-22 — 4단계 (데스크톱 통과 · iPad 미확인 · T11 대기)
- `ops/gen.ts` gen.set · 규칙/난수 열 한 건(PRNG `hash(seed, seq)`) · 슬라이더 `rule.param` · `ops/text.ts` 입력 칸(visualViewport 위) · 칩 3 · 음절 토큰(T12) · 면/띠 놓기 · abort · absent
- `lock.ts` §11-1 순수 계산(v0.3 · alt v0.2, 준비 화면에서 뒤집기 가능) · `session.ts` 타이머(done.appear · cap · 구간 2 · 회고) · 잠금 적용(slot.gone · by:lock · blank는 첫 조작 = 채택) · `touch.* reason:lock`
- `ops/image.ts` 손잡이 move/size/remove · `mic.ts` 입력 채널(온셋 · 자기상관 f0 · 게이트 = 마스터 출력 RMS) · `audio.ts` 마스터 탭
- `facilitator.ts` 세션 중 제어(구간 2 조기 종료 · 비상 정지) · 회고 화면(마킹 재생 · 미사용 · 정지 · 버튼 인지 · 잠금 근거) · 잠금식 토글
- `tools/chain.py` 4단계 검사 20여 항목(잠금 재계산 · done 시각 · 순서 · 열 · 적기 음절 · 손잡이 · mic.span) · 개발 전용 `?fast`(8 s · 15 s · 10 s)
- 로그 저장 보강 — 읽기 전 `drain()` · 병합 후 거울 정리 · seq 중복 제거 · tx 중 쌓인 줄 연쇄 flush (같은 줄 이중 저장 수정)

### 2026-09-22 — 3단계 (데스크톱 통과 · iPad 미확인)
- `ops/play.ts` 띠 탭 = 시작점 · 재생/정지 · 순환 · 커서식 예약(LOOKAHEAD) · `heard[][]` · `matches_scope` · 격자 양자화 재생 · 체류 구간(spanOpen/Close)
- `ops/material.ts` `sound.json`·이미지 5장 번들 임포트(프리캐시 포함) · 열람(1회 재생 / 패널) · 채택(끌어 놓기, 상태가 바뀔 때만 `mat.adopt`) · `image.place` · `image.touch` u,v
- `ops/canvas.ts` keep/discard/switch/evict · 목록 순서 · 캔버스별 mat·playFrom·선택 · `preview.ts` 9종 무음 루프(시드 난수 · 정지 프레임 전환)
- `layout.ts` 패널·목록·이미지 히트 테스트 · `render.ts` 이미지(노트 아래)·헤드·시작점 표시·목록 축소판·패널·끌기 잔상·미리보기
- `session.ts` 배선 · 복구 재생에 캔버스·이미지·목록 · `tools/make_dummy_materials.py` · `chain.py` 3단계 검사 13항목(34)

### 2026-09-22 — 2단계 (데스크톱 통과 · iPad 미확인)
- `ops/scope.ts` 선택 one/many/all · `ops/notes.ts` 고치기(pos·len, 끌기 중 실시간) · 지우기(면 밖) · `ops/grid.ts` 토글(비파괴, 렌더·히트 테스트·발음에서만 양자화)
- `input.ts` onMove 훅 · N2: 두 번째 포인터 · none · slot.gone · axis 끌기(up에서 acted:false) · blocked 훅
- `log.ts` 체류/idle(§10-5, seg.start가 기준점) · `session.resume`(IndexedDB 재생 · 체류 복원 · 같은 pid 재시작은 `_2`) · 오디오 청크 스토어
- `mic.ts` 권한 · 레벨 미터 · 임계 · MediaRecorder 녹음 트랙(part별) · 내보내기 파일 둘
- `sw.ts` 프리캐시 서비스 워커 + `vite.config.ts` 산출물 목록 주입 · `manifest` scope · apple-touch-icon(단색)
- `facilitator.ts` 마이크 블록 · 복구 표시 · [새 세션으로] · `tools/chain.py` 체류 재계산 + 검사 9항목 추가(21)
- 유실 방지 — touch.move 외 모든 이벤트 즉시 flush + `localStorage` 거울(다음 로드에서 merge). 같은 날 같은 pid 재시작은 sid `_2`

### 2026-09-22 — 1단계 수직 절편 (데스크톱 통과 · iPad 미확인)
- `layout.ts` 영역·슬롯·셔플·좌표↔값·히트 테스트(1단계 범위) · `log.ts` 봉투·헤더·IndexedDB·snapshot·share/다운로드 내보내기 · `audio.ts` saw→LPF→ADSR voice 32 · `render.ts` · `input.ts` Pointer→탭·누르기·끌기, 5연타 · `ops/notes.ts` 더하기 셋 · `ops/buttons.ts` mark · `session.ts` seg −1→0→1 · `facilitator.ts` 준비·구간 1 시작·내보내기 · `tools/chain.py` 체인 한 줄 + ⚙ 12항목
- 개발 전용 — Vite `/__dump` 미들웨어 + `window.__probe`(jsonl · status · openSheet · exportNow · dump). 빌드에는 들어가지 않는다
- 저장소 결정 R-001~R-004 (docs/decisions)

### 2026-09-22 — 0단계 뼈대
- `constants.ts`(§2 전부) · `model.ts`(§4) · `main.ts`(캔버스 마운트 · 배율 · 레터박스) · `index.html` · `vite.config.ts`(`base './'` · `__BUILD__` 주입)
- 개발 환경 — Node v24.21.0 LTS(공식 arm64 tarball → `~/.local/node`, `~/bin` 링크) · `npm install` · `tsc --noEmit` 통과 · `vite build` 통과

### 2026-09-22 — 저장소 골격
- 스펙 문서 폴더 구조와 기본 파일 구조 생성. 구현 코드 없음
- `SPEC.md` ← 볼트 *2026-09-22_Probe 개발 명세* 복사

## cuts 기록

| 날짜 | 판정 시점 | 자른 것 | 헤더 `cuts` |
| --- | --- | --- | --- |
| 09.22 | (전 기능 구현 완료 — 밤별 판정 불필요) | 없음 | `[]` |
| — | 09.26 파일럿 | 마이크 입력 채널이 iPad에서 이상이면 `mic_input` | |
