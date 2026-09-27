// Calibrate the creative critic: curated references should pass, and known
// weaker drafts (default: Swablu) should score below every reference.
// Usage: npm run critic:calibrate -- [baseline-episode-id ...]
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {calibrateCritic, referenceStory} from './lib/creative-critic.mjs';
import {createCompletion} from './lib/llm.mjs';
import {loadReferences} from './lib/references.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const baselines = process.argv.slice(2).filter((arg) => !arg.startsWith('--'));
const readJson = (file) => JSON.parse(fs.readFileSync(path.join(root, file), 'utf8'));
const cachedResearch = (id) => (fs.existsSync(path.join(root, `research/pokepulses/${id}.json`)) ? readJson(`research/pokepulses/${id}.json`) : undefined);

const stories = [
  ...loadReferences().map((reference) => ({label: `reference ${reference.id}`, story: referenceStory(reference), research: cachedResearch(reference.id), expect: 'pass'})),
  ...(baselines.length ? baselines : ['swablu-333']).map((id) => ({label: `baseline ${id}`, story: readJson(`drafts/pokepulses/${id}.json`), research: cachedResearch(id), expect: 'lower'})),
];

let complete;
try {
  complete = createCompletion();
} catch (error) {
  console.error(`✗ ${error.message}`);
  process.exit(1);
}
console.log(`critic: ${complete.provider} (${complete.model})\n`);
const {rows, calibrated} = await calibrateCritic({stories, complete});
for (const {label, expect, review, ok} of rows) {
  if (review.skipped) {
    console.log(`✗ ${label}: not judged (${review.modelError ?? 'no critic'})`);
    continue;
  }
  console.log(`${ok ? '✓' : '✗'} ${label}: ${review.score}/100 ${review.passed ? 'pass' : 'fail'} (expected ${expect === 'pass' ? 'pass' : 'below every reference'})`);
  for (const item of review.criteria) console.log(`    ${item.score}/5 ${item.criterion}${item.capped ? ' (capped)' : ''}${item.revision ? ` — ${item.revision}` : ''}`);
}
console.log(calibrated ? '\n✓ The critic separates the references from the baselines.' : '\n✗ The critic is not calibrated: adjust its prompt or the references.');
process.exit(calibrated ? 0 : 1);
