// The YouTube description for an episode, as the upload will publish it:
//   npm run description -- <episode-id>   writes out/<show>/<id>/<id>-description.txt
import fs from 'node:fs';
import path from 'node:path';
import {findManifest, resolveEpisodeId} from './catalog.mjs';
import {episodeDescription} from './lib/description.mjs';
import {loadShow} from './lib/shows.mjs';
import {episodeOutPath} from './lib/out.mjs';

const episodeId = resolveEpisodeId(process.argv[2] ?? 'bulbasaur-001');
const {root, manifestPath} = findManifest(episodeId);
const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
const outputPath = episodeOutPath(root, episodeId, `${episodeId}-description.txt`);
fs.mkdirSync(path.dirname(outputPath), {recursive: true});
fs.writeFileSync(outputPath, `${episodeDescription(manifest, loadShow(manifest.show.id))}\n`);
console.log(`✓ description: ${path.relative(root, outputPath)}`);
