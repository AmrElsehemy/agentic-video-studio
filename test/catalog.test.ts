import assert from 'node:assert/strict';
import {describe, it} from 'node:test';
import {episodeIds, resolveEpisodeId} from '../scripts/catalog.mjs';

const ids = ['bulbasaur-001', 'charmander-004', 'terapagos-1024', 'mew-151', 'mewtwo-150'];

describe('episode ids', () => {
  it('accepts a Pokédex number in any usual spelling', () => {
    for (const value of ['4', '004', '#4', '#004']) assert.equal(resolveEpisodeId(value, ids), 'charmander-004', value);
    assert.equal(resolveEpisodeId('1024', ids), 'terapagos-1024');
    assert.equal(resolveEpisodeId('150', ids), 'mewtwo-150', 'does not confuse #150 with #151');
  });

  it('leaves full ids alone', () => {
    assert.equal(resolveEpisodeId('charmander-004', ids), 'charmander-004');
    assert.equal(resolveEpisodeId('anything-else', ids), 'anything-else');
  });

  it('explains a number with no episode, or several', () => {
    assert.throws(() => resolveEpisodeId('25', ids), /No episode for Pokédex #25\. Create it with: npm run episode:new -- 25/);
    assert.throws(() => resolveEpisodeId('4', [...ids, 'charmander-mega-004']), /matches several episodes \(charmander-004, charmander-mega-004\)/);
  });

  it('finds the real catalog', () => {
    assert.ok(episodeIds().includes('bulbasaur-001'));
    assert.equal(resolveEpisodeId('1'), 'bulbasaur-001');
  });
});
