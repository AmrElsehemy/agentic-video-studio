import assert from 'node:assert/strict';
import {describe, it} from 'node:test';
import {createCompletion} from '../scripts/lib/llm.mjs';
import {fetchWithReason, networkError} from '../scripts/lib/net.mjs';

/** What Node's fetch throws: a bare "fetch failed" with the real reason in `cause`. */
const fetchFailed = (code: string, message = `${code} message`) => Object.assign(new TypeError('fetch failed'), {cause: Object.assign(new Error(message), {code})});
const failingFetch = (error: unknown) => (async () => { throw error; }) as unknown as typeof fetch;

describe('network errors', () => {
  it('names the service, the host, the underlying reason and what to check', () => {
    const error = networkError('PokéAPI', 'https://pokeapi.co/api/v2/pokemon-species/800', fetchFailed('ENOTFOUND', 'getaddrinfo ENOTFOUND pokeapi.co'));
    assert.equal(error.message, 'PokéAPI request to https://pokeapi.co failed (ENOTFOUND: getaddrinfo ENOTFOUND pokeapi.co): the host name could not be resolved: check your internet connection or DNS.');
    assert.equal((error.cause as Error).message, 'fetch failed');
  });

  it('explains TLS interception by a corporate proxy', () => {
    assert.match(networkError('OpenAI', 'https://api.openai.com/v1/x', fetchFailed('UNABLE_TO_GET_ISSUER_CERT_LOCALLY')).message, /NODE_EXTRA_CA_CERTS/);
  });

  it('falls back to a general hint for unknown causes', () => {
    assert.match(networkError('PokéAPI', 'https://pokeapi.co/x', new TypeError('fetch failed')).message, /failed \(fetch failed\): (check your internet connection|HTTPS_PROXY is set)/);
  });

  it('wraps fetch failures and passes responses through', async () => {
    await assert.rejects(fetchWithReason('PokéAPI', 'https://pokeapi.co/x', undefined, failingFetch(fetchFailed('ECONNRESET'))), /PokéAPI request to https:\/\/pokeapi\.co failed \(ECONNRESET/);
    const ok = await fetchWithReason('PokéAPI', 'https://pokeapi.co/x', undefined, (async () => new Response('{}')) as unknown as typeof fetch);
    assert.equal(ok.status, 200);
  });

  it('model requests report network failures the same way', async () => {
    const complete = createCompletion({provider: 'openai', apiKey: 'k', env: {}, fetchImpl: failingFetch(fetchFailed('ETIMEDOUT'))});
    await assert.rejects(complete({system: 's', messages: [{role: 'user', content: 'hi'}]}), /OpenAI request to https:\/\/api\.openai\.com failed \(ETIMEDOUT/);
  });
});
