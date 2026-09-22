# §6 조작 규칙

> **정본** — [SPEC.md](../../SPEC.md) §6
> **근거** — 구현 명세 V0.3 §2-2 ~ §3-5 · 기능 명세 G1 · G3–G6 · G8–G12
> **대응 코드** — `src/ops/` — notes · scope · grid · gen · play · material · text · image · canvas · buttons
>
> 이 파일은 스펙을 다시 쓰는 자리가 아니라 **이 절을 구현하며 쌓이는 것**(메모 · 구현 결정 · 교정값 · 상위 문서에 되돌릴 정정)을 두는 자리다. 규칙·수치가 SPEC과 어긋나면 SPEC(볼트 원본)을 먼저 고친다.

## 이 절이 정하는 것

| 절 | 모듈 | 요지 |
| --- | --- | --- |
| §6-1 | `ops/notes.ts` | 탭·누르기·끌기 = 더하기 · 노트 끌기 = 고치기 · 면 밖에서 뗌 = 지우기 · 손 노트는 즉시 발음 |
| §6-2 | `ops/scope.ts` | 편집 범위 = 선택 one/many/all · 고치기·지우기에만 걸림 · `scope.set` |
| §6-3 | `ops/grid.ts` | 토글 · **비파괴**(저장은 원값, 렌더·재생·규칙 열에서만 양자화) |
| §6-4 | `ops/gen.ts` | hand/rule/random · 규칙·난수는 열 한 건 `note.add {count}` · PRNG 시드 `hash(seed, seq)` · 슬라이더 `rule.param` |
| §6-5 | `ops/play.ts` | `axis` 탭 = `playFrom` · 재생 슬롯 = 시작/정지 · `heard[]` · `matches_scope` |
| §6-6 | `ops/material.ts` | 탭 = 열람 `mat.peek` · 끌어 놓기 = 채택 `mat.adopt`(캔버스 첫 회만) + `note.add src:material` / `image.place` |
| §6-7 | `ops/text.ts` | 빈 면 슬롯 → 입력 칸 → 칩(3) → 면에 놓으면 음절 = 노트 + 라벨 · 띠에 놓으면 라벨만 · `text.abort`(≤3자) · `image.absent` |
| §6-8 | `ops/image.ts` | 손잡이 둘(move 좌상 · size 우하 48×48) · 3:2 고정 · 면 밖 = 제거 · 노트 아래에 그림 |
| §6-9 | `ops/canvas.ts` | keep/discard/switch/evict · 캔버스별 `mat·playFrom·selection` · 떠나는 캔버스 스냅샷 |
| §6-10 | `ops/buttons.ts` | `mark`(화면 변화 없음 + 스냅샷) · `done`(구간 1 종료) |

## 열린 항목

- [ ] 음절 분해 규칙(§6-7)의 구현 단위 — 한글 음절 · 로마자 모음 묶음 · 숫자 자릿수 · 공백·문장부호 = 쉼
- [ ] 선택 노트 하나를 끌 때 선택 전체가 따라 움직이는 동작의 시각 피드백 (글자 없이)
- [ ] 캔버스 목록 상한 — SPEC `CANVAS_LIST_MAX` 10 (구현 명세 V0.3 §3-5는 6 → SPEC이 이긴다). 상위 문서 정정 대상

## 구현 메모

- 09.22 — 손 노트는 `pointerdown`에서 `noteOn`으로 즉시 울리고 뗄 때 `off`. 탭이면 최소 `LEN_DEFAULT`만큼 울린다. 노트의 `len`은 규칙대로(탭 기본 · 누르기 시간 · 끌기 가로량) 뗄 때 확정 — 들리는 길이와 저장되는 길이가 끌기에서는 다를 수 있다(파일럿에서 위화감 확인)
- 09.22 — 1단계에서 좌 6 · 서랍 3 · `axis` 접촉은 `acted:true`로 기록되지만 동작은 없다. 2~4단계에서 채운다. 그때까지의 테스트 로그에서 이 슬롯 접촉을 "작동"으로 읽지 말 것

- 09.22 (2단계) — 고치기는 **끌기 중 실시간**으로 노트를 옮기고(원값은 `Edit.prev`에), 뗄 때 한 번 `note.edit`. 움직이지 않았으면 남기지 않는다. `pointercancel`이면 원값 복원
- 09.22 — 지우기(면 밖에서 뗌)는 먼저 원값으로 되돌린 뒤 `note.remove` — 지우기 사건 안에 이동이 섞이지 않게
- 09.22 — 노트 탭 = 선택 토글 + 그 노트 1회 발음(격자 ON이면 양자화 음고). 누르기도 탭과 같이 처리한다(SPEC 미기재)
- 09.22 — 격자 ON일 때 히트 테스트도 양자화된 자리를 쓴다(`noteRect(n, grid)`) — 렌더와 같은 함수

- 09.22 (3단계) — 재생·재료·캔버스의 빈칸은 [R-006](../decisions/R-006_stage3-gaps.md). 재생은 커서식 예약(프레임마다 `[cursor, pos+LOOKAHEAD)`), 순환 시 `heard`를 끊고 예약 집합을 비운다
- 09.22 — 이미지 몸통 접촉 = `surface`와 같은 더하기 + `image.touch {id,img,u,v}` · 그 `note.add`의 `target_mat`은 `image`. 소리 재료 노트를 고치거나 지우면 `target_mat sound`
- 09.22 — 손잡이(`image.move` · `image.size`)는 4단계. 지금은 이미지를 옮기거나 지울 수 없다

- 09.22 (4단계) — 생성 방식·적기·손잡이의 빈칸은 [R-007](../decisions/R-007_stage4-gaps.md). 적기 입력 칸은 DOM `<input>`(visualViewport 하단, 1206 × 80 · autocorrect/autocomplete/spellcheck off). 키보드에 가려진 자리는 `blocked:true`
- 09.22 — 음절 토큰(`text.tokenize`)과 chain.py의 `syllables()`가 같은 규칙. 'hello 안녕 123' → 7 노트

## 상위 문서에 되돌릴 것

_(없음)_
