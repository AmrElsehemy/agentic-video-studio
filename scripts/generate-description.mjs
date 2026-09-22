import fs from 'node:fs';
import path from 'node:path';
import {findManifest} from './catalog.mjs';

const episodeId = process.argv[2] ?? 'bulbasaur-001';
const {root, manifestPath} = findManifest(episodeId);
const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
const outputPath = path.join(root, 'out', `${episodeId}-description.txt`);
const sources = manifest.sources.map((source) => `- ${source.label}: ${source.url}`).join('\n');
const aiDisclosure = manifest.audio.voice ? '\nNarration: AI-generated voice.' : '';
const body = `${manifest.title}\n\n${manifest.rights.nonAffiliationNotice}\n${manifest.rights.ownershipNotice}${aiDisclosure}\n\nSources:\n${sources}\n`;
fs.mkdirSync(path.dirname(outputPath), {recursive: true});
fs.writeFileSync(outputPath, body);
console.log(`✓ description: ${path.relative(root, outputPath)}`);
