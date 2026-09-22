# §4 데이터 모델

> **정본** — [SPEC.md](../../SPEC.md) §4
> **근거** — 구현 명세 V0.3 §3-2 · §4 · §5-1
> **대응 코드** — `src/model.ts`
>
> 이 파일은 스펙을 다시 쓰는 자리가 아니라 **이 절을 구현하며 쌓이는 것**(메모 · 구현 결정 · 교정값 · 상위 문서에 되돌릴 정정)을 두는 자리다. 규칙·수치가 SPEC과 어긋나면 SPEC(볼트 원본)을 먼저 고친다.

## 이 절이 정하는 것

- `Mat` blank·sound·image · `Gen` hand·rule·random · `Src` touch·rule·random·material·text·mic · `Scope` one·many·all
- `State { mat, grid, gen }` = 18칸. `grid·gen`은 전역(모드), `mat`은 캔버스별
- `Note { id on pitch len vel tone src mat }` · `Image { img x y w h }` 3:2 · `Label { id x y raw ids onAxis }` · `Chip { id raw t }` 최대 3
- `Canvas { n mat notes images labels playFrom selection allOn kept }`
- `Session { pid seed build seg t0 state canvases current chips slots lock? cuts }`
- 규칙 — `state.mat`은 `mat.adopt`로만 · 새 캔버스에서 `blank` · 노트 `mat`은 `src === 'material'`이면 `sound` 그 외 `blank` · `vel·tone` 상수

## 열린 항목

- [ ] `id` 생성 규칙(노트 `n81` · 라벨 `l2` · 스냅샷 `s12` 형식) 확정 — 로그 예시와 맞춘다
- [ ] `selection: Set<string>`의 직렬화(스냅샷·IndexedDB)

## 구현 메모

_(비어 있음 — 구현하는 날 채운다)_

## 상위 문서에 되돌릴 것

_(없음)_
