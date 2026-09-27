import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {PASSING_SCORE, scoreEpisode} from './lib/engagement.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const requested = process.argv[2];
const manifests = [];
const walk = (directory) => {
  for (const entry of fs.readdirSync(directory, {withFileTypes: true})) {
    const target = path.join(directory, entry.name);
    if (entry.isDirectory()) walk(target);
    else if (entry.name === 'video.json') manifests.push(target);
  }
};
walk(path.join(root, 'videos'));

for (const manifestPath of manifests) {
  const video = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  if (requested && video.id !== requested) continue;

  const {pattern, score, passed, checks} = scoreEpisode(video);
  console.log(`\n${video.id} [${pattern}] — engagement score ${score}/100`);
  for (const check of checks) console.log(`${check.passed ? '✓' : '✗'} ${check.label} (${check.points})`);
  if (!passed) {
    console.error(`\nRejected: ${video.id} must score at least ${PASSING_SCORE}/100 before rendering.`);
    process.exitCode = 1;
  } else {
    console.log(`\nDirector approved: ${video.direction.premise}`);
  }
}
