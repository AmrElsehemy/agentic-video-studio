// The music bed and sound effects for an episode, from its compiled manifest:
//   npm run assets -- <episode-id>
// A render builds them itself from the manifest it uses (scripts/lib/render-props.mjs),
// so narration that lengthens a scene moves the cues with it.
import fs from 'node:fs';
import {findManifest, resolveEpisodeId} from './catalog.mjs';
import {writeAudioBed} from './lib/audio-bed.mjs';

const episodeId = resolveEpisodeId(process.argv[2] ?? 'bulbasaur-001');
const {root, manifestPath} = findManifest(episodeId);
writeAudioBed({root, episodeId, manifest: JSON.parse(fs.readFileSync(manifestPath, 'utf8'))});
