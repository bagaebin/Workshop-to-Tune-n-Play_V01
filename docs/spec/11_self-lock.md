# §11 자기 잠금

> **정본** — [SPEC.md](../../SPEC.md) §11
> **근거** — 구현 명세 V0.3 §6 (⑨ → **D14 제안**) · 기능 명세 G15 · 결정 기록 D11
> **대응 코드** — `src/lock.ts`(계산) · `src/session.ts`(적용)
>
> 이 파일은 스펙을 다시 쓰는 자리가 아니라 **이 절을 구현하며 쌓이는 것**(메모 · 구현 결정 · 교정값 · 상위 문서에 되돌릴 정정)을 두는 자리다. 규칙·수치가 SPEC과 어긋나면 SPEC(볼트 원본)을 먼저 고친다.

## 이 절이 정하는 것

- 구간 1 종료 시 계산 — 축 `mat·grid·gen` · `k = 3·2·3` · `p = max dwell / T_active` · `pn = (p − 1/k)/(1 − 1/k)` · `used` = 전이 ≥ 1
- `candidates` = used인 축(없으면 전부) · `axis = argmax pn` 동점 gen > mat > grid · `value = argmax dwell`
- `alt` = V0.2 원식(`argmax p`) — 기록만. 헤더 `lock_rule`이 `"v0.2"`이면 역할이 바뀐다
- 적용 — `mat=sound/image` 슬롯 제거 · `mat=blank` 첫 조작은 채택이어야(그 전 `acted:false reason:lock`) · `gen=X` 슬롯 제거 + 모드 전환 `by:lock` · `grid` 토글 제거 + 반대값 고정
- 빈 자리는 메우지 않는다 · 구간 2는 새 캔버스 · `lock.apply`에 `p · p_norm · alt · dwell · T_active` 전부 → [../log-schema/examples/lock.apply.json](../log-schema/examples/lock.apply.json)

## 열린 항목

- [ ] **D14** — 판정식 승인. 09.26 자가 파일럿 2회에서 두 식(v0.3 / v0.2)이 다른 축을 고르는지 비교
- [ ] `lock_rule` 플래그를 헤더뿐 아니라 빌드 설정에서 바꿀 수 있게 (세션 전원 동일)

## 구현 메모

- 09.22 (4단계) — `lock.ts`는 순수 계산. 준비 화면 토글로 `lock_rule` v0.2를 실제 잠금으로 둘 수 있고, 어느 쪽이든 다른 식이 `alt`로 병기된다. `chain.py`가 `dwell`에서 p · p_norm · candidates · axis · value · alt를 재계산해 대조한다(P10에서 일치)
- 09.22 — 적용: mat=sound/image → 서랍 슬롯 `gone` · mat=blank → 구간 2 캔버스마다 첫 조작 = 채택(R-007 #10) · gen=X → 슬롯 gone + 현재 모드면 전환 `by:lock` · grid → 토글 gone + 반대값 고정. 빈 자리를 누르면 `slot.gone` `acted:false reason:lock`

## 상위 문서에 되돌릴 것

_(없음)_
