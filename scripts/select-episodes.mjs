// CI helper: prints the render jobs as a JSON array of space-separated episode ids.
//   node scripts/select-episodes.mjs --base=<git ref>   episodes affected since <ref>
//   node scripts/select-episodes.mjs --full             every episode
import {execFileSync} from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {selectEpisodes, toShards} from './lib/ci-select.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const full = args.includes('--full');
const base = args.find((arg) => arg.startsWith('--base='))?.slice('--base='.length);
if (!full && !base) throw new Error('Usage: node scripts/select-episodes.mjs --base=<git ref> | --full');

const catalog = [];
const walk = (directory) => {
  for (const entry of fs.readdirSync(directory, {withFileTypes: true})) {
    const target = path.join(directory, entry.name);
    if (entry.isDirectory()) walk(target);
    else if (entry.name === 'video.json') catalog.push(JSON.parse(fs.readFileSync(target, 'utf8')).id);
  }
};
walk(path.join(root, 'videos'));

const changedFiles = full ? [] : execFileSync('git', ['diff', '--name-only', `${base}...HEAD`], {cwd: root, encoding: 'utf8'}).split('\n').filter(Boolean);
const golden = JSON.parse(fs.readFileSync(path.join(root, '.github', 'golden-episodes.json'), 'utf8')).episodes;
const {episodes, reason} = selectEpisodes({changedFiles, catalog, golden, full});
console.error(`Rendering ${episodes.length} episode(s): ${reason}`);
process.stdout.write(JSON.stringify(toShards(episodes)));
