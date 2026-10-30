// Ranked races: the pinned Pokédex table, the races it allows, and the story a race tells.
// Everything a race states comes from public/pokedex/dex.json (npm run races:prepare).
// Pure functions only, so the tests can run them on a small table.

import {createHash} from 'node:crypto';

export const FPS = 30;
export const MAX_RACERS = 10;
export const MIN_POOL = 6;

/** The table's checksum: sha256 of the file's JSON without its own sha256 field. */
export const tableChecksum = (table) => createHash('sha256').update(JSON.stringify({...table, sha256: undefined})).digest('hex');

/** One PokéAPI pokemon + species pair as a table row. */
export const dexRow = (pokemon, species) => {
  const stat = (name) => pokemon.stats.find((entry) => entry.stat.name === name)?.base_stat;
  const id = (url) => (url ? Number(url.match(/\/(\d+)\/?$/)?.[1]) : null);
  return {
    id: pokemon.id,
    slug: pokemon.name,
    name: species.names?.find((entry) => entry.language?.name === 'en')?.name ?? pokemon.name,
    types: pokemon.types.map((entry) => entry.type.name),
    pastTypes: (pokemon.past_types ?? []).map((entry) => ({until: entry.generation.name, types: entry.types.map((type) => type.type.name)})),
    stats: {hp: stat('hp'), attack: stat('attack'), defense: stat('defense'), spAtk: stat('special-attack'), spDef: stat('special-defense'), speed: stat('speed')},
    height: pokemon.height,
    weight: pokemon.weight,
    baseExp: pokemon.base_experience,
    captureRate: species.capture_rate,
    hatchCounter: species.hatch_counter,
    legendary: species.is_legendary,
    mythical: species.is_mythical,
    baby: species.is_baby,
    evolvesFrom: id(species.evolves_from_species?.url),
    artworkUrl: pokemon.sprites?.other?.['official-artwork']?.front_default
      ?? `https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/other/official-artwork/${pokemon.id}.png`,
  };
};

export const total = (row) => Object.values(row.stats).reduce((sum, value) => sum + value, 0);

const STAT_LABELS = {hp: 'HP', attack: 'Attack', defense: 'Defense', spAtk: 'Sp. Atk', spDef: 'Sp. Def', speed: 'Speed'};

/**
 * What a race can rank. `battle` metrics are base stats, compared with the Pokémon's other stats in the payoff.
 * `scale` turns the table's unit into the one shown (PokéAPI height is decimetres, weight hectograms).
 */
export const METRICS = {
  hp: {label: 'HP', unit: 'HP', battle: true, get: (row) => row.stats.hp, ask: {top: 'WHO HAS THE MOST HP?', bottom: 'WHO HAS THE LEAST HP?'}},
  attack: {label: 'Attack', unit: 'ATTACK', battle: true, get: (row) => row.stats.attack, ask: {top: 'WHO HITS THE HARDEST?', bottom: 'WHO HAS THE WEAKEST ATTACK?'}},
  defense: {label: 'Defense', unit: 'DEFENSE', battle: true, get: (row) => row.stats.defense, ask: {top: 'WHO HAS THE BEST DEFENSE?', bottom: 'WHO HAS THE WORST DEFENSE?'}},
  spAtk: {label: 'Sp. Atk', unit: 'SP. ATK', battle: true, get: (row) => row.stats.spAtk, ask: {top: 'WHO HAS THE HIGHEST SP. ATK?', bottom: 'WHO HAS THE LOWEST SP. ATK?'}},
  spDef: {label: 'Sp. Def', unit: 'SP. DEF', battle: true, get: (row) => row.stats.spDef, ask: {top: 'WHO HAS THE HIGHEST SP. DEF?', bottom: 'WHO HAS THE LOWEST SP. DEF?'}},
  speed: {label: 'Speed', unit: 'SPEED', battle: true, get: (row) => row.stats.speed, ask: {top: 'WHO IS THE FASTEST?', bottom: 'WHO IS THE SLOWEST?'}},
  total: {label: 'Total stats', unit: 'TOTAL', battle: false, get: total, ask: {top: 'WHO HAS THE HIGHEST TOTAL STATS?', bottom: 'WHO HAS THE LOWEST TOTAL STATS?'}},
  height: {label: 'Height', unit: 'M', battle: false, scale: 0.1, decimals: 1, get: (row) => row.height, ask: {top: 'WHO IS THE TALLEST?', bottom: 'WHO IS THE SHORTEST?'}},
  weight: {label: 'Weight', unit: 'KG', battle: false, scale: 0.1, decimals: 1, get: (row) => row.weight, ask: {top: 'WHO IS THE HEAVIEST?', bottom: 'WHO IS THE LIGHTEST?'}},
  captureRate: {label: 'Catch rate', unit: 'CATCH RATE', battle: false, get: (row) => row.captureRate, ask: {top: 'WHO IS THE EASIEST TO CATCH?', bottom: 'WHO IS THE HARDEST TO CATCH?'}},
  hatchCounter: {label: 'Egg cycles', unit: 'EGG CYCLES', battle: false, get: (row) => row.hatchCounter, ask: {top: 'WHOSE EGG TAKES LONGEST TO HATCH?', bottom: 'WHOSE EGG HATCHES FASTEST?'}},
  baseExp: {label: 'Base XP', unit: 'BASE XP', battle: false, get: (row) => row.baseExp, ask: {top: 'WHO GIVES THE MOST XP?', bottom: 'WHO GIVES THE LEAST XP?'}},
};

/** Values as shown: the metric's unit and decimals. */
export const display = (metricId, value) => {
  const metric = METRICS[metricId];
  const shown = value * (metric.scale ?? 1);
  return metric.decimals ? shown.toFixed(metric.decimals) : String(Math.round(shown));
};

export const REGIONS = {
  kanto: {label: 'KANTO', has: (row) => row.id <= 151},
  johto: {label: 'JOHTO', has: (row) => row.id >= 152 && row.id <= 251},
  both: {label: 'GEN 1–2', has: (row) => row.id <= 251},
};

/**
 * Evolution stages as a region sees them: a Pokémon whose evolution arrived later (Onix → Steelix) is fully
 * evolved in a Kanto race, and one whose pre-evolution arrived later (Pichu → Pikachu) starts its line there.
 */
export const stagesIn = (rows) => {
  const inRegion = new Map(rows.map((row) => [row.id, row]));
  const evolvesInto = new Set(rows.filter((row) => inRegion.has(row.evolvesFrom)).map((row) => row.evolvesFrom));
  const stage = (row) => (inRegion.has(row.evolvesFrom) ? stage(inRegion.get(row.evolvesFrom)) + 1 : 1);
  return new Map(rows.map((row) => [row.id, {stage: stage(row), final: !evolvesInto.has(row.id)}]));
};

const TYPES = ['normal', 'fire', 'water', 'grass', 'electric', 'ice', 'fighting', 'poison', 'ground', 'flying', 'psychic', 'bug', 'rock', 'ghost', 'dragon', 'dark', 'steel', 'fairy'];
const special = (row) => row.legendary || row.mythical;

export const GROUPS = {
  all: {label: '', has: () => true},
  unevolved: {label: 'UNEVOLVED', has: (row, s) => s.stage === 1 && !s.final},
  fullyEvolved: {label: 'FULLY EVOLVED', has: (row, s) => s.final && s.stage > 1},
  middle: {label: 'MIDDLE STAGES', has: (row, s) => s.stage === 2 && !s.final},
  single: {label: 'NEVER EVOLVE', has: (row, s) => s.final && s.stage === 1 && !special(row)},
  legendary: {label: 'LEGENDARIES', has: (row) => special(row)},
  baby: {label: 'BABY POKÉMON', has: (row) => row.baby},
  ...Object.fromEntries(TYPES.map((type) => [type, {label: `${type.toUpperCase()} TYPES`, has: (row) => row.types.includes(type)}])),
};

const EVOLUTION_GROUPS = ['unevolved', 'fullyEvolved', 'middle', 'single'];

export const candidateId = ({region, group, direction, metric}) => `${region}-${group}-${direction}-${metric}`;

export const parseCandidateId = (id) => {
  const [region, group, direction, metric] = String(id).split('-');
  if (!REGIONS[region] || !GROUPS[group] || !['top', 'bottom'].includes(direction) || !METRICS[metric]) {
    throw new Error(`Not a race id: ${id}. It reads <region>-<group>-<top|bottom>-<metric>, e.g. both-psychic-top-hp`);
  }
  return {region, group, direction, metric};
};

/** The Pokémon a race could rank, best first. */
export const poolOf = (rows, {region, group, direction, metric}) => {
  const regional = rows.filter(REGIONS[region].has);
  const stages = stagesIn(regional);
  const get = METRICS[metric].get;
  return regional
    .filter((row) => GROUPS[group].has(row, stages.get(row.id)) && get(row) != null)
    .sort((a, b) => (direction === 'top' ? get(b) - get(a) : get(a) - get(b)) || a.id - b.id);
};

/** How surprising a race is, and why. A tie for first place can't be raced (score -1). */
export const scoreRace = (rows, spec) => {
  const pool = poolOf(rows, spec);
  if (pool.length < MIN_POOL) return null;
  const get = METRICS[spec.metric].get;
  const [winner, runnerUp] = pool;
  const base = {id: candidateId(spec), ...spec, pool: pool.length, winner: winner.name, runnerUp: runnerUp.name, value: get(winner), runnerUpValue: get(runnerUp)};
  if (get(winner) === get(runnerUp)) return {...base, score: -1, why: ['tie for first']};
  const stages = stagesIn(rows.filter(REGIONS[spec.region].has));
  const stage = stages.get(winner.id);
  const stronger = pool.filter((row) => total(row) > total(winner)).length / pool.length;
  const spread = Math.abs(get(pool[0]) - get(pool.at(-1))) || 1;
  const gap = Math.abs(get(winner) - get(runnerUp)) / spread;
  const why = [];
  let score = 0;
  const statLike = METRICS[spec.metric].battle || ['total', 'baseExp'].includes(spec.metric);
  if (statLike && spec.direction === 'top') {
    if (stronger > 0.5) { score += 3; why.push('underdog wins'); } else if (stronger > 0.25) { score += 1; why.push('mid-table winner'); }
    if (special(winner)) { score -= 2; why.push('a legendary wins (expected)'); }
  }
  if (statLike && spec.direction === 'bottom') {
    if (special(winner)) { score += 4; why.push('a legendary comes last'); } else if (stage.final && stage.stage > 1) { score += 3; why.push('fully evolved, still last'); }
  }
  if (!statLike && spec.direction === 'top' && ['height', 'weight'].includes(spec.metric) && !stage.final) { score += 2; why.push('unevolved wins on size'); }
  if (gap < 0.02) { score += 1; why.push('photo finish'); } else if (gap > 0.25) { score += 1; why.push('runaway winner'); }
  if (spec.group !== 'all') score += 0.5;
  return {...base, score, why};
};

/** Every race the table allows, scored, best first. */
export const allRaces = (rows) => {
  const races = [];
  for (const region of Object.keys(REGIONS)) for (const group of Object.keys(GROUPS)) for (const metric of Object.keys(METRICS)) for (const direction of ['top', 'bottom']) {
    const race = scoreRace(rows, {region, group, direction, metric});
    if (race) races.push(race);
  }
  return races.sort((a, b) => b.score - a.score || a.id.localeCompare(b.id));
};

/** The shortlist: surprising races, at most `perWinner` per Pokémon and `perGroup` per region and group, one per group and metric. */
export const shortlist = (races, {minScore = 2, perWinner = 3, perGroup = 3} = {}) => {
  const winners = new Map();
  const groups = new Map();
  const seen = new Set();
  return races.filter((race) => {
    const key = `${race.region}-${race.group}`;
    // The same winner of the same group and metric in another region is the same story.
    const story = `${race.group}-${race.direction}-${race.metric}-${race.winner}`;
    if (race.score < minScore || seen.has(`${key}-${race.metric}`) || seen.has(story) || (winners.get(race.winner) ?? 0) >= perWinner || (groups.get(key) ?? 0) >= perGroup) return false;
    seen.add(`${key}-${race.metric}`);
    seen.add(story);
    winners.set(race.winner, (winners.get(race.winner) ?? 0) + 1);
    groups.set(key, (groups.get(key) ?? 0) + 1);
    return true;
  });
};

const ordinal = (n) => `${n}${n % 100 >= 11 && n % 100 <= 13 ? 'TH' : ['TH', 'ST', 'ND', 'RD'][n % 10] ?? 'TH'}`;
const names = (rows) => (rows.length === 1 ? rows[0].name : rows.length === 2 ? `${rows[0].name} and ${rows[1].name}` : `${rows.length} of them`).toUpperCase();
const seconds = (s) => Math.round(s * FPS);

/**
 * The race manifest: who runs, the counter's keyframes, the headlines and the closing question.
 * Top race: every bar counts up together and the winner is the last one still growing.
 * Bottom race: the winner is the first bar to stop.
 */
export const buildRace = (table, spec) => {
  const {region, group, direction, metric} = spec;
  const race = scoreRace(table.pokemon, spec);
  if (!race) throw new Error(`${candidateId(spec)}: fewer than ${MIN_POOL} Pokémon to race`);
  if (race.score < 0) throw new Error(`${candidateId(spec)}: ${race.winner} and ${race.runnerUp} tie for first, so there is no race`);
  const m = METRICS[metric];
  const get = m.get;
  const racers = poolOf(table.pokemon, spec).slice(0, MAX_RACERS);
  const [hero, second] = racers;
  const v1 = get(hero);
  const v2 = get(second);
  const max = Math.max(...racers.map(get));

  // Counter keyframes, in the table's units.
  const counter = [{frame: seconds(2.5), value: 0}];
  const headlines = [];
  const kicker = [GROUPS[group].label, REGIONS[region].label].filter(Boolean).join(' · ');
  headlines.push({from: 0, kicker, text: m.ask[direction]});
  if (direction === 'top') {
    const together = seconds(9.5);
    const solo = Math.round(seconds(2.5) + seconds(2.5) * Math.min(1, (v1 - v2) / Math.max(v2, 1)));
    counter.push({frame: together, value: v2}, {frame: together + solo, value: v1});
    const tied = racers.filter((row) => get(row) === v2);
    headlines.push({from: together - seconds(1.6), kicker: `${names(tied)} ${tied.length > 1 ? 'TOP' : 'TOPS'} OUT AT`, text: `${display(metric, v2)} ${m.unit}`});
    headlines.push({from: together + 20, text: 'ONE BAR KEEPS GOING', tone: 'hero'});
  } else {
    const first = seconds(7.5);
    const hold = seconds(1.5);
    counter.push({frame: first, value: v1}, {frame: first + hold, value: v1}, {frame: first + hold + seconds(3), value: max});
    headlines.push({from: first, kicker: 'FIRST TO STOP', text: hero.name.toUpperCase(), tone: 'hero'});
    headlines.push({from: first + hold + 10, text: 'EVERYONE ELSE KEEPS GOING'});
  }
  const raceEnd = counter.at(-1).frame;
  const sortStart = raceEnd + 12;
  const sortEnd = sortStart + 50;
  const payoff = sortEnd + 25;
  const question = payoff + seconds(4);
  const end = question + seconds(4);
  headlines.push({from: sortStart, kicker: hero.name.toUpperCase(), text: `${display(metric, v1)} ${m.unit}`, tone: 'hero'});

  // The payoff contrasts the winner with itself: a top winner's weakest stat, a bottom winner's best.
  if (m.battle) {
    const others = Object.entries(hero.stats).filter(([stat]) => stat !== metric);
    const pick = others.sort(([, a], [, b]) => (direction === 'top' ? a - b : b - a))[0];
    const rankOf = (stat) => racers.filter((row) => row.stats[stat] > pick[1]).length + 1;
    const rank = rankOf(pick[0]);
    // Stats tied with the pick are named too when they rank the same among the racers.
    const tiedStats = others.filter(([stat, value]) => value === pick[1] && (direction === 'top' || rankOf(stat) === rank)).map(([stat]) => STAT_LABELS[stat].toUpperCase()).slice(0, 2).join(' AND ');
    headlines.push(direction === 'top'
      ? {from: payoff, kicker: `${METRICS[metric].label.toUpperCase()} WINNER · BUT ${tiedStats}`, text: `JUST ${pick[1]}`, tone: 'twist'}
      : {from: payoff, kicker: `LAST ON ${METRICS[metric].label.toUpperCase()} · BUT ${tiedStats}`, text: rank === 1 ? `${pick[1]} · BEST HERE` : `${pick[1]} · ${ordinal(rank)} HERE`, tone: 'twist'});
  } else {
    const rank = [...racers].sort((a, b) => total(b) - total(a)).findIndex((row) => row.id === hero.id) + 1;
    headlines.push({from: payoff, kicker: `${hero.name.toUpperCase()} ON TOTAL STATS`, text: `${ordinal(rank)} OF ${racers.length}`, tone: 'twist'});
  }
  headlines.forEach((headline, index) => { headline.to = headlines[index + 1]?.from ?? question; });

  // Who it races against in the question: the strongest other racer by total stats.
  const foil = [...racers].filter((row) => row.id !== hero.id).sort((a, b) => total(b) - total(a))[0];
  const ordered = (rows) => rows.map((row) => row.id);
  const initial = metric === 'total' ? [...racers].sort((a, b) => a.id - b.id) : [...racers].sort((a, b) => total(b) - total(a) || a.id - b.id);

  return {
    schemaVersion: 1,
    id: candidateId(spec),
    format: 'ranked-race',
    show: 'pokepulses',
    race: {region, group, direction, metric, score: race.score, why: race.why},
    source: {name: table.source, fetchedAt: table.fetchedAt, sha256: table.sha256},
    metric: {id: metric, label: m.label, unit: m.unit, scale: m.scale ?? 1, decimals: m.decimals ?? 0},
    racers: racers.map((row) => ({id: row.id, name: row.name, value: get(row), total: total(row), artworkUrl: row.artworkUrl, hero: row.id === hero.id})),
    order: {initial: ordered(initial), final: ordered(racers), initialLabel: metric === 'total' ? 'POKÉDEX ORDER' : 'ORDERED BY TOTAL STATS', finalLabel: `ORDERED BY ${m.label.toUpperCase()}`},
    counter,
    timeline: {sortStart, sortEnd, payoff, question, end},
    headlines,
    question: {
      prompt: 'WHO WOULD YOU RATHER HAVE?',
      options: [
        {id: hero.id, label: hero.name.toUpperCase(), sub: `${m.label} ${display(metric, v1)}`},
        {id: foil.id, label: foil.name.toUpperCase(), sub: `${total(foil)} total stats`},
      ],
    },
    // Evolution groups are judged within the region's Pokédex (Togetic is fully evolved until Gen 4), so the video says so.
    caption: [m.battle || metric === 'total' ? 'BASE STATS' : 'POKÉDEX DATA', 'CURRENT GAMES', ...(EVOLUTION_GROUPS.includes(group) ? [`EVOLUTIONS AS OF ${region === 'kanto' ? 'GEN 1' : 'GEN 2'}`] : [])].join(' · '),
  };
};

/** Every figure in a race manifest still matches the pinned table: names, values, totals. */
export const checkRace = (table, manifest) => {
  const problems = [];
  if (manifest.source.sha256 !== table.sha256) problems.push(`built from a different table (${manifest.source.sha256.slice(0, 8)}, pinned ${table.sha256.slice(0, 8)}); rebuild with npm run races:new -- ${manifest.id}`);
  const byId = new Map(table.pokemon.map((row) => [row.id, row]));
  const get = METRICS[manifest.metric.id].get;
  for (const racer of manifest.racers) {
    const row = byId.get(racer.id);
    if (!row) { problems.push(`#${racer.id} is not in the table`); continue; }
    if (row.name !== racer.name) problems.push(`#${racer.id} is ${row.name}, not ${racer.name}`);
    if (get(row) !== racer.value) problems.push(`${racer.name}: ${manifest.metric.label} is ${get(row)}, not ${racer.value}`);
    if (total(row) !== racer.total) problems.push(`${racer.name}: total stats are ${total(row)}, not ${racer.total}`);
  }
  return problems;
};

/** Phase windows for the music bed: one pseudo-scene per beat of the race, so the cues land on its turns. */
export const raceBeats = (manifest) => {
  const marks = [0, ...manifest.headlines.slice(1).map((headline) => headline.from), manifest.timeline.question, manifest.timeline.end];
  const roles = ['hook', 'evidence', 'escalation', 'reveal', 'payoff', 'interaction'];
  return marks.slice(0, -1).map((from, index) => ({id: `beat-${index}`, role: index === marks.length - 2 ? 'interaction' : roles[Math.min(index, roles.length - 2)], durationSeconds: (marks[index + 1] - from) / FPS}));
};
