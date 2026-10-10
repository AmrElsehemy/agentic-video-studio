// Photographs from Wikimedia Commons, with their credit.
//   npm run photos -- search <words...>          list likely files with their licences (usable ones first)
//   npm run photos -- add <slug> "<File:Name.jpg>" [--caption="..."]   download one (it must be public domain, CC0 or CC BY) into public/photos/
//   npm run photos -- verify                     check the files and their credits (no network)
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {fetchWithReason} from './lib/net.mjs';
import {sha256} from './lib/geo-data.mjs';
import {COMMONS_API, USER_AGENT, attributionLine, describeFile, refusal, screenCredit} from './lib/photos.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dir = path.join(root, 'public', 'photos');
const indexPath = path.join(dir, 'index.json');
const [command, ...rest] = process.argv.slice(2);
const words = rest.filter((arg) => !arg.startsWith('--'));
const option = (name) => rest.find((arg) => arg.startsWith(`--${name}=`))?.slice(name.length + 3);

const api = async (params) => {
  const url = `${COMMONS_API}?${new URLSearchParams({format: 'json', ...params})}`;
  for (let attempt = 0; attempt < 4; attempt++) {
    const response = await fetchWithReason('Wikimedia Commons', url, {headers: {'user-agent': USER_AGENT}});
    if (response.ok) return response.json();
    await new Promise((resolve) => setTimeout(resolve, 2000 * (attempt + 1)));
  }
  throw new Error(`Wikimedia Commons would not answer for ${url}`);
};
const infoParams = {prop: 'imageinfo', iiprop: 'url|size|mime|extmetadata', iiurlwidth: '1600'};

const readIndex = () => (fs.existsSync(indexPath) ? JSON.parse(fs.readFileSync(indexPath, 'utf8')) : {source: 'Wikimedia Commons', photos: {}});

if (command === 'search') {
  const reply = await api({action: 'query', generator: 'search', gsrsearch: `filetype:bitmap ${words.join(' ')}`, gsrnamespace: '6', gsrlimit: '24', ...infoParams, iiurlwidth: '320'});
  const files = Object.values(reply.query?.pages ?? {}).map(describeFile).filter((file) => /jpe?g|png/.test(file.mime) && file.originalWidth >= 1400);
  files.sort((a, b) => Number(Boolean(b.kind)) - Number(Boolean(a.kind)));
  for (const file of files) console.log(`${file.kind ? '✓' : '✗'} ${file.title} · ${file.originalWidth}x${file.originalHeight} · ${file.license} · ${file.author.slice(0, 40)}${file.kind ? '' : ` — ${refusal(file.license)}`}`);
} else if (command === 'add') {
  const [slug, title] = words;
  if (!/^[a-z0-9-]+$/.test(slug ?? '') || !title) throw new Error('Usage: npm run photos -- add <slug> "File:Name.jpg" [--caption="..."]');
  const reply = await api({action: 'query', titles: title, ...infoParams});
  const file = describeFile(Object.values(reply.query.pages)[0]);
  if (!file.kind) throw new Error(`${file.title}: ${refusal(file.license)}.`);
  if (!file.author) throw new Error(`${file.title} names no author; a photo is only used with its credit.`);
  const response = await fetchWithReason('Wikimedia Commons', file.imageUrl, {headers: {'user-agent': USER_AGENT}});
  if (!response.ok) throw new Error(`Download failed (${response.status}) for ${file.imageUrl}`);
  const bytes = Buffer.from(await response.arrayBuffer());
  fs.mkdirSync(dir, {recursive: true});
  fs.writeFileSync(path.join(dir, `${slug}.jpg`), bytes);
  const index = readIndex();
  index.photos[slug] = {
    title: file.title, pageUrl: file.pageUrl, author: file.author, license: file.license, licenseUrl: file.licenseUrl, kind: file.kind,
    width: file.width, height: file.height, caption: option('caption') ?? file.description.slice(0, 140), attribution: attributionLine(file), screenCredit: screenCredit(file), sha256: sha256(bytes),
  };
  fs.writeFileSync(indexPath, `${JSON.stringify(index, null, 1)}\n`);
  console.log(`✓ ${slug}: ${file.title} (${file.license}, ${file.author}) → public/photos/${slug}.jpg ${(bytes.length / 1024).toFixed(0)} KB\n  ${attributionLine(file)}`);
} else if (command === 'verify') {
  const index = readIndex();
  const problems = [];
  for (const [slug, photo] of Object.entries(index.photos)) {
    const file = path.join(dir, `${slug}.jpg`);
    if (!fs.existsSync(file)) problems.push(`${slug}.jpg is missing`);
    else if (sha256(fs.readFileSync(file)) !== photo.sha256) problems.push(`${slug}.jpg doesn't match its checksum`);
    if (!photo.author || !photo.license || !photo.pageUrl) problems.push(`${slug} has no complete credit`);
  }
  if (problems.length) {console.error(`✗ photos:\n${problems.map((problem) => `  - ${problem}`).join('\n')}`); process.exit(1);}
  console.log(`✓ photos match their index (${Object.keys(index.photos).length})`);
} else {
  throw new Error('Usage: npm run photos -- search <words> | add <slug> "<File:Name>" | verify');
}
