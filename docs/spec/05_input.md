# §5 입력 처리

> **정본** — [SPEC.md](../../SPEC.md) §5
> **근거** — 구현 명세 V0.3 §2-1 · §2-6 (N2 확정 목록)
> **대응 코드** — `src/input.ts` — 포인터 → 제스처 → `target`
>
> 이 파일은 스펙을 다시 쓰는 자리가 아니라 **이 절을 구현하며 쌓이는 것**(메모 · 구현 결정 · 교정값 · 상위 문서에 되돌릴 정정)을 두는 자리다. 규칙·수치가 SPEC과 어긋나면 SPEC(볼트 원본)을 먼저 고친다.

## 이 절이 정하는 것

- Pointer Events · `touch-action: none` · `gesturestart` 차단 · 더블탭 확대 차단 · **한 손가락만 작동**
- 히트 테스트 순서 — `slot.gone → slot:* → panel:* → chip → canvas:<n> → slider → axis → image.move → image.size → note.edge → note → label → image → surface → none`
- 제스처 — 탭(< 8 px · < 300 ms) · 누르기(< 8 px · ≥ 300 ms) · 끌기(≥ 8 px)
- 작동하지 않는 것(전부 `acted:false`) — 두 번째 이후 포인터 · 핀치·더블탭 · `axis` 끌기 · `none` · `slot.gone` · 잠금 위반 · 회고 모드 접촉. 가려진 영역은 `blocked:true`(별개)
- `image:<id>`에 맞은 접촉은 `surface`와 같은 동작 + `image.touch {img,u,v}`

## 열린 항목

- [ ] `force` · `radiusX`(size) 실값 여부 — 기록만 하고 파일럿 로그에서 확인 (⑭ 보류)
- [ ] 첫 포인터가 진행 중일 때 두 번째 포인터의 `touch.move`를 어디까지 기록할지 (`pointers≥2 acted:false`)

## 구현 메모

- 09.22 — 제스처 판정은 **시작점으로부터의 최대 이탈 거리**(`maxDist`) < 8 px로 탭·누르기를 가른다(경로 길이가 아니라). 흔들리는 탭이 끌기로 새지 않게
- 09.22 — seg 0에서는 FAC_RECT만 `none`, 나머지 전부 `surface`(N4). 진행자 5연타가 튜토리얼 소리를 내지 않게 한 예외
- 09.22 — `touch.*`의 `size`는 `[width, height]`(PointerEvent). `radiusX`는 Pointer Events에 없다 — 파일럿 로그에서 실값 여부를 볼 때 이 필드를 본다(⑭)

## 상위 문서에 되돌릴 것

_(없음)_
