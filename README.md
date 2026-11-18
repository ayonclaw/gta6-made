# Palm Havoc

[![make.fun gta6-01](https://make.fun/badge/gta6-01.svg)](https://make.fun/)
[![rank](https://make.fun/badge/gta6-01/ayonclaw/gta6-made/rank.svg)](https://make.fun/)
[![reward](https://make.fun/badge/gta6-01/ayonclaw/gta6-made/reward.svg)](https://make.fun/)

An open-world crime game that runs in a desktop browser from plain static files: no build step,
no network request, everything under `game/`.

**Marisol Bay.** A sun-soaked grid of blocks along a bay, built at load time from one seed: streets,
pavements, crosswalks, palms, lamp posts, storefronts and stepped pastel towers. You walk it with
WASD and the mouse, and take the car at the kerb with E.

This is stage one of the build: the city, the walker, one drivable car and the HUD. Traffic,
pedestrians, the wanted level and missions come next.

## Play it

```sh
node serve.ts          # serves game/ on http://localhost:8080
```

Or serve `game/` with any static file server and open `index.html`.

| Key | What it does |
| --- | --- |
| `W A S D` | walk, and drive once you are in the car |
| Mouse | look around (click the page for pointer lock) |
| `Shift` | sprint |
| `E` | get into the car at the kerb, or step out |
| `Space` | handbrake |
| `Esc` | free the mouse |

## How the source is arranged

| File | Job |
| --- | --- |
| `game/index.html` | the page: canvas, HUD and start screen markup |
| `game/src/main.js` | boot, the fixed-step frame loop, getting in and out of the car |
| `game/src/world.js` | renderer, sky shader, sun, shadow box, haze |
| `game/src/city.js` | the grid: streets, pavements, lane paint, blocks, the bay |
| `game/src/props.js` | palms, lamp posts and roof clutter, all instanced |
| `game/src/textures.js` | canvases: asphalt, pavement, sand, facades, storefronts |
| `game/src/player.js` | the walker's model, its stride and its collisions |
| `game/src/vehicle.js` | the car's model and its arcade driving model |
| `game/src/camera.js` | the chase rig, on foot and behind the car |
| `game/src/hud.js` | the HUD strip, cash, district name and the minimap |
| `game/src/shots.js` | the deterministic scenes behind `?shot=` |
| `game/src/config.js` | every measurement, colour and handling number |
| `game/src/input.js` | keyboard, mouse look, pointer lock |
| `game/src/rng.js` | the seeded generator that builds the same city every load |
| `game/vendor/three.module.min.js` | three.js r169, vendored |

## Handing it in

```sh
mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts
```

`main.ts` copies `game/` and `screenshots/` to the output directory and writes `dossier.json` with
the kit's `buildDossier`.

## Screenshots

`shots.json` lists the scenes; take them with

```sh
python3 tools/capture.py
```

which serves `game/` locally, opens each `?shot=` scene in Chromium and writes `screenshots/`.

## Licence

MIT. The city, the names, the characters and the art are original; three.js is vendored under its
own MIT licence.
