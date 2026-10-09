// Write the script of an architecture walkthrough (#128) from its diagram, then
// time the picture to it with the Diagram Director (#129).
//   npm run diagram:write -- url-shortener                   write out/<show>/<id>/<id>.walkthrough.json
//   npm run diagram:write -- url-shortener --write           replace the draft's script and actions
//   --notes=<file>     facts the diagram doesn't show, and their sources: {"facts": [...], "sources": [{"label", "url"}]}
//   --save-replies=<dir>  keep each model's replies (writer, critic, director), e.g. as test fixtures
//   --attempts=<n>     revisions allowed (default 3)
// The diagram (and the notes) are the only facts the script may state. Start
// from an imported diagram: npm run diagram:import -- <file.drawio> --id <id>.
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createCompletion} from './lib/llm.mjs';
import {appendProduction, modelEntry} from './lib/production.mjs';
import {writeWalkthrough} from './lib/walkthrough-writer.mjs';
import {findDraft} from './catalog.mjs';
import {episodeOutPath} from './lib/out.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const option = (name) => args.find((arg) => arg.startsWith(`--${name}=`))?.slice(name.length + 3);
const target = args.find((arg) => !arg.startsWith('--'));
if (!target || !/^([a-z0-9-]+\/)?[a-z0-9-]+$/.test(target)) {
  console.error('Usage: npm run diagram:write -- [<show>/]<episode id> [--write] [--notes=<file>] [--save-replies=<dir>] [--attempts=<n>]');
  process.exit(1);
}
const episodeId = target.split('/').at(-1);
const showId = target.includes('/') ? target.split('/')[0] : findDraft(episodeId)?.showId;
if (!showId) { console.error(`✗ no draft named ${episodeId} in drafts/.`); process.exit(1); }
const draftPath = path.join(root, 'drafts', showId, `${episodeId}.json`);
if (!fs.existsSync(draftPath)) { console.error(`✗ ${path.relative(root, draftPath)} doesn't exist.`); process.exit(1); }
const notesPath = option('notes');
const notes = notesPath ? JSON.parse(fs.readFileSync(path.resolve(notesPath), 'utf8')) : {};

const saveDir = option('save-replies');
if (saveDir) fs.mkdirSync(path.resolve(saveDir), {recursive: true});
const counts = {};
const model = (role) => {
  const complete = createCompletion({role, onUsage: (usage) => appendProduction(root, showId, episodeId, [modelEntry(usage)])});
  return async (prompt) => {
    const text = await complete(prompt);
    if (saveDir) {
      counts[role] = (counts[role] ?? 0) + 1;
      fs.writeFileSync(path.join(path.resolve(saveDir), `${episodeId}.${role}-${counts[role]}.json`), text.endsWith('\n') ? text : `${text}\n`);
    }
    return text;
  };
};

const result = await writeWalkthrough({
  draft: JSON.parse(fs.readFileSync(draftPath, 'utf8')),
  notes,
  complete: model('writer'),
  critique: model('critic'),
  direct: model('director'),
  showId,
  maxAttempts: Number(option('attempts') ?? 3),
  onAttempt: ({attempt, problems, review}) => {
    console.log(`attempt ${attempt}: ${problems.length ? `${problems.length} problem(s)` : 'passed'}${review?.score !== undefined ? `, story ${review.score}/100` : ''}`);
    for (const problem of problems) console.log(`    - ${problem}`);
  },
});

for (const scene of result.draft.scenes) console.log(`  ${scene.id.padEnd(12)} ${scene.narration}`);
console.log(`✓ engagement ${result.audit.score}/100; story ${result.review.score ?? 'not judged'}/100${result.belowBar ? ' (below the bar: review it)' : ''}; ${result.direction.assigned.length}/${result.draft.scenes.length} scenes directed by the model`);
for (const {id, reason} of result.direction.fallbacks) console.warn(`  ! ${id}: fallback actions (${reason})`);
const output = args.includes('--write') ? draftPath : episodeOutPath(root, episodeId, `${episodeId}.walkthrough.json`);
fs.mkdirSync(path.dirname(output), {recursive: true});
fs.writeFileSync(output, `${JSON.stringify(result.draft, null, 2)}\n`);
console.log(`✓ wrote ${path.relative(root, output)}`);
