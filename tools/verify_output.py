#!/usr/bin/env python3
"""Open the game from a staged output directory, not the source tree.

Serves <dir>/game on loopback, loads it in the same Chromium the capture uses,
waits for the first frames, and fails on any console error or page error. This is
the copy the judge receives.

    python3 tools/verify_output.py /tmp/stagec
    python3 tools/verify_output.py /output --seconds 12
"""

import argparse
import functools
import http.server
import pathlib
import socketserver
import sys
import threading

from playwright.sync_api import sync_playwright

CHROME = "/home/ubuntu/.cache/ms-playwright/chromium-1234/chrome-linux/chrome"
ARGS = [
    "--use-gl=angle",
    "--use-angle=swiftshader",
    "--enable-unsafe-swiftshader",
    "--no-sandbox",
    "--disable-dev-shm-usage",
    "--ignore-gpu-blocklist",
]


class Server(socketserver.TCPServer):
    allow_reuse_address = True


class Quiet(http.server.SimpleHTTPRequestHandler):
    def log_message(self, format, *args):
        pass


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("output", nargs="?", default="/output")
    parser.add_argument("--port", type=int, default=8341)
    parser.add_argument("--seconds", type=float, default=6.0)
    args = parser.parse_args()

    game = pathlib.Path(args.output).resolve() / "game"
    if not (game / "index.html").is_file():
        print(f"no game/index.html under {args.output}")
        return 1

    httpd = Server(("127.0.0.1", args.port), functools.partial(Quiet, directory=str(game)))
    threading.Thread(target=httpd.serve_forever, daemon=True).start()

    problems = []
    with sync_playwright() as playwright:
        browser = playwright.chromium.launch(executable_path=CHROME, args=ARGS)
        page = browser.new_page(viewport={"width": 1280, "height": 720})
        page.on("pageerror", lambda error: problems.append(f"pageerror: {error}"))
        page.on(
            "console",
            lambda message: problems.append(f"console: {message.text}") if message.type == "error" else None,
        )
        page.goto(f"http://127.0.0.1:{args.port}/index.html", wait_until="domcontentloaded")
        page.wait_for_function("window.__salmora && window.__salmora.frames > 2", timeout=120000)
        page.wait_for_timeout(int(args.seconds * 1000))
        state = page.evaluate(
            "() => ({frames: window.__salmora.frames, ready: window.__salmora.ready,"
            " colliders: window.__salmora.colliders, cash: window.__salmora.cash,"
            " district: window.__salmora.hud ? true : false})"
        )
        shot = pathlib.Path(args.output).resolve() / "game" / "index.html"
        print(f"served {shot} ({shot.stat().st_size} bytes)")
        print(f"frames {state['frames']}, colliders {state['colliders']}, cash {state['cash']}")
        page.screenshot(path="/tmp/shipped_copy.jpg", type="jpeg", quality=80)
        browser.close()
    httpd.shutdown()

    if problems:
        for problem in problems:
            print("  !", problem)
        return 1
    print("shipped copy loaded with no console errors")
    return 0


if __name__ == "__main__":
    sys.exit(main())
