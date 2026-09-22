# §8 오디오

> **정본** — [SPEC.md](../../SPEC.md) §8
> **근거** — 구현 명세 V0.3 §7-1 · §7-2 · 기능 명세 N3 · N4
> **대응 코드** — `src/audio.ts`
>
> 이 파일은 스펙을 다시 쓰는 자리가 아니라 **이 절을 구현하며 쌓이는 것**(메모 · 구현 결정 · 교정값 · 상위 문서에 되돌릴 정정)을 두는 자리다. 규칙·수치가 SPEC과 어긋나면 SPEC(볼트 원본)을 먼저 고친다.

## 이 절이 정하는 것

- `note → scheduler(lookahead 25 ms) → voice[32] → master → destination`
- voice: `Oscillator(sawtooth) → BiquadFilter(lowpass, LPF_HZ 2 000, Q 0.7) → Gain(ADSR × vel)`
- `AudioContext({ latencyHint: 'interactive' })` · 손 노트·탭 발음은 즉시 · 재생·규칙 열은 스케줄
- 초과 시 가장 오래된 voice 회수 · 마스터 리미터 `DynamicsCompressor` threshold −6 dB
- **악기는 하나뿐**(N3) — 모든 `src`가 같은 경로
- 준비 화면에서 무음 버퍼 1회로 워밍 · 튜토리얼 첫 접촉에서 `resume()`

## 열린 항목

- [ ] 터치 → 소리 20 ms 이내 확인 방법 (실기기 · 👁 G1)
- [ ] 튜토리얼 원 소리 `pitch 0.5 · len 400 · vel 0.6 · tone 0.5`가 본 세션 노트와 같은 경로인지

## 구현 메모

_(비어 있음 — 구현하는 날 채운다)_

## 상위 문서에 되돌릴 것

_(없음)_
