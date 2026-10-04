// Production log (#89): how an episode was made and roughly what it cost.
// Agents, narration, renders and approvals append entries to the committed
// analytics/<show>/<id>.production.json; summarizeProduction() totals them,
// with costs estimated from scripts/lib/prices.json.
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

export const PRICES = JSON.parse(fs.readFileSync(path.join(path.dirname(fileURLToPath(import.meta.url)), 'prices.json'), 'utf8'));

export const productionPath = (root, show, episodeId) => path.join(root, 'analytics', show, `${episodeId}.production.json`);

export const readProduction = (root, show, episodeId) => {
  const file = productionPath(root, show, episodeId);
  return fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, 'utf8')) : {episodeId, show, entries: []};
};

/**
 * Append entries to an episode's log. Each gets the time it was recorded
 * unless it already has one (`now` is for tests).
 */
export const appendProduction = (root, show, episodeId, entries, {now = () => new Date().toISOString()} = {}) => {
  if (!entries.length) return;
  const log = readProduction(root, show, episodeId);
  log.entries.push(...entries.map((entry) => ({at: now(), ...entry})));
  const file = productionPath(root, show, episodeId);
  fs.mkdirSync(path.dirname(file), {recursive: true});
  fs.writeFileSync(file, `${JSON.stringify(log, null, 2)}\n`);
};

/** A log entry for one model call, from createCompletion's onUsage. */
export const modelEntry = ({role, provider, model, inputTokens = null, outputTokens = null}) => ({kind: 'model', role, provider, model, inputTokens, outputTokens});

/** Estimated cost in dollars of a model call, or null when its model has no listed price or its usage is unknown. */
export const modelCost = ({model, inputTokens, outputTokens}, prices = PRICES) => {
  const price = prices.models[model];
  if (!price || inputTokens == null || outputTokens == null) return null;
  return (inputTokens * price.inputPerMillion + outputTokens * price.outputPerMillion) / 1e6;
};

/** Estimated cost in dollars of paid narration, or null when its model has no listed price. */
export const speechCost = ({model, seconds, characters}, prices = PRICES) => {
  const price = prices.speech[model];
  if (price?.perMinute != null) return (seconds / 60) * price.perMinute;
  // ElevenLabs bills by characters (#102).
  if (price?.perThousandCharacters != null && characters != null) return (characters / 1000) * price.perThousandCharacters;
  return null;
};

const round = (value) => (value == null ? null : Math.round(value * 10000) / 10000);

/**
 * Totals for an episode's log: model calls by role, paid narration, renders and
 * approvals (the log's own, plus the reviews recorded in the manifest's rights).
 * `cost` is the sum of every priced item; `unpriced` names what had no price.
 */
export const summarizeProduction = (log, {manifest, prices = PRICES} = {}) => {
  const roles = {};
  const unpriced = new Set();
  let cost = 0;
  for (const entry of log.entries.filter((item) => item.kind === 'model')) {
    const role = (roles[entry.role] ??= {calls: 0, inputTokens: 0, outputTokens: 0, cost: 0, models: []});
    role.calls++;
    role.inputTokens += entry.inputTokens ?? 0;
    role.outputTokens += entry.outputTokens ?? 0;
    if (!role.models.includes(entry.model)) role.models.push(entry.model);
    const itemCost = modelCost(entry, prices);
    if (itemCost == null) unpriced.add(`${entry.role}: ${entry.model}`);
    else { role.cost += itemCost; cost += itemCost; }
  }
  const narration = {characters: 0, seconds: 0, cost: 0, providers: []};
  for (const entry of log.entries.filter((item) => item.kind === 'narration')) {
    narration.characters += entry.characters;
    narration.seconds += entry.seconds;
    const label = `${entry.provider}${entry.model ? ` (${entry.model})` : ''}`;
    if (!narration.providers.includes(label)) narration.providers.push(label);
    const itemCost = entry.provider === 'local' ? 0 : speechCost(entry, prices);
    if (itemCost == null) unpriced.add(`narration: ${entry.model}`);
    else { narration.cost += itemCost; cost += itemCost; }
  }
  const renders = log.entries.filter((item) => item.kind === 'render');
  const approvals = [
    ...log.entries.filter((item) => item.kind === 'approval').map(({at, what, by}) => ({what, date: at.slice(0, 10), ...(by ? {by} : {})})),
    ...(manifest?.rights?.bordersReview ? [{what: 'borders review', date: manifest.rights.bordersReview.date, by: manifest.rights.bordersReview.reviewer}] : []),
  ];
  for (const role of Object.values(roles)) role.cost = round(role.cost);
  return {
    episodeId: log.episodeId,
    models: roles,
    narration: {...narration, seconds: round(narration.seconds), cost: round(narration.cost)},
    renders: {count: renders.length, lastSeconds: renders.at(-1)?.seconds ?? null},
    approvals,
    cost: round(cost),
    unpriced: [...unpriced],
    pricesChecked: prices.checked,
  };
};
