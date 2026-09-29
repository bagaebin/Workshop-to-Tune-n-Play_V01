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

// ── 세션 타이머 (기능 명세 V1.0 §5 · D15)
// SPEC.md(개발 명세) §2는 볼트 개정 전까지 옛 값이다. 어긋나면 기능 명세 V1.0이 이긴다
export const SEG0_LEN = 240_000        // 자유 탐색 4분 — 끝나면 자동으로 기대 회고(화면 동결)
export const SEG1_LEN = 600_000        // 구간 1 10분 — 끝은 진행자가 말로 끊고 시트 [구간 1 종료]. 자동 종료 없음
export const SEG2_LEN = 600_000        // 구간 2 10분 — 타이머 종료
export const RECALL_GUIDE = 180_000    // 기대 회고 3분 — 시트 안내 시간(자동 전환 없음)
export const BRIEFING_GUIDE = 420_000  // 기능 소개 7분 — 시트 안내 시간(자동 전환 없음)
export const MARK_FLASH = 250          // 마킹 눌림 확인 — 버튼만 밝아지는 시간 (G10 개정)
export const PN_MARGIN_WEAK = 0.08     // 잠금 근거 약함 문턱 (§6-1) — 분석용. 세션 중 판정은 바꾸지 않는다
export const UI_IN_MS = 300            // 전체 UI가 나타나는 시간

// ── 운영 방식 (★ 기능 명세가 비워 둔 곳 — R-013)
/** 구간 1 종료 뒤 구간 2는 진행자가 시트에서 시작한다. 그 사이 구두 확인 · 구간 2 과제문. false면 곧바로 시작 */
export const SEG2_GATED = true
/** 기능 소개 중 화면에 문장 띠와 밝히기를 보인다. false면 진행자 낭독만(시트에 순서 표시) */
export const BRIEFING_BANNER = true

// ── 제어 요소 · 노트 · 이미지
export const SLOT = 100                // ☐ 제어 요소 한 변
export const NOTE_EDGE = 28            // 노트 양 끝 손잡이 폭 — 선택했을 때만 (V1.0 §3-2)
export const IMG_DEFAULT = { w: 360, h: 240 } as const   // 3:2 고정
export const IMG_MIN = { w: 180, h: 120 } as const
export const IMG_MAX = { w: 1206, h: 804 } as const
export const HANDLE = 48               // 이미지 모서리 손잡이 한 변 — 선택했을 때만, 네 모서리

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
export const TEXT_ABORT_CHARS = 0      // 이하이면 text.abort — 빈 칸만. 짧은 글 판정은 분석에서 chars·dur·edits로 (09.23 · PI-008)
export const IDLE_LIST_MIN = 60_000    // 회고 모드 정지 목록 문턱

// ── 운영 플래그 — 세션 전원이 같은 값이어야 한다 (§14-2 cuts · §11-1 lock_rule)
/** 잘라낸 항목. 후보 순서 — mic_input · image_size · preview_loop · rule_slider · text_label */
export const CUTS: readonly string[] = ['mic_input'] // V1.0 §3 「할 수 있는 것 전부」에 마이크 입력이 없다 — 입력 채널을 자른다. 녹음 트랙은 남는다 (R-013)
/** 자기 잠금 판정식. 'v0.2'면 원식이 실제 잠금이 되고 v0.3 결과가 alt로 간다 (§11-1) */
export const LOCK_RULE: 'v0.3' | 'v0.2' = 'v0.3'

// ── §2 표 밖의 본문 수치 (절 번호 표기)
export const TAP_MOVE_PX = 8           // §5-2 탭·누르기 이동 상한
export const TAP_MAX_MS = 300          // §5-2 탭 지속 상한 (이상이면 누르기)
export const FLASH_FRAMES = 3          // §7 흰 플래시
export const CHIP_H = 28               // §6-7 칩 한 줄 높이 (100 × 28)
export const MIC_F0_LO = 82.41         // §9 E2 — 피치 추정 하한 (Hz)
export const MIC_F0_HI = 1318.51       // §9 E6 — 상한
export const MIC_VEL_MIN = 0.2         // §9 vel = 피크 RMS 정규화 (0.2–1)
export const MIC_POLL_MS = 16          // §9 60 Hz 폴링
