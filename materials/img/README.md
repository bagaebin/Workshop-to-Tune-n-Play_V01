# materials/img/

`i1.png` … `i5.png` — **1200 × 800 px (3:2) · RGB PNG.** 이미지 재료 실물(09.29).

- 원본 — 볼트 `Projects/2026_Sound by Scratch/probe_images/app_assets/` (= `final/probe_img_A…E.png`, i1=A … i5=E). 체크섬이 같은 파일을 그대로 복사했다. 리사이즈 · 재압축 · 크롭 · 보정 없음
- id(`i1`–`i5`)는 로그의 `img`와 헤더 `slots_panel`에 그대로 쓰인다. **파일명과 매핑을 바꾸지 않는다**
- 이미지의 유일한 출처는 `src/ops/material.ts`의 `IMAGES` — 파일명에서 id를 뽑는다. 화면에는 이름 · 번호 · 설명을 두지 않는다
- 바꿀 때는 같은 이름으로 덮어쓰고 커밋한다. 빌드가 파일명에 해시를 붙이고 서비스 워커 프리캐시 목록과 캐시 이름(커밋 해시)이 함께 바뀐다
