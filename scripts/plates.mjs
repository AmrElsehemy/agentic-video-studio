// Plate reconstruction data: where landmasses were in the past, from a published plate-motion model.
//   npm run plates:prepare   download the pinned model, check its checksum, write public/geo/plates.json (commit the result)
//   npm run plates:verify    check public/geo/plates.json against its recorded checksum (no network)
// Options for prepare: --from=<file.zip> reads the model's zip from disk instead of downloading it.
// The model is Müller et al. (2016), "Ocean basin evolution and global-scale plate reorganization events
// since Pangea breakup", Annual Review of Earth and Planetary Sciences (CC BY 4.0).
import {spawnSync} from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {fetchWithReason} from './lib/net.mjs';
import {sha256} from './lib/geo-data.mjs';
import {buildModel, parseRotations, sampleTable} from './lib/plates.mjs';
import {MODEL, PLATES, plateOfCountry} from './lib/plate-model.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const output = path.join(root, 'public', 'geo', 'plates.json');
const args = process.argv.slice(2);
const from = args.find((arg) => arg.startsWith('--from='))?.slice('--from='.length);

const readZipFile = (zip, file) => {
  const result = spawnSync('unzip', ['-p', zip, file], {maxBuffer: 64 * 1024 * 1024});
  if (result.status !== 0) throw new Error(`Could not read ${file} from the model zip (unzip exit ${result.status}).`);
  return result.stdout;
};

const prepare = async () => {
  let zipPath = from && path.resolve(from);
  if (!zipPath) {
    const response = await fetchWithReason('Zenodo', MODEL.url);
    if (!response.ok) throw new Error(`Zenodo download failed (${response.status}) for ${MODEL.url}`);
    zipPath = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'plates-')), 'model.zip');
    fs.writeFileSync(zipPath, Buffer.from(await response.arrayBuffer()));
  }
  const zipHash = sha256(fs.readFileSync(zipPath));
  if (zipHash !== MODEL.zipSha256) throw new Error(`The model zip checksum ${zipHash} doesn't match the pinned ${MODEL.zipSha256}. The source changed; review it before updating MODEL in scripts/plates.mjs.`);
  const rot = readZipFile(zipPath, MODEL.file);
  if (sha256(rot) !== MODEL.fileSha256) throw new Error(`${MODEL.file} doesn't match its pinned checksum.`);

  const model = buildModel(parseRotations(rot.toString('utf8')));
  const ages = Array.from({length: 116}, (_, index) => index * 2);
  const table = sampleTable(model, Object.keys(PLATES).map(Number), ages);

  const entities = JSON.parse(fs.readFileSync(path.join(root, 'public', 'geo', 'entities.json'), 'utf8'));
  const entityPlates = Object.fromEntries(entities.filter((entity) => entity.kind === 'country').flatMap((entity) => {
    const plate = plateOfCountry(entity.id, entity.continent);
    return plate ? [[entity.id, plate]] : [];
  }));

  const contents = {
    source: {name: MODEL.name, citation: MODEL.citation, doi: MODEL.doi, license: MODEL.license, licenseUrl: MODEL.licenseUrl, url: MODEL.url, zipSha256: MODEL.zipSha256, file: MODEL.file, fileSha256: MODEL.fileSha256, attribution: MODEL.attribution},
    plates: PLATES,
    entityPlates,
    table,
  };
  fs.writeFileSync(output, `${JSON.stringify(contents)}\n`);
  console.log(`✓ public/geo/plates.json: ${Object.keys(PLATES).length} plates, ${ages.length} ages (0-${ages.at(-1)} Ma), ${Object.keys(entityPlates).length} countries placed (${(fs.statSync(output).size / 1024).toFixed(0)} KB)`);
};

const verify = () => {
  if (!fs.existsSync(output)) throw new Error('public/geo/plates.json is missing. Run: npm run plates:prepare');
  const contents = JSON.parse(fs.readFileSync(output, 'utf8'));
  if (contents.source.fileSha256 !== MODEL.fileSha256) {
    console.error('✗ public/geo/plates.json was built from a different model than the one pinned in scripts/plates.mjs. Run: npm run plates:prepare');
    process.exit(1);
  }
  console.log(`✓ plates.json matches the pinned model (${contents.source.name}, ${Object.keys(contents.entityPlates).length} countries)`);
};

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  if (args.includes('--verify')) verify();
  else await prepare();
}
