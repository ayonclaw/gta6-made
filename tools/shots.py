#!/usr/bin/env python3
"""Shoot the entry's four screenshots from the current build.

Serves game/ on a loopback port, drives Chromium over the deterministic staging
the game exposes (?shot=<scene>&seed=1) at reduced quality (?quality=low), and
writes screenshots/<name>.jpg at 1280x720. A shot that lands above 256 KiB is
re-taken at a lower JPEG quality rather than being shipped over the cap.

    python3 tools/shots.py
    python3 tools/shots.py --port 8322 --wait 6000
"""

import argparse
import functools
import http.server
import pathlib
import socketserver
import threading

from PIL import Image
from playwright.sync_api import sync_playwright

ROOT = pathlib.Path(__file__).resolve().parent.parent
GAME = ROOT / "game"
SHOTS = ROOT / "screenshots"
CHROME = "/home/ubuntu/.cache/ms-playwright/chromium-1234/chrome-linux/chrome"

ARGS = [
    "--use-gl=angle",
    "--use-angle=swiftshader",
    "--enable-unsafe-swiftshader",
    "--no-sandbox",
    "--disable-dev-shm-usage",
    "--ignore-gpu-blocklist",
]

# The first file by name is the cover: the junction, because it carries the most.
SCENES = [
    ("1-street.jpg", "street"),
    ("2-vista.jpg", "vista"),
    ("3-chase.jpg", "chase"),
    ("4-mission.jpg", "mission"),
]

MAX_BYTES = 256 * 1024
LONG_SIDE = 1280
SHORT_SIDE = 480


class Quiet(http.server.SimpleHTTPRequestHandler):
    def log_message(self, fmt, *args):
        pass


class Server(socketserver.TCPServer):
    allow_reuse_address = True


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--port", type=int, default=8333)
    parser.add_argument("--wait", type=int, default=5500, help="ms for traffic and crowds to settle")
    args = parser.parse_args()

    SHOTS.mkdir(exist_ok=True)
    handler = functools.partial(Quiet, directory=str(GAME))
    httpd = Server(("127.0.0.1", args.port), handler)
    threading.Thread(target=httpd.serve_forever, daemon=True).start()
    base = f"http://127.0.0.1:{args.port}/index.html"

    problems = []
    with sync_playwright() as playwright:
        browser = playwright.chromium.launch(executable_path=CHROME, args=ARGS)
        page = browser.new_page(viewport={"width": 1280, "height": 720}, device_scale_factor=1)
        page.set_default_timeout(120000)
        page.on("pageerror", lambda error: problems.append(f"pageerror: {error}"))
        page.on(
            "console",
            lambda message: problems.append(f"console: {message.text}") if message.type == "error" else None,
        )

        for name, scene in SCENES:
            quality = 88
            target = SHOTS / name
            while True:
                page.goto(f"{base}?shot={scene}&seed=1&quality=low", wait_until="domcontentloaded")
                page.wait_for_function("window.__salmora && window.__salmora.frames > 4", timeout=120000)
                page.wait_for_timeout(args.wait)
                state = page.evaluate(
                    "() => ({frames: window.__salmora.frames, staged: window.__salmora.staged,"
                    " wanted: window.__salmora.wanted, cash: window.__salmora.cash})"
                )
                page.screenshot(path=str(target), type="jpeg", quality=quality)
                size = target.stat().st_size
                if size <= MAX_BYTES or quality <= 60:
                    break
                quality -= 8
            with Image.open(target) as image:
                width, height = image.size
            long_side, short_side = max(width, height), min(width, height)
            ok = (
                size <= MAX_BYTES
                and long_side <= LONG_SIDE
                and short_side >= SHORT_SIDE
            )
            print(
                f"{name}  {scene:8s} {width}x{height}  {size / 1024:6.1f} KiB  q={quality}  "
                f"frames={state['frames']} wanted={state['wanted']} cash={state['cash']}  "
                f"{'ok' if ok else 'FAIL'}"
            )
            if not ok:
                problems.append(f"{name} outside the screenshot limits")

        browser.close()
    httpd.shutdown()

    if problems:
        for problem in problems:
            print("  !", problem)
        return 1
    print("four screenshots written, no console errors")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
