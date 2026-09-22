import fs from 'node:fs';
import {findManifest} from './catalog.mjs';
import {videoSchema} from '../src/schema';

const episodeId = process.argv[2] ?? 'bulbasaur-001';
const {manifestPath} = findManifest(episodeId);
const manifest = videoSchema.parse(JSON.parse(fs.readFileSync(manifestPath, 'utf8')));
const blockers = manifest.rights.assets.filter((asset) => !asset.publicReleaseApproved || !['owned', 'licensed'].includes(asset.licenseStatus));

if (!manifest.rights.publicReleaseApproved) blockers.unshift({kind: 'episode', sourceUrl: manifest.sources[0].url, owner: 'release owner', licenseStatus: 'permission-required', publicReleaseApproved: false, notes: 'Episode-level public release has not been approved.'});
if (manifest.rights.releaseStatus !== 'cleared') blockers.unshift({kind: 'release-status', sourceUrl: manifest.sources[0].url, owner: 'release owner', licenseStatus: 'permission-required', publicReleaseApproved: false, notes: `Status is ${manifest.rights.releaseStatus}, not cleared.`});

if (blockers.length > 0) {
  console.error(`✗ ${episodeId} is NOT cleared for public release:`);
  for (const blocker of blockers) console.error(`  - ${blocker.kind}: ${blocker.notes ?? blocker.licenseStatus}`);
  process.exit(1);
}
console.log(`✓ ${episodeId} is cleared for public release.`);
