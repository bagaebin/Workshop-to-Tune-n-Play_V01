# Workshop-to-Tune-n-Play_V01 — Digital Probe

Sound by Scratch 워크숍 **후반부(digital probe 세션)**에서 쓰는 한 화면짜리 웹 음악 도구.
참여자가 8~15분 + 7분 동안 "떠오르는 것을 만들어" 보는 동안 **무엇을 어떤 순서로 했는지를 빠짐없이 기록**한다.
가르치지 않고, 제안하지 않고, 평가하지 않는다. 만드는 목적은 소리가 아니라 **로그**다.

## 상태

| | |
| --- | --- |
| 단계 | **1~4단계 구현 완료 · 데스크톱 검증 통과** (2026-09-22). 남은 것 — iPad 실기기 확인 · T11 재료 실물 · 09.26 자가 파일럿([절차](docs/acceptance/pilot-protocol.md)) |
| 정본 | [SPEC.md](SPEC.md) — 볼트의 *Probe 개발 명세* 복사본 |
| 대상 기기 | iPad Pro 12.9형 5세대 · iPadOS 26.8 · Safari standalone · 1366 × 1024 |
| 배포 | GitHub Pages — <https://bagaebin.github.io/Workshop-to-Tune-n-Play_V01/> (main push 시 `.github/workflows/pages.yml`이 빌드·배포) |
| 스택 | Canvas 2D + Web Audio + Pointer Events · TypeScript · Vite · 외부 라이브러리 0 |
| 일정 | 제작 09.22–26 · 자가 파일럿 09.26 · 예비심사 09.28 · 본 세션 09.29– |

## 실행

```bash
npm install && npm run dev        # 개발 (Shift+F = 진행자 시트 · ?fast = 타이머 단축 · __probe.dump() → sessions/)
npm run dev:host                  # 같은 Wi-Fi의 iPad에서 열 때
npm run build && npm run preview  # 빌드 + 서비스 워커 확인
python3 tools/chain.py sessions/<sid>.jsonl --pilot   # 로그 검사 · 파일럿 교정 수치
```

## 읽는 순서

1. [SPEC.md](SPEC.md) — **§2 상수 → §4 데이터 모델 → §5 입력 → §6 조작 → §10 로그 → §14 제작 순서 → §15 수용 테스트**
2. [docs/README.md](docs/README.md) — 문서 체계와 우선순위
3. [docs/features/traceability.md](docs/features/traceability.md) — 기능 명세 G/N 번호 ↔ SPEC 절 ↔ 코드 파일
4. [docs/acceptance/checklist.md](docs/acceptance/checklist.md) — 자가 파일럿 순서

## 폴더

```
.
├── SPEC.md                 정본 — 개발 명세 복사본 (직접 수정 금지)
├── docs/
│   ├── README.md           문서 체계 · 어느 문서가 이기는가
│   ├── 00_sources.md       볼트 원본 문서 목록 (경로·버전·역할)
│   ├── spec/               SPEC §1–§14 대응 작업 노트 (절별 메모·교정값·구현 결정)
│   ├── features/           기능 명세 G1–G16 · N1–N5 추적표
│   ├── acceptance/         수용 테스트 · 파일럿 교정값 · 진행자 체크리스트 · 파일럿 절차 · pilot-issues/(회차 이슈)
│   ├── decisions/          결정 기록 D1–D14 색인 · 저장소 로컬 결정
│   └── log-schema/         이벤트 타입 표 · 예시 JSON
├── src/                    SPEC §17 파일 구조 — 현재 스텁
│   └── ops/                §6 조작 규칙별 모듈
├── materials/              §13 더미 재료 (sound.json · img/i1..i5.png)
├── tools/                  chain.py — jsonl → 기록 체인 · ⚙ 수용 테스트 자동 확인
├── public/                 manifest · 아이콘 (standalone 설치용)
├── index.html
├── package.json · tsconfig.json · vite.config.ts
└── CHANGELOG.md            빌드 식별 `probe-<semver>+<hash>` · cuts 기록
```

## 진행 조작 — 진행자 시트 (SPEC §7-1)

참여자 화면에는 버튼·안내가 없다(N1 · N5). 구간 전환·내보내기는 **숨은 진행자 시트**에서 한다.

- 열기 — **화면 왼쪽 위 구석(약 80 pt 안, 상태 표시줄 바로 아래)을 3초 안에 5연타**, 또는 **같은 자리를 3초 길게 누르기.** 가상 캔버스 (0,0)–(30,32)도 같은 뜻. 준비 화면 오른쪽 아래에 빌드 식별자가 희미하게 보인다 — 배포한 커밋과 같은지 확인
- **새 빌드 받기** — 시트 준비 화면의 [새 빌드 확인] (Wi-Fi 필요). 서버가 더 새 빌드면 캐시를 비우고 다시 뜬다. 세션 로그는 지워지지 않는다. 새로 push한 뒤 GitHub Actions `pages`가 끝나야(1~2분) 서버 빌드가 바뀐다
- 개발 모드(`npm run dev`)에서는 **Shift+F**로도 열린다. 데스크톱은 레터박스 때문에 모서리가 보이지 않는다
- 흐름 — [시작] → 플래시 → 튜토리얼 원 → (과제문 낭독) → **[구간 1 시작]** → 자유 → … → [내보내기]

## 불가침 (SPEC §14-2)

로그 파이프라인 · 상태·전이 · 버튼 넷 · 격자 · 생성 방식 셋 · 선택 · 재생·들은 구간 · 잠금 · 스냅샷 · 플래시 · 진행자 시트 · 재료 3종 · 적기 · 캔버스 복귀.
자를 때는 §14-2 순서(마이크 입력 → 이미지 크기 → 미리보기 루프 → 슬라이더 → 라벨)로만 자르고 헤더 `cuts`에 적는다.

## 첫 수직 절편 (09.22–23)

플래시 → 튜토리얼 원 → 작업 면 탭·끌기 = 소리 + `note.add` → `mark` → IndexedDB → `share` 내보내기 → `tools/chain.py`가 한 줄을 뽑는다.
**이 한 줄이 돌기 전에 다른 기능을 넣지 않는다.**
