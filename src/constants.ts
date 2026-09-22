/**
 * constants.ts — 상수 전부 (SPEC §2 상수표)
 *
 * 코드의 상수는 이 파일 하나에만 둔다. 값을 바꾸면 볼트 원본 → SPEC.md → 여기 순서.
 * ☐ = 09.26 자가 파일럿에서 교정되는 값 (docs/acceptance/pilot-calibration.md).
 * 단위 — 길이 px(가상 캔버스 1366 × 1024) · 시간 ms · 정규화 값 0–1.
 */

// ── 가상 캔버스
export const W = 1366
export const H = 1024

// ── 루프 · 격자
export const L = 8_000                 // ☐ 루프(캔버스) 길이
export const K_P = 48                  // ☐ 격자 분할 — 음고(반음)
export const K_T = 16                  // ☐ 격자 분할 — 시간 (L/16 = 500 ms)

// ── 음고
export const MIDI_LO = 40              // pitch 0 → MIDI 40 (E2)
export const MIDI_RANGE = 48           // pitch 1 → MIDI 88 (E6)

// ── 노트 값
export const LEN_DEFAULT = 250         // ☐ 탭 노트 길이
export const VEL_FIXED = 0.5           // 세기 상수 (입력축 없음)
export const TONE_FIXED = 0.5          // 밝기 상수 (⑭ 보류 — radiusX는 기록만)

// ── 생성 방식
export const STEP_DEFAULT = L / 16     // ☐ 규칙 열 간격
export const STEP_RANGE: readonly [number, number] = [L / 32, L / 4]  // ☐
export const SPREAD_DEFAULT = 0.5      // ☐ 난수 지터 (0–1)

// ── 체류
export const TAU = 10_000              // ☐ 정지 임계

// ── 세션 타이머 (기준 = seg.start seg:1의 t)
export const SEG1_APPEAR = 480_000     // '여기까지' 등장
export const SEG1_CAP = 900_000        // 구간 1 상한
export const SEG2_LEN = 420_000        // 구간 2 길이
export const FADE_IN = 3_000           // '여기까지' 페이드 인

// ── 제어 요소 · 노트 · 이미지
export const SLOT = 100                // ☐ 제어 요소 한 변
export const NOTE_EDGE = 28            // 노트 오른쪽 끝 손잡이 폭
export const IMG_DEFAULT = { w: 360, h: 240 } as const   // 3:2 고정
export const IMG_MIN = { w: 180, h: 120 } as const
export const IMG_MAX = { w: 1206, h: 804 } as const
export const HANDLE = 48               // 이미지 손잡이 한 변

// ── 칩 · 캔버스 목록 · 미리보기
export const CHIP_MAX = 3
export const CANVAS_LIST_MAX = 10
export const PREVIEW_LOOP = 2_500      // ☐

// ── 오디오
export const VOICES = 32
export const LOOKAHEAD = 25
export const LATENCY_TARGET = 20
export const ENV = { a: 5, d: 60, s: 0.6, r: 80 } as const   // 앰프 엔벨로프 (ms · s는 레벨)
export const LPF_HZ = 2_000            // 필터 컷오프 (tone 상수)

// ── 마이크
export const MIC_THR = 0.02            // ☐ RMS 온셋 임계
export const MIC_ON = 40               // ☐ 온셋 지속
export const MIC_OFF = 150             // ☐ 종료 지속
export const MIC_SPAN_END = 1_500      // ☐ span 종료 무음

// ── 로그
export const MOVE_COALESCE = 16        // touch.move 병합
export const FLUSH = 1_000             // IndexedDB 기록 주기

// ── 진행자 시트
export const FAC_TAPS = 5
export const FAC_WINDOW = 1_500
export const FAC_RECT = { x0: 0, y0: 0, x1: 30, y1: 32 } as const

// ── 적기 · 회고
export const TEXT_ABORT_CHARS = 3      // 이하이면 text.abort
export const IDLE_LIST_MIN = 60_000    // 회고 모드 정지 목록 문턱

// ── 운영 플래그 — 세션 전원이 같은 값이어야 한다 (§14-2 cuts · §11-1 lock_rule)
/** 잘라낸 항목. 후보 순서 — mic_input · image_size · preview_loop · rule_slider · text_label */
export const CUTS: readonly string[] = []
/** 자기 잠금 판정식. 'v0.2'면 원식이 실제 잠금이 되고 v0.3 결과가 alt로 간다 (§11-1) */
export const LOCK_RULE: 'v0.3' | 'v0.2' = 'v0.3'

// ── §2 표 밖의 본문 수치 (절 번호 표기)
export const TAP_MOVE_PX = 8           // §5-2 탭·누르기 이동 상한
export const TAP_MAX_MS = 300          // §5-2 탭 지속 상한 (이상이면 누르기)
export const FLASH_FRAMES = 3          // §7 흰 플래시
export const TUTORIAL_CENTER = { x: 763, y: 466 } as const   // §7 튜토리얼 원
export const TUTORIAL_DIAMETER = 240
export const TUTORIAL_NOTE = { pitch: 0.5, len: 400, vel: 0.6, tone: 0.5 } as const
export const TUTORIAL_OUT_MS = 300     // §7 원이 사라지는 시간
export const CHIP_H = 28               // §6-7 칩 한 줄 높이 (100 × 28)
export const MIC_F0_LO = 82.41         // §9 E2 — 피치 추정 하한 (Hz)
export const MIC_F0_HI = 1318.51       // §9 E6 — 상한
export const MIC_VEL_MIN = 0.2         // §9 vel = 피크 RMS 정규화 (0.2–1)
export const MIC_POLL_MS = 16          // §9 60 Hz 폴링
