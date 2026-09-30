// Direct the maps of a geography draft (#74): every scene gets a geo-map shot
// chosen by the director model from the places and points its research names.
//   npm run geo:direct -- lesotho-enclave             ask the model, write out/<id>.geo-directed.json
//   npm run geo:direct -- lesotho-enclave --write     replace the draft's shots
//   npm run geo:direct -- lesotho-enclave --reply=f   use a saved reply instead of a model
//   --research=<file>  research other than research/<show>/<id>.json (the show is the draft's folder)
//   --provider=<name>  the director's provider (default: DIRECTOR_* / CHECKER_* / WRITER_* settings)
// Shots that break a rule fall back to a plain map of the subject and are listed.
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {directGeoVisuals} from './lib/geo-director.mjs';
import {createCompletion} from './lib/llm.mjs';
import {findDraft} from './catalog.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const option = (name) => args.find((arg) => arg.startsWith(`--${name}=`))?.slice(name.length + 3);
const target = args.find((arg) => !arg.startsWith('--'));
if (!target || !/^([a-z0-9-]+\/)?[a-z0-9-]+$/.test(target)) {
  console.error('Usage: npm run geo:direct -- [<show>/]<episode id> [--write] [--reply=<file>] [--research=<file>] [--provider=<name>]');
  process.exit(1);
}
const episodeId = target.split('/').at(-1);
const showId = target.includes('/') ? target.split('/')[0] : findDraft(episodeId)?.showId;
if (!showId) { console.error(`✗ no draft named ${episodeId} in drafts/.`); process.exit(1); }
const draftPath = path.join(root, 'drafts', showId, `${episodeId}.json`);
const researchPath = option('research') ? path.resolve(option('research')) : path.join(root, 'research', showId, `${episodeId}.json`);
for (const file of [draftPath, researchPath]) if (!fs.existsSync(file)) { console.error(`✗ ${path.relative(root, file)} doesn't exist.`); process.exit(1); }

const reply = option('reply');
const complete = reply
  ? async () => fs.readFileSync(path.resolve(reply), 'utf8')
  : createCompletion({role: 'director', provider: option('provider')});
const result = await directGeoVisuals({
  draft: JSON.parse(fs.readFileSync(draftPath, 'utf8')),
  research: JSON.parse(fs.readFileSync(researchPath, 'utf8')),
  complete,
  showId,
});

if (result.modelError) console.warn(`! the director model failed (${result.modelError}); every scene uses the default map.`);
for (const {id, why} of result.assigned) console.log(`  ✓ ${id}: ${why}`);
for (const {id, reason} of result.fallbacks) console.warn(`  ! ${id}: default map (${reason})`);
for (const {name, areas} of result.review) console.warn(`  ! ${name} has disputed areas (${areas.map((area) => area.name).join(', ')}): record rights.bordersReview before publishing (docs/geomotion-review.md).`);
const output = args.includes('--write') ? draftPath : path.join(root, 'out', `${episodeId}.geo-directed.json`);
fs.mkdirSync(path.dirname(output), {recursive: true});
fs.writeFileSync(output, `${JSON.stringify(result.draft, null, 2)}\n`);
console.log(`✓ ${result.assigned.length}/${result.draft.scenes.length} scenes directed; wrote ${path.relative(root, output)}`);
