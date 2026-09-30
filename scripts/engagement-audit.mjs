import fs from 'node:fs';
import {PASSING_SCORE, scoreEpisode} from './lib/engagement.mjs';
import {listManifests, resolveEpisodeId} from './catalog.mjs';

const requested = process.argv[2] && resolveEpisodeId(process.argv[2]);
const manifests = listManifests();

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
