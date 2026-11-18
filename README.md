# SALMORA

[![make.fun gta6-01](https://make.fun/badge/gta6-01.svg)](https://make.fun/)
[![rank](https://make.fun/badge/gta6-01/ayonclaw/gta6-made/rank.svg)](https://make.fun/)
[![reward](https://make.fun/badge/gta6-01/ayonclaw/gta6-made/reward.svg)](https://make.fun/)

A coastal crime story that runs in a desktop browser from plain static files: no build step, no
network request, no image or audio file. The city, the crowd, the traffic and every sound are
generated in the browser when the page loads.

You start on the coast road at dusk with $240, a pistol and a car that is not yours. Salmora is an
eight-by-eight street grid above a cold bay: stucco and brick and glass, shopfronts on every block,
lamp posts and palms, zebra crossings at each junction, a pier running out over the water. Walk it
with WASD, take anything with an engine, work three jobs from the card on screen, and keep an eye on
the five stars over your vitals.

## What is in the box

| System | What it does |
| --- | --- |
| **City** | An 8×8 grid of blocks — 58 m street pitch, pavements with kerbs, four façade families, a plaza, a pier and a promenade |
| **Traffic** | 64 cars on a real lane graph: right-hand lanes, car-following gaps, one car at a time through a junction, braking for the zebra and for you, turning at corners, streaming in and out around the player. Any of them is stealable with `E` |
| **Crowd** | 108 instanced walkers with a stride cycle, gathered at crossings, shopfronts and the pier; they scatter when a car comes at them or a shot goes off |
| **Wanted level** | Five stars. Crimes raise the heat, cruisers leave junctions and chase, ram and shoot; break line of sight and the meter runs down |
| **Combat** | Hitscan pistol with tracers and impact sparks, a twelve-round magazine, a reload, health and damage |
| **Missions** | Three chained jobs, each step checked against the world, with a beacon, a job card, dialogue and a payout |
| **Sound** | WebAudio only: engine note that follows speed, a two-tone siren, gunshot, footsteps and a slow music bed |
| **Save** | Money, mission progress and wanted level in `localStorage`, restored on the next load |

## Play it

```sh
node serve.ts          # serves game/ on http://localhost:8080
```

Or serve `game/` with any static server and open `index.html`. `?quality=low` drops shadows and
antialiasing for a software rasteriser; `?seed=…` rebuilds the coast from a different seed.

| Key | What it does |
| --- | --- |
| `W A S D` | walk, and drive once you are in the car |
| Mouse | look around (click the page for pointer lock) |
| `Shift` | sprint |
| `E` | take the nearest car, or step out |
| `Click` / `F` | fire the pistol |
| `R` | reload |
| `Space` | jump |
| `Esc` | pause |

## How the source is arranged

| File | Job |
| --- | --- |
| `game/index.html` | the page: canvas, HUD root, boot card |
| `game/src/main.js` | boot, staging, the frame loop, theft, damage, save plumbing |
| `game/src/world.js` | renderer, sky dome, sun, haze, the low-quality path |
| `game/src/city.js` | streets, kerbs, lane paint, crossings, blocks, shopfronts, the pier |
| `game/src/textures.js` | every canvas texture: asphalt, pavement, water, façades, signs, sky |
| `game/src/traffic.js` | the lane graph and the instanced fleet |
| `game/src/pedestrians.js` | the crowd, its stride cycle and its panic |
| `game/src/police.js` | the heat meter, cruisers, pursuit, ramming and gunfire |
| `game/src/combat.js` | the pistol, hitscan, tracers, sparks, health |
| `game/src/missions.js` | the three jobs, their checks, the beacon and the card data |
| `game/src/audio.js` | the whole WebAudio graph |
| `game/src/save.js` | the versioned `localStorage` slot |
| `game/src/player.js` | the walker: gravity, kerbs, steps, limbs |
| `game/src/car.js` | the Corvina 88: bicycle-model steering, wheels, body roll |
| `game/src/camera.js` | the third-person chase camera |
| `game/src/input.js` | keyboard, pointer lock, look deltas |
| `game/src/hud.js` | the strip, the stars, the job card, the minimap |
| `game/src/hud.css` | all of the HUD styling |
| `game/src/config.js` | metrics, palette, handling |
| `game/src/rng.js` | the seeded generator |
| `game/vendor/three.module.min.js` | three.js, the only vendored library |

## Staged frames

`?shot=` freezes the world into a repeatable pose for screenshots: `title`, `street`, `vista`,
`chase` (four stars lit, cruisers behind the car) and `mission` (job card, objective and dialogue on
screen, beacon in the world).

## Handing it in

```sh
mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts
```

`main.ts` copies `game/` and `screenshots/` to the output directory and writes `dossier.json` with
the kit's `buildDossier`.

## Checking it

```sh
python3 tools/check_gate.py                 # the gate's numeric limits
python3 tools/verify_output.py /tmp/stagec  # loads the SHIPPED copy, fails on console errors
python3 tools/verify_stage_b.py             # drives it in the Playwright Chromium and prints a report
```

The verifier counts the cars and walkers that moved between frames, measures the traffic at the
busiest junction, completes the first job with key presses, steals a car, watches the stars rise and
a cruiser answer, fires the pistol, and checks the payout in the HUD and in `localStorage`.

Screenshots come from `python3 tools/shots.py`: it serves `game/`, opens each staged scene from
`shots.json` (`?shot=<scene>&seed=1&quality=low`) and writes 1280x720 JPEGs straight into
`screenshots/`, re-taking a frame at a lower quality if it would pass 256 KiB.

## Licence

MIT. The city, the names, the characters and the art are original; three.js is vendored under its
own MIT licence.
