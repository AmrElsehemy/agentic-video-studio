// Import a draw.io architecture diagram as a walkthrough draft (#120).
//
//   npm run diagram:import -- path/to/system.drawio --id my-system [--title "My System"]
//     [--show under-the-hood] [--page "Page-1" | --page 0] [--look clean|sketch] [--force]
//   npm run diagram:import -- path/to/system.drawio --spec-only   (print the spec, write nothing)
//
// Writes drafts/<show>/<id>.json (a starter walkthrough that compiles) and any
// SVG icons embedded in the file under public/icons/drawio/, then reports what
// it found and every guess it made. Rewrite the narration, then compile.
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {archProblems, archSpecSchema} from './diagram-arch-schema.mjs';
import {importDrawio} from './lib/drawio.mjs';
import {starterDraft} from './lib/drawio-draft.mjs';
import {loadShow} from './lib/shows.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const option = (name) => {
  const inline = args.find((arg) => arg.startsWith(`--${name}=`));
  if (inline) return inline.slice(name.length + 3);
  const at = args.indexOf(`--${name}`);
  return at >= 0 ? args[at + 1] : undefined;
};
// The file is the one argument that is neither a flag nor a flag's value.
const VALUED = ['id', 'title', 'show', 'page', 'look'];
const file = args.find((arg, i) => !arg.startsWith('--') && !(i > 0 && VALUED.includes(args[i - 1].replace(/^--/, ''))));
if (!file || !fs.existsSync(file)) {
  console.error('Usage: npm run diagram:import -- <file.drawio> --id <episode-id> [--title "..."] [--show <show-id>] [--page <name|index>] [--look clean|sketch] [--force] [--spec-only]');
  process.exit(1);
}

const look = option('look') ?? 'clean';
const {spec, assets, report} = importDrawio(fs.readFileSync(file, 'utf8'), {page: option('page'), look, file: path.basename(file)});
const parsed = archSpecSchema.safeParse(spec);
if (!parsed.success) {
  console.error(`✗ The imported diagram doesn't fit the architecture spec:\n${parsed.error.issues.map((issue) => `- ${issue.path.join('.')}: ${issue.message}`).join('\n')}`);
  process.exit(1);
}
const problems = archProblems(parsed.data);

console.log(`✓ ${path.basename(file)}, page "${report.page}"${report.pages.length > 1 ? ` (of ${report.pages.join(', ')})` : ''}: ${report.nodes} components, ${report.groups} boundaries, ${report.edges} routes, ${report.steps} numbered steps, ${report.legend} legend entries, ${report.labels} free labels`);
for (const guess of report.guesses) console.log(`⚠ ${guess}`);
for (const icon of [...new Set(report.unmappedIcons)]) console.log(`⚠ no icon for ${icon}: drew the generic one; add it under public/icons/ and map it in scripts/lib/drawio.mjs (AZURE_ICONS)`);
for (const problem of problems) console.log(`✗ ${problem}`);
if (problems.length) process.exit(1);

if (args.includes('--spec-only')) {
  process.stdout.write(`${JSON.stringify(parsed.data, null, 2)}\n`);
  process.exit(0);
}

const id = option('id');
if (!id || !/^[a-z0-9-]+$/.test(id)) {
  console.error('✗ Give the episode an id: --id my-system (lowercase words joined by hyphens).');
  process.exit(1);
}
const show = loadShow(option('show') ?? 'under-the-hood');
const draftPath = path.join(root, 'drafts', show.id, `${id}.json`);
if (fs.existsSync(draftPath) && !args.includes('--force')) {
  console.error(`✗ ${path.relative(root, draftPath)} already exists; pass --force to replace it.`);
  process.exit(1);
}
const title = option('title') ?? id.split('-').map((word) => word.charAt(0).toUpperCase() + word.slice(1)).join(' ');
for (const [asset, svg] of Object.entries(assets)) {
  const target = path.join(root, 'public', asset);
  fs.mkdirSync(path.dirname(target), {recursive: true});
  fs.writeFileSync(target, svg);
  console.log(`✓ saved embedded icon public/${asset}`);
}
const draft = starterDraft({id, title, show: {id: show.id, name: show.name, handle: show.handle}, spec: parsed.data, file: path.basename(file)});
fs.mkdirSync(path.dirname(draftPath), {recursive: true});
fs.writeFileSync(draftPath, `${JSON.stringify(draft, null, 2)}\n`);
console.log(`✓ wrote ${path.relative(root, draftPath)}: ${draft.scenes.length} scenes (${draft.scenes.map((scene) => scene.id).join(', ')})`);
console.log('Next: rewrite each scene\'s narration and anchor actions to its words, replace the placeholder sources, then npm run episode:compile -- ' + id);
