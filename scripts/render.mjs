import {spawnSync} from 'node:child_process';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {prepareRenderProps} from './lib/render-props.mjs';
import {resolveEpisodeId} from './catalog.mjs';

const args = process.argv.slice(2);
const episodeId = resolveEpisodeId(args.find((arg) => !arg.startsWith('--')) ?? 'bulbasaur-001');
const voice = args.find((arg) => arg.startsWith('--voice='))?.split('=')[1] ?? process.env.VOICE_PROVIDER ?? 'auto';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
// npm run pipeline has already validated this episode in the same run (its lint stage).
if (process.env.STUDIO_CHECKED !== episodeId) {
  const validation = spawnSync(process.execPath, ['--import', 'tsx', 'scripts/validate.ts', episodeId], {cwd: root, stdio: 'inherit'});
  if (validation.status !== 0) process.exit(validation.status ?? 1);
}

let propsPath;
try {
  ({propsPath} = prepareRenderProps(episodeId, {voice}));
} catch (error) {
  console.error(error.message);
  process.exit(1);
}
const outputPath = path.join(root, 'out', `${episodeId}.mp4`);

const renderArgs = ['remotion', 'render', 'src/index.ts', 'VerticalEpisode', outputPath, `--props=${propsPath}`, '--codec=h264', '--crf=18', '--pixel-format=yuv420p'];
if (process.env.REMOTION_BROWSER_EXECUTABLE) renderArgs.push(`--browser-executable=${process.env.REMOTION_BROWSER_EXECUTABLE}`);

const result = spawnSync(process.platform === 'win32' ? 'npx.cmd' : 'npx', renderArgs, {cwd: root, stdio: 'inherit'});
if (result.status !== 0) process.exit(result.status ?? 1);
const qa = spawnSync(process.execPath, ['scripts/qa.mjs', outputPath, propsPath], {cwd: root, stdio: 'inherit'});
process.exit(qa.status ?? 1);
