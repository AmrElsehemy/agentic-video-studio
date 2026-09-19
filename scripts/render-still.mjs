import {spawnSync} from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import {findManifest} from './catalog.mjs';

const episodeId = process.argv[2] ?? 'bulbasaur-001';
const {root, manifestPath} = findManifest(episodeId);
const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
const propsPath = path.join(root, 'out', `${episodeId}.props.json`);
const outputPath = path.join(root, 'out', `${episodeId}-cover.png`);
fs.mkdirSync(path.dirname(outputPath), {recursive: true});
fs.writeFileSync(propsPath, JSON.stringify({manifest}, null, 2));
const assets = spawnSync(process.execPath, ['scripts/generate-audio.mjs', episodeId], {cwd: root, stdio: 'inherit'});
if (assets.status !== 0) process.exit(assets.status ?? 1);
const result = spawnSync(process.platform === 'win32' ? 'npx.cmd' : 'npx', ['remotion', 'still', 'src/index.ts', 'VerticalEpisode', outputPath, `--props=${propsPath}`, '--frame=75'], {cwd: root, stdio: 'inherit'});
process.exit(result.status ?? 1);
