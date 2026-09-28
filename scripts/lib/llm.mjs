// Model access for the agents. Every agent talks to a model through one
// interface, complete({system, messages}) → reply text, so any stage can use
// any provider.
import {fetchWithReason} from './net.mjs';

export const PROVIDERS = {
  anthropic: {keyEnv: 'ANTHROPIC_API_KEY', defaultModel: 'claude-opus-5-5'},
  openai: {keyEnv: 'OPENAI_API_KEY', defaultModel: 'gpt-4o'},
};

// A message's content is a string, or a list of parts:
// {type: 'text', text} | {type: 'image', mediaType: 'image/png', data: <base64>}.
const partsOf = (content) => (typeof content === 'string' ? [{type: 'text', text: content}] : content);
const anthropicContent = (content) => (typeof content === 'string' ? content : partsOf(content).map((part) => (part.type === 'image'
  ? {type: 'image', source: {type: 'base64', media_type: part.mediaType, data: part.data}}
  : {type: 'text', text: part.text})));
const openaiContent = (content) => (typeof content === 'string' ? content : partsOf(content).map((part) => (part.type === 'image'
  ? {type: 'image_url', image_url: {url: `data:${part.mediaType};base64,${part.data}`}}
  : {type: 'text', text: part.text})));

const failure = async (label, response) => new Error(`${label} request failed (${response.status}): ${await response.text()}`);

const anthropicAdapter = ({apiKey, model, maxTokens, fetchImpl}) => async ({system, messages}) => {
  const response = await fetchWithReason('Claude', 'https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {'x-api-key': apiKey, 'anthropic-version': '2023-06-01', 'content-type': 'application/json'},
    body: JSON.stringify({model, max_tokens: maxTokens, system, messages: messages.map((message) => ({...message, content: anthropicContent(message.content)}))}),
  }, fetchImpl);
  if (!response.ok) throw await failure('Claude', response);
  const data = await response.json();
  if (data.stop_reason === 'max_tokens') throw new Error('Claude reply was cut off (max_tokens). Increase maxTokens.');
  return data.content.filter((block) => block.type === 'text').map((block) => block.text).join('');
};

const openaiAdapter = ({apiKey, model, maxTokens, fetchImpl}) => async ({system, messages}) => {
  const response = await fetchWithReason('OpenAI', 'https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {Authorization: `Bearer ${apiKey}`, 'content-type': 'application/json'},
    body: JSON.stringify({model, max_completion_tokens: maxTokens, messages: [{role: 'system', content: system}, ...messages.map((message) => ({...message, content: openaiContent(message.content)}))]}),
  }, fetchImpl);
  if (!response.ok) throw await failure('OpenAI', response);
  const data = await response.json();
  const choice = data.choices?.[0];
  if (choice?.finish_reason === 'length') throw new Error('OpenAI reply was cut off (length). Increase maxTokens.');
  return choice?.message?.content ?? '';
};

const adapters = {anthropic: anthropicAdapter, openai: openaiAdapter};

/**
 * Pick the provider: an explicit choice (WRITER_PROVIDER), otherwise the
 * first one whose API key is set.
 */
export const resolveProvider = ({provider, env = process.env} = {}) => {
  if (provider) {
    if (!PROVIDERS[provider]) throw new Error(`Unknown model provider "${provider}". Supported: ${Object.keys(PROVIDERS).join(', ')}.`);
    return provider;
  }
  const available = Object.keys(PROVIDERS).find((name) => env[PROVIDERS[name].keyEnv]);
  if (!available) throw new Error(`The writer agent needs a model. Set ${Object.values(PROVIDERS).map((item) => item.keyEnv).join(' or ')} (and optionally WRITER_PROVIDER / WRITER_MODEL), or write the draft by hand in drafts/<show>/<id>.json.`);
  return available;
};

/** complete({system, messages}) for the chosen provider and model. */
export const createCompletion = ({provider, model, apiKey, maxTokens = 8000, env = process.env, fetchImpl = fetch} = {}) => {
  const name = resolveProvider({provider: provider ?? env.WRITER_PROVIDER, env});
  const {keyEnv, defaultModel} = PROVIDERS[name];
  const key = apiKey ?? env[keyEnv];
  if (!key) throw new Error(`${keyEnv} is required for the ${name} provider.`);
  const complete = adapters[name]({apiKey: key, model: model ?? env.WRITER_MODEL ?? defaultModel, maxTokens, fetchImpl});
  return Object.assign(complete, {provider: name, model: model ?? env.WRITER_MODEL ?? defaultModel});
};
