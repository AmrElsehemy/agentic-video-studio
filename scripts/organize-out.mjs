// Move the old flat out/<id>… files into out/<show>/<id>/.
// Usage: npm run out:organize [-- --apply]    (without --apply it only lists what would move)
// An entry belongs to the episode whose id it is, or starts with followed by "-" or "." (<id>.mp4,
// <id>-cover.png, <id>-frames/). Anything else (analytics-report.json, visual-review/, ...) stays.
import fs from 'node:fs';
import path from 'node:path';
import {repoRoot as root, episodeIds} from './catalog.mjs';
import {showOfEpisode} from './lib/out.mjs';

const apply = process.argv.includes('--apply');
const outDir = path.join(root, 'out');
if (!fs.existsSync(outDir)) {
  console.log('No out/ folder; nothing to organize.');
  process.exit(0);
}

// Longest id first, so "nidoran-f-029" is never taken for another id that is a prefix of it.
const ids = episodeIds().sort((a, b) => b.length - a.length);
const moves = [];
for (const name of fs.readdirSync(outDir)) {
  const id = ids.find((candidate) => name === candidate || name.startsWith(`${candidate}-`) || name.startsWith(`${candidate}.`));
  const show = id && showOfEpisode(root, id);
  if (!show) continue;
  moves.push({name, from: path.join(outDir, name), to: path.join(outDir, show, id, name)});
}

let moved = 0;
let skipped = 0;
for (const {name, from, to} of moves) {
  if (fs.existsSync(to)) {
    skipped++;
    console.warn(`⚠ ${name}: already at ${path.relative(outDir, to)}; left where it is.`);
    continue;
  }
  if (apply) {
    fs.mkdirSync(path.dirname(to), {recursive: true});
    fs.renameSync(from, to);
  }
  moved++;
}
const left = fs.readdirSync(outDir).filter((name) => !moves.some((move) => move.name === name));
console.log(`${apply ? '✓ moved' : 'Would move'} ${moved} entr${moved === 1 ? 'y' : 'ies'} into out/<show>/<episode>/${skipped ? ` (${skipped} skipped)` : ''}.`);
if (left.length) console.log(`Staying in out/: ${left.join(', ')}`);
if (!apply && moved) console.log('Run again with --apply to move them.');
