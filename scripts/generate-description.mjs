import fs from 'node:fs';
import path from 'node:path';
import {findManifest, resolveEpisodeId} from './catalog.mjs';

const episodeId = resolveEpisodeId(process.argv[2] ?? 'bulbasaur-001');
const {root, manifestPath} = findManifest(episodeId);
const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
const outputPath = path.join(root, 'out', `${episodeId}-description.txt`);
const sources = manifest.sources.map((source) => `- ${source.label}: ${source.url}`).join('\n');
// Credits that assets ask for (e.g. map data), from the rights entries.
const credits = manifest.rights.assets.filter((asset) => asset.kind === 'map-data' && asset.notes).map((asset) => `\n${asset.notes}`).join('');
const body = `${manifest.title}\n\n${manifest.rights.nonAffiliationNotice}\n${manifest.rights.ownershipNotice}${credits}\n\nSources:\n${sources}\n`;
fs.mkdirSync(path.dirname(outputPath), {recursive: true});
fs.writeFileSync(outputPath, body);
console.log(`✓ description: ${path.relative(root, outputPath)}`);
