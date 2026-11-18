#!/usr/bin/env python3
"""Stage B acceptance run: drive Salmora in the Playwright Chromium and check
the city is actually alive. Reports what it measured; prints PASS/FAIL.

    python3 tools/verify_stage_b.py

SwiftShader only commits a frame when it feels like it, so rAF is released
from vsync in the launch flags; without that the page runs at about 1 fps.
"""

import functools
import http.server
import json
import pathlib
import socketserver
import threading

from playwright.sync_api import sync_playwright

ROOT = pathlib.Path(__file__).resolve().parent.parent
GAME = ROOT / "game"
CHROME = "/home/ubuntu/.cache/ms-playwright/chromium-1234/chrome-linux/chrome"
ARGS = [
    "--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader",
    "--no-sandbox", "--disable-dev-shm-usage", "--ignore-gpu-blocklist",
]


class Quiet(http.server.SimpleHTTPRequestHandler):
    def log_message(self, format, *args):
        pass


class Server(socketserver.TCPServer):
    allow_reuse_address = True


def frames_later(page, count, timeout=240000):
    """Wait for the world to advance a given number of frames, whatever the fps."""
    page.evaluate(f"window.__goal = window.__salmora.frames + {count}")
    page.wait_for_function("window.__salmora.frames >= window.__goal", timeout=timeout)


def snapshot(page):
    return page.evaluate("""() => {
      const h = window.__salmora;
      return {
        cars: h.traffic.cars.filter(c => c.alive).map(c => [c.id, c.x, c.z]),
        peds: h.crowd.people.map(p => [p.id, p.x, p.z]),
        here: [h.player.x, h.player.z],
        frames: h.frames,
      };
    }""")


def main():
    handler = functools.partial(Quiet, directory=str(GAME))
    httpd = Server(("127.0.0.1", 8475), handler)
    threading.Thread(target=httpd.serve_forever, daemon=True).start()

    results = {}
    errors = []
    with sync_playwright() as playwright:
        browser = playwright.chromium.launch(executable_path=CHROME, args=ARGS)
        page = browser.new_page(viewport={"width": 960, "height": 540}, device_scale_factor=1)
        page.set_default_timeout(90000)
        page.set_default_navigation_timeout(90000)
        page.on("pageerror", lambda error: errors.append(f"pageerror: {error}"))
        page.on("console", lambda message: errors.append(f"console.{message.type}: {message.text}")
                if message.type == "error" else None)

        page.goto("http://127.0.0.1:8475/index.html?seed=1&quality=low", wait_until="domcontentloaded")
        page.wait_for_function("window.__salmora && window.__salmora.frames > 6", timeout=180000)
        results["loaded"] = True

        # --- one: the city is alive -------------------------------------
        before = snapshot(page)
        frames_later(page, 14)
        after = snapshot(page)
        moved = sum(
            1 for (i, x, z), (j, x2, z2) in zip(before["cars"], after["cars"])
            if i == j and (abs(x - x2) + abs(z - z2)) > 0.4
        )
        peds_moved = sum(
            1 for (i, x, z), (j, x2, z2) in zip(before["peds"], after["peds"])
            if i == j and (abs(x - x2) + abs(z - z2)) > 0.15
        )
        results["cars"] = len(after["cars"])
        results["cars_moved"] = moved
        results["peds"] = len(after["peds"])
        results["peds_moved"] = peds_moved
        results["busiest_junction"] = page.evaluate("""() => {
          const h = window.__salmora;
          let best = { n: 0, x: 0, z: 0 };
          for (let i = 1; i <= 6; i++) for (let j = 1; j <= 6; j++) {
            const x = -210 + i * 58 + 7, z = -210 + j * 58 + 7;
            const n = h.traffic.within(x, z, 42);
            if (n > best.n) best = { n, x, z };
          }
          return best;
        }""")
        results["stopped_for_crossing"] = page.evaluate(
            "window.__salmora.traffic.cars.filter(c => c.alive && c.speed < 0.2).length")

        # --- two: mission one, on foot, through the game's own rules -----
        page.keyboard.down("Shift")
        page.keyboard.down("d")
        page.wait_for_function("window.__salmora.missions.step === 1", timeout=240000)
        results["mission_step_1"] = page.evaluate("window.__salmora.missions.step")
        page.wait_for_function("window.__salmora.missions.completed.includes('dock-dues')", timeout=300000)
        page.keyboard.up("d")
        page.keyboard.up("Shift")
        results["mission_1_completed"] = page.evaluate("window.__salmora.missions.completed.includes('dock-dues')")
        results["cash"] = page.evaluate("window.__salmora.cash")
        results["cash_hud"] = page.evaluate("document.querySelector('.cash').textContent")
        results["objective_hud"] = page.evaluate("document.querySelector('.job-text').textContent")
        saved = page.evaluate("JSON.parse(localStorage.getItem('salmora-save-v1') || 'null')")
        results["save"] = saved
        results["save_cash_matches"] = bool(saved and saved["cash"] == results["cash"])
        results["job_card_visible"] = page.evaluate(
            "document.querySelector('#job').classList.contains('show')")
        results["beacon_in_scene"] = page.evaluate("window.__salmora.missions.beacon.visible")

        # --- three: stealing a car is a crime, and the law answers -------
        page.evaluate("window.__carBefore = window.__salmora.traffic.cars.filter(c => c.alive).length")
        for attempt in range(6):
            page.evaluate("""() => {
              const h = window.__salmora;
              if (h.mode === 'drive') return;
              const car = h.traffic.cars.find(c => c.alive && c.speed < 6)
                || h.traffic.cars.find(c => c.alive);
              h.teleport(car.x + 0.7, car.z + 0.7, 0);
            }""")
            page.keyboard.press("e")
            try:
                page.wait_for_function("window.__salmora.mode === 'drive'", timeout=12000)
                break
            except Exception:
                continue
        results["mode_after_e"] = page.evaluate("window.__salmora.mode")
        results["cars_after_steal"] = page.evaluate("window.__salmora.traffic.cars.filter(c => c.alive).length")
        results["cars_before_steal"] = page.evaluate("window.__carBefore")
        results["stole_car"] = results["cars_after_steal"] == results["cars_before_steal"] - 1
        results["stars_after_theft"] = page.evaluate("window.__salmora.police.stars")
        results["hud_stars_lit"] = page.evaluate("document.querySelectorAll('#wanted .star.lit').length")
        try:
            page.wait_for_function("window.__salmora.police.units.length >= 1", timeout=180000)
        except Exception:
            pass
        results["cruisers"] = page.evaluate("window.__salmora.police.units.length")

        # --- four: the pistol actually fires ----------------------------
        page.keyboard.press("e")
        frames_later(page, 4, 60000)
        page.evaluate("window.__salmora.combat.cooldown = 0")
        before_shots = page.evaluate("window.__salmora.combat.shots")
        page.keyboard.press("f")
        try:
            page.wait_for_function(f"window.__salmora.combat.shots > {before_shots}", timeout=60000)
        except Exception:
            pass
        results["shots"] = page.evaluate("window.__salmora.combat.shots") - before_shots
        results["ammo"] = page.evaluate("window.__salmora.combat.magazine")
        results["health"] = page.evaluate("window.__salmora.health")

        report = page.evaluate("window.__salmora.report()")
        results["triangles"] = report["triangles"]
        results["draw_calls"] = report["calls"]

        browser.close()
    httpd.shutdown()

    print(json.dumps(results, indent=1))
    print("console errors:", errors[:8] if errors else "none")

    ok = (
        not errors
        and results["cars"] >= 40
        and results["cars_moved"] > 20
        and results["peds"] >= 100
        and results["peds_moved"] > 20
        and results["busiest_junction"]["n"] > 12
        and results["mission_step_1"] == 1
        and results["mission_1_completed"]
        and results["cash"] == 720
        and results["cash_hud"] == "$720"
        and results["save_cash_matches"]
        and results["stole_car"]
        and results["stars_after_theft"] >= 1
        and results["cruisers"] >= 1
        and results["shots"] >= 1
    )
    print("verify stage B:", "PASS" if ok else "FAIL")
    return 0 if ok else 1


if __name__ == "__main__":
    raise SystemExit(main())
