// How an episode was made and roughly what it cost (#89).
//   npm run production -- <episode-id>          the summary
//   npm run production -- <episode-id> --json   the summary as JSON
// The log is analytics/<show>/<id>.production.json; agents, narration, local
// renders and approvals add to it. Costs are estimates from scripts/lib/prices.json.
import fs from 'node:fs';
import path from 'node:path';
import {findManifest, resolveEpisodeId} from './catalog.mjs';
import {readProduction, summarizeProduction} from './lib/production.mjs';

const args = process.argv.slice(2);
const target = args.find((arg) => !arg.startsWith('--'));
if (!target) { console.error('Usage: npm run production -- <episode-id> [--json]'); process.exit(1); }
const episodeId = resolveEpisodeId(target);
const {root, manifestPath} = findManifest(episodeId);
const show = path.basename(path.dirname(path.dirname(manifestPath)));
const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
const summary = summarizeProduction(readProduction(root, show, episodeId), {manifest});
if (args.includes('--json')) { console.log(JSON.stringify(summary, null, 2)); process.exit(0); }

const dollars = (value) => (value == null ? 'no price' : `$${value.toFixed(value < .1 ? 4 : 2)}`);
console.log(`${episodeId} (${show})`);
const roles = Object.entries(summary.models);
if (!roles.length) console.log('  models: none logged');
for (const [role, item] of roles) console.log(`  ${role}: ${item.calls} call(s), ${item.inputTokens.toLocaleString('en-US')} in / ${item.outputTokens.toLocaleString('en-US')} out tokens (${item.models.join(', ')}), ${dollars(item.cost)}`);
console.log(`  narration: ${summary.narration.characters ? `${summary.narration.characters} characters, ${summary.narration.seconds}s (${summary.narration.providers.join(', ')}), ${dollars(summary.narration.cost)}` : 'none generated'}`);
console.log(`  renders: ${summary.renders.count}${summary.renders.lastSeconds ? ` (last took ${summary.renders.lastSeconds}s)` : ''}`);
for (const approval of summary.approvals) console.log(`  approved: ${approval.what}, ${approval.date}${approval.by ? `, ${approval.by}` : ''}`);
console.log(`  estimated cost: ${dollars(summary.cost)} (prices checked ${summary.pricesChecked})${summary.unpriced.length ? `; not priced: ${summary.unpriced.join(', ')}` : ''}`);
