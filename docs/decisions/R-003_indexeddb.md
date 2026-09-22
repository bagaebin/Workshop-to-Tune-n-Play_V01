# R-003 — IndexedDB 스키마

| | |
| --- | --- |
| 날짜 | 2026-09-22 |
| 상태 | 승인 |
| SPEC | §10-4 |
| 코드 | `src/log.ts` |

## 정한 것
DB `probe` v1, 스토어 둘.

| 스토어 | 키 | 레코드 |
| --- | --- | --- |
| `events` | autoIncrement · 인덱스 `sid` | `{ sid, seq, line }` — `line`은 로그 한 줄 그대로(헤더 포함) |
| `sessions` | `sid` | `{ sid, pid, date, wall, exported, exportedAt? }` |

`sid = <pid>_<YYYY-MM-DD>` = 내보내기 파일 이름과 같다. **같은 날 같은 pid로 다시 시작하면 `_2` `_3`…을 붙인다** — 두 세션을 한 파일에 합치지 않는다(09.22 — 같은 pid 재시작이 실제로 한 파일에 섞여 헤더가 둘이 됐다). 헤더는 `seq: -1`로 저장하고 읽을 때 맨 앞에 둔다. 쓰기 실패 시 버퍼로 되돌린다(유실 금지).

## 기록 시점 (09.22 보완)
SPEC은 `FLUSH`(1 s)마다 append + `visibilitychange`·`pagehide`에서 즉시라고 하지만, 새로고침 직전 0.1 s 안의 제스처가 `pagehide` flush가 끝나기 전에 사라지는 것을 테스트에서 봤다. 그래서 **`touch.move`만 1 s 버퍼에 맡기고 나머지 모든 이벤트는 기록 직후(마이크로태스크) append**한다. 손실 창은 최대 16 ms 병합분의 move뿐이다.
그래도 새로고침 직전(수십 ms) 트랜잭션이 커밋되지 못하는 것을 다시 봤다. 그래서 **미기록 버퍼를 `localStorage["probe.pending.<sid>"]`에 동기로 거울**처럼 쓰고, 다음 로드의 `linesOf()`가 IndexedDB에 없는 seq를 거울에서 합쳐 넣는다. IndexedDB가 정본, 거울은 마지막 몇 줄의 보험이다.

## 왜
한 기기에 하루 두 세션(09.29)이 있으므로 세션별로 분리·재시도할 수 있어야 한다. 이벤트를 한 줄씩 append하는 것이 SPEC의 "세션이 끊겨도 앞부분이 유효"와 맞는다.
