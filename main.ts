// SABLE YARD — a three.js tactical FPS, entered on make.fun as threejs-fps-02.
//
// The entry point is a Node 22 program (standard library only). It hands the game in
// by copying this repository's game/ and screenshots/ into the grader's output
// directory and writing /output/dossier.json with the kit's vendored library, the
// exact summary the judge reads. Run it outside the grader with:
//
//   mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts
//
// Then serve game/ locally with `node serve.ts` and play it at http://localhost:8080.
// The program runs twice in grading and both runs must write identical bytes, so it
// does nothing time- or random-dependent: a plain copy plus the dossier build.

import { cpSync, existsSync, mkdirSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildDossier } from './vendor/makefun-threejs.ts';

const repoRoot = fileURLToPath(new URL('.', import.meta.url));
const outputDir = process.env.MAKEFUN_OUTPUT_DIR ?? '/output';
const gameDir = join(repoRoot, 'game');
const shotsDir = join(repoRoot, 'screenshots');

function countFiles(dir) {
  let total = 0;
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    total += statSync(path).isDirectory() ? countFiles(path) : 1;
  }
  return total;
}

mkdirSync(outputDir, { recursive: true });
cpSync(gameDir, join(outputDir, 'game'), { recursive: true });
mkdirSync(join(outputDir, 'screenshots'), { recursive: true });
if (existsSync(shotsDir)) cpSync(shotsDir, join(outputDir, 'screenshots'), { recursive: true });

// Gate caps, mirrored from the kit's RULES: the dossier text is capped at 160 KiB,
// at most 4 screenshots of 256 KiB each, and game/ stays inside 993 files / 48 MiB
// so the whole of /output fits the platform's own 1,000-entry, 64 MiB ceiling.
writeFileSync(
  join(outputDir, 'dossier.json'),
  buildDossier(outputDir, {
    text_max_bytes: 163840,
    screenshots: { max: 4, max_bytes: 262144 },
    game_max_files: 993,
    game_max_bytes: 50331648,
  }),
);

const shots = existsSync(shotsDir) ? readdirSync(shotsDir).filter((n) => !n.startsWith('.')) : [];
console.log(`sable-yard: ${countFiles(gameDir)} game files, ${shots.length} screenshots -> ${outputDir}`);
