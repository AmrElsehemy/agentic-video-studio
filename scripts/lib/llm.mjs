// Model access for the agents. Every agent talks to a model through one
// interface, complete({system, messages}) → reply text, so any stage can use
// any provider.
import {fetchWithReason} from './net.mjs';

export const PROVIDERS = {
  anthropic: {keyEnv: 'ANTHROPIC_API_KEY', defaultModel: 'claude-opus-5-5'},
  openai: {keyEnv: 'OPENAI_API_KEY', defaultModel: 'gpt-5.6-luna'},
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
  return {text: data.content.filter((block) => block.type === 'text').map((block) => block.text).join(''), usage: {inputTokens: data.usage?.input_tokens ?? null, outputTokens: data.usage?.output_tokens ?? null}};
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
  return {text: choice?.message?.content ?? '', usage: {inputTokens: data.usage?.prompt_tokens ?? null, outputTokens: data.usage?.completion_tokens ?? null}};
};

const adapters = {anthropic: anthropicAdapter, openai: openaiAdapter};

/**
 * Pick the provider: an explicit choice, otherwise the first one whose API
 * key is set.
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

/**
 * Agents and the environment prefix that picks each one's model. Judging
 * roles also read CHECKER_*, so one setting can move all of them to a cheaper
 * model; everything falls back to WRITER_*.
 */
export const AGENT_ROLES = {
  writer: {prefix: 'WRITER', checker: false},
  angles: {prefix: 'ANGLES', checker: false},
  'angle-critic': {prefix: 'ANGLE_CRITIC', checker: true},
  verifier: {prefix: 'VERIFIER', checker: true},
  critic: {prefix: 'CRITIC', checker: true},
  director: {prefix: 'DIRECTOR', checker: true},
  vision: {prefix: 'VISION', checker: true},
};

/**
 * The provider and model for a role. Settings are read most specific first
 * (e.g. VERIFIER_*, then CHECKER_*, then WRITER_*). A model setting only
 * applies to the provider chosen at its own level or a more specific one, so
 * CHECKER_PROVIDER=anthropic never inherits an OpenAI WRITER_MODEL.
 */
export const resolveRole = (role = 'writer', env = process.env, {provider: explicit} = {}) => {
  const agent = AGENT_ROLES[role];
  if (!agent) throw new Error(`Unknown agent role "${role}". Known: ${Object.keys(AGENT_ROLES).join(', ')}.`);
  const levels = [...new Set([agent.prefix, ...(agent.checker ? ['CHECKER'] : []), 'WRITER'])];
  const providerLevel = levels.findIndex((level) => env[`${level}_PROVIDER`]);
  const provider = resolveProvider({provider: explicit ?? (providerLevel === -1 ? undefined : env[`${levels[providerLevel]}_PROVIDER`]), env});
  // Model settings from levels that chose another provider don't apply.
  const eligible = levels.filter((level, index) => (providerLevel === -1 || index <= providerLevel) && (!env[`${level}_PROVIDER`] || env[`${level}_PROVIDER`] === provider));
  const modelLevel = eligible.find((level) => env[`${level}_MODEL`]);
  return {provider, model: modelLevel ? env[`${modelLevel}_MODEL`] : PROVIDERS[provider].defaultModel, source: modelLevel ? `${modelLevel}_MODEL` : 'default'};
};

/**
 * complete({system, messages}) for an agent role (default: the writer), or an
 * explicit provider and model. `onUsage` hears about every finished call:
 * {role, provider, model, inputTokens, outputTokens} (for the production log, #89).
 */
export const createCompletion = ({role = 'writer', provider, model, apiKey, maxTokens = 16000, env = process.env, fetchImpl = fetch, onUsage} = {}) => {
  const resolved = resolveRole(role, env, {provider});
  const chosen = model ?? resolved.model;
  const {keyEnv} = PROVIDERS[resolved.provider];
  const key = apiKey ?? env[keyEnv];
  if (!key) throw new Error(`${keyEnv} is required for the ${resolved.provider} provider.`);
  const call = adapters[resolved.provider]({apiKey: key, model: chosen, maxTokens, fetchImpl});
  const complete = async (request) => {
    const {text, usage} = await call(request);
    onUsage?.({role, provider: resolved.provider, model: chosen, ...usage});
    return text;
  };
  return Object.assign(complete, {provider: resolved.provider, model: chosen, role});
};
