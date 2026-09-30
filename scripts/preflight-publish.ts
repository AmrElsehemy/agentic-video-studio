import fs from 'node:fs';
import {findManifest, resolveEpisodeId} from './catalog.mjs';
import {loadGeoData} from './lib/geo-primitives.mjs';
import {publishBlockers} from './lib/publish-checks.mjs';
import {videoSchema} from '../src/schema';

const episodeId = resolveEpisodeId(process.argv[2] ?? 'bulbasaur-001');
const {manifestPath} = findManifest(episodeId);
const manifest = videoSchema.parse(JSON.parse(fs.readFileSync(manifestPath, 'utf8')));
const hasMaps = manifest.scenes.some((scene) => scene.primitive?.kind === 'geo-map');
const blockers = publishBlockers(manifest, hasMaps ? loadGeoData() : undefined);

if (blockers.length > 0) {
  console.error(`✗ ${episodeId} is NOT cleared for public release:`);
  for (const blocker of blockers) console.error(`  - ${blocker}`);
  process.exit(1);
}
console.log(`✓ ${episodeId} passes the publish checks (a person has approved the release).`);
