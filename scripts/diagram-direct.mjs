// Direct a diagram episode (#129): every scene gets the actions that show what
// its narration says, timed to its words, chosen by the director model from the
// elements the diagram defines.
//   npm run diagram:direct -- azure-cache-aside             ask the model, write out/<show>/<id>/<id>.diagram-directed.json
//   npm run diagram:direct -- azure-cache-aside --write     replace the draft's actions
//   npm run diagram:direct -- azure-cache-aside --reply=f   use a saved reply instead of a model
//   npm run diagram:direct -- azure-cache-aside --offline   no model: every scene gets the fallback
//   --provider=<name>  the director's provider (default: DIRECTOR_* / CHECKER_* / WRITER_* settings)
//   --save-reply=<file>  keep the model's reply, e.g. as a test fixture
// Scenes whose actions break a rule get the deterministic fallback and are listed.
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {directDiagram} from './lib/diagram-director.mjs';
import {createCompletion} from './lib/llm.mjs';
import {appendProduction, modelEntry} from './lib/production.mjs';
import {findDraft} from './catalog.mjs';
import {episodeOutPath} from './lib/out.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const option = (name) => args.find((arg) => arg.startsWith(`--${name}=`))?.slice(name.length + 3);
const target = args.find((arg) => !arg.startsWith('--'));
if (!target || !/^([a-z0-9-]+\/)?[a-z0-9-]+$/.test(target)) {
  console.error('Usage: npm run diagram:direct -- [<show>/]<episode id> [--write] [--reply=<file> | --offline] [--provider=<name>] [--save-reply=<file>]');
  process.exit(1);
}
const episodeId = target.split('/').at(-1);
const showId = target.includes('/') ? target.split('/')[0] : findDraft(episodeId)?.showId;
if (!showId) { console.error(`✗ no draft named ${episodeId} in drafts/.`); process.exit(1); }
const draftPath = path.join(root, 'drafts', showId, `${episodeId}.json`);
if (!fs.existsSync(draftPath)) { console.error(`✗ ${path.relative(root, draftPath)} doesn't exist.`); process.exit(1); }

const reply = option('reply');
const saveReply = option('save-reply');
let complete;
if (reply) complete = async () => fs.readFileSync(path.resolve(reply), 'utf8');
else if (!args.includes('--offline')) {
  const model = createCompletion({role: 'director', provider: option('provider'), onUsage: (usage) => appendProduction(root, showId, episodeId, [modelEntry(usage)])});
  complete = async (prompt) => {
    const text = await model(prompt);
    if (saveReply) fs.writeFileSync(path.resolve(saveReply), text.endsWith('\n') ? text : `${text}\n`);
    return text;
  };
}
const result = await directDiagram({draft: JSON.parse(fs.readFileSync(draftPath, 'utf8')), complete, showId});

if (result.modelError) console.warn(`! the director model failed (${result.modelError}); every scene uses the fallback.`);
for (const {id, why, repairs = []} of result.assigned) {
  console.log(`  ✓ ${id}: ${why}`);
  for (const repair of repairs) console.log(`      repaired ${repair}`);
}
for (const {id, reason} of result.fallbacks) console.warn(`  ! ${id}: fallback (${reason})`);
const output = args.includes('--write') ? draftPath : episodeOutPath(root, episodeId, `${episodeId}.diagram-directed.json`);
fs.mkdirSync(path.dirname(output), {recursive: true});
fs.writeFileSync(output, `${JSON.stringify(result.draft, null, 2)}\n`);
console.log(`✓ ${result.assigned.length}/${result.draft.scenes.length} scenes directed by the model; wrote ${path.relative(root, output)}`);
