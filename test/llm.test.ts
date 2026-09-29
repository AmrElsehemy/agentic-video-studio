import assert from 'node:assert/strict';
import {describe, it} from 'node:test';
import {createCompletion, PROVIDERS, resolveProvider, resolveRole} from '../scripts/lib/llm.mjs';

type Call = {url: string; init: {headers: Record<string, string>; body: string}};

/** A fetch that records the request and returns a recorded API response. */
const recordingFetch = (body: unknown, status = 200) => {
  const calls: Call[] = [];
  const fetchImpl = (async (url: string, init: Call['init']) => {
    calls.push({url, init});
    return new Response(typeof body === 'string' ? body : JSON.stringify(body), {status});
  }) as unknown as typeof fetch;
  return {fetchImpl, calls};
};

const request = {system: 'You write episodes.', messages: [{role: 'user', content: 'Write it.'}]};
const anthropicReply = {content: [{type: 'text', text: '{"title": '}, {type: 'text', text: '"Zacian"}'}], stop_reason: 'end_turn'};
const openaiReply = {choices: [{message: {role: 'assistant', content: '{"title": "Zacian"}'}, finish_reason: 'stop'}]};

describe('provider selection', () => {
  it('uses the explicit provider', () => {
    assert.equal(resolveProvider({provider: 'openai', env: {ANTHROPIC_API_KEY: 'a'}}), 'openai');
  });

  it('falls back to whichever key is set, Anthropic first', () => {
    assert.equal(resolveProvider({env: {ANTHROPIC_API_KEY: 'a', OPENAI_API_KEY: 'o'}}), 'anthropic');
    assert.equal(resolveProvider({env: {OPENAI_API_KEY: 'o'}}), 'openai');
  });

  it('explains what to set when no key is available', () => {
    assert.throws(() => resolveProvider({env: {}}), /Set ANTHROPIC_API_KEY or OPENAI_API_KEY/);
  });

  it('rejects unknown providers and a chosen provider without its key', () => {
    assert.throws(() => resolveProvider({provider: 'gemini', env: {}}), /Unknown model provider "gemini"/);
    assert.throws(() => createCompletion({env: {WRITER_PROVIDER: 'openai', ANTHROPIC_API_KEY: 'a'}}), /OPENAI_API_KEY is required/);
  });

  it('reads WRITER_PROVIDER and WRITER_MODEL', () => {
    const complete = createCompletion({env: {WRITER_PROVIDER: 'openai', WRITER_MODEL: 'custom-model', OPENAI_API_KEY: 'o'}});
    assert.equal(complete.provider, 'openai');
    assert.equal(complete.model, 'custom-model');
  });
});

describe('models per agent', () => {
  const env = {OPENAI_API_KEY: 'o', WRITER_MODEL: 'gpt-5.6-terra', CHECKER_MODEL: 'gpt-5.6-luna', VERIFIER_MODEL: 'gpt-5.6-terra'};

  it('reads the most specific setting: the role, then CHECKER_* for judges, then WRITER_*', () => {
    assert.equal(resolveRole('writer', env).model, 'gpt-5.6-terra');
    assert.equal(resolveRole('angles', env).model, 'gpt-5.6-terra', 'generating angles is creative work, not a check');
    assert.equal(resolveRole('critic', env).model, 'gpt-5.6-luna');
    assert.equal(resolveRole('director', env).model, 'gpt-5.6-luna');
    assert.deepEqual(resolveRole('verifier', env), {provider: 'openai', model: 'gpt-5.6-terra', source: 'VERIFIER_MODEL'});
    assert.equal(createCompletion({role: 'vision', env}).model, 'gpt-5.6-luna');
  });

  it('falls back to the writer, then the provider default', () => {
    assert.equal(resolveRole('critic', {OPENAI_API_KEY: 'o', WRITER_MODEL: 'w'}).model, 'w');
    assert.deepEqual(resolveRole('critic', {OPENAI_API_KEY: 'o'}), {provider: 'openai', model: PROVIDERS.openai.defaultModel, source: 'default'});
  });

  it("never pairs a provider with another provider's model", () => {
    const mixed = {OPENAI_API_KEY: 'o', ANTHROPIC_API_KEY: 'a', WRITER_PROVIDER: 'openai', WRITER_MODEL: 'gpt-5.6-terra', CHECKER_PROVIDER: 'anthropic'};
    assert.deepEqual(resolveRole('critic', mixed), {provider: 'anthropic', model: PROVIDERS.anthropic.defaultModel, source: 'default'});
    assert.equal(resolveRole('writer', mixed).model, 'gpt-5.6-terra');
  });

  it('rejects unknown roles', () => {
    assert.throws(() => resolveRole('narrator', env), /Unknown agent role "narrator"/);
  });
});

describe('anthropic adapter', () => {
  it('sends the system prompt and messages, and joins text blocks', async () => {
    const {fetchImpl, calls} = recordingFetch(anthropicReply);
    const complete = createCompletion({env: {ANTHROPIC_API_KEY: 'key-a'}, fetchImpl});
    assert.equal(await complete(request), '{"title": "Zacian"}');
    assert.equal(calls[0].url, 'https://api.anthropic.com/v1/messages');
    assert.equal(calls[0].init.headers['x-api-key'], 'key-a');
    const body = JSON.parse(calls[0].init.body);
    assert.equal(body.model, PROVIDERS.anthropic.defaultModel);
    assert.equal(body.system, request.system);
    assert.deepEqual(body.messages, request.messages);
  });

  it('reports cut-off replies and API errors', async () => {
    await assert.rejects(createCompletion({env: {ANTHROPIC_API_KEY: 'a'}, fetchImpl: recordingFetch({...anthropicReply, stop_reason: 'max_tokens'}).fetchImpl})(request), /cut off/);
    await assert.rejects(createCompletion({env: {ANTHROPIC_API_KEY: 'a'}, fetchImpl: recordingFetch('overloaded', 529).fetchImpl})(request), /Claude request failed \(529\): overloaded/);
  });
});

describe('openai adapter', () => {
  it('puts the system prompt first and returns the message content', async () => {
    const {fetchImpl, calls} = recordingFetch(openaiReply);
    const complete = createCompletion({env: {OPENAI_API_KEY: 'key-o'}, fetchImpl});
    assert.equal(await complete(request), '{"title": "Zacian"}');
    assert.equal(calls[0].url, 'https://api.openai.com/v1/chat/completions');
    assert.equal(calls[0].init.headers.Authorization, 'Bearer key-o');
    const body = JSON.parse(calls[0].init.body);
    assert.equal(body.model, PROVIDERS.openai.defaultModel);
    assert.deepEqual(body.messages, [{role: 'system', content: request.system}, ...request.messages]);
  });

  it('reports cut-off replies and API errors', async () => {
    await assert.rejects(createCompletion({env: {OPENAI_API_KEY: 'o'}, fetchImpl: recordingFetch({choices: [{message: {content: '{'}, finish_reason: 'length'}]}).fetchImpl})(request), /cut off/);
    await assert.rejects(createCompletion({env: {OPENAI_API_KEY: 'o'}, fetchImpl: recordingFetch('bad key', 401).fetchImpl})(request), /OpenAI request failed \(401\): bad key/);
  });
});
