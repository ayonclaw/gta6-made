#!/usr/bin/env python3
"""Load Salmora in the Playwright Chromium, report what the city is doing and
print any console noise. This is the smoke probe for stage B; the full
acceptance run lives beside it in verify_stage_b.py.

    python3 tools/smoke_stage_b.py [query]
"""

import functools
import http.server
import json
import pathlib
import socketserver
import sys
import threading

from playwright.sync_api import sync_playwright

ROOT = pathlib.Path(__file__).resolve().parent.parent
GAME = ROOT / "game"
CHROME = "/home/ubuntu/.cache/ms-playwright/chromium-1234/chrome-linux/chrome"
ARGS = [
    "--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader",
    "--no-sandbox", "--disable-dev-shm-usage", "--ignore-gpu-blocklist",
    "--disable-gpu-vsync", "--disable-frame-rate-limit",
]


class Quiet(http.server.SimpleHTTPRequestHandler):
    def log_message(self, format, *args):
        pass


class Server(socketserver.TCPServer):
    allow_reuse_address = True


def main():
    query = sys.argv[1] if len(sys.argv) > 1 else "?seed=1&quality=low"
    handler = functools.partial(Quiet, directory=str(GAME))
    httpd = Server(("127.0.0.1", 8474), handler)
    threading.Thread(target=httpd.serve_forever, daemon=True).start()

    logs = []
    with sync_playwright() as playwright:
        browser = playwright.chromium.launch(executable_path=CHROME, args=ARGS)
        page = browser.new_page(viewport={"width": 900, "height": 506}, device_scale_factor=1)
        page.on("pageerror", lambda error: logs.append(f"pageerror: {error}"))
        page.on("console", lambda message: logs.append(f"console.{message.type}: {message.text}"))
        page.goto(f"http://127.0.0.1:8474/index.html{query}", wait_until="load")
        page.wait_for_function("window.__salmora && window.__salmora.frames > 3", timeout=120000)
        start = page.evaluate("window.__salmora.frames")
        page.wait_for_timeout(4000)
        end = page.evaluate("window.__salmora.frames")
        report = page.evaluate("window.__salmora.report()")
        fps = (end - start) / 4.0
        probe = page.evaluate("""() => {
          const h = window.__salmora;
          return {
            here: h.player,
            cars: h.traffic.cars.filter(c => c.alive).map(c => [c.x, c.z, c.speed]),
            peds: h.crowd.people.slice(0, 4).map(p => [p.x, p.z, p.speed, p.state]),
            job: document.querySelector('#job') ? document.querySelector('#job').className : null,
            stars: document.querySelectorAll('#wanted .star.lit').length,
            cash: document.querySelector('.cash').textContent,
            ammo: document.querySelector('.weapon .value').textContent,
          };
        }""")
        browser.close()
    httpd.shutdown()

    print(json.dumps(report, indent=1))
    print("fps:", round(fps, 2))
    print("probe:", json.dumps(probe)[:900])
    print("logs:", logs[:20] if logs else "none")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
