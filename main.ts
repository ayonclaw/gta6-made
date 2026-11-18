/**
 * make.fun gta6-01 entry — Salmora.
 *
 * The game is the static tree in `game/` beside this file: one index.html, its ES
 * modules, a stylesheet and a vendored three.js build. Nothing is fetched at run
 * time, so the entry needs no build step, no install and no network. This program
 * only hands that tree in: it stages `game/` and `screenshots/` under the output
 * directory and writes the dossier the judge reads.
 *
 * Runs on Node 22 with type stripping alone (`node main.ts`), standard library
 * plus the vendored `vendor/makefun-game.ts`.
 *
 *   node main.ts                                  # writes to /output
 *   MAKEFUN_OUTPUT_DIR=out node main.ts           # writes beside the repo
 *
 * Every path is resolved from this file, not from the current directory, so the
 * command works from any cwd.
 */

import { cpSync, existsSync, mkdirSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildDossier } from './vendor/makefun-game.ts';

const ROOT = fileURLToPath(new URL('.', import.meta.url));
const GAME = join(ROOT, 'game');
const SHOTS = join(ROOT, 'screenshots');
const OUT = process.env.MAKEFUN_OUTPUT_DIR ?? '/output';

/** The scorer's own caps (reference/gate.json); only text_max_bytes shapes the
 *  dossier, the rest refuse an entry the scorer would refuse. */
const CAPS = {
  text_max_bytes: 163840,
  screenshots: { max: 4, max_bytes: 262144 },
  game_max_files: 993,
  game_max_bytes: 50331648,
  game_path_max_bytes: 1000,
};

function fail(reason: string, hint: string): never {
  console.error(`salmora entry: ${reason}`);
  console.error(`  looked in ${ROOT}`);
  console.error(`  ${hint}`);
  process.exit(1);
}

function requireDir(path: string, label: string): void {
  if (!existsSync(path) || !statSync(path).isDirectory()) {
    fail(`${label}/ is missing or not a directory`, `the entry needs ${label}/ beside main.ts`);
  }
}

/** Replace, never merge: a stale file left from an earlier run would be counted. */
function stage(from: string, to: string): void {
  rmSync(to, { recursive: true, force: true });
  cpSync(from, to, { recursive: true });
}

requireDir(GAME, 'game');
if (!existsSync(join(GAME, 'index.html')) || !statSync(join(GAME, 'index.html')).isFile()) {
  fail('game/index.html is missing', 'the game folder is not a loadable entry without its index.html');
}
requireDir(SHOTS, 'screenshots');

mkdirSync(OUT, { recursive: true });
stage(GAME, join(OUT, 'game'));
stage(SHOTS, join(OUT, 'screenshots'));

const dossier = (() => {
  try {
    return buildDossier(OUT, CAPS);
  } catch (error) {
    // A cap refusal names its limit; say which one, so a bad screenshot or a bloated
    // game tree is diagnosable without reading the vendored library.
    const limit = (error as { limit?: string }).limit;
    const detail = limit ? ` (limit: ${limit})` : '';
    fail(`the dossier builder refused this entry${detail}: ${(error as Error).message}`,
      'check screenshots/ (4 JPEGs, <= 256 KiB each) and game/ (<= 993 entries, 48 MiB)');
  }
})();
writeFileSync(join(OUT, 'dossier.json'), dossier);

const kinds = readdirSync(OUT, { withFileTypes: true }).map((entry) => entry.name).sort();
console.log(`salmora entry: staged ${kinds.join(', ')} -> ${OUT}`);
console.log(`dossier: ${dossier.byteLength} bytes, ${readdirSync(SHOTS).length} screenshots`);
