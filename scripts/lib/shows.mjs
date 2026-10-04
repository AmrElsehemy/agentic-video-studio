// Show profiles live in shows/<id>.json.
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {archetypes} from '../archetypes.mjs';
import {showSchema} from '../show-schema.mjs';

const defaultDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', 'shows');
const cache = new Map();

/** Validate a show profile, including that every story shape it lists exists. */
export const parseShow = (raw, source = 'show profile') => {
  const result = showSchema.safeParse(raw);
  if (!result.success) throw new Error(`Invalid ${source}: ${result.error.issues.map((issue) => `${issue.path.join('.') || 'show'} ${issue.message}`).join('; ')}`);
  const unknown = result.data.archetypes.filter((name) => !(name in archetypes));
  if (unknown.length) throw new Error(`Invalid ${source}: unknown story shape${unknown.length > 1 ? 's' : ''} ${unknown.join(', ')}. Supported: ${Object.keys(archetypes).join(', ')}.`);
  return result.data;
};

/**
 * A show's style guide, shows/<id>.style.md (#92): its visual rules, voice and
 * formats, read by the agents that write and direct its episodes. Empty when a
 * show has none.
 */
export const loadStyleGuide = (showId, {dir = defaultDir} = {}) => {
  const file = path.join(dir, `${showId}.style.md`);
  return fs.existsSync(file) ? fs.readFileSync(file, 'utf8').trim() : '';
};

/** The style guide as a prompt section, or nothing when the show has none. */
export const styleGuideSection = (showId, options) => {
  const guide = loadStyleGuide(showId, options);
  return guide ? `\n\n# Show style guide (shows/${showId}.style.md)\nFollow it for tone, visuals and formats; the rules and hard limits in these instructions win where they're stricter.\n\n${guide}` : '';
};

/** Load shows/<id>.json (cached per folder). */
export const loadShow = (showId, {dir = defaultDir} = {}) => {
  const key = path.join(dir, `${showId}.json`);
  if (!cache.has(key)) {
    if (!fs.existsSync(key)) throw new Error(`No show profile for "${showId}": create shows/${showId}.json (see shows/README.md).`);
    const show = parseShow(JSON.parse(fs.readFileSync(key, 'utf8')), `shows/${showId}.json`);
    if (show.id !== showId) throw new Error(`shows/${showId}.json has id "${show.id}"; the file name and id must match.`);
    cache.set(key, show);
  }
  return cache.get(key);
};
