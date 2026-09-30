# 이벤트 타입 표 (SPEC §10-2)

`tools/chain.py`가 검증하는 기준. SPEC과 다르면 SPEC이 이긴다. 필드 열은 **봉투 공통 필드 외** 추가 필드만.

## 봉투 (모든 줄 공통)

```json
{ "t": 184230, "seq": 417, "type": "note.add", "seg": 1, "phase": "create1", "canvas": 2,
  "state": { "mat": "sound", "grid": false, "gen": "hand" }, "target_mat": "image" }
```

| 필드 | 뜻 |
| --- | --- |
| `t` | `performance.now() − t0` · 정수 ms · 0점 = 플래시 |
| `seq` | 단조 증가 |
| `seg` | `-1` 준비 · `0` 튜토리얼 · `1` 자유 · `2` 잠금 · `3` 회고 |
| `phase` | V1.0 §7 — `prep` · `explore` · `recall` · `briefing`(seg 0) · `create1` · `hold`(구간 2 전 · seg 2) · `create2` · `review`. 09.29 오전 빌드의 로그는 `circle` · `expect` · `intro` |
| `canvas` | 캔버스 일련번호 |
| `state` | 18칸 좌표 `{ mat, grid, gen }` |
| `target_mat` | 조작이 향한 재료 `sound`·`image` 또는 `null` |

## 타입

| 타입 | 추가 필드 | 구현 상태 |
| --- | --- | --- |
| `session.header` | §10-3 → [examples/header.jsonl](examples/header.jsonl) | ☐ |
| `session.flash` | `wall` | ☐ |
| `session.resume` | `gap_ms` | ☐ |
| `seg.start` `seg.end` | `seg` `by` | ☐ |
| `touch.down` `touch.move` `touch.up` | `id` `x` `y` `force` `size` `pointers` `target` `acted` `blocked` · up에 `dur` `path_len` · `reason` | ☐ |
| `note.add` | `ids[]` `count` `src` `vals[]` `scope` | ☐ |
| `note.edit` | `ids[]` `count` `scope` `field` `prev[]` `vals[]` | ☐ |
| `note.remove` | `ids[]` `count` `scope` | ☐ |
| `scope.set` | `scope` `count` `ids[]` | ☐ |
| `mat.peek` | `mat` · 소리 목록의 칸을 들으면 `id` `material_id` `dur` | ✔ |
| `mat.adopt` | `mat` `x` `y` · 소리는 `id` `material_id` | ✔ |
| `grid.on` `grid.off` | `by` (`user`\|`lock`) | ☐ |
| `gen.set` | `gen` `by` | ☐ |
| `rule.param` | `name` `value` | ☐ |
| `play.seek` | `at` | ☐ |
| `play.start` | `from` | ☐ |
| `play.stop` | `at` `heard[][]` `matches_scope` | ☐ |
| `text.open` `text.commit` `text.abort` | `raw` `chars` `edits` `dur` · 구현 추가 `source` `pan` `kb` | ✔ |
| `text.place` | `target` `x` `y` `raw` `ids[]` `truncated` | ☐ |
| `image.place` `image.move` `image.size` `image.remove` | `img` `x` `y` `w` `h` | ☐ |
| `image.touch` | `img` `u` `v` | ☐ |
| `image.absent` | `raw` `chars` | ☐ |
| `label.move` `label.remove` | `id` `x` `raw` — 띠 라벨만 (R-011, 09.23 추가) | ✔ |
| `mic.span` | `from` `to` `n` `gated_ms` | ☐ |
| `mic.gate` | `on` | ☐ |
| `mark` | `snapshot` `n_before` | ☐ |
| `canvas.new` `canvas.discard` `canvas.switch` `canvas.evict` | `from` `to` `reason` | ☐ |
| `snapshot` | `id` `reason` `canvas` `playFrom` `notes[]` `images[]` `labels[]` | ☐ |
| ~~`done.appear`~~ ~~`done`~~ | V1.0에서 삭제. 구간 1 종료는 `seg.end {seg:1, by:'facilitator'}` | — |
| `lock.apply` | `pn_margin`(V1.0 §6-1) · §11-3 → [examples/lock.apply.json](examples/lock.apply.json) | ☐ |
| `idle` | `dur` | ☐ |
| `facilitator` | `action` | ☐ |
| `phase.start` `phase.end` | `phase`(시작하거나 끝나는 단계 — 이 두 타입에서는 봉투 `phase` 자리에 이 값이 적힌다) `by` (`facilitator`\|`timer`) · D15 · SPEC 반영 대기 | ✔ |
| `workspace.reset` | 09.29 오전 빌드만. V1.0에서는 `canvas.new {reason:'seg1'}` | — |
| `audio.unlock` | `by` `at:'seg-1'` `wall` — 준비 화면 [소리 확인]. 헤더 바로 뒤 | ✔ |
| `image.select` | `id` `img` `on` | ✔ |
| `intro.step` | `i` `key` — 띠에 그 단계가 보일 때마다(이전으로 돌아가도) | ✔ |
| `intro.met` | `i` `key` `since` — 그 단계의 동작을 처음 했다 (R-014) | ✔ |
| `intro.leave` | `i` `key` `dwell` `met` `by` `dir` (R-014) | ✔ |
| `intro.done` | `dur` `met` | ✔ |

`vals[]` 원소 = `{ on, pitch, len, vel, tone }`. `touch.move`는 `MOVE_COALESCE`(16 ms)로 병합.

## 파일

- `P07_2026-09-30.jsonl` — 헤더 + 이벤트 + 스냅샷, 한 줄 한 사건
- `P07_2026-09-30.audio.m4a|webm` — 세션 전체 오디오

## V1.0에서 필드가 늘어난 것

- `note.add src:material` — `sound` · `material_id`(s1..s5)
- 헤더 — `sound_set`(`s1-s5`|`s1-s3`) · `bottom_layout`(`session-left`|`session-right`, 09.30) — chain.py가 슬롯 좌표를 이것으로 가른다
- `note.edit field:len` — `edge` (`l`\|`r`). 왼쪽이면 `on`도 바뀐다
- `image.size` — `corner` (`nw`\|`ne`\|`sw`\|`se`)
- `canvas.new` — `reason:'seg1'`은 화면 비우기(목록 · 칩 · 상태까지)
- `touch.*` — `reason` ∈ `lock` · `recall` · `wait` · `hold` · `review`
- 헤더 — `session_structure` `spec` `slots_sounds` `seg0_len_ms` `seg1_len_ms` `seg2_len_ms` `seg2_gated` `briefing_banner` `mark_flash_ms`
