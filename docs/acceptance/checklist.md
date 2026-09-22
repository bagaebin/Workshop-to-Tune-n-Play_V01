# 수용 테스트 체크리스트 — 자가 파일럿 순서 (SPEC §15)

⚙ = `tools/chain.py`로 확인 · 👁 = 눈·귀로 확인. 자가 파일럿(09.26) 2회, 이 순서대로. 절차는 [pilot-protocol.md](pilot-protocol.md).

> 09.22 — ⚙ 항목은 **데스크톱 개발 로그(P02~P12)에서 `chain.py`가 전부 통과**했다(마이크 G2 제외 — 브라우저가 마이크를 막음). 체크박스는 **iPad 파일럿에서** 채운다. 👁 항목과 환경 항목은 데스크톱에서 대체할 수 없다.
결과는 이 파일에 직접 체크하고, 실패 항목은 [pilot-calibration.md](pilot-calibration.md) 또는 해당 `docs/spec/` 절의 열린 항목으로.

## 환경
- [ ] 👁 standalone으로 뜨고, 기내 모드에서도 뜬다
- [ ] 👁 회전 잠금 · Guided Access · 무음 해제 상태에서 소리가 난다
- [ ] ⚙ 헤더에 `build` · 슬롯 배열 셋 · 상수가 있다
- [ ] 👁 내보내기가 파일 앱에 파일 둘을 만든다. 취소 후 재시도가 된다
- [ ] ⚙ 새로고침 후 `session.resume`이 남고 앞 로그가 그대로다

## N — 없는 것
- [ ] 👁 N1 준비 화면 이후 참여자가 보는 첫 화면은 원 하나. 권한·로딩·시작 버튼 없음
- [ ] ⚙ N2 두 손가락·핀치·`axis` 끌기·`slot.gone`이 `acted:false`로 남는다
- [ ] 👁 N3 손·재료·적기·마이크 노트가 같은 악기로 들린다
- [ ] 👁 N4 튜토리얼 원에서 탭·누르기·끌기·위치가 같은 소리
- [ ] 👁 N5 좌 6·서랍 3에 글자 없음, 우 4에만 글자

## G — 기능
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

## 수직 절편 판정 (09.22–23 밤)
- [x] 플래시 → 원 → 탭·끌기 = 소리 + `note.add` → `mark` → IndexedDB → share → `chain.py` 한 줄 (09.22 데스크톱 · share는 다운로드 폴백)

## 파일럿 기록

| 회차 | 날짜 | pid | 빌드 | `lock_rule` | 잠긴 축·값 | `alt` | 비고 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | 09.26 | PILOT1 | | v0.3 | | | 직접 「여기까지」 |
| 2 | 09.26 | PILOT2 | | **v0.2** | | | 15분 상한 · 도중 새로고침 복구 |
