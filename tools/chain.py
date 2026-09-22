#!/usr/bin/env python3
"""chain.py — jsonl → 기록 체인 한 줄 · 수용 테스트 ⚙ 자동 확인 (SPEC §10 · §11 · §15 · §17)

사용  python3 tools/chain.py P07_2026-09-30.jsonl [--events] [--pilot]
      --pilot  자가 파일럿(09.26) 교정 수치 — 상수표 ☐ · 두 잠금식 비교(D14) · 발견 여부 (docs/acceptance/pilot-calibration.md의 입력)

출력
  1. 헤더 요약        pid · date · build · 슬롯 배열 셋 · lock_rule · cuts
  2. 기록 체인 한 줄  (재료,격자,생성) 상태가 바뀔 때마다 + 캔버스 전환 + 구간 경계, 시각 m'ss"
  3. 집계             타입별 건수 · note.add를 src별 · touch.down의 acted/blocked · 마킹 목록
  4. ⚙ 검사           seq 단조 · t 비감소 · 헤더 필수 필드 · mark ↔ snapshot · note.add count 일치 · 구간 순서
종료 코드  0 = 검사 전부 통과 · 1 = 실패 있음 · 2 = 입력 오류

2단계 — 체류/idle 재계산(§10-5) · note.edit prev · scope.set 값 · N2(pointers≥2 · axis 끌기) · session.resume.
3단계 — play.start/stop 짝 · heard[][] · matches_scope · mat.peek ≠ mat.adopt · 채택이 state.mat을 바꿈 · image.place 필드 · canvas.new/discard/switch/evict · 산출 밀도 state × src(§10-2).
4단계 — lock.apply 재계산(p · p_norm · candidates · axis · value · alt) · done.appear/cap 시각 · 구간 순서 1→2→(3) · gen.set/rule.param · 규칙·난수 열 · 적기(음절 수 = count · abort ≤ 3자 · place target) · 이미지 손잡이 · mic.span · 잠금 뒤 slot.gone 접촉.
의존  표준 라이브러리만
"""
from __future__ import annotations

import json
import sys
from collections import Counter, defaultdict

MAT = {"blank": "빈면", "sound": "소리", "image": "이미지"}
GEN = {"hand": "손", "rule": "규칙", "random": "난수"}

HEADER_REQUIRED = [
    "pid", "date", "build", "device", "os", "standalone", "viewport", "scale", "letterbox",
    "vel_source", "tone_source", "seed", "slots_bottom", "slots_drawer", "slots_panel",
    "loop_ms", "grid_div", "tau_ms", "len_default_ms", "step_default_ms", "spread_default",
    "mic_threshold", "mic_input", "lock_rule", "cuts", "guided_access", "silent_mode_off", "wall",
]


def mmss(t_ms: int) -> str:
    s = int(t_ms // 1000)
    return f"{s // 60}'{s % 60:02d}\""


def state_label(st: dict) -> str:
    return f"({MAT.get(st.get('mat'), st.get('mat'))},{'ON' if st.get('grid') else 'OFF'},{GEN.get(st.get('gen'), st.get('gen'))})"


def load(path: str) -> tuple[dict | None, list[dict], list[str]]:
    header = None
    events: list[dict] = []
    problems: list[str] = []
    with open(path, encoding="utf-8") as f:
        for i, raw in enumerate(f, 1):
            raw = raw.strip()
            if not raw:
                continue
            try:
                line = json.loads(raw)
            except json.JSONDecodeError as e:
                problems.append(f"L{i}: JSON 오류 — {e}")
                continue
            if line.get("type") == "session.header":
                if header is not None:
                    problems.append(f"L{i}: 헤더가 둘")
                header = line
            else:
                events.append(line)
    if header is None:
        problems.append("헤더 없음 (첫 줄이 session.header여야 한다)")
    events.sort(key=lambda e: e.get("seq", -1))
    return header, events, problems


def chain(header: dict | None, events: list[dict]) -> str:
    pid = header.get("pid", "?") if header else "?"
    parts: list[str] = []
    prev_state: str | None = None
    prev_canvas = None
    for e in events:
        t = e.get("t", 0)
        typ = e.get("type", "")
        if typ == "seg.start":
            parts.append(f"[구간 {e.get('seg')} 시작 {mmss(t)}]")
        elif typ == "seg.end":
            parts.append(f"[구간 {e.get('seg')} 끝 {mmss(t)} by:{e.get('by')}]")
        elif typ == "mark":
            parts.append(f"★{mmss(t)}")
        elif typ == "done":
            parts.append(f"[여기까지 {mmss(t)} by:{e.get('by')}]")
        elif typ in ("canvas.new", "canvas.discard", "canvas.switch"):
            parts.append(f"[{typ.split('.')[1]} {e.get('from')}→{e.get('to')} {mmss(t)}]")
        st = e.get("state")
        if isinstance(st, dict):
            lab = state_label(st)
            cv = e.get("canvas")
            if lab != prev_state or cv != prev_canvas:
                parts.append(f"{lab}#{cv} {mmss(t)}")
                prev_state, prev_canvas = lab, cv
    last_t = events[-1].get("t", 0) if events else 0
    return f"{pid}  " + " → ".join(parts) + f" → 끝 {mmss(last_t)}"


def checks(header: dict | None, events: list[dict]) -> list[tuple[bool, str]]:
    out: list[tuple[bool, str]] = []
    # 헤더 필드
    if header is not None:
        missing = [k for k in HEADER_REQUIRED if k not in header]
        out.append((not missing, f"헤더 필수 필드 — 누락 {missing}" if missing else "헤더 필수 필드 전부 있음"))
        out.append((isinstance(header.get("build"), str) and header["build"].startswith("probe-"), f"build = {header.get('build')}"))
        out.append((len(header.get("slots_bottom", [])) == 6 and len(header.get("slots_drawer", [])) == 3 and len(header.get("slots_panel", [])) == 5,
                    "슬롯 배열 셋 길이 6 · 3 · 5"))
    # seq 단조 · t 비감소
    seqs = [e.get("seq") for e in events]
    mono = all(isinstance(s, int) for s in seqs) and all(b == a + 1 for a, b in zip(seqs, seqs[1:])) and (not seqs or seqs[0] == 0)
    out.append((mono, f"seq 0부터 단조 증가 (n={len(seqs)})"))
    ts = [e.get("t", 0) for e in events]
    out.append((all(b >= a for a, b in zip(ts, ts[1:])), "t 비감소"))
    # 봉투 필드
    env_ok = all(all(k in e for k in ("t", "seq", "type", "seg", "canvas", "state", "target_mat")) for e in events)
    out.append((env_ok, "모든 이벤트에 봉투 7필드"))
    # 플래시
    flashes = [e for e in events if e.get("type") == "session.flash"]
    out.append((len(flashes) == 1 and flashes[0].get("t", 99) <= 50 and "wall" in flashes[0],
                f"session.flash 1건 · t≤50 · wall 있음 (t={flashes[0].get('t') if flashes else '—'})"))
    # mark ↔ snapshot
    snap_ids = {e.get("id") for e in events if e.get("type") == "snapshot"}
    marks = [e for e in events if e.get("type") == "mark"]
    ok = all(m.get("snapshot") in snap_ids for m in marks) and all(
        any(s.get("id") == m.get("snapshot") and s.get("reason") == "mark" for s in events if s.get("type") == "snapshot") for m in marks)
    out.append((ok, f"mark {len(marks)}건마다 snapshot reason:mark 대응"))
    # note.add 일치
    adds = [e for e in events if e.get("type") == "note.add"]
    ok = all(len(a.get("ids", [])) == a.get("count") == len(a.get("vals", [])) for a in adds)
    out.append((ok, f"note.add {len(adds)}건 ids · count · vals 일치"))
    ok = all(all(k in v for k in ("on", "pitch", "len", "vel", "tone")) for a in adds for v in a.get("vals", []))
    out.append((ok, "vals 원소에 on · pitch · len · vel · tone"))
    # 구간 순서
    seg_starts = [e.get("seg") for e in events if e.get("type") == "seg.start"]
    out.append((seg_starts == sorted(seg_starts), f"seg.start 순서 {seg_starts}"))
    # seg 0 접촉은 노트를 남기지 않는다
    seg0_notes = [a for a in adds if a.get("seg") == 0]
    out.append((not seg0_notes, "튜토리얼(seg 0) 접촉이 노트를 남기지 않음"))
    # 2단계 — note.edit prev · scope.set 값 · N2 · grid by · idle
    edits = [e for e in events if e.get("type") == "note.edit"]
    ok = all(len(e.get("ids", [])) == e.get("count") == len(e.get("prev", [])) == len(e.get("vals", [])) and e.get("field") in ("pos", "len") for e in edits)
    out.append((ok, f"note.edit {len(edits)}건 prev · vals · count 일치, field ∈ pos·len"))
    ok = all(any(p != v for p, v in zip(e.get("prev", []), e.get("vals", []))) for e in edits)
    out.append((ok, "note.edit마다 prev ≠ vals (움직이지 않은 끌기는 남기지 않음)"))
    scopes = [e for e in events if e.get("type") == "scope.set"]
    ok = all(e.get("scope") in ("one", "many", "all", None) and (e.get("scope") is None) == (e.get("count") == 0) for e in scopes)
    out.append((ok, f"scope.set {len(scopes)}건 값 ∈ one·many·all·null, count 0 ↔ null"))
    downs = [e for e in events if e.get("type") == "touch.down"]
    multi = [d for d in downs if (d.get("pointers") or 1) >= 2]
    out.append((all(not d.get("acted") for d in multi), f"두 번째 이후 포인터 acted:false ({len(multi)}건)"))
    ups = [e for e in events if e.get("type") == "touch.up"]
    axis_drag = [u for u in ups if u.get("target") == "axis" and (u.get("path_len") or 0) >= 8]
    out.append((all(not u.get("acted") for u in axis_drag), f"axis 끌기 acted:false ({len(axis_drag)}건)"))
    none_t = [d for d in downs if d.get("target") == "none" or str(d.get("target", "")).startswith("slot.gone")]
    out.append((all(not d.get("acted") for d in none_t), f"none · slot.gone acted:false ({len(none_t)}건)"))
    grids = [e for e in events if e.get("type") in ("grid.on", "grid.off")]
    ok = all(e.get("by") in ("user", "lock") and (e.get("state") or {}).get("grid") == (e.get("type") == "grid.on") for e in grids)
    out.append((ok, f"grid.on/off {len(grids)}건 by 있음 · 봉투 state.grid가 전이 후 값"))
    idles = [e for e in events if e.get("type") == "idle"]
    tau = int(header.get("tau_ms", 10000)) if header else 10000
    out.append((all((e.get("dur") or 0) > tau for e in idles), f"idle {len(idles)}건 dur > τ({tau})"))
    _, t_active, idle_calc = dwell_from_log(header, events)
    out.append((len(idle_calc) == len([e for e in idles if e.get("seg") == 1]), f"idle 재계산 {len(idle_calc)}건 = 로그의 seg 1 idle {len([e for e in idles if e.get('seg') == 1])}건"))
    # 3단계 — 재생 · 재료 · 캔버스
    starts = [e for e in events if e.get("type") == "play.start"]
    stops = [e for e in events if e.get("type") == "play.stop"]
    paired = True
    open_ = 0
    for e in events:
        if e.get("type") == "play.start":
            paired &= open_ == 0
            open_ += 1
        elif e.get("type") == "play.stop":
            paired &= open_ == 1
            open_ -= 1
    out.append((paired and len(starts) == len(stops), f"play.start {len(starts)} ↔ play.stop {len(stops)} 짝"))
    ok = all(isinstance(e.get("heard"), list) and all(isinstance(h, list) and len(h) == 2 and h[0] <= h[1] for h in e.get("heard")) and e.get("matches_scope") in (True, False, None) for e in stops)
    out.append((ok, "play.stop에 heard[][] · matches_scope ∈ true·false·null"))
    loop_ms = int(header.get("loop_ms", 8000)) if header else 8000
    ok = all(all(0 <= h[0] <= loop_ms and 0 <= h[1] <= loop_ms for h in e.get("heard", [])) for e in stops)
    out.append((ok, "heard 구간이 [0, L] 안"))
    seeks = [e for e in events if e.get("type") == "play.seek"]
    out.append((all(0 <= (e.get("at") or 0) <= loop_ms for e in seeks), f"play.seek {len(seeks)}건 at ∈ [0, L]"))
    peeks = [e for e in events if e.get("type") == "mat.peek"]
    adopts = [e for e in events if e.get("type") == "mat.adopt"]
    out.append((all(e.get("mat") in ("sound", "image") for e in peeks + adopts), f"mat.peek {len(peeks)} · mat.adopt {len(adopts)} mat ∈ sound·image"))
    ok = all((e.get("state") or {}).get("mat") == e.get("mat") for e in adopts)
    out.append((ok, "mat.adopt 뒤 봉투 state.mat = 채택한 재료"))
    # 같은 캔버스에서 상태가 바뀌지 않았는데 adopt가 다시 남지 않는다
    last_mat: dict = {}
    dup = 0
    for e in events:
        if e.get("type") in ("canvas.new", "canvas.discard"):
            last_mat[e.get("to")] = "blank"
        if e.get("type") == "mat.adopt":
            if last_mat.get(e.get("canvas"), "blank") == e.get("mat"):
                dup += 1
            last_mat[e.get("canvas")] = e.get("mat")
    out.append((dup == 0, f"mat.adopt는 상태가 바뀔 때만 ({dup}건 중복)"))
    mat_adds = [a for a in adds if a.get("src") == "material"]
    out.append((all(a.get("target_mat") == "sound" for a in mat_adds), f"src:material note.add {len(mat_adds)}건 target_mat sound"))
    places = [e for e in events if e.get("type") == "image.place"]
    ok = all(all(k in e for k in ("id", "img", "x", "y", "w", "h")) and abs(e["w"] / e["h"] - 1.5) < 0.01 for e in places)
    out.append((ok, f"image.place {len(places)}건 id·img·x·y·w·h · 3:2"))
    touches = [e for e in events if e.get("type") == "image.touch"]
    out.append((all(0 <= e.get("u", -1) <= 1 and 0 <= e.get("v", -1) <= 1 for e in touches), f"image.touch {len(touches)}건 u,v ∈ [0,1]"))
    cvs = [e for e in events if e.get("type") in ("canvas.new", "canvas.discard", "canvas.switch")]
    out.append((all(e.get("from") != e.get("to") and "reason" in e for e in cvs), f"canvas.* {len(cvs)}건 from ≠ to · reason"))
    # 캔버스 전환 직전에 떠나는 캔버스의 snapshot
    ok = True
    for i, e in enumerate(events):
        if e.get("type") in ("canvas.new", "canvas.discard", "canvas.switch"):
            prev = events[i - 1] if i > 0 else {}
            ok &= prev.get("type") == "snapshot" and prev.get("canvas") == e.get("from")
    out.append((ok, "canvas.new/discard/switch 직전에 떠나는 캔버스의 snapshot"))
    ok = all(a.get("seg") != 1 or (a.get("state") or {}).get("mat") in ("blank", "sound", "image") for a in adds)
    out.append((ok, "산출 밀도 — state × src 로 나눌 수 있음 (state.mat 값 유효)"))

    # 4단계 — 구간 · done · 잠금
    starts_seg = [e for e in events if e.get("type") == "seg.start"]
    ends_seg = [e for e in events if e.get("type") == "seg.end"]
    seq_ok = [e.get("seg") for e in starts_seg] in ([], [1], [1, 2]) and all(x.get("by") in ("facilitator", "timer", "user") for x in starts_seg + ends_seg)
    out.append((seq_ok, f"seg.start {[e.get('seg') for e in starts_seg]} · seg.end {[(e.get('seg'), e.get('by')) for e in ends_seg]} · by 유효"))
    s1 = next((e for e in starts_seg if e.get("seg") == 1), None)
    appear = next((e for e in events if e.get("type") == "done.appear"), None)
    done = next((e for e in events if e.get("type") == "done"), None)
    appear_ms = int(header.get("dev_fast") and 8000 or 480000) if header else 480000
    cap_ms = int(header.get("dev_fast") and 15000 or 900000) if header else 900000
    if s1 and appear:
        d = appear.get("t", 0) - s1.get("t", 0)
        out.append((abs(d - appear_ms) <= 50, f"done.appear = seg1 + {appear_ms} ± 50 (실측 +{d})"))
    if s1 and done:
        ok = done.get("by") in ("user", "cap") and (done.get("by") != "cap" or abs(done.get("t", 0) - s1.get("t", 0) - cap_ms) <= 50)
        sa = done.get("since_appear")
        ok &= (appear is None and sa is None) or (appear is not None and sa is not None and abs(sa - (done.get("t", 0) - appear.get("t", 0))) <= 2)
        out.append((ok, f"done by:{done.get('by')} · since_appear {sa} 일치"))
        # done → seg.end 1 → lock.apply → snapshot(seg) → canvas.new(lock) → seg.start 2
        i = events.index(done)
        # 잠금이 일으킨 전이(gen.set · grid.on/off by:lock)는 lock.apply 뒤에 올 수 있다
        follow = [e.get("type") for e in events[i : i + 9] if not ((e.get("type") in ("gen.set", "grid.on", "grid.off") and e.get("by") == "lock") or e.get("type") == "idle")][:6]
        expected = ["done", "seg.end", "lock.apply", "snapshot", "canvas.new", "seg.start"]
        out.append((follow == expected, f"done 뒤 순서 {follow}"))
        by_lock = [e for e in events[i : i + 8] if e.get("by") == "lock"]
        out.append((all(events.index(e) > events.index(lock_line) for e in by_lock) if (lock_line := next((x for x in events if x.get("type") == "lock.apply"), None)) else True, f"by:lock 전이 {len(by_lock)}건이 lock.apply 뒤"))
    lock = next((e for e in events if e.get("type") == "lock.apply"), None)
    if lock:
        rc = lock_recompute(lock, transitions_seg1(events))
        rule = lock.get("rule")
        main = rc["v03"] if rule == "v0.3" else rc["v02"]
        alt = rc["v02"] if rule == "v0.3" else rc["v03"]
        ok_p = all(abs(lock.get("p", {}).get(a, -1) - rc["p"][a]) < 1e-3 and abs(lock.get("p_norm", {}).get(a, -1) - rc["p_norm"][a]) < 1e-3 for a in ("mat", "grid", "gen"))
        out.append((ok_p, f"lock.apply p · p_norm 재계산 일치 {rc['p']} {rc['p_norm']}"))
        out.append((sorted(lock.get("candidates", [])) == sorted(rc["candidates"]), f"candidates 재계산 {rc['candidates']} (로그 {lock.get('candidates')})"))
        out.append(((lock.get("axis"), lock.get("value")) == main, f"잠금 {rule} → {main} (로그 {lock.get('axis')}={lock.get('value')})"))
        a = lock.get("alt") or {}
        out.append(((a.get("axis"), a.get("value")) == alt, f"alt → {alt} (로그 {a.get('axis')}={a.get('value')})"))
        # 잠긴 뒤 그 슬롯 접촉은 slot.gone reason:lock
        gone_touch = [e for e in events if e.get("type") == "touch.down" and str(e.get("target", "")).startswith("slot.gone")]
        out.append((all(not e.get("acted") and e.get("reason") == "lock" for e in gone_touch), f"slot.gone 접촉 {len(gone_touch)}건 acted:false reason:lock"))
    # gen · rule.param · 열
    gens = [e for e in events if e.get("type") == "gen.set"]
    out.append((all(e.get("gen") in ("hand", "rule", "random") and e.get("by") in ("user", "lock") and (e.get("state") or {}).get("gen") == e.get("gen") for e in gens), f"gen.set {len(gens)}건 값·by·봉투 일치"))
    params = [e for e in events if e.get("type") == "rule.param"]
    lo, hi = (int(header.get("loop_ms", 8000)) // 32, int(header.get("loop_ms", 8000)) // 4) if header else (250, 2000)
    out.append((all((e.get("name") == "step" and lo <= e.get("value", -1) <= hi) or (e.get("name") == "spread" and 0 <= e.get("value", -1) <= 1) for e in params), f"rule.param {len(params)}건 범위"))
    cols = [a for a in adds if a.get("src") in ("rule", "random")]
    out.append((all(a.get("count") >= 1 and len(a.get("vals", [])) == a.get("count") and "step" in a for a in cols), f"규칙·난수 열 {len(cols)}건 한 건씩 · step 기록"))
    ok = True
    for a in cols:
        if a.get("src") != "rule":
            continue
        ons = [v["on"] for v in a.get("vals", [])]
        ok &= all(abs((b - x) - a.get("step")) <= 1 for x, b in zip(ons, ons[1:]))
    out.append((ok, "규칙 열 간격 = step"))
    # 적기
    commits = [e for e in events if e.get("type") == "text.commit"]
    aborts = [e for e in events if e.get("type") == "text.abort"]
    out.append((all(e.get("chars", 0) > 3 for e in commits) and all(e.get("chars", 99) <= 3 or not e.get("raw") for e in aborts), f"text.commit {len(commits)} (chars>3) · text.abort {len(aborts)} (≤3자 또는 취소)"))
    places = [e for e in events if e.get("type") == "text.place"]
    ok = True
    for pl in places:
        if pl.get("target") == "surface":
            ok &= len(pl.get("ids", [])) + (pl.get("truncated") or 0) == syllables(pl.get("raw", ""))
        else:
            ok &= pl.get("target") == "axis" and not pl.get("ids")
    out.append((ok, f"text.place {len(places)}건 — 면: 음절 수 = ids + truncated · 띠: 노트 없음"))
    absents = [e for e in events if e.get("type") == "image.absent"]
    out.append((all("raw" in e and "chars" in e for e in absents), f"image.absent {len(absents)}건 raw · chars"))
    # 이미지 손잡이
    imgops = [e for e in events if e.get("type") in ("image.move", "image.size", "image.remove")]
    out.append((all(all(k in e for k in ("id", "img", "x", "y", "w", "h")) and abs(e["w"] / e["h"] - 1.5) < 0.02 for e in imgops), f"image.move/size/remove {len(imgops)}건 필드 · 3:2"))
    sizes = [e for e in imgops if e.get("type") == "image.size"]
    out.append((all(180 <= e.get("w", 0) <= 1206 for e in sizes), f"image.size {len(sizes)}건 [180, 1206]"))
    # 마이크
    spans = [e for e in events if e.get("type") == "mic.span"]
    out.append((all(e.get("from", 1) <= e.get("to", 0) and e.get("n", -1) >= 0 and e.get("gated_ms", -1) >= 0 for e in spans), f"mic.span {len(spans)}건 from ≤ to · n · gated_ms"))
    mic_notes = [a for a in adds if a.get("src") == "mic"]
    out.append((all(0 <= a["vals"][0].get("vel", -1) <= 1 for a in mic_notes if a.get("vals")), f"src:mic {len(mic_notes)}건 vel ∈ [0,1]"))
    # 회고 모드 접촉
    seg3 = [e for e in events if e.get("type") == "touch.down" and e.get("seg") == 3]
    out.append((all(not e.get("acted") for e in seg3), f"회고(seg 3) 접촉 {len(seg3)}건 acted:false"))
    return out


def dwell_from_log(header: dict | None, events: list[dict]) -> tuple[dict, int, list[int]]:
    """§10-5 체류 재계산 — 활동(터치) 사이 Δ ≤ τ를 그때의 state에 더한다. 구간 1만. 반환 (dwell, T_active, idle 목록)"""
    tau = int(header.get("tau_ms", 10000)) if header else 10000
    dwell = {"mat": defaultdict(int), "grid": defaultdict(int), "gen": defaultdict(int)}
    last_t = None
    last_state = None
    last_seg = None
    idles: list[int] = []
    for e in events:
        typ = e.get("type", "")
        st = e.get("state")
        if typ == "seg.start":
            last_t = e.get("t", 0)  # 구간 시작이 기준점
        if typ.startswith("touch.") or typ == "seg.end":
            t = e.get("t", 0)
            if last_t is not None and last_state is not None and last_seg == 1:
                gap = t - last_t
                if gap <= tau:
                    dwell["mat"][last_state.get("mat")] += gap
                    dwell["grid"]["on" if last_state.get("grid") else "off"] += gap
                    dwell["gen"][last_state.get("gen")] += gap
                else:
                    idles.append(gap)
            last_t = t
        if isinstance(st, dict):
            last_state = st
            last_seg = e.get("seg")
    t_active = sum(dwell["mat"].values())
    return {k: dict(v) for k, v in dwell.items()}, t_active, idles


HANGUL = range(0xAC00, 0xD7A4)


def syllables(raw: str) -> int:
    """T12 음절 규칙 — 한글 음절 1 · 로마자 모음 묶음 1(모음 없으면 1) · 숫자 자릿수 1. 공백·문장부호는 쉼(노트 없음)"""
    import re
    n = 0
    i = 0
    while i < len(raw):
        ch = raw[i]
        if ord(ch) in HANGUL or ch.isdigit():
            n += 1
            i += 1
        elif ch.isascii() and ch.isalpha():
            j = i
            while j < len(raw) and raw[j].isascii() and raw[j].isalpha():
                j += 1
            groups = len(re.findall(r"[aeiouyAEIOUY]+", raw[i:j]))
            n += max(1, groups)
            i = j
        elif ch.isspace() or not ch.isalnum():
            i += 1
        else:
            n += 1
            i += 1
    return n


def transitions_seg1(events: list[dict]) -> dict:
    """구간 1의 축별 전이 수 — used 판정용 (§11-1)"""
    tr = {"mat": 0, "grid": 0, "gen": 0}
    last = None
    for e in events:
        st = e.get("state")
        if not isinstance(st, dict):
            continue
        if e.get("seg") == 1 and last is not None:
            for k in tr:
                if last.get(k) != st.get(k):
                    tr[k] += 1
        last = st
    return tr


def lock_recompute(lock: dict, tr: dict) -> dict:
    """lock.apply의 dwell·T_active에서 §11-1을 다시 계산"""
    K = {"mat": 3, "grid": 2, "gen": 3}
    PRI = {"gen": 0, "mat": 1, "grid": 2}
    dwell = lock.get("dwell", {})
    T = lock.get("T_active") or 0
    p, pn = {}, {}
    for a in ("mat", "grid", "gen"):
        top = max(dwell.get(a, {}).values(), default=0)
        p[a] = round(top / T, 4) if T else round(1 / K[a], 4)
        pn[a] = round((p[a] - 1 / K[a]) / (1 - 1 / K[a]), 4)
    used = [a for a in ("mat", "grid", "gen") if tr.get(a, 0) >= 1]
    cands = used or ["mat", "grid", "gen"]
    pick = lambda score, among: sorted(among, key=lambda a: (-score[a], PRI[a]))[0]
    a03 = pick(pn, cands)
    v03 = max(dwell.get(a03, {}).items(), key=lambda kv: kv[1], default=("", 0))[0]
    a02 = pick(p, ["mat", "grid", "gen"])
    v02 = max(dwell.get(a02, {}).items(), key=lambda kv: kv[1], default=("", 0))[0]
    return {"p": p, "p_norm": pn, "candidates": cands, "v03": (a03, v03), "v02": (a02, v02)}


def density(header: dict | None, events: list[dict]) -> dict:
    """산출 밀도 — density[state][src] = Σ note.add.count ÷ dwell[state] (구간 1). state = (mat,grid,gen)"""
    tau = int(header.get("tau_ms", 10000)) if header else 10000
    dwell_state: dict = defaultdict(int)
    counts: dict = defaultdict(lambda: defaultdict(int))
    last_t = None
    last_key = None
    for e in events:
        typ = e.get("type", "")
        st = e.get("state") or {}
        key = f"({MAT.get(st.get('mat'), st.get('mat'))},{'ON' if st.get('grid') else 'OFF'},{GEN.get(st.get('gen'), st.get('gen'))})"
        if typ == "seg.start":
            last_t = e.get("t", 0)
        if typ == "note.add" and e.get("seg") == 1:
            counts[key][e.get("src")] += int(e.get("count") or 0)
        if typ.startswith("touch."):
            t = e.get("t", 0)
            if last_t is not None and last_key is not None and e.get("seg") == 1 and t - last_t <= tau:
                dwell_state[last_key] += t - last_t
            last_t = t
        last_key = key
    out = {}
    for key, per_src in counts.items():
        d = dwell_state.get(key, 0)
        out[key] = {src: (round(n / (d / 60000), 2) if d else None) for src, n in per_src.items()}  # 분당
    return out


# ── 슬롯 기하 (SPEC §3-2 · §3-3) — 오접촉 근접 판정용
SLOT = 100
BOTTOM_LEFT_X = [40, 164, 288, 412, 536, 660]
BOTTOM_RIGHT_X = [854, 978, 1102, 1226]
DRAWER_Y = [32, 168, 304]


def slot_rects(header: dict | None) -> list[tuple[str, int, int]]:
    if not header:
        return []
    out = []
    for name, x in zip(list(header.get("slots_bottom", [])) + ["mark", "canvas.keep", "canvas.discard", "done"], BOTTOM_LEFT_X + BOTTOM_RIGHT_X):
        out.append((name, x, 904))
    for name, y in zip(header.get("slots_drawer", []), DRAWER_Y):
        out.append((f"mat.{name}", 30, y))
    return out


def pilot(header: dict | None, events: list[dict]) -> str:
    """자가 파일럿 교정 수치 — 판정은 하지 않는다. 사람이 pilot-calibration.md에 옮겨 적는다"""
    L: list[str] = []
    tau = int(header.get("tau_ms", 10000)) if header else 10000
    len_default = int(header.get("len_default_ms", 250)) if header else 250
    s1 = next((e for e in events if e.get("type") == "seg.start" and e.get("seg") == 1), None)
    t1 = s1.get("t", 0) if s1 else 0
    seg1 = [e for e in events if e.get("seg") == 1]
    downs1 = [e for e in seg1 if e.get("type") == "touch.down"]

    # τ — 접촉 간격 분포 (구간 1)
    gaps = [b.get("t", 0) - a.get("t", 0) for a, b in zip(downs1, downs1[1:])]
    bins = {"≤2 s": 0, "2–5 s": 0, "5–10 s": 0, "10–20 s": 0, ">20 s": 0}
    for g in gaps:
        k = "≤2 s" if g <= 2000 else "2–5 s" if g <= 5000 else "5–10 s" if g <= 10000 else "10–20 s" if g <= 20000 else ">20 s"
        bins[k] += 1
    L.append(f"[τ {tau}] 구간 1 접촉 간격 분포 {bins} · τ 초과 {sum(1 for g in gaps if g > tau)}건 · 최대 {max(gaps) if gaps else 0} ms")
    if s1 and downs1:
        L.append(f"[첫 정지] seg.start 1 → 첫 touch.down {downs1[0].get('t', 0) - t1} ms")

    # SLOT · 간격 — 슬롯 옆 24 px 안에서 빗나간 접촉(target none)
    near = 0
    for e in events:
        if e.get("type") != "touch.down" or e.get("target") != "none":
            continue
        x, y = e.get("x", -999), e.get("y", -999)
        for _, sx, sy in slot_rects(header):
            if sx - 24 <= x <= sx + SLOT + 24 and sy - 24 <= y <= sy + SLOT + 24:
                near += 1
                break
    L.append(f"[SLOT 100 · 간격 24] 슬롯 24 px 이내 빗나간 접촉(none) {near}건 · 전체 none {sum(1 for e in events if e.get('type') == 'touch.down' and e.get('target') == 'none')}건")

    # LEN_DEFAULT — 탭 · 누르기 · 끌기 길이
    touch_adds = [a for a in events if a.get("type") == "note.add" and a.get("src") == "touch"]
    lens = [v.get("len", 0) for a in touch_adds for v in a.get("vals", [])]
    taps = sum(1 for l in lens if l == len_default)
    others = sorted(l for l in lens if l != len_default)
    L.append(f"[LEN_DEFAULT {len_default}] 손 노트 {len(lens)} — 탭 {taps} · 누르기/끌기 {len(others)} (중앙값 {others[len(others)//2] if others else '—'} ms)")

    # L · K — 루프 안 위치 분포 · 격자 사용
    ons = [v.get("on", 0) for a in events if a.get("type") == "note.add" for v in a.get("vals", [])]
    loop = int(header.get("loop_ms", 8000)) if header else 8000
    quarters = [sum(1 for o in ons if q * loop / 4 <= o < (q + 1) * loop / 4) for q in range(4)]
    grid_on_ms = dwell_from_log(header, events)[0]["grid"].get("on", 0)
    L.append(f"[L {loop} · K 48·16] 노트 on 4분위 분포 {quarters} · 격자 ON 체류 {grid_on_ms} ms · 격자 토글 {sum(1 for e in events if e.get('type') in ('grid.on', 'grid.off') and e.get('by') == 'user')}회")

    # STEP · SPREAD — 규칙·난수 첫 사용까지 · 슬라이더
    first_rule = next((e for e in events if e.get("type") == "gen.set" and e.get("gen") in ("rule", "random") and e.get("by") == "user"), None)
    first_col = next((a for a in events if a.get("type") == "note.add" and a.get("src") in ("rule", "random")), None)
    params = [(e.get("name"), e.get("value")) for e in events if e.get("type") == "rule.param"]
    L.append(f"[STEP · SPREAD] 규칙/난수 첫 선택 {(first_rule.get('t', 0) - t1) if first_rule else '—'} ms · 첫 열 {(first_col.get('t', 0) - t1) if first_col else '—'} ms · 슬라이더 조정 {params}")

    # MIC_THR — span · 게이트
    spans = [e for e in events if e.get("type") == "mic.span"]
    gates = sum(1 for e in events if e.get("type") == "mic.gate" and e.get("on"))
    mic_n = sum(a.get("count", 0) for a in events if a.get("type") == "note.add" and a.get("src") == "mic")
    L.append(f"[MIC_THR {header.get('mic_threshold') if header else '—'}] span {len(spans)} · mic 노트 {mic_n} · 게이트 닫힘 {gates}회 · gated_ms 합 {sum(e.get('gated_ms', 0) for e in spans)}")

    # D1 전환 기준 — 적기 시간
    commits = [e for e in events if e.get("type") in ("text.commit", "text.abort")]
    L.append(f"[D1 15 s · 절반] 적기 {len(commits)}회 — " + (" · ".join(f"{e.get('chars')}자 {e.get('dur')} ms" for e in commits) if commits else "없음"))

    # 발견 여부 — 시작점 탭 · 반복 청취 · 칩 놓기 · 지우기 · 이미지 손잡이 · 되돌아가기
    seeks = sum(1 for e in events if e.get("type") == "play.seek")
    stops = [e for e in events if e.get("type") == "play.stop"]
    repeats = 0
    prev_ranges: list = []
    for st in stops:
        for a, b in st.get("heard", []):
            for c, d in prev_ranges:
                inter = max(0, min(b, d) - max(a, c))
                if inter and inter / max(1, min(b - a, d - c)) >= 0.7:
                    repeats += 1
                    break
            prev_ranges.append((a, b))
    places = Counter(e.get("target") for e in events if e.get("type") == "text.place")
    L.append(
        f"[발견] 시작점 탭 {seeks} · 재생 {len(stops)}회(반복 청취 {repeats}) · 칩 놓기 면 {places.get('surface', 0)} 띠 {places.get('axis', 0)} · "
        f"노트 지우기 {sum(1 for e in events if e.get('type') == 'note.remove')} · 이미지 옮김/크기/제거 "
        f"{sum(1 for e in events if e.get('type') == 'image.move')}/{sum(1 for e in events if e.get('type') == 'image.size')}/{sum(1 for e in events if e.get('type') == 'image.remove')} · "
        f"캔버스 되돌아가기 {sum(1 for e in events if e.get('type') == 'canvas.switch')} · 마킹 {sum(1 for e in events if e.get('type') == 'mark')}"
    )
    # 버튼 넷 인지 — 첫 접촉
    first: dict = {}
    for e in events:
        if e.get("type") == "touch.down" and str(e.get("target", "")).startswith("slot:"):
            n = e["target"][5:]
            if n in ("mark", "canvas.keep", "canvas.discard", "done") and n not in first:
                first[n] = mmss(e.get("t", 0))
    L.append(f"[버튼 넷 첫 접촉] {first or '없음'}")

    # radiusX · force
    forces = {e.get("force") for e in events if e.get("type") == "touch.down"}
    sizes = {tuple(e.get("size", [])) for e in events if e.get("type") == "touch.down"}
    L.append(f"[radiusX · force] force 값 종류 {len(forces)} {sorted(f for f in forces if f is not None)[:5]} · size 값 종류 {len(sizes)} → 1이면 상수(⑭ 상수 유지)")

    # 두 잠금식 비교 (D14)
    lock = next((e for e in events if e.get("type") == "lock.apply"), None)
    if lock:
        main = (lock.get("axis"), lock.get("value"))
        alt = (lock.get("alt", {}).get("axis"), lock.get("alt", {}).get("value"))
        L.append(f"[D14] {lock.get('rule')} → {main} · 다른 식 → {alt} · {'같은 축·값' if main == alt else '★ 다르다'} · candidates {lock.get('candidates')} · p_norm {lock.get('p_norm')}")
    else:
        L.append("[D14] lock.apply 없음 (구간 1을 끝내지 않음)")
    return "\n".join(L)


def summary(events: list[dict]) -> str:
    by_type = Counter(e.get("type") for e in events)
    by_src = Counter(a.get("src") for a in events if a.get("type") == "note.add")
    downs = [e for e in events if e.get("type") == "touch.down"]
    acted = Counter((bool(d.get("acted")), bool(d.get("blocked"))) for d in downs)
    targets = Counter(d.get("target", "").split(":")[0] for d in downs)
    lines = ["타입별 건수:"]
    for k, n in sorted(by_type.items(), key=lambda kv: -kv[1]):
        lines.append(f"  {k:<18}{n}")
    lines.append(f"note.add src별: {dict(by_src)}")
    lines.append(f"touch.down: acted {acted.get((True, False), 0)} · 비작동 {acted.get((False, False), 0)} · 가려짐 {sum(n for (a, b), n in acted.items() if b)}")
    lines.append(f"touch.down target별: {dict(targets)}")
    marks = [e for e in events if e.get("type") == "mark"]
    if marks:
        lines.append("마킹: " + " · ".join(f"{mmss(m.get('t', 0))} {m.get('snapshot')} n_before={m.get('n_before')}" for m in marks))
    edits = [e for e in events if e.get("type") == "note.edit"]
    removes = [e for e in events if e.get("type") == "note.remove"]
    scopes = Counter(e.get("scope") for e in events if e.get("type") == "scope.set")
    lines.append(f"note.edit {len(edits)} (field {dict(Counter(e.get('field') for e in edits))}) · note.remove {len(removes)} · scope.set {dict(scopes)}")
    grids = [(mmss(e.get("t", 0)), e.get("type").split(".")[1], e.get("by")) for e in events if e.get("type") in ("grid.on", "grid.off")]
    if grids:
        lines.append("격자: " + " · ".join(f"{t} {v} by:{b}" for t, v, b in grids))
    idles = [e for e in events if e.get("type") == "idle"]
    if idles:
        lines.append("idle(로그): " + " · ".join(f"{mmss(e.get('t', 0) - e.get('dur', 0))}→{mmss(e.get('t', 0))} {e.get('dur')}ms" for e in idles))
    resumes = [e for e in events if e.get("type") == "session.resume"]
    if resumes:
        lines.append("session.resume: " + " · ".join(f"{mmss(e.get('t', 0))} gap {e.get('gap_ms')}ms" for e in resumes))
    stops = [e for e in events if e.get("type") == "play.stop"]
    if stops:
        lines.append("재생: " + " · ".join(f"{mmss(e.get('t', 0))} heard {e.get('heard')} scope={e.get('matches_scope')}" for e in stops))
    seeks = [e for e in events if e.get("type") == "play.seek"]
    if seeks:
        lines.append(f"play.seek {len(seeks)}건: " + " · ".join(str(e.get("at")) for e in seeks))
    peeks = Counter(e.get("mat") for e in events if e.get("type") == "mat.peek")
    adopts = [(mmss(e.get("t", 0)), e.get("mat"), e.get("canvas")) for e in events if e.get("type") == "mat.adopt"]
    if peeks or adopts:
        lines.append(f"mat.peek {dict(peeks)} · mat.adopt {adopts}")
    places = [e for e in events if e.get("type") == "image.place"]
    touches = [e for e in events if e.get("type") == "image.touch"]
    if places or touches:
        lines.append(f"image.place {len(places)} ({[p.get('img') for p in places]}) · image.touch {len(touches)}")
    lock = next((e for e in events if e.get("type") == "lock.apply"), None)
    if lock:
        lines.append(f"잠금 {lock.get('rule')}: {lock.get('axis')}={lock.get('value')} · candidates {lock.get('candidates')} · p_norm {lock.get('p_norm')} · alt {lock.get('alt')} · T_active {lock.get('T_active')}")
    done = next((e for e in events if e.get("type") == "done"), None)
    if done:
        lines.append(f"done by:{done.get('by')} {mmss(done.get('t', 0))} since_appear {done.get('since_appear')}")
    gens = [(mmss(e.get("t", 0)), e.get("gen"), e.get("by")) for e in events if e.get("type") == "gen.set"]
    if gens:
        lines.append("gen.set: " + " · ".join(f"{t} {g} by:{b}" for t, g, b in gens))
    texts = [(e.get("type"), e.get("raw"), e.get("target")) for e in events if e.get("type") in ("text.commit", "text.abort", "text.place", "image.absent")]
    if texts:
        lines.append("적기: " + " · ".join(f"{k} {r!r}{(' → ' + t) if t else ''}" for k, r, t in texts))
    cvs = [(e.get("type").split(".")[1], e.get("from"), e.get("to")) for e in events if e.get("type") in ("canvas.new", "canvas.discard", "canvas.switch")]
    evicts = [e.get("n") for e in events if e.get("type") == "canvas.evict"]
    if cvs:
        lines.append("캔버스: " + " · ".join(f"{k} {a}→{b}" for k, a, b in cvs) + (f" · evict {evicts}" if evicts else ""))
    return "\n".join(lines)


def main(argv: list[str]) -> int:
    if len(argv) < 2:
        print(__doc__, file=sys.stderr)
        return 2
    path = argv[1]
    show_events = "--events" in argv
    show_pilot = "--pilot" in argv
    header, events, problems = load(path)

    print("═" * 72)
    if header:
        print(f"pid {header.get('pid')} · {header.get('date')} · {header.get('build')} · {header.get('device')} {header.get('os')} · standalone={header.get('standalone')}")
        print(f"slots_bottom {header.get('slots_bottom')}")
        print(f"slots_drawer {header.get('slots_drawer')} · slots_panel {header.get('slots_panel')}")
        print(f"lock_rule {header.get('lock_rule')} · cuts {header.get('cuts')} · mic_input {header.get('mic_input')} · scale {header.get('scale')} letterbox {header.get('letterbox')}")
    print("─" * 72)
    print(chain(header, events))
    print("─" * 72)
    print(summary(events))
    dw, t_active, _ = dwell_from_log(header, events)
    print(f"체류(구간 1, 재계산): T_active {t_active}ms · mat {dw['mat']} · grid {dw['grid']} · gen {dw['gen']}")
    dens = density(header, events)
    if dens:
        print("산출 밀도(구간 1, 분당 note.add.count ÷ 체류): " + " · ".join(f"{k} {v}" for k, v in dens.items()))
    print("─" * 72)
    results = checks(header, events)
    for ok, msg in results:
        print(f"  {'✔' if ok else '✘'} {msg}")
    for p in problems:
        print(f"  ✘ {p}")
    failed = [m for ok, m in results if not ok] + problems
    print("═" * 72)
    print("⚙ 전부 통과" if not failed else f"⚙ 실패 {len(failed)}건")
    if show_pilot:
        print("─" * 72)
        print("파일럿 교정 수치 (판정 없음 — pilot-calibration.md에 옮긴다)")
        print(pilot(header, events))
    if show_events:
        for e in events:
            print(json.dumps(e, ensure_ascii=False))
    return 0 if not failed else 1


if __name__ == "__main__":
    raise SystemExit(main(sys.argv))
