# §2 상수표

> **정본** — [SPEC.md](../../SPEC.md) §2
> **근거** — 구현 명세 V0.3 §11-3 (파일럿 교정값)
> **대응 코드** — `src/constants.ts` — 코드의 상수는 **이 파일 하나**에만 둔다
>
> 이 파일은 스펙을 다시 쓰는 자리가 아니라 **이 절을 구현하며 쌓이는 것**(메모 · 구현 결정 · 교정값 · 상위 문서에 되돌릴 정정)을 두는 자리다. 규칙·수치가 SPEC과 어긋나면 SPEC(볼트 원본)을 먼저 고친다.

## 이 절이 정하는 것

- 가상 캔버스 `W·H` 1366·1024 · 루프 `L` 8 000 ms ☐ · 격자 `K_P·K_T` 48·16 ☐
- `MIDI_LO·MIDI_RANGE` 40·48 · `LEN_DEFAULT` 250 ms ☐ · `VEL_FIXED·TONE_FIXED` 0.5·0.5
- `STEP_DEFAULT·STEP_RANGE` L/16·[L/32, L/4] ☐ · `SPREAD_DEFAULT` 0.5 ☐ · `TAU` 10 000 ms ☐
- `SEG1_APPEAR·SEG1_CAP·SEG2_LEN` 480 000·900 000·420 000 ms · `FADE_IN` 3 000 ms
- `SLOT` 100 ☐ · `NOTE_EDGE` 28 · `IMG_DEFAULT·IMG_MIN·IMG_MAX` 360×240·180×120·1206×804 · `HANDLE` 48
- `CHIP_MAX` 3 · `CANVAS_LIST_MAX` 10 · `PREVIEW_LOOP` 2 500 ms ☐
- `VOICES·LOOKAHEAD·LATENCY_TARGET` 32·25·20 ms · `ENV` A5 D60 S0.6 R80 · `LPF_HZ` 2 000
- `MIC_THR·MIC_ON·MIC_OFF·MIC_SPAN_END` 0.02·40·150·1 500 ☐ · `MOVE_COALESCE·FLUSH` 16·1 000 ms
- `FAC_TAPS·FAC_WINDOW·FAC_RECT` 5·1 500 ms·(0,0)–(30,32) · `TEXT_ABORT_CHARS` 3 · `IDLE_LIST_MIN` 60 000 ms

☐ = 09.26 자가 파일럿에서 교정되는 값. 교정 기록은 [../acceptance/pilot-calibration.md](../acceptance/pilot-calibration.md)

- 09.22 — 운영 플래그 `CUTS`(절단 목록 → 헤더 `cuts`)와 `LOCK_RULE`(기본 v0.3)을 constants.ts에 둔다. 절단 판정 밤에 `CUTS`만 고친다

## 열린 항목

- [ ] ☐ 값 전부 — 파일럿 후 교정 (기록은 pilot-calibration.md, 반영은 볼트 → SPEC → constants.ts)
- [ ] 상수를 헤더(`loop_ms` · `grid_div` · `tau_ms` · `len_default_ms` · `step_default_ms` · `spread_default` · `mic_threshold`)로 내보내는 대응표 확정

## 교정 이력

| 날짜 | 상수 | 이전 → 이후 | 근거 |
| --- | --- | --- | --- |
| — | — | — | — |

## 구현 메모

_(비어 있음 — 구현하는 날 채운다)_

## 상위 문서에 되돌릴 것

_(없음)_
