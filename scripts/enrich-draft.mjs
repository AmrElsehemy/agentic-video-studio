// Give directed drafts their score, ambience and flags (scripts/lib/enrich.mjs), from scripts/lib/episode-sound.json.
//   npm run episode:enrich -- <episode id>... [--write]
import './lib/load-secrets.mjs';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {findDraft} from './catalog.mjs';
import {enrichDraft} from './lib/enrich.mjs';
import {loadGeoData} from './lib/geo-primitives.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const picks = JSON.parse(fs.readFileSync(path.join(root, 'scripts', 'lib', 'episode-sound.json'), 'utf8'));
const ids = args.filter((arg) => !arg.startsWith('--'));
if (!ids.length) throw new Error('Usage: npm run episode:enrich -- <episode id>... [--write]');
const {entities} = loadGeoData(root);
for (const id of ids) {
  const found = findDraft(id);
  const pick = picks[id];
  if (!found || !pick) {console.error(`✗ ${id}: ${found ? 'no entry in scripts/lib/episode-sound.json' : 'no draft'}`); continue;}
  const draft = JSON.parse(fs.readFileSync(found.draftPath, 'utf8'));
  const enriched = enrichDraft(draft, {...pick, entities});
  const maps = enriched.scenes.filter((scene) => scene.primitive?.kind === 'geo-map');
  console.log(`${args.includes('--write') ? '✓' : '·'} ${id}: score ${enriched.score}, ambience on ${maps.filter((scene) => scene.primitive.ambience && scene.primitive.ambience !== 'none').length}/${maps.length} scenes, flags on ${maps.filter((scene) => scene.primitive.flags).length}`);
  if (args.includes('--write')) fs.writeFileSync(found.draftPath, `${JSON.stringify(enriched, null, 2)}\n`);
}
