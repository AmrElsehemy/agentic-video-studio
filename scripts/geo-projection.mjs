// Give a directed map episode the projection its subject calls for, without asking the model again.
//   npm run geo:projection -- <episode-id>... [--write] [--projection=auto|mercator|equal-earth|albers|azimuthal]
// Without --write it only says what it would do. Compile afterwards (npm run episode:compile -- <id>).
import './lib/load-secrets.mjs';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {findDraft} from './catalog.mjs';
import {chooseProjection, resolveResearchPlaces} from './lib/geo-director.mjs';
import {loadGeoData} from './lib/geo-primitives.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const write = args.includes('--write');
const forced = args.find((arg) => arg.startsWith('--projection='))?.slice('--projection='.length);
const ids = args.filter((arg) => !arg.startsWith('--'));
if (!ids.length) { console.error('Usage: npm run geo:projection -- <episode-id>... [--write] [--projection=auto|mercator|equal-earth|albers|azimuthal]'); process.exit(1); }

const geo = loadGeoData();
for (const id of ids) {
  const found = findDraft(id);
  if (!found) { console.error(`✗ no draft named ${id}`); continue; }
  const draft = JSON.parse(fs.readFileSync(found.draftPath, 'utf8'));
  const research = JSON.parse(fs.readFileSync(path.join(root, 'research', found.showId, `${id}.json`), 'utf8'));
  const {subjectId, places} = resolveResearchPlaces(research, geo);
  const kind = forced && forced !== 'auto' ? forced : draft.projection && draft.projection !== 'auto' ? draft.projection : chooseProjection(places.get(subjectId));
  let changed = 0;
  for (const scene of draft.scenes) {
    const primitive = scene.primitive;
    if (primitive?.kind !== 'geo-map' || primitive.globe) continue;
    const next = kind === 'mercator' ? undefined : kind;
    if (primitive.projection !== next) changed++;
    if (next) primitive.projection = next; else delete primitive.projection;
  }
  console.log(`${id}: ${kind}${changed ? ` (${changed} scene${changed === 1 ? '' : 's'} ${write ? 'changed' : 'would change'})` : ' (already set)'}`);
  if (write && changed) fs.writeFileSync(found.draftPath, `${JSON.stringify(draft, null, 2)}\n`);
}
