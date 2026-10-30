// Is each show's YouTube login still good, and how long until Google expires it?
// Usage: npm run youtube:check            (every show with a stored login)
//        npm run youtube:check -- geographica
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {LOGIN_WARN_DAYS, loginAgeDays, refreshAccessToken, tokenPath} from './lib/youtube.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const asked = process.argv.slice(2).filter((arg) => !arg.startsWith('-'));
const shows = asked.length ? asked : fs.readdirSync(path.join(root, 'shows')).filter((name) => name.endsWith('.json')).map((name) => name.replace(/\.json$/, '')).filter((id) => fs.existsSync(tokenPath(root, id)));

let bad = 0;
for (const show of shows) {
  const age = loginAgeDays(root, show);
  const ageText = age === undefined ? 'age unknown (made before logins were dated)' : `${age.toFixed(1)} days old`;
  try {
    const file = tokenPath(root, show);
    await refreshAccessToken(root, JSON.parse(fs.readFileSync(file, 'utf8')), {show});
    const warn = age !== undefined && age >= LOGIN_WARN_DAYS;
    console.log(`${warn ? '⚠' : '✓'} ${show}: login works, ${ageText}${warn ? `. Testing-mode logins expire at 7 days: run npm run youtube:auth -- --show=${show} soon.` : ''}`);
  } catch (error) {
    bad++;
    console.log(`✗ ${show}: ${error instanceof Error ? error.message : error}. Run: npm run youtube:auth -- --show=${show}`);
  }
}
if (!shows.length) console.log('No stored YouTube logins found.');
process.exit(bad ? 1 : 0);
