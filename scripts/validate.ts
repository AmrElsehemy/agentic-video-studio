import fs from 'node:fs';
import path from 'node:path';
import {videoSchema} from '../src/schema';

const requested = process.argv[2];
const manifests: string[] = [];
const walk = (directory: string) => {
  for (const entry of fs.readdirSync(directory, {withFileTypes: true})) {
    const target = path.join(directory, entry.name);
    if (entry.isDirectory()) walk(target);
    else if (entry.name === 'video.json') manifests.push(target);
  }
};
walk(path.resolve('videos'));
if (manifests.length === 0) throw new Error('No video manifests found.');

let matched = 0;
for (const manifestPath of manifests) {
  const raw = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  if (requested && raw.id !== requested) continue;
  matched += 1;
  const parsed = videoSchema.parse(raw);
  const seconds = parsed.scenes.reduce((sum, scene) => sum + scene.durationSeconds, 0);
  if (seconds > 60) throw new Error(`${parsed.id} is ${seconds}s; short-form episodes must be 60s or less.`);
  if (new Set(parsed.scenes.map((scene) => scene.id)).size !== parsed.scenes.length) throw new Error(`${parsed.id} has duplicate scene IDs.`);
  console.log(`✓ ${parsed.id}: ${parsed.scenes.length} scenes, ${seconds.toFixed(1)}s`);
}

if (requested && matched === 0) throw new Error(`Unknown episode: ${requested}`);
