// Record the channel owner's release approval on Geographica drafts, then compile and run the publish checks.
// Usage: node scripts/approve-geographica.mjs <id> [<id>...] [--borders="how the disputed areas are shown"] [--reviewer="Name"]
// A person runs this after watching each episode. It marks the episode cleared and approved and recompiles it.
// --borders records rights.bordersReview (reviewer, today's date, your wording) and is only for episodes that
// show disputed borders or names; the publish check says when one is needed. It never uploads.
import fs from 'node:fs';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const valueOf = (name) => args.find((arg) => arg.startsWith(`--${name}=`))?.slice(name.length + 3);
const ids = args.filter((arg) => !arg.startsWith('--'));
if (!ids.length) throw new Error('Usage: node scripts/approve-geographica.mjs <id> [<id>...] [--borders="..."] [--reviewer="Name"]');
const borders = valueOf('borders');
const reviewer = valueOf('reviewer') ?? 'Amr Elsehemy';
const today = new Date().toISOString().slice(0, 10);

let failed = 0;
for (const id of ids) {
  const file = path.join(root, 'drafts', 'geographica', `${id}.json`);
  if (!fs.existsSync(file)) { console.log(`✗ ${id}: no draft at drafts/geographica/${id}.json`); failed++; continue; }
  const draft = JSON.parse(fs.readFileSync(file, 'utf8'));
  draft.rights.releaseStatus = 'cleared';
  draft.rights.publicReleaseApproved = true;
  if (borders) draft.rights.bordersReview = {reviewer, date: today, decision: borders};
  fs.writeFileSync(file, `${JSON.stringify(draft, null, 2)}\n`);
  const compile = spawnSync(process.execPath, ['scripts/compile-episode.mjs', id], {cwd: root, encoding: 'utf8'});
  if (compile.status !== 0) { console.log(`✗ ${id}: compile failed\n${compile.stderr || compile.stdout}`); failed++; continue; }
  const checks = spawnSync(process.execPath, ['--import', 'tsx', 'scripts/preflight-publish.ts', id], {cwd: root, encoding: 'utf8'});
  const lines = `${checks.stdout}${checks.stderr}`.split('\n').filter((line) => /^[✓✗]|^  - /.test(line));
  console.log(lines.length ? lines.join('\n') : `${checks.status === 0 ? '✓' : '✗'} ${id}`);
  if (checks.status !== 0) failed++;
}
console.log(failed ? `${failed} of ${ids.length} not cleared.` : `All ${ids.length} approved and cleared for upload. Next: npm run youtube:upload -- <id>`);
process.exit(failed ? 1 : 0);
