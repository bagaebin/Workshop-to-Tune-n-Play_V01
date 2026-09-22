# 구현 계획 — 작업 순서

작성 2026-09-22. 기준은 [SPEC.md](../SPEC.md) §14-1(제작 순서) · §14-2(절단) · 구현 명세 V0.3 §12-1(첫 수직 절편). 그것을 `src/` 파일 단위로 푼 것이다.
진행 상황은 이 파일의 체크박스에, 밤의 판정은 [spec/14_build-order-and-cuts.md](spec/14_build-order-and-cuts.md)와 [../CHANGELOG.md](../CHANGELOG.md)에 적는다.

## 원칙 셋

1. **수직 절편이 돌기 전에는 가로로 넓히지 않는다.** 플래시 → 원 → 탭 = 소리 + `note.add` → 마킹 → 내보내기 → `chain.py` 한 줄. 이 경로가 로그 파이프라인 전체를 한 번 관통하므로 스키마 오류가 첫날에 드러난다
2. **불가침 항목을 먼저, 절단 후보를 마지막에.** 마이크 입력 · 이미지 크기 · 미리보기 루프 · 슬라이더 · 라벨은 각 날의 맨 끝. 밤에 잘라도 앞의 것이 흔들리지 않는다
3. **매일 밤 세 가지.** 자기 로그로 `chain.py` 실행 · [acceptance/checklist.md](acceptance/checklist.md) 해당 항목 체크 · [spec/](spec/) 열린 항목 갱신. 절단하면 CHANGELOG `cuts`

## 0단계 · 09.22 오후 — 뼈대가 서는지

- [x] `npm install` · `vite dev`가 뜨고 `tsc --noEmit` 통과 (Node v24.21.0 LTS를 `~/bin`에 설치, 09.22)
- [x] `constants.ts` — §2 상수표 그대로. ☐는 주석으로
- [x] `model.ts` — §4 타입 그대로
- [x] `index.html` + `main.ts` — 캔버스 하나 · 1366 × 1024 배율 `s` · 중앙 레터박스

## 1단계 · 09.22–23 — 수직 절편 (번호 = 의존 순서)

| # | 파일 | 이번에 넣는 것만 | |
| --- | --- | --- | --- |
| 1 | `layout.ts` | 영역 사각형 4 · 좌표↔값(§3-5) · 히트 테스트는 `surface` · `slot:mark` · `none`까지만 | [x] |
| 2 | `log.ts` | 봉투(`t` `seq` `seg` `state`) · 메모리 버퍼 · IndexedDB append · `snapshot` · `navigator.share` 내보내기 | [x] |
| 3 | `audio.ts` | `AudioContext` · voice saw → LPF → ADSR · 즉시 발음 · `resume()` | [x] |
| 4 | `render.ts` | 작업 면과 노트 · 튜토리얼 원 · 하단 띠 자리(우 4만) | [x] |
| 5 | `input.ts` | Pointer → 탭·누르기·끌기 → `target` · `touch.down/up` 기록 | [x] |
| 6 | `ops/notes.ts` | 더하기 셋(탭·누르기·끌기)만 | [x] |
| 7 | `session.ts` | seg −1 → 플래시 → 0 → 1. 타이머 없음 | [x] |
| 8 | `facilitator.ts` | 5연타 시트 · `pid` · [시작] · [구간 1 시작] · [내보내기]만 | [x] |
| 9 | `ops/buttons.ts` | `mark` + `snapshot reason:mark` | [x] |
| 10 | `tools/chain.py` | 헤더 · `note.add` · `mark` · `snapshot`을 읽어 체인 한 줄 | [x] |

**판정** — 실기기 iPad에서 내보낸 jsonl을 `chain.py`가 한 줄로 뽑는가.

> 09.22 — **데스크톱에서 통과** (`sessions/P02_2026-09-22.jsonl` · ⚙ 12/12). **iPad 실기기는 미확인** — `npm run dev:host`로 같은 Wi-Fi에서 열거나 GitHub Pages에 올려 standalone · share · 마이크 권한을 본다. 이때 standalone 설치 · `share` 저장 · 마이크 권한(§12-1의 배포 리스크 셋)을 같이 본다. 기기 문제는 코드보다 먼저 드러나야 한다.

## 2단계 · 09.23 — 불가침, 절단 없음

- [x] `ops/scope.ts` → `ops/notes.ts`에 고치기(pos · len) · 지우기(면 밖). `note.edit prev[]`
- [x] `ops/grid.ts` — 토글 · 비파괴 양자화(`render.ts` · `audio.ts` 쪽에서만)
- [x] `input.ts` — §5-3 N2 목록 전부 `acted:false` · 가림 `blocked:true` (blocked 판정 훅만 — 키보드·패널은 3~4단계에서 붙인다)
- [x] `log.ts` — 체류 · `idle`(§10-5) · `session.resume`
- [x] `sw.ts` + `manifest` — 기내 모드에서 뜨는지 (빌드·프리캐시 목록 확인. **기내 모드 실측은 iPad**)
- [x] `mic.ts` — 준비 화면 권한 + `MediaRecorder` 녹음 트랙만 (입력 채널은 아직 아님). 개발 브라우저는 마이크가 막혀 **거부 경로만 확인**, 녹음은 iPad에서

> 09.22 — **데스크톱에서 통과** (`sessions/P04~P07`). ⚙ 21/21. 확인한 것 — 선택 one·many·all·null · 고치기 pos·len(`prev`) · 지우기 · 격자 on/off(비파괴 · 히트 테스트 일치) · axis 끌기 acted:false · idle(τ 초과) · `session.resume`(노트·구간·체류 복원) · 서비스 워커 프리캐시(서버 끄고도 로드) · 마이크 **거부 경로**. 새로고침 직전 유실을 두 번 잡아 즉시 flush + localStorage 거울로 막았다(R-003). **iPad 미확인** — 녹음 트랙·MIME · standalone 마이크 권한 · 기내 모드.

## 3단계 · 09.24 — 재생 · 재료 · 캔버스, 마지막에 미리보기

- [x] `ops/play.ts` — `seek` · `start` · `stop` · `heard[]` · `matches_scope`
- [x] `materials/` 더미 이미지 5장 → `ops/material.ts` — `peek` ≠ `adopt` · 이미지 패널 · `image.place` · `image.touch`
- [x] `ops/canvas.ts` — keep · discard · switch · evict · 서랍 목록 렌더
- [x] `preview.ts` — **절단 후보 3.** 밤에 미완이면 정지 프레임

> 09.22 — **데스크톱에서 통과** (`sessions/P08`). ⚙ 34/34. 확인한 것 — `play.seek` · `play.start/stop` `heard[[2914,5943]]` · `matches_scope` · 소리 재료 열람 ≠ 채택(5노트 `src:material` 상대 음고 유지) · 이미지 패널 → 놓기 → 몸통 접촉 `image.touch` · 캔버스 new/switch/discard + 직전 스냅샷 · 목록 축소판 · 미리보기 9종 루프 · 복구 재생에 캔버스·이미지·목록 포함. 정지 프레임 절단은 `cuts:["preview_loop"]`로 전환 가능. **iPad 미확인.**

## 4단계 · 09.25 — 나머지 전부, 무거운 것은 끝에

- [x] `ops/gen.ts` — `gen.set` · 규칙·난수 열 한 건 · PRNG `hash(seed, seq)`. 슬라이더는 뒤로
- [x] `ops/text.ts` — 입력 칸 · 칩 3 · 면 놓기(음절 = 노트) · 띠 놓기 · `abort` · `absent`. 라벨 렌더는 뒤로
- [x] `session.ts` 타이머 — `done.appear` 페이드 · `cap` · 구간 2 · 회고 동결. `done`은 session.ts의 `endSeg1`에서(buttons.ts는 mark만)
- [x] `lock.ts` 계산 + `session.ts` 적용 — `slot.gone` · `by:lock` · `alt` 병기
- [x] `facilitator.ts` 완성 — 세션 중 · 회고(마킹 재생 · 미사용 · 정지 · 버튼 인지)
- [ ] 재료 실물 교체 (**T11**, 저녁까지)
- [x] **절단 후보 1 · 2** — `mic.ts` 입력 채널(온셋 · 피치 · 게이트) · `ops/image.ts` 손잡이 둘
- [x] **절단 후보 4 · 5** — 규칙 슬라이더 · 텍스트 라벨 렌더

> 09.22 — **데스크톱에서 통과** (`sessions/P09` 기능 · `P10` 타임라인 `?fast`). 확인한 것 — 규칙·난수 열(간격 = step · 시드 = seq) · 슬라이더 `rule.param` · 적기 commit/abort/칩 → 면(음절 7 = 노트 7 + 라벨)/띠(라벨만) · 이미지 손잡이 size/move/remove · `done.appear` = seg1 + 8 s(±0) · 사용자 `done` → `seg.end` → `lock.apply`(재계산 일치) → 잠긴 슬롯 사라짐 + `gen.set by:lock` → `snapshot seg` → `canvas.new lock` → `seg.start 2` → 타이머로 `seg.end 2` → 회고(접촉 `acted:false` · 회고 데이터). **미확인** — 마이크 입력 채널(브라우저 차단 → iPad) · 재료 실물 T11(콘텐츠, 사용자 작업).

## 5단계 · 09.26 — 파일럿

- [x] 남은 것 마무리 · 절단 판정 — 09.22 기준 **자른 것 없음**(`CUTS = []`, 헤더 `cuts:[]`). 후보 1(마이크 입력)은 iPad에서만 판정할 수 있어 **파일럿 당일 결정**으로 남긴다 ([pilot-protocol.md](acceptance/pilot-protocol.md) §0)
- [x] 준비물 — 진행 절차서 [pilot-protocol.md](acceptance/pilot-protocol.md) · `chain.py --pilot`(☐ 교정 수치 · D14 두 식 비교 · 발견 여부 자동 추출) · 시트의 잠금식 토글 · 체크리스트 회차 표
- [ ] **09.26 · 사용자** — 자가 파일럿 2회 (PILOT1 `v0.3` 직접 종료 · PILOT2 `v0.2` 상한 + 복구) → `chain.py --pilot` · 문제는 [pilot-issues/](acceptance/pilot-issues/README.md)에 하나씩
- [ ] **09.26 · 사용자** — [pilot-calibration.md](acceptance/pilot-calibration.md) 채우고 ☐ 상수를 볼트 → SPEC → `constants.ts` 순서로 반영 → 최종 빌드 → iPad 캐시 갱신 (09.28 전)

> 09.22 — 이 단계는 실기기와 사람의 판단이 필요해 **준비까지만** 했다. 데스크톱에서 할 수 있는 검증(⚙ 전 항목 · 두 잠금식 계산 · 복구 · 오프라인 캐시)은 1~4단계에서 끝났다.

## 순서에서 중요한 판단 둘

- **`log.ts`를 `audio.ts`보다 앞에** 둔다. 이 도구의 산출물은 소리가 아니라 로그다. 소리 없이 로그가 나오는 상태는 쓸모가 있지만 그 반대는 없다
- **`lock.ts`는 순수 계산으로 분리**하고 `chain.py`가 같은 식을 Python으로 다시 계산한다. §11-3이 `dwell` 전체를 남기는 이유가 사후 재계산 검증이므로, 두 구현이 같은 답을 내는지가 곧 G15 테스트다
