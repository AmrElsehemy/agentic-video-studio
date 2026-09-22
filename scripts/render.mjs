import {spawnSync} from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import {findManifest} from './catalog.mjs';

const episodeId = process.argv[2] ?? 'bulbasaur-001';
const {root, manifestPath} = findManifest(episodeId);
const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
const propsPath = path.join(root, 'out', `${episodeId}.props.json`);
const outputPath = path.join(root, 'out', `${episodeId}.mp4`);
fs.mkdirSync(path.dirname(outputPath), {recursive: true});

const assets = spawnSync(process.execPath, ['scripts/generate-audio.mjs', episodeId], {cwd: root, stdio: 'inherit'});
if (assets.status !== 0) process.exit(assets.status ?? 1);

const generatedVoice = manifest.audio.voice?.output;
if (generatedVoice && fs.existsSync(path.join(root, 'public', generatedVoice))) {
  manifest.audio.voiceover = generatedVoice;
  console.log(`✓ narration: public/${generatedVoice}`);
} else if (manifest.audio.voice) {
  console.log(`ℹ narration not generated; run: npm run voice -- ${episodeId}`);
}
fs.writeFileSync(propsPath, JSON.stringify({manifest}, null, 2));

const renderArgs = ['remotion', 'render', 'src/index.ts', 'VerticalEpisode', outputPath, `--props=${propsPath}`, '--codec=h264', '--crf=18', '--pixel-format=yuv420p'];
if (process.env.REMOTION_BROWSER_EXECUTABLE) {
  renderArgs.push(`--browser-executable=${process.env.REMOTION_BROWSER_EXECUTABLE}`);
}

const result = spawnSync(
  process.platform === 'win32' ? 'npx.cmd' : 'npx',
  renderArgs,
  {cwd: root, stdio: 'inherit'},
);
if (result.status !== 0) process.exit(result.status ?? 1);
const qa = spawnSync(process.execPath, ['scripts/qa.mjs', outputPath, manifestPath], {cwd: root, stdio: 'inherit'});
process.exit(qa.status ?? 1);
