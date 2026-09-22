#!/usr/bin/env python3
"""make_dummy_materials.py — SPEC §13 더미 이미지 5장 (1200 × 800 · 3:2 · 단색 + 번호만)

사용  python3 tools/make_dummy_materials.py
출력  materials/img/i1.png … i5.png   (실물도 같은 파일명·규격 — T11 09.25 저녁 교체)
의존  표준 라이브러리만 (zlib · struct)
"""
from __future__ import annotations

import struct
import zlib
from pathlib import Path

W, H = 1200, 800
COLORS = [(52, 58, 64), (73, 80, 87), (33, 37, 41), (66, 60, 55), (56, 66, 60)]  # 정서 중립 · 어두운 회색 계열
INK = (200, 200, 200)

# 5×7 비트맵 숫자
FONT = {
    "1": ["00100", "01100", "00100", "00100", "00100", "00100", "01110"],
    "2": ["01110", "10001", "00001", "00010", "00100", "01000", "11111"],
    "3": ["11110", "00001", "00001", "01110", "00001", "00001", "11110"],
    "4": ["00010", "00110", "01010", "10010", "11111", "00010", "00010"],
    "5": ["11111", "10000", "11110", "00001", "00001", "10001", "01110"],
}


def png(path: Path, rgb: bytes) -> None:
    raw = b"".join(b"\x00" + rgb[y * W * 3 : (y + 1) * W * 3] for y in range(H))

    def chunk(t: bytes, d: bytes) -> bytes:
        return struct.pack(">I", len(d)) + t + d + struct.pack(">I", zlib.crc32(t + d) & 0xFFFFFFFF)

    data = b"\x89PNG\r\n\x1a\n" + chunk(b"IHDR", struct.pack(">IIBBBBB", W, H, 8, 2, 0, 0, 0))
    data += chunk(b"IDAT", zlib.compress(raw, 9)) + chunk(b"IEND", b"")
    path.write_bytes(data)


def render(n: int, bg: tuple[int, int, int]) -> bytes:
    px = bytearray(bytes(bg) * (W * H))
    glyph = FONT[str(n)]
    cell = 60  # 5×7 → 300 × 420
    ox, oy = (W - 5 * cell) // 2, (H - 7 * cell) // 2
    for gy, row in enumerate(glyph):
        for gx, bit in enumerate(row):
            if bit != "1":
                continue
            for y in range(oy + gy * cell, oy + (gy + 1) * cell):
                start = (y * W + ox + gx * cell) * 3
                px[start : start + cell * 3] = bytes(INK) * cell
    return bytes(px)


def main() -> None:
    out = Path("materials/img")
    out.mkdir(parents=True, exist_ok=True)
    for i, bg in enumerate(COLORS, 1):
        png(out / f"i{i}.png", render(i, bg))
        print(f"materials/img/i{i}.png")


if __name__ == "__main__":
    main()
