# 이벤트 타입 표 (SPEC §10-2)

`tools/chain.py`가 검증하는 기준. SPEC과 다르면 SPEC이 이긴다. 필드 열은 **봉투 공통 필드 외** 추가 필드만.

## 봉투 (모든 줄 공통)

```json
{ "t": 184230, "seq": 417, "type": "note.add", "seg": 1, "canvas": 2,
  "state": { "mat": "sound", "grid": false, "gen": "hand" }, "target_mat": "image" }
```

| 필드 | 뜻 |
| --- | --- |
| `t` | `performance.now() − t0` · 정수 ms · 0점 = 플래시 |
| `seq` | 단조 증가 |
| `seg` | `-1` 준비 · `0` 튜토리얼 · `1` 자유 · `2` 잠금 · `3` 회고 |
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
| `mat.peek` | `mat` `dur` | ☐ |
| `mat.adopt` | `mat` `x` `y` | ☐ |
| `grid.on` `grid.off` | `by` (`user`\|`lock`) | ☐ |
| `gen.set` | `gen` `by` | ☐ |
| `rule.param` | `name` `value` | ☐ |
| `play.seek` | `at` | ☐ |
| `play.start` | `from` | ☐ |
| `play.stop` | `at` `heard[][]` `matches_scope` | ☐ |
| `text.open` `text.commit` `text.abort` | `raw` `chars` `edits` `dur` | ☐ |
| `text.place` | `target` `x` `y` `raw` `ids[]` `truncated` | ☐ |
| `image.place` `image.move` `image.size` `image.remove` | `img` `x` `y` `w` `h` | ☐ |
| `image.touch` | `img` `u` `v` | ☐ |
| `image.absent` | `raw` `chars` | ☐ |
| `mic.span` | `from` `to` `n` `gated_ms` | ☐ |
| `mic.gate` | `on` | ☐ |
| `mark` | `snapshot` `n_before` | ☐ |
| `canvas.new` `canvas.discard` `canvas.switch` `canvas.evict` | `from` `to` `reason` | ☐ |
| `snapshot` | `id` `reason` `canvas` `playFrom` `notes[]` `images[]` `labels[]` | ☐ |
| `done.appear` | — | ☐ |
| `done` | `by` `since_appear` | ☐ |
| `lock.apply` | §11-3 → [examples/lock.apply.json](examples/lock.apply.json) | ☐ |
| `idle` | `dur` | ☐ |
| `facilitator` | `action` | ☐ |

`vals[]` 원소 = `{ on, pitch, len, vel, tone }`. `touch.move`는 `MOVE_COALESCE`(16 ms)로 병합.

## 파일

- `P07_2026-09-30.jsonl` — 헤더 + 이벤트 + 스냅샷, 한 줄 한 사건
- `P07_2026-09-30.audio.m4a|webm` — 세션 전체 오디오
