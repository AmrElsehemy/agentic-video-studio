import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {describe, it} from 'node:test';
import {loadSecrets, parseEnvFile} from '../scripts/lib/secrets.mjs';

const project = (files: Record<string, string>, mode = 0o600) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'secrets-'));
  fs.mkdirSync(path.join(root, '.secrets'));
  for (const [name, text] of Object.entries(files)) fs.writeFileSync(path.join(root, '.secrets', name), text, {mode});
  return root;
};
const untracked = () => false;

describe('secrets loader', () => {
  it('reads keys from .secrets/*.env, quoted or not, without overriding the environment', () => {
    const root = project({'openai.env': 'OPENAI_API_KEY="sk-one"\n', 'voice.env': '# eleven\nexport ELEVENLABS_API_KEY=sk-two\n'});
    const env: Record<string, string | undefined> = {ELEVENLABS_API_KEY: 'already'};
    assert.deepEqual(loadSecrets({root, env, tracked: untracked}), ['OPENAI_API_KEY']);
    assert.equal(env.OPENAI_API_KEY, 'sk-one');
    assert.equal(env.ELEVENLABS_API_KEY, 'already');
  });

  it('does nothing without a .secrets folder', () => {
    assert.deepEqual(loadSecrets({root: fs.mkdtempSync(path.join(os.tmpdir(), 'none-')), env: {}, tracked: untracked}), []);
  });

  it('refuses a file other users can read, or one git tracks', () => {
    assert.throws(() => loadSecrets({root: project({'a.env': 'OPENAI_API_KEY=x'}, 0o644), env: {}, tracked: untracked}), /chmod 600/);
    assert.throws(() => loadSecrets({root: project({'a.env': 'OPENAI_API_KEY=x'}), env: {}, tracked: () => true}), /tracked by git/);
  });

  it('rejects malformed lines without echoing the value', () => {
    assert.throws(() => parseEnvFile('OPENAI_API_KEY=sk-abc def', 'f'), (error: Error) => /line 1/.test(error.message) && !error.message.includes('sk-abc'));
    assert.throws(() => parseEnvFile('NOT_A_KEY=1', 'f'), /isn't a key/);
    assert.throws(() => parseEnvFile('just words', 'f'), /KEY=value/);
  });
});
