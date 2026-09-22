# SPEC.md — Probe 개발 명세 (정본 복사본)

> **원본** — Obsidian 볼트 `Galmuri/Projects/2026_Sound by Scratch/2026-09-22_Probe 개발 명세.md`
> **동기화** — 2026-09-22 (개발 명세 `updated: 2026-09-22` 기준)
> **규칙** — 이 파일은 볼트 원본을 **그대로 복사**한다. 여기서 직접 고치지 않는다. 값이 바뀌면 볼트 원본 → 이 파일 → `src/constants.ts` 순서로 옮긴다.
> 본문의 `[[...]]` 링크는 볼트 안의 노트를 가리킨다. 저장소에서는 열리지 않는다 — 원본 목록은 [docs/00_sources.md](docs/00_sources.md).

---


> [!abstract] 이 문서는
> **코드가 따르는 정본**이다. 이름이 *개발 명세*인 이유 — 구현 명세(V0.x)는 결정을 쌓는 문서이고, 이 문서는 결정이 끝난 것만 개발용으로 옮긴 것이다. [[2026-09-22_Probe 구현 명세_V0.3]]이 *왜 그렇게 정했는가*(승인 목록 · 상위 문서 정정 · 대안)를 담는다면, 이 문서는 결정이 끝난 것만 **만들 수 있는 문장**으로 다시 적는다. 근거·대안·이력은 여기 없다 — 필요하면 V0.3의 같은 번호 절을 본다.
> 규칙 — 이 문서와 V0.3이 다르면 **이 문서가 이긴다**(더 나중이고 더 구체적이다). 값을 바꾸면 여기와 §2 상수표를 먼저 고친다.
> 코드 저장소에는 이 파일을 그대로 복사해 둔다(`SPEC.md`).

> [!tip] 읽는 순서
> **§2 상수 → §4 데이터 모델 → §5 입력 → §6 조작 → §10 로그 → §14 제작 순서 → §15 수용 테스트**

---

## 0. 한 줄

한 화면짜리 웹 음악 도구. 참여자가 8~15분 + 7분 동안 "떠오르는 것을 만들어" 보는 동안, **무엇을 어떤 순서로 했는지를 빠짐없이 기록**한다. 가르치지 않고, 제안하지 않고, 평가하지 않는다. 만드는 목적은 소리가 아니라 **로그**다.

## 1. 실행 환경 · 스택 · 배포

| 항목 | 정함 |
| --- | --- |
| **기기** | iPad Pro 12.9형 5세대(M1) · iPadOS 26.8 · 1366 × 1024 pt · 손가락 압력 없음 |
| **실행** | Safari **홈 화면에 추가(standalone)**. 가로 고정. 세션 내내 페이지 이동 없음 |
| **오프라인** | 서비스 워커가 정적 자산 전부(HTML · JS · CSS · JSON · 이미지)를 프리캐시. 세션 전날 한 번 띄워 캐시를 굳힌다. 현장에서 **새로고침 금지** |
| **호스팅** | 정적 호스팅(GitHub Pages) — 첫 설치와 갱신에만 네트워크 사용 |
| **스택** | 프레임워크 없음. **Canvas 2D + Web Audio + Pointer Events**, TypeScript, Vite 단일 진입. 외부 라이브러리 0 (필요 시 `fflate` 정도까지) |
| **저장** | IndexedDB (standalone 앱 자체 저장소) |
| **내보내기** | `navigator.share({ files })` → 파일 앱. 실패 시 IndexedDB에 보존, 진행자 시트에서 재시도 |
| **잠금** | OS 회전 잠금 + **Guided Access**(가장자리·홈·컨트롤 센터·알림 차단). 페이지가 막지 못하는 것은 페이지가 기록하지도 못한다 |
| **깨움** | `navigator.wakeLock.request('screen')` + 자동 잠금 해제 |
| **소리** | 내장 스피커 또는 유선. **블루투스 금지**(지연) · 세션 전 **무음 모드 해제** 확인 |
| **빌드 식별** | 헤더 `build` = `probe-<semver>+<git short hash>` |

## 2. 상수표

코드의 `constants.ts` 하나에 전부 둔다. 파일럿(09.26)에서 교정되는 값은 ☐.

| 이름 | 값 | 뜻 | |
| --- | --- | --- | --- |
| `W · H` | 1366 · 1024 | 가상 캔버스. 세션 기기에서 1 px = 1 pt | |
| `L` | 8 000 ms | 루프(캔버스) 길이 | ☐ |
| `K_P · K_T` | 48 · 16 | 격자 분할 — 음고(반음) · 시간(L/16 = 500 ms) | ☐ |
| `MIDI_LO · MIDI_RANGE` | 40 · 48 | pitch 0–1 → MIDI 40–88 (E2–E6) | |
| `LEN_DEFAULT` | 250 ms | 탭 노트 길이 | ☐ |
| `VEL_FIXED · TONE_FIXED` | 0.5 · 0.5 | 세기·밝기 상수 (입력축 없음) | |
| `STEP_DEFAULT · STEP_RANGE` | L/16 · [L/32, L/4] | 규칙 열 간격 | ☐ |
| `SPREAD_DEFAULT` | 0.5 | 난수 지터 (0–1) | ☐ |
| `TAU` | 10 000 ms | 정지 임계 (체류 계산) | ☐ |
| `SEG1_APPEAR · SEG1_CAP · SEG2_LEN` | 480 000 · 900 000 · 420 000 ms | 여기까지 등장 · 구간 1 상한 · 구간 2 길이 | |
| `FADE_IN` | 3 000 ms | 여기까지 페이드 인 | |
| `SLOT` | 100 | 제어 요소 한 변 | ☐ |
| `NOTE_EDGE` | 28 px | 노트 오른쪽 끝 손잡이 폭 | |
| `IMG_DEFAULT · IMG_MIN · IMG_MAX` | 360×240 · 180×120 · 1206×804 | 이미지 크기 (3:2 고정) | |
| `HANDLE` | 48 | 이미지 손잡이 한 변 | |
| `CHIP_MAX` | 3 | 빈 면 슬롯의 칩 수 | |
| `CANVAS_LIST_MAX` | 10 | 캔버스 목록 표시 수 | |
| `PREVIEW_LOOP` | 2 500 ms | 미리보기 루프 | ☐ |
| `VOICES · LOOKAHEAD · LATENCY_TARGET` | 32 · 25 ms · 20 ms | 오디오 | |
| `ENV` | A 5 · D 60 · S 0.6 · R 80 ms | 앰프 엔벨로프 | |
| `LPF_HZ` | 2 000 | 필터 컷오프 (tone 상수) | |
| `MIC_THR · MIC_ON · MIC_OFF · MIC_SPAN_END` | 0.02 · 40 · 150 · 1 500 ms | 마이크 온셋·종료·span 종료 | ☐ |
| `MOVE_COALESCE · FLUSH` | 16 · 1 000 ms | touch.move 병합 · IndexedDB 기록 주기 | |
| `FAC_TAPS · FAC_WINDOW · FAC_RECT` | 5 · 1 500 ms · (0,0)–(30,32) | 진행자 시트 열기 | |
| `TEXT_ABORT_CHARS` | 3 | 이하이면 `text.abort` | |
| `IDLE_LIST_MIN` | 60 000 ms | 회고 모드 정지 목록 문턱 | |

## 3. 화면과 좌표

### 3-1. 영역

```
 (0,0)                                                          (1366,0)
   ┌───────┬────────────────────────────────────────────────────────┐
   │ 서랍  │  시간축 띠  1206 × 48                                  │  y 0–48
   │ 160   ├────────────────────────────────────────────────────────┤
   │ ×     │              작 업 면   1206 × 836                      │  y 48–884
   │ 884   │              x → 시간 · y → 음고                        │
   ├───────┴────────────────────────────────────────────────────────┤
   │                    하 단 띠   1366 × 140                        │  y 884–1024
   └────────────────────────────────────────────────────────────────┘
```

| 영역 | 사각형 |
| --- | --- |
| 재료 서랍 | (0, 0) – (160, 884) |
| 시간축 띠 | (160, 0) – (1366, 48) |
| 작업 면 | (160, 48) – (1366, 884) |
| 하단 띠 | (0, 884) – (1366, 1024) |

배율 `s = min(vw/1366, vh/1024)`, 중앙 정렬 레터박스. 로그 좌표는 언제나 가상 좌표.

### 3-2. 하단 띠 — 슬롯 10개 (100 × 100, y 904–1004)

| 묶음 | 슬롯 (기본 순서) | x |
| --- | --- | --- |
| 좌 6 · **셔플** | `grid` `gen.hand` `gen.rule` `gen.random` `play` `all` | 40 · 164 · 288 · 412 · 536 · 660 |
| 우 4 · **고정** | `mark` `canvas.keep` `canvas.discard` `done` | 854 · 978 · 1102 · 1226 |

좌 6은 글자 없음(미리보기), 우 4는 글자 있음 — **마킹 · 남기고 새로 · 지우고 새로 · 여기까지**. `done`은 구간 1 시작 후 `SEG1_APPEAR`까지 자리만 비우고 렌더하지 않는다; 나타날 때 `FADE_IN` 동안 opacity 0→1.

### 3-3. 재료 서랍

| 구획 | 사각형 | 내용 |
| --- | --- | --- |
| 재료 슬롯 3 · **셔플** | (30,32) (30,168) (30,304), 각 100×100 | `mat.blank` `mat.sound` `mat.image` |
| 규칙 값 슬라이더 | (30,440) – (130,600) | `gen ∈ {rule, random}`일 때만 렌더 |
| 캔버스 목록 | (16,640) – (144,884) | 60×40 축소판, 2열 × 5행, 간격 8 |

**이미지 패널** — `mat.image` 슬롯 탭으로 열린다. (160,48) – (360,884). 5장(150×100, 순서 셔플) + `absent` 슬롯(100×100), 세로 간격 24. 패널 밖 탭 = 닫힘. 열린 동안 가려진 작업 면 접촉은 `blocked:true`.

### 3-4. 온스크린 키보드

입력 칸 1206 × 80, x = 160, `visualViewport` 상단 기준 키보드 바로 위. 작업 면 좌표계 불변(스크롤·축소 없음). 가려진 영역 접촉은 `blocked:true`. 바깥 탭 = 확정.

### 3-5. 좌표 ↔ 값

```
on    = (x − 160) / 1206 · L                 [0, L]
pitch = 1 − (y − 48) / 836                   [0, 1]
midi  = MIDI_LO + MIDI_RANGE · pitch
hz    = 440 · 2^((midi − 69) / 12)
격자 ON → pitchQ = round(pitch · K_P) / K_P,  onQ = round(on / (L/K_T)) · (L/K_T)   (렌더·재생 시에만, 저장은 원값)
```

## 4. 데이터 모델

```ts
type Mat  = 'blank' | 'sound' | 'image'
type Gen  = 'hand' | 'rule' | 'random'
type Src  = 'touch' | 'rule' | 'random' | 'material' | 'text' | 'mic'
type Scope = 'one' | 'many' | 'all'

interface State { mat: Mat; grid: boolean; gen: Gen }          // 18칸. grid·gen은 전역, mat은 캔버스별

interface Note  { id: string; on: number; pitch: number; len: number; vel: number; tone: number; src: Src; mat: Mat }
interface Image { img: string; x: number; y: number; w: number; h: number }          // 3:2
interface Label { id: string; x: number; y: number; raw: string; ids: string[]; onAxis: boolean }
interface Chip  { id: string; raw: string; t: number }                               // 빈 면 슬롯, 최대 3

interface Canvas {
  n: number; mat: Mat; notes: Note[]; images: Image[]; labels: Label[];
  playFrom: number;            // 재생 시작점 (ms). 캔버스별
  selection: Set<string>; allOn: boolean;
  kept: boolean;               // 목록에 있는가
}

interface Session {
  pid: string; seed: string; build: string; seg: -1|0|1|2|3;
  t0: number;                  // 플래시 시각 (performance.now)
  state: State; canvases: Canvas[]; current: number; chips: Chip[];
  slots: { bottom: string[]; drawer: string[]; panel: string[] };
  lock?: { axis: 'mat'|'grid'|'gen'; value: string };
  cuts: string[];
}
```

**규칙** — `state.mat`은 `mat.adopt`로만 바뀌고 새 캔버스에서 `blank`. `grid`·`gen`은 캔버스와 무관. 노트의 `mat`은 `src === 'material'`이면 `sound`, 그 외 `blank`. `vel`·`tone`은 상수.

## 5. 입력 처리

Pointer Events. `touch-action: none`, `gesturestart` 차단, 더블탭 확대 차단. **한 손가락만 작동한다.**

### 5-1. `target` 판정 (히트 테스트 순서)

`slot.gone` → `slot:*` → `panel:*` → `chip` → `canvas:<n>` → `slider` → `axis` → `image.move:<id>` → `image.size:<id>` → `note.edge:<id>` → `note:<id>` → `label:<id>` → `image:<id>` → `surface` → `none`

노트는 이미지 위에 그려지므로 노트가 이미지보다 먼저 맞는다. `image:<id>`에 맞은 접촉은 **`surface`와 같은 동작을 하고** `image.touch {img,u,v}`를 추가로 남긴다.

### 5-2. 제스처 분류

| 판정 | 조건 |
| --- | --- |
| 탭 | down→up, 이동 < 8 px, 지속 < 300 ms |
| 누르기 | 이동 < 8 px, 지속 ≥ 300 ms |
| 끌기 | 이동 ≥ 8 px |

### 5-3. 작동하지 않는 것 (N2) — 전부 `acted:false`로 기록

두 번째 이후 포인터(첫 포인터의 동작은 계속) · 핀치·더블탭 · `axis`에서 끌기 · `none` · `slot.gone` · 잠금 위반 접촉(§11-3) · 회고 모드(seg 3)의 모든 접촉. 가려진 영역은 `blocked:true`(별개).

## 6. 조작 규칙

### 6-1. 작업 면 — 노트

| 제스처 | target | 동작 | 사건 |
| --- | --- | --- | --- |
| 탭 | `surface` | 더하기. `on,pitch`←좌표, `len=LEN_DEFAULT` | `note.add src:touch` |
| 누르기 | `surface` | 더하기. `len` = 누른 시간 (뗄 때 확정) | `note.add` |
| 끌기 | `surface` | 더하기. `on`=시작 x, `pitch`=**시작 y**, `len`=max(LEN_DEFAULT, 가로 이동량→ms). 뗄 때 확정 | `note.add` |
| 탭 | `note` | 선택 토글(§6-2) + 그 노트 1회 발음 | `scope.set` |
| 끌기 | `note` | 고치기 — 그 노트(선택에 포함돼 있으면 선택 전체)의 `on,pitch` 이동 | `note.edit field:pos prev[] vals[]` |
| 끌기 | `note.edge` | 고치기 — `len` 변경 | `note.edit field:len` |
| 끌기 후 **작업 면 밖에서 뗌** | `note` | 지우기 — 그 노트(또는 선택 전체) | `note.remove` |

`gen ∈ {rule, random}`이면 `surface` 탭·누르기·끌기는 노트 하나 대신 **열**을 놓는다(§6-4). 노트 위 조작은 모드와 무관.

새 노트를 놓으면 선택 = 그 노트 하나, `allOn=false`. 손 노트는 놓는 즉시 1회 발음.

### 6-2. 편집 범위 = 선택

| 값 | 어떻게 |
| --- | --- |
| `one` | 노트 탭 (선택이 정확히 1개) |
| `many` | 노트를 잇달아 탭 (토글 누적, 2개 이상) |
| `all` | `all` 슬롯 탭 (토글). 켜지면 전부 선택, 새 노트를 놓으면 꺼진다 |

선택이 바뀔 때마다 `scope.set {scope,count,ids}`. 고치기·지우기는 선택 전체에 걸린다. 더하기에는 범위가 걸리지 않는다. 선택 0개면 `scope` 필드는 `null`.

### 6-3. 격자 `grid`

`grid` 슬롯 탭 = 토글 → `grid.on` / `grid.off`. **비파괴** — 저장은 원값, 렌더·재생·규칙 열 생성에서만 양자화(§3-5). 켜면 시간축 띠와 작업 면에 눈금이 나타난다.

### 6-4. 생성 방식 `gen`

`gen.*` 슬롯 탭 → `gen.set`. 켜진 슬롯은 밝게. 규칙·난수일 때 슬라이더 렌더(§3-3).

| 모드 | `surface` 접촉 결과 | 즉시 들리는 것 |
| --- | --- | --- |
| `hand` | 노트 1 | 그 노트 1회 |
| `rule` | 접촉 x부터 `L`까지 간격 `step`, 같은 `pitch`, `len`=LEN_DEFAULT(끌기면 이동량)의 열 | 열 전체가 놓인 간격 그대로 지금부터 1회 재생 |
| `random` | 규칙과 같은 개수. `on += U(−spread·step, +spread·step)`, `pitch += U(−spread·0.25, +spread·0.25)` 클램프. PRNG 시드 = `hash(seed, seq)` | 같음 |

열은 `note.add {src:'rule'|'random', count, ids[], vals[]}` **한 건**. 슬라이더 이동 → `rule.param {name:'step'|'spread', value}`.

### 6-5. 시간축 띠 · 재생

| 제스처 | 동작 | 사건 |
| --- | --- | --- |
| `axis` 탭 | `playFrom` = 그 x의 `on`. 재생 중이면 헤드 점프 | `play.seek {at}` |
| `play` 슬롯 탭 | 재생 시작(`playFrom`부터, `L`에서 0으로 순환) / 재생 중이면 정지 | `play.start {from}` · `play.stop {at, heard[], matches_scope}` |

`heard[]` = 이번 재생에서 실제로 지나간 구간들 `[[from, L],[0, at]]` 형식. `matches_scope` = 들은 구간이 정지 시점 선택 노트들의 `[on, on+len]`을 전부 덮으면 `true`, 선택 없으면 `null`. 재생 중 모든 조작 가능.

### 6-6. 재료 — 열람과 채택

| 슬롯 | 탭 (열람) | 작업 면으로 끌어 놓기 (채택) |
| --- | --- | --- |
| `mat.sound` | 재료 열을 1회 재생 → `mat.peek {mat:'sound', dur}` | 첫 이벤트가 놓은 (x,y)에 오도록 열 전체 배치 → `mat.adopt {mat,x,y}`(캔버스에서 처음일 때만) + `note.add {src:'material', count}` |
| `mat.image` | 이미지 패널 열기 → `mat.peek {mat:'image'}` | 패널의 장을 끌어 놓기 → 놓은 자리 중심 `IMG_DEFAULT` → `mat.adopt`(처음일 때만) + `image.place` |
| `mat.blank` | 적기 열기(§6-7) | 채택 없음 |

`mat.adopt`가 `state.mat`을 바꾼다. 소리 재료는 몇 번이고 놓을 수 있다.

### 6-7. 적기 — 칩 · 라벨

```
mat.blank 탭 → text.open → 키보드 → 바깥 탭 → text.commit {raw,chars,edits,dur} (chars ≤ 3이면 text.abort)
확정 → 칩이 mat.blank 슬롯에 붙는다 (최대 CHIP_MAX, 넘치면 가장 오래된 것 제거)
칩 끌어 작업 면에 놓기 → text.place {target:'surface', x, y, raw, ids[]} + note.add {src:'text', count} + Label
칩 끌어 시간축 띠에 놓기 → text.place {target:'axis', x, raw} + Label(onAxis)   — 노트 없음
```

음절 → 노트: 한글 음절 1 = 노트 1 · 로마자 모음 묶음 1 = 노트 1 · 숫자 자릿수 1 = 노트 1 · 공백·문장부호 = 쉼 1칸(노트 없음). 간격 = `grid ? L/K_T : L/16`, `pitch` = 놓은 y(평탄), `len`=LEN_DEFAULT. `L`을 넘는 음절은 버리고 `text.place.truncated:n`.

입력 칸 속성: `autocorrect=off autocomplete=off spellcheck=false autocapitalize=off`. **어느 상태에서도 열린다.**

`absent` 슬롯(이미지 패널) → 같은 입력 칸, 확정 시 `image.absent {raw,chars}`. 칩 없음, 노트 없음.

### 6-8. 이미지 — 손잡이

| target | 끌기 | 사건 |
| --- | --- | --- |
| `image.move` (좌상단 48×48) | 옮기기. **작업 면 밖에서 뗌 = 제거** | `image.move` · `image.remove` |
| `image.size` (우하단 48×48) | 크기. 3:2 고정, `[IMG_MIN, IMG_MAX]` | `image.size` |
| `image` 몸통 | §6-1과 같음 + `image.touch {img,u,v}` (u,v = 이미지 내부 0–1) | — |

이미지는 노트 아래에 그린다. 나중에 놓은 이미지가 위. 손잡이는 작은 모서리 표시로 상시.

### 6-9. 캔버스

| 조작 | 동작 | 사건 |
| --- | --- | --- |
| `canvas.keep` 슬롯 | 현재 캔버스 스냅샷 → `kept=true`, 목록에 추가 → 새 빈 캔버스(`mat=blank`) | `snapshot reason:canvas` · `canvas.new {from,to}` |
| `canvas.discard` 슬롯 | 스냅샷 → 버림(`kept=false`) → 새 빈 캔버스 | `snapshot` · `canvas.discard {from,to}` |
| 목록 축소판 탭 | 그 캔버스로 전환. 떠나는 캔버스는 스냅샷 후 목록으로 | `snapshot` · `canvas.switch {from,to}` |
| 11번째 kept | 가장 오래된 것이 목록에서만 사라짐 | `canvas.evict {n}` |

캔버스마다 `mat` · `playFrom` · 선택을 따로 갖는다.

### 6-10. 세션 버튼

| 슬롯 | 동작 | 사건 |
| --- | --- | --- |
| `mark` | 화면 변화 없음. 스냅샷 | `mark {snapshot, n_before}` · `snapshot reason:mark` |
| `done` | 구간 1 종료(§7) | `done {by:'user', since_appear}` |

## 7. 세션 흐름

```
seg -1 준비   진행자 시트: pid · 마이크 임계·권한 · 체크리스트 → [시작]
   │ 흰 플래시 3프레임 → session.flash {wall}, t0
seg 0 튜토리얼   원 하나만 보임. 진행자가 과제문 낭독 → 시트 [구간 1 시작]
seg 1 자유       seg.start{seg:1,by:'facilitator'} → +SEG1_APPEAR: done.appear → +SEG1_CAP: done{by:'cap'}
   │ done → seg.end{1} → lock 계산·적용(§11) → snapshot reason:seg → canvas.new reason:'lock' → seg.start{2}
seg 2 잠금       +SEG2_LEN → seg.end{2,by:'timer'} (시트로 조기 종료 가능)
seg 3 회고       UI 동결. 시트: 마킹 재생 · 미사용 · 정지 · 버튼 인지 · 내보내기
```

| 규칙 | |
| --- | --- |
| 타이머 기준 | `seg.start seg:1`의 `t`. 플래시·첫 터치가 아니다 |
| 구간 2 시작 | `done` 직후 자동. 지연 없음 |
| 튜토리얼 원 | 중심 (763,466), 지름 240. 서랍·띠·하단 띠 비표시. 어떤 접촉이든 `pitch 0.5 · len 400 · vel 0.6 · tone 0.5` 1회 — 위치·이동·시간 무관. 첫 접촉이 `AudioContext.resume()`. 노트를 남기지 않는다(`seg:0` 접촉만 기록) |
| 구간 1 전환 | 원이 300 ms에 사라지고 전체 UI가 **동시에** 나타난다 |
| 회고 모드 | 마지막 화면 그대로. 참여자 접촉은 `acted:false` |

### 7-1. 진행자 시트

열기 — `FAC_RECT`를 `FAC_WINDOW` 안에 `FAC_TAPS`회 탭. 닫기 — 시트 밖 탭. 모든 조작 `facilitator {action}`.

| 화면 | 내용 |
| --- | --- |
| 준비 (seg −1) | `pid` 입력 · 마이크 권한 요청 버튼 + 레벨 미터 + 임계 슬라이더 · 체크 항목(회전 잠금 · Guided Access · 무음 모드 해제 · 스피커 유선/내장 · 카메라 시계) · `vel_source`·`audio_mime` 표시 · **[시작]** |
| 세션 중 | 구간·경과 · [구간 1 시작] · [구간 2 조기 종료] · [비상 정지] |
| 회고 (seg 3) | 마킹 목록(시각 + 축소판, 탭 = 스냅샷 불러와 0부터 1회 재생) · 미사용 목록(접촉 0인 슬롯 · 채택 0 재료 · 칩 놓기 0) · 정지 목록(`idle ≥ IDLE_LIST_MIN`) · 우 4 각각의 첫 접촉 시각 · **[내보내기]** · [재시도] |

## 8. 오디오

```
note → scheduler(lookahead 25 ms) → voice[32] → master → destination
voice: OscillatorNode(sawtooth, hz) → BiquadFilter(lowpass, LPF_HZ, Q 0.7) → Gain(ADSR × vel)
```

- `AudioContext({ latencyHint: 'interactive' })`. 손 노트·탭 발음은 `ctx.currentTime` 즉시, 재생·규칙 열은 스케줄.
- 초과 시 가장 오래된 voice 회수. 마스터 리미터(`DynamicsCompressor`, threshold −6 dB) 하나.
- 악기는 하나뿐. 모든 `src`가 같은 경로.
- 튜토리얼 첫 접촉에서 `resume()`. 준비 화면에서 무음 버퍼 1회 재생으로 컨텍스트 워밍.

## 9. 마이크

```
getUserMedia({ audio: { echoCancellation: true, noiseSuppression: false, autoGainControl: false } })
  ├─ MediaRecorder(전체 세션, 브라우저 기본 MIME)  → 파일 2   ← 게이트와 무관, 끊지 않는다
  └─ AnalyserNode 60 Hz 폴링 (입력 채널)
       RMS > MIC_THR 이 MIC_ON 지속        → 온셋. span 없으면 mic.span 시작
       온셋 후 50 ms f0 중앙값(자기상관)   → pitch (E2–E6 클램프)
       RMS < MIC_THR 이 MIC_OFF 지속       → 노트 끝. len = 지속, vel = 피크 RMS 정규화(0.2–1)
       MIC_SPAN_END 무음                    → mic.span 끝 {from, to, n, gated_ms}
```

- 놓는 위치 — span 첫 노트는 현재 `playFrom`, 이후 실시간 경과만큼 오른쪽. `L`에 닿으면 span 종료. `src:'mic'`.
- **게이트** — 마스터 출력 RMS가 임계 이상인 동안 입력 채널 닫힘. `mic.gate {on}` 기록, span에 `gated_ms` 합산.
- 권한은 준비 화면에서. 임계는 레벨 미터로 진행자가 조정 → 헤더 `mic_threshold`.

## 10. 로그

### 10-1. 봉투

```json
{ "t": 184230, "seq": 417, "type": "note.add", "seg": 1, "canvas": 2,
  "state": { "mat": "sound", "grid": false, "gen": "hand" }, "target_mat": "image", ... }
```

`t` = `performance.now() − t0` (ms, 정수). `seq` 단조 증가. `target_mat` = 조작이 향한 재료(`sound`·`image`) 또는 `null`.

### 10-2. 타입

| 타입 | 필드 |
| --- | --- |
| `session.header` | §10-3 |
| `session.flash` | `wall` |
| `session.resume` | `gap_ms` |
| `seg.start` `seg.end` | `seg` `by` |
| `touch.down` `touch.move` `touch.up` | `id` `x` `y` `force` `size` `pointers` `target` `acted` `blocked` · up에 `dur` `path_len` · `reason`(잠금 위반 시 `'lock'`) |
| `note.add` | `ids[]` `count` `src` `vals[]` `scope` |
| `note.edit` | `ids[]` `count` `scope` `field` `prev[]` `vals[]` |
| `note.remove` | `ids[]` `count` `scope` |
| `scope.set` | `scope` `count` `ids[]` |
| `mat.peek` | `mat` `dur` |
| `mat.adopt` | `mat` `x` `y` |
| `grid.on` `grid.off` | `by` (`'user'`\|`'lock'`) |
| `gen.set` | `gen` `by` |
| `rule.param` | `name` `value` |
| `play.seek` | `at` |
| `play.start` | `from` |
| `play.stop` | `at` `heard[][]` `matches_scope` |
| `text.open` `text.commit` `text.abort` | `raw` `chars` `edits` `dur` |
| `text.place` | `target` `x` `y` `raw` `ids[]` `truncated` |
| `image.place` `image.move` `image.size` `image.remove` | `img` `x` `y` `w` `h` |
| `image.touch` | `img` `u` `v` |
| `image.absent` | `raw` `chars` |
| `mic.span` | `from` `to` `n` `gated_ms` |
| `mic.gate` | `on` |
| `mark` | `snapshot` `n_before` |
| `canvas.new` `canvas.discard` `canvas.switch` `canvas.evict` | `from` `to` `reason` |
| `snapshot` | `id` `reason` `canvas` `playFrom` `notes[]` `images[]` `labels[]` |
| `done.appear` | — |
| `done` | `by` `since_appear` |
| `lock.apply` | §11-4 |
| `idle` | `dur` |
| `facilitator` | `action` |

`vals[]` 원소 = `{on, pitch, len, vel, tone}`. `touch.move`는 `MOVE_COALESCE`로 병합.

### 10-3. 헤더 (첫 줄)

```json
{ "type":"session.header", "pid":"P07", "date":"2026-09-30", "build":"probe-0.3.0+a1b2c3d",
  "device":"iPad Pro 12.9 (5th)", "os":"iPadOS 26.8", "ua":"…", "standalone":true,
  "viewport":[1366,1024], "scale":1.0, "letterbox":[0,0],
  "vel_source":"fixed", "tone_source":"fixed", "audio_mime":"audio/mp4",
  "seed":"P07",
  "slots_bottom":["gen.rule","grid","play","gen.hand","all","gen.random"],
  "slots_drawer":["image","blank","sound"], "slots_panel":["i3","i1","i5","i2","i4"],
  "loop_ms":8000, "grid_div":[48,16], "tau_ms":10000, "len_default_ms":250,
  "step_default_ms":500, "spread_default":0.5, "mic_threshold":0.02, "mic_input":true,
  "lock_rule":"v0.3", "cuts":[], "guided_access":true, "silent_mode_off":true }
```

셔플 시드 = `pid`. 확정된 배열 셋을 통째로 남긴다.

### 10-4. 저장 · 내보내기

- 이벤트는 메모리 버퍼 → `FLUSH`마다 IndexedDB append. `visibilitychange`·`pagehide`에서 즉시.
- 새로고침 시 IndexedDB에서 이어 붙이고 `session.resume`. `t0`는 헤더 `wall`로 복원.
- 파일 — `P07_2026-09-30.jsonl` (헤더 + 이벤트 + 스냅샷) · `P07_2026-09-30.audio.m4a|webm`.
- 내보내기 — `navigator.share({ files: [File, File] })`. 실패/취소 시 IndexedDB 보존, `exported:false`, 시트 [재시도]. 성공 시 `exported:true`.

### 10-5. 체류

```
활동 구간 = 터치 이벤트 · play.start→stop · mic.span · text.open→commit|abort
연속 활동 사이 Δ ≤ TAU  → 현재 state의 dwell에 Δ
Δ > TAU                → idle {dur}, dwell에 넣지 않음
T_active = Σ dwell (seg 1만)
```

## 11. 자기 잠금

### 11-1. 계산 (구간 1 종료 시)

```
for axis in [mat, grid, gen]:
    k        = {mat:3, grid:2, gen:3}[axis]
    p[axis]  = max_v dwell[axis][v] / T_active
    pn[axis] = (p[axis] − 1/k) / (1 − 1/k)
    used[axis] = 구간 1에 그 축 전이 ≥ 1

candidates = [a for a in axes if used[a]] or axes
axis  = argmax(pn over candidates); 동점 gen > mat > grid
value = argmax_v dwell[axis][v]
alt   = 원식 — argmax(p over axes), 동점 gen > mat > grid   (기록만)
```

헤더 `lock_rule`이 `"v0.2"`이면 `alt`가 실제 잠금이 되고 `v0.3` 결과가 `alt`로 간다.

### 11-2. 적용

| 잠긴 것 | 화면 | 상태 |
| --- | --- | --- |
| `mat=sound` / `image` | 그 서랍 슬롯 제거(`slot.gone`) | 면 위 기존 것은 유지 |
| `mat=blank` | 제거할 슬롯 없음 | 구간 2 캔버스에서 **첫 조작이 채택이어야** 한다. 그 전 `surface` 접촉 `acted:false reason:'lock'` |
| `gen=X` | 그 슬롯 제거. 현재 모드가 X면 → `hand`(X가 hand면 `rule`) `gen.set by:'lock'` | 슬라이더도 제거(X가 rule/random) |
| `grid=off` | 토글 제거, ON 고정 `grid.on by:'lock'` | |
| `grid=on` | 토글 제거, OFF 고정 `grid.off by:'lock'` | |

빈 자리는 메우지 않는다. 구간 2는 새 캔버스(`canvas.new reason:'lock'`), 앞 캔버스는 목록에 남는다.

### 11-3. 기록

```json
{ "type":"lock.apply", "seg":2, "rule":"v0.3", "axis":"mat", "value":"blank",
  "candidates":["mat","gen"], "p":{...}, "p_norm":{...},
  "alt":{"rule":"v0.2","axis":"grid","value":"off"},
  "dwell":{ "mat":{...}, "grid":{...}, "gen":{...} }, "T_active":411900 }
```

## 12. 미리보기 (좌 6 · 서랍 3)

슬롯 안 미니 캔버스에 작업 면 렌더러를 `preview` 모드로. 하나의 `requestAnimationFrame`에서 전부. 무음. 루프 `PREVIEW_LOOP`, 아홉의 길이·움직임 양 동일. 손가락·경로 없음, **결과만**.

| 슬롯 | 보이는 것 |
| --- | --- |
| `grid` | 눈금이 나타났다 사라짐 |
| `gen.hand` | 점 하나 |
| `gen.rule` | 등간격 열 |
| `gen.random` | 불규칙 열 — 시드 `hash(seed, loopIndex)`로 매 루프 다르게 |
| `play` | 헤드가 지나가며 점이 밝아짐 |
| `all` | 흩어진 점이 한꺼번에 밝아짐 |
| `mat.blank` | 커서 깜빡임 + 짧은 획 (칩 있으면 칩 표시) |
| `mat.sound` | 점 몇 개가 한 덩어리로 |
| `mat.image` | 사각형 |

절단 시(§14) 각 슬롯의 마지막 프레임 한 장으로 대체.

## 13. 더미 재료 (09.25 저녁 실물 교체)

| 재료 | 더미 | 형식 |
| --- | --- | --- |
| 소리 | `materials/sound.json` — `{ "vals": [ {on, pitch, len, vel, tone} × 5–8 ] }`, `on`은 0부터 상대값 | 실물도 같은 JSON. 코드 변경 없음 |
| 이미지 | `materials/img/i1..i5.png` — 단색 사각형, **1200 × 800**(3:2), 번호만 | 실물도 같은 파일명·규격 |

## 14. 제작 순서와 절단

### 14-1. 순서

| 날 | 만드는 것 | 밤의 판정 |
| --- | --- | --- |
| **09.22–23** | **수직 절편** — 플래시 → 튜토리얼 원 → 작업 면 탭·끌기 = 소리 + `note.add` → `mark` → IndexedDB → `share` 내보내기 → **로그 검증 스크립트**(`jsonl → 기록 체인 한 줄`) | 이 한 줄이 돌기 전에 다른 기능 없음 |
| 09.23 | 격자 · 선택·고치기·지우기 · 상태 전이 로깅 · standalone 설치 + SW 캐시 · 마이크 권한(준비 화면) | 절단 없음 — 전부 불가침. 미완이면 다음 날 오전 |
| 09.24 | 재생·시작점·`heard[]` · 재료 채택(더미) · 캔버스 목록 · 미리보기 | 미리보기 미완 → **정지 프레임** |
| 09.25 | 적기·칩·라벨 · 생성 방식·슬라이더 · 버튼 넷·`done` 타이머 · 잠금 · 마이크 입력 · 이미지 손잡이 · 진행자 시트 · **재료 실물** | 마이크 입력·이미지 크기 미완 → 자른다. 실물 미완 → 더미로 파일럿 |
| 09.26 아침 | 남은 것 | 슬라이더·라벨 미완 → 자른다 |
| **09.26** | **자가 파일럿** 2회 (§15 순서대로 · 두 잠금식 비교) | 상수표 ☐ 교정 |

### 14-2. 절단 후보 (순서대로) — 헤더 `cuts`에 기록, 전원 동일

| # | 자르는 것 | 대안 |
| --- | --- | --- |
| 1 | 마이크 입력 채널 | 녹음 트랙만 |
| 2 | 이미지 크기 조정 | `IMG_DEFAULT` 고정, `image.size` 없음 |
| 3 | 미리보기 루프 | 정지 프레임 |
| 4 | 규칙 값 슬라이더 | 기본값만 |
| 5 | 텍스트 라벨 | 칩 놓기는 노트만 |

**자르지 않는다** — 로그 파이프라인 · 상태·전이 · 버튼 넷 · 격자 · 생성 방식 셋 · 선택 · 재생·들은 구간 · 잠금 · 스냅샷 · 플래시 · 진행자 시트 · 재료 3종 · 적기 · 캔버스 복귀.

## 15. 수용 테스트 (자가 파일럿 순서)

로그 검증 스크립트로 확인 가능한 것은 ⚙, 눈·귀로 확인하는 것은 👁.

**환경**
- [ ] 👁 standalone으로 뜨고, 기내 모드에서도 뜬다
- [ ] 👁 회전 잠금 · Guided Access · 무음 해제 상태에서 소리가 난다
- [ ] ⚙ 헤더에 `build` · 슬롯 배열 셋 · 상수가 있다
- [ ] 👁 내보내기가 파일 앱에 파일 둘을 만든다. 취소 후 재시도가 된다
- [ ] ⚙ 새로고침 후 `session.resume`이 남고 앞 로그가 그대로다

**N — 없는 것**
- [ ] 👁 N1 준비 화면 이후 참여자가 보는 첫 화면은 원 하나. 권한·로딩·시작 버튼 없음
- [ ] ⚙ N2 두 손가락·핀치·`axis` 끌기·`slot.gone`이 `acted:false`로 남는다
- [ ] 👁 N3 손·재료·적기·마이크 노트가 같은 악기로 들린다
- [ ] 👁 N4 튜토리얼 원에서 탭·누르기·끌기·위치가 같은 소리
- [ ] 👁 N5 좌 6·서랍 3에 글자 없음, 우 4에만 글자

**G — 기능**
- [ ] ⚙ G1 탭·누르기·끌기가 각각 `note.add`로, `len`이 규칙대로 · 터치 → 소리 20 ms 내(👁)
- [ ] ⚙ G2 `mic.span`과 `src:mic` 노트 · 녹음 파일이 세션 전체 · 게이트가 재생 중 닫힌다
- [ ] ⚙ G3 `text.commit raw` 원문 · `text.abort`(≤3자) · 칩 3개 · `text.place target` 둘 다 · 음절 수 = `count`
- [ ] ⚙ G4 `mat.peek` ≠ `mat.adopt` · 채택이 `state.mat`을 바꾼다 · 새 캔버스에서 `blank` · `image.place/touch` u,v
- [ ] ⚙ G5 `note.edit`(prev 있음) ≠ `note.remove`+`note.add` · 요소 지우기 ≠ `canvas.discard` · 규칙·난수 열이 `count` 한 건
- [ ] ⚙ G6 `play.seek` · `play.stop heard[]` · 순환 시 조각 둘 · `matches_scope`
- [ ] ⚙ G8 `scope.set` one/many/all · 고치기·지우기가 선택 전체에
- [ ] ⚙ G9 `grid.on/off` 시각 · 원값 저장(👁 끄면 복원)
- [ ] ⚙ G10 `mark`마다 `snapshot reason:mark` · 회고 모드에서 재생(👁)
- [ ] ⚙ G11 `done.appear` = seg1 + 480 000 ± 50 · 👁 3초 페이드 · `done by:cap` = seg1 + 900 000 · `since_appear`
- [ ] ⚙ G12 `canvas.new` ≠ `canvas.discard` ≠ `note.remove` · `canvas.switch` 후 노트 그대로
- [ ] ⚙ G14 두 pid에서 슬롯 배열이 다르고 같은 pid에서 같다
- [ ] ⚙ G15 `lock.apply`에 `p`·`p_norm`·`alt`·`dwell` · 👁 잠긴 슬롯이 사라지고 나머지는 안 움직인다 · `slot.gone` 접촉 기록
- [ ] ⚙ G16 `session.flash wall`이 카메라 시각과 맞는다
- [ ] ⚙ 체류 — 재생 20초 무접촉이 `idle`로 빠지지 않는다
- [ ] ⚙ 산출 밀도 — 스크립트가 `state × src`로 나눠 낸다

**파일럿에서 볼 것 (상수표 ☐)** — `TAU` · `SLOT` · `LEN_DEFAULT` · `L` · `K_P/K_T` · `STEP/SPREAD` · `MIC_THR` · 두 잠금식의 판정 차이 · D1 전환 기준(한 문장 15초 · 작업 면 절반 가림) · 칩 놓기·지우기·시작점 탭의 발견 여부 · `radiusX`·`force` 실값 여부.

## 16. 진행자 준비 체크리스트 (준비 화면에 그대로)

- [ ] 기내 모드 또는 Wi-Fi 끔 · 앱이 standalone으로 뜸
- [ ] 회전 잠금 켬 · **무음 모드 해제** · 알림 요약 끔
- [ ] 스피커 내장/유선 · 볼륨 70 %
- [ ] 마이크 권한 허용 · 레벨 미터에서 방 소음 아래로 임계 조정
- [ ] `pid` 입력 · 카메라 2대 녹화 시작 · 카메라 시계 확인
- [ ] **Guided Access 시작** (마지막)
- [ ] [시작] → 플래시 → 원 → 과제문 낭독 → [구간 1 시작]

## 17. 파일 구조 (제안)

```
src/
  constants.ts      §2
  layout.ts         §3 사각형·히트 테스트
  model.ts          §4
  input.ts          §5 포인터 → 제스처 → target
  ops/              §6 notes · scope · grid · gen · play · material · text · image · canvas · buttons
  session.ts        §7 구간·타이머·잠금 적용
  facilitator.ts    §7-1
  audio.ts          §8
  mic.ts            §9
  log.ts            §10 봉투·버퍼·IndexedDB·export
  lock.ts           §11
  render.ts         작업 면·띠·서랍·하단 띠
  preview.ts        §12
  sw.ts             프리캐시
materials/          §13
tools/
  chain.py          jsonl → 기록 체인 한 줄 · 수용 테스트 ⚙ 항목 자동 확인
```
