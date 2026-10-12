// API keys from .secrets/*.env (git-ignored), so a key never has to be typed into a command or pasted into a chat.
// One KEY=value per line; a key already set in the environment wins. Values are never printed.
import fs from 'node:fs';
import path from 'node:path';
import {spawnSync} from 'node:child_process';

export const SECRET_KEYS = ['OPENAI_API_KEY', 'ELEVENLABS_API_KEY', 'ANTHROPIC_API_KEY'];

const gitTracks = (root, file) => spawnSync('git', ['ls-files', '--error-unmatch', file], {cwd: root, stdio: 'ignore'}).status === 0;

/** Parse the text of an env file into {KEY: value}; throws, naming the line but never the value, on anything malformed. */
export const parseEnvFile = (text, name = '.env') => {
  const found = {};
  text.split(/\r?\n/).forEach((raw, index) => {
    const line = raw.trim();
    if (!line || line.startsWith('#')) return;
    const match = /^(?:export\s+)?([A-Z][A-Z0-9_]*)\s*=\s*(.*)$/.exec(line);
    if (!match) throw new Error(`${name} line ${index + 1} isn't KEY=value.`);
    const value = match[2].replace(/^(['"])(.*)\1$/, '$2');
    if (!SECRET_KEYS.includes(match[1])) throw new Error(`${name} line ${index + 1}: ${match[1]} isn't a key this project reads (${SECRET_KEYS.join(', ')}).`);
    if (!value || /\s/.test(value)) throw new Error(`${name} line ${index + 1}: the value for ${match[1]} is empty or contains a space or line break. Put the whole key on one line.`);
    found[match[1]] = value;
  });
  return found;
};

/**
 * Load every .secrets/*.env into `env` (only keys not already set). Refuses a file other users can read or one git tracks.
 * Returns the names of the keys it set.
 */
export const loadSecrets = ({root, env = process.env, tracked = gitTracks} = {}) => {
  const dir = path.join(root, '.secrets');
  if (!fs.existsSync(dir)) return [];
  const set = [];
  for (const name of fs.readdirSync(dir).filter((file) => file.endsWith('.env')).sort()) {
    const file = path.join(dir, name);
    if (fs.statSync(file).mode & 0o077) throw new Error(`.secrets/${name} is readable by other users. Run: chmod 600 .secrets/${name}`);
    if (tracked(root, path.join('.secrets', name))) throw new Error(`.secrets/${name} is tracked by git. Remove it from git (git rm --cached) and rotate the key it holds.`);
    for (const [key, value] of Object.entries(parseEnvFile(fs.readFileSync(file, 'utf8'), `.secrets/${name}`))) {
      if (env[key] === undefined || env[key] === '') { env[key] = value; set.push(key); }
    }
  }
  return set;
};
