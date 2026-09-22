# §10 로그

> **정본** — [SPEC.md](../../SPEC.md) §10
> **근거** — 구현 명세 V0.3 §4 · §8 · §12-1 #2 #7
> **대응 코드** — `src/log.ts`(봉투 · 버퍼 · IndexedDB · export) · [../log-schema/](../log-schema/) · `tools/chain.py`
>
> 이 파일은 스펙을 다시 쓰는 자리가 아니라 **이 절을 구현하며 쌓이는 것**(메모 · 구현 결정 · 교정값 · 상위 문서에 되돌릴 정정)을 두는 자리다. 규칙·수치가 SPEC과 어긋나면 SPEC(볼트 원본)을 먼저 고친다.

## 이 절이 정하는 것

- 봉투 — `t`(`performance.now() − t0`, 정수 ms) · `seq` 단조 증가 · `type` · `seg` · `canvas` · `state` · `target_mat`
- 타입 표 — §10-2 → [../log-schema/events.md](../log-schema/events.md)
- 헤더 첫 줄 — §10-3 → [../log-schema/examples/header.jsonl](../log-schema/examples/header.jsonl). 셔플 시드 = `pid` · 확정된 배열 셋을 통째로
- 저장 — 메모리 버퍼 → `FLUSH`(1 000 ms)마다 IndexedDB append · `visibilitychange·pagehide`에서 즉시 · 새로고침 시 이어 붙이고 `session.resume {gap_ms}`
- 파일 — `P07_2026-09-30.jsonl` + `.audio.m4a|webm` · `navigator.share({ files })` · 실패 시 보존 `exported:false` · 시트 [재시도]
- 체류 — 활동 구간(터치 · `play.start→stop` · `mic.span` · `text.open→commit|abort`) · Δ ≤ TAU dwell · Δ > TAU `idle {dur}` · `T_active` = Σ dwell(seg 1)

## 열린 항목

- [ ] IndexedDB 스키마(세션 레코드 · 이벤트 청크 · `exported` 플래그) — 저장소 결정
- [ ] `touch.move` 16 ms 병합의 기준(마지막 좌표만 vs 경로 요약 `path_len`)
- [ ] `tools/chain.py`가 첫날부터 헤더·`note.add`·`mark`·`snapshot`을 읽는 최소 버전

## 구현 메모

- 09.22 — 스키마는 [R-003](../decisions/R-003_indexeddb.md). 헤더는 봉투 없이 첫 줄. 이벤트는 `seq` 0부터
- 09.22 — 개발 중 로그 확인은 `__probe.dump()` → `sessions/<sid>.jsonl` → `python3 tools/chain.py sessions/<sid>.jsonl` ([R-004](../decisions/R-004_dev-only.md))
- 09.22 — `chain.py` 1단계 검사 12항목: 헤더 필수 필드 · build 접두 · 슬롯 배열 길이 · seq 단조 · t 비감소 · 봉투 7필드 · flash 1건 t≤50 · mark↔snapshot · note.add 일치 · vals 5값 · seg 순서 · seg 0 노트 없음

- 09.22 (2단계) — 체류/idle 규칙의 빈칸은 [R-005](../decisions/R-005_dwell-accounting.md). `chain.py`가 같은 규칙으로 재계산해 대조한다
- 09.22 — 복구: 페이지 로드 시 `findResumable()`(오늘 · 미내보내기 · 최신 wall) → 이벤트 재생으로 노트·구간·상태·체류 복원 → `session.resume {gap_ms}`. 같은 날 같은 pid 재시작은 sid `_2`
- 09.22 — 내보내기 파일 이름은 sid. 오디오는 part별로 하나씩

## 상위 문서에 되돌릴 것

_(없음)_
