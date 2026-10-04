// Record the channel owner's release approval on PokePulses drafts, mirroring an approved episode.
// Usage: node scripts/approve-release.mjs <first> <last>     e.g. 10 20
// A person runs this after reviewing each episode's facts, title and cover (see RIGHTS.md).
// It copies rights.artworkReview from bulbasaur-001 (the owner's recorded 2026-09-30 decision),
// marks the artwork permission-required and approved, and approves the episode itself.
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dir = path.join(root, 'drafts', 'pokepulses');
const [first, last] = process.argv.slice(2).map(Number);
if (!Number.isInteger(first) || !Number.isInteger(last) || first > last) throw new Error('Usage: node scripts/approve-release.mjs <first> <last>');

const read = (file) => JSON.parse(fs.readFileSync(file, 'utf8'));
const {artworkReview} = read(path.join(dir, 'bulbasaur-001.json')).rights;
if (!artworkReview) throw new Error('bulbasaur-001 has no rights.artworkReview to copy.');

for (const file of fs.readdirSync(dir).filter((name) => name.endsWith('.json')).sort()) {
  const number = Number(file.match(/-(\d+)\.json$/)?.[1]);
  if (number < first || number > last) continue;
  const draft = read(path.join(dir, file));
  const {rights} = draft;
  rights.releaseStatus = 'cleared';
  rights.publicReleaseApproved = true;
  // Keep the key order of an approved episode: artworkReview sits before assets.
  const {assets, ...rest} = rights;
  draft.rights = {...rest, artworkReview, assets: assets.map((asset) => ({
    ...asset,
    licenseStatus: 'permission-required',
    publicReleaseApproved: true,
    notes: `No licence. Cleared for publication by a legal review (${artworkReview.reviewer}, ${artworkReview.date}); see rights.artworkReview.`,
  }))};
  fs.writeFileSync(path.join(dir, file), `${JSON.stringify(draft, null, 2)}\n`);
  console.log(`approved ${file}`);
}
