# Palm Havoc

[![make.fun gta6-01](https://make.fun/badge/gta6-01.svg)](https://make.fun/)
[![rank](https://make.fun/badge/gta6-01/ayonclaw/gta6-made/rank.svg)](https://make.fun/)
[![reward](https://make.fun/badge/gta6-01/ayonclaw/gta6-made/reward.svg)](https://make.fun/)

An open-world crime game that runs in a desktop browser from plain static files: no build step,
no network request, no image or audio file. Everything — the city, the crowds, the traffic, the
sound — is generated in the browser at load time.

**Marisol Bay.** A sun-soaked grid of blocks along a bay: real façades in four families, fifty-six
shopfronts with their own names and type treatments, palms, crossings, a pier with a working Ferris
wheel, a lighthouse on the western headland and the spire of Casa Alta over the middle of town. You
walk it with WASD and the mouse, steal any car that passes, and hold off the police that come for
you. You arrive with $1,200 in your pocket.

## What is in the box

| System | What it does |
| --- | --- |
| **City** | Five by five blocks, four façade families (deco, brick, curtain-wall glass, stone), a deck of 56 named shopfronts in four sign treatments (no block repeats a name), rooftop boards, parapets and stair heads on every roof, awnings, benches, kiosks, bus shelters |
| **Landmarks** | **Casa Alta** — the stepped tower with a lit spire; **Pier Nine** — plank deck, arcade and the **Marisol Wheel**; the **headland lighthouse**; a marina of seven sailboats; the **Marisol Bay** gantry over the avenue |
| **Traffic** | 132 cars on a lane graph: right-hand lanes, queues at red lights, braking for each other and for the junction ahead, streaming toward the player — and hit, shot or stolen |
| **Pedestrians** | 176 walkers: crowds that gather at the crossings and shop doors, pavement traffic, people on the pier, swinging legs, idling, fleeing a car that comes at them, scattering from gunfire |
| **Wanted level** | Five stars. Crimes raise it, cruisers spawn from junctions, ram and shoot; stay unseen and the stars come back down |
| **Combat** | Hitscan pistol, tracers, impact sparks, a magazine and a reload; health, and a clinic bill when you go down |
| **Missions** | Three chained jobs with objectives the game checks, on-screen objective text, dialogue and a payout, plus a three-card intro that sets up the story |
| **Save** | Money (starting at $1,200), mission progress and wanted level in `localStorage` |
| **Bay** | A shader-driven sea: four travelling swells displaced in the vertex shader, a fresnel sky reflection, a broken sun-glitter path, and a surf line that breathes against the sand |
| **Light** | One low warm sun with soft contact shadows under every car and walker, a warm bounce off the sand, and a haze that still lets the skyline read |
| **HUD** | Contextual prompts that appear when they can help and fade when they cannot; the full control list lives on the Tab card |
| **Sound** | WebAudio only: an engine that follows the revs, tyre noise, gunshots, sirens, and a four-bar minor-key loop |

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
| `E` | steal the nearest car, or step out |
| `F` | fire; hold the left mouse button to keep firing |
| `R` | reload |
| `Space` | handbrake |
| `H` | horn — the pavement gets out of the way |
| `Tab` | the controls card, which pauses the street |
| `Esc` | free the mouse |

## How the source is arranged

| File | Job |
| --- | --- |
| `game/index.html` | the page: canvas, HUD, intro and start screen markup |
| `game/src/main.js` | boot, the fixed-step frame loop, theft, shooting, death and the save |
| `game/src/world.js` | renderer, sky shader, sun, shadow box, haze |
| `game/src/city.js` | the grid: streets, pavements, lane paint, blocks, the bay, landmark lots |
| `game/src/landmarks.js` | Casa Alta, Pier Nine and the wheel, the lighthouse, the marina |
| `game/src/props.js` | palms, lamps, parked cars, corner furniture and rooftop clutter, all instanced |
| `game/src/shops.js` | the shopfront deck: 56 names, seven type treatments, rooftop words |
| `game/src/water.js` | the animated bay: swell, glitter and surf, in one shader |
| `game/src/textures.js` | canvases: asphalt, pavement, sand, water, four façade families, storefronts, signs |
| `game/src/traffic.js` | the lane graph, signals, car following and the instanced traffic pool |
| `game/src/pedestrians.js` | the crowd: paths, stride, panic, and the instanced bodies |
| `game/src/police.js` | the wanted level, cruiser pursuit and the stars |
| `game/src/combat.js` | the pistol, tracers, sparks, the magazine and health |
| `game/src/missions.js` | the three jobs, their objectives, markers and payouts |
| `game/src/audio.js` | the WebAudio engine, sirens, gunshots and music |
| `game/src/save.js` | `localStorage` save and load |
| `game/src/player.js` | the walker's model, its stride and its collisions |
| `game/src/vehicle.js` | the car's model, the police livery, and the arcade driving model |
| `game/src/camera.js` | the chase rig, on foot and behind the car |
| `game/src/hud.js` | cash, health, stars, objective, subtitles and the minimap |
| `game/src/shots.js` | the deterministic scenes behind `?shot=` |
| `game/src/config.js` | every measurement, colour, price and handling number |
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

`shots.json` lists the four scenes — the vista, the busy street, the chase and the mission:

```sh
python3 tools/capture.py     # serves game/, opens each ?shot= scene, writes screenshots/
python3 tools/verify.py      # drives the game: traffic, crowd, theft, stars, combat, a mission, the save
python3 tools/check_gate.py  # the gate's numeric limits
```

Each scene stages the real systems (seeded traffic and crowd, real police units, real mission
state) and plays the rules forward a fixed number of steps, so the same seed always frames the
same picture.

## Licence

MIT. The city, the names, the characters and the art are original; three.js is vendored under its
own MIT licence.
