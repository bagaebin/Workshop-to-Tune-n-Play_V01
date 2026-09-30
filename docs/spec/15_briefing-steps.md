# 기능 소개 단계표 (R-014 · 09.30)

> **정본** — 볼트 *2026-09-30_Probe 기능 소개 단계표* (문장을 고치려면 볼트를 먼저 고친다)
> **대응 코드** — `src/intro.ts`의 `DEFS` · `buildSteps`
> 기능 명세 V1.0 §4-4 · 진행자 스크립트 V02 4/5장의 15문장을 **동작 하나에 한 단계**로 쪼갠 것. ★ = 스크립트에 없던 문장

순서 — 면 7 → 서랍 3(그 참여자 화면의 위→아래) → 좌 6(왼→오) → 우 3 → 맺음. 아래 표는 기본 배치 기준.

| # | key | 화면의 문장 | [다음]이 켜지는 사건 |
| --- | --- | --- | --- |
| 1 | `surface.tap` | 여기 넓은 면에 손가락을 대면 소리가 하나 납니다. 한 번 해보시겠어요? | `note.add` (면에서) |
| 2 | `surface.drag` | 대고 옆으로 끌면 길게 이어집니다. | 면에서 끌기 (`touch.up` · `path_len ≥ 8`) |
| 3 | `select` | 면에 놓인 걸 누르면 선택됩니다. 한 번 더 누르면 풀려요. | 놓인 것 탭 |
| 4 | `select.many` | 잇달아 누르면 여러 개가 같이 선택됩니다. | `scope.set {scope:many, count ≥ 2}` |
| 5 | `length` | 선택하면 양 끝에 손잡이가 생기는데, 그걸 끌면 길이가 바뀝니다. | `note.edit {field:len}` |
| 6 | `move` ★ | 놓인 걸 끌면 옮겨집니다. | `note.edit {field:pos}` |
| 7 | `remove` | 놓인 걸 없애려면 면 밖으로 끌어내시면 됩니다. | `note.remove` |
| 8 | `mat.blank` | 이걸 누르면 글자를 적는 칸이 나옵니다. | `text.open` |
| 9 | `mat.blank.commit` | 적고 나면 작은 조각으로 이 칸에 붙습니다. | `text.commit` |
| 10 | `mat.blank.place` | 그 조각을 면이나 위쪽 띠로 끌어다 놓을 수 있어요. | `text.place` |
| 11 | `mat.sound` | 이걸 누르면 미리 만들어 둔 소리들이 나옵니다. | `mat.peek {mat:sound}` |
| 12 | `mat.sound.peek` ★ | 하나를 누르면 그 소리가 들립니다. | `mat.peek {mat:sound, id}` |
| 13 | `mat.sound.place` | 하나를 면으로 끌어다 놓으면 그 소리가 놓여요. | `note.add {src:material}` |
| 14 | `mat.image` | 이걸 누르면 이미지가 여러 장 나옵니다. | `mat.peek {mat:image}` |
| 15 | `mat.image.place` | 마찬가지로 면으로 끌어다 놓으실 수 있어요. | `image.place` |
| 16 | `mat.image.move` | 놓은 이미지는 끌면 옮겨집니다. | `image.move` |
| 17 | `mat.image.size` | 모서리의 손잡이를 끌면 크기가 바뀝니다. | `image.size` |
| 18 | `mat.image.touch` | 이미지 위를 누르면 그 위에 소리가 놓여요. | `image.touch` |
| 19 | `grid` | 이걸 누르면 화면에 눈금이 생기고, 한 번 더 누르면 사라집니다. | `grid.on` 또는 `grid.off` |
| 20 | `gen.hand` | 이걸 누르면 켜집니다. | 슬롯 탭 |
| 21 | `gen.hand.use` | 이게 켜져 있으면 면에 댈 때 하나씩 놓입니다. | `note.add {src:touch}` |
| 22 | `gen.rule` | 이걸 켜면 옆에 값 조절이 나옵니다. | 슬롯 탭 |
| 23 | `gen.rule.use` | 면에 대면 일정한 간격으로 여러 개가 놓입니다. | `note.add {src:rule}` |
| 24 | `gen.random` | 이걸 켜도 옆에 값 조절이 나옵니다. | 슬롯 탭 |
| 25 | `gen.random.use` | 면에 댈 때마다 불규칙하게 놓입니다. | `note.add {src:random}` |
| 26 | `play` | 이걸 누르면 지금까지 놓인 게 처음부터 재생됩니다. | `play.start` |
| 27 | `play.stop` | 재생 중에 다시 누르면 멈춰요. | `play.stop` |
| 28 | `play.seek` | 위쪽 띠를 누르면 거기서부터 재생됩니다. | `play.seek` |
| 29 | `all` | 이걸 누르면 면에 있는 게 전부 선택됩니다. 한 번 더 누르면 풀려요. | 슬롯 탭 |
| 30 | `mark` | 이건 마킹이에요. 누르면 버튼이 잠깐 밝아졌다 돌아오고 화면은 그대로입니다. 아무 때나 누르셔도 되고, 안 누르셔도 됩니다. | **없음 — 처음부터 켜져 있다** |
| 31 | `canvas.keep` | 지금 화면을 남겨두고 빈 면에서 새로 시작합니다. | `canvas.new {reason:keep}` |
| 32 | `canvas.keep.back` ★ | 남긴 건 왼쪽 목록에 쌓여요. 누르면 그 화면으로 돌아갑니다. | `canvas.switch` |
| 33 | `canvas.discard` | 지금 화면을 지우고 빈 면에서 새로 시작합니다. | `canvas.discard` |
| 34 | `end` | 이게 전부예요. 더 없습니다. | 없음 |

## 규칙

- 동작을 하면 [다음]이 켜질 뿐이다. 칭찬 · 체크 표시 · 소리 없음. 한 번 켜진 단계는 돌아와도 켜져 있다
- 시범 없음 — 움직이는 손가락 · 예시 배치 · 자동 재생을 넣지 않는다
- 소개하지 않는다 — 이미지 패널의 「여기 없다」 칸 · 마킹을 언제 누르는지 · 규칙 값 조절이 무엇을 바꾸는지(나온다는 것만)
- 진행자는 여는 말 한 문장만. 막히면 시트 [이 단계 넘기기] → `facilitator {action:'briefing.skip'}` · `intro.leave {by:'facilitator'}`
- 띠는 작업 면 아래쪽, 패널 오른쪽. 적기 세 단계는 위쪽(키보드 · 입력 칸을 피한다)

## 로그

| 타입 | 필드 |
| --- | --- |
| `intro.step` | `i` `key` — 단계가 보일 때마다 |
| `intro.met` | `i` `key` `since` — 그 단계의 동작을 **처음** 했다. `since` = 단계가 보인 뒤 ms |
| `intro.leave` | `i` `key` `dwell` `met` `by`(`participant`\|`facilitator`) `dir`(1\|−1) |
| `intro.done` | `dur` `met`(동작을 한 단계 수) |

## 열린 항목

- [ ] iPad에서 실제 소요 시간 — 34단계 × 약 12초 = 7분이 빠듯하다. 넘으면 단계를 합친다(후보: 손 · 규칙 · 난수의 「켜기」와 「면에 대기」)
- [ ] ★ 문장 셋(옮기기 · 소리 듣기 · 남긴 것으로 돌아가기) 승인
- [ ] 적기 단계에서 iPad 키보드가 떴을 때 띠 · 입력 칸 · 밝힌 슬롯이 겹치지 않는가
