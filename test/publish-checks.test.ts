import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {describe, it} from 'node:test';
import {fileURLToPath} from 'node:url';
import {loadGeoData} from '../scripts/lib/geo-primitives.mjs';
import {publishBlockers} from '../scripts/lib/publish-checks.mjs';
import {videoSchema, type VideoManifest} from '../src/schema';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const manifestOf = (show: string, id: string) => videoSchema.parse(JSON.parse(fs.readFileSync(path.join(root, 'videos', show, id, 'video.json'), 'utf8')));
const geo = loadGeoData();
const approved = (manifest: VideoManifest): VideoManifest => ({...manifest, rights: {...manifest.rights, releaseStatus: 'cleared', publicReleaseApproved: true}});

describe('publish checks', () => {
  it('blocks the Georgia episode until the release is approved and its borders reviewed', () => {
    const georgia = manifestOf('geographica', 'georgia-wine');
    const blockers = publishBlockers(georgia, geo);
    assert.match(blockers.join('\n'), /release-status: Status is internal-prototype/);
    assert.match(blockers.join('\n'), /borders-review: .*Georgia \(Abkhazia, South Ossetia\)/);
    assert.deepEqual(publishBlockers(approved(georgia), geo).map((blocker) => blocker.split(':')[0]), ['borders-review'], 'approval alone is not enough');
    const reviewed = approved(georgia);
    reviewed.rights = {...reviewed.rights, bordersReview: {reviewer: 'editor', date: '2026-09-30', decision: "Georgia shown within its internationally recognised borders, including Abkhazia and South Ossetia; narration doesn't mention them."}};
    assert.deepEqual(publishBlockers(reviewed, geo), []);
  });

  it('requires the map data credit on map episodes', () => {
    const georgia = approved(manifestOf('geographica', 'georgia-wine'));
    georgia.rights = {...georgia.rights, bordersReview: {reviewer: 'editor', date: '2026-09-30', decision: 'ok'}, assets: georgia.rights.assets.filter((asset) => asset.kind !== 'map-data').concat({kind: 'narration', sourceUrl: 'https://example.com', owner: 'studio', licenseStatus: 'owned', publicReleaseApproved: true})};
    assert.match(publishBlockers(georgia, geo).join('\n'), /map-data: Map scenes need a map-data rights entry/);
  });

  it('keeps blocking PokePulses episodes on their artwork', () => {
    const mew = approved(manifestOf('pokepulses', 'mew-151'));
    assert.match(publishBlockers(mew).join('\n'), /Internal prototype only/);
    assert.doesNotMatch(publishBlockers(mew).join('\n'), /borders-review|map-data/);
  });
});
