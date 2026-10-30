import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {describe, it} from 'node:test';
import {LOGIN_WARN_DAYS, loginAgeDays} from '../scripts/lib/youtube.mjs';

describe('youtube login age', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'yt-age-'));
  fs.mkdirSync(path.join(root, '.secrets'));
  const day = 86_400_000;
  const now = Date.UTC(2026, 9, 30);

  it('counts days since the login was granted', () => {
    fs.writeFileSync(path.join(root, '.secrets', 'youtube-token-geographica.json'), JSON.stringify({granted_at: now - 6 * day}));
    assert.equal(loginAgeDays(root, 'geographica', now), 6);
    assert.ok(6 >= LOGIN_WARN_DAYS);
  });

  it('is unknown for a login made before dates were recorded, or when there is none', () => {
    fs.writeFileSync(path.join(root, '.secrets', 'youtube-token-old.json'), JSON.stringify({refresh_token: 'x'}));
    assert.equal(loginAgeDays(root, 'old', now), undefined);
    assert.equal(loginAgeDays(root, 'nobody', now), undefined);
  });
});
