import assert from 'node:assert/strict';
import {describe, it} from 'node:test';
import type {Angle, DexTable} from '../scripts/lib/dex.mjs';
import {raceCues, renderRaceSfx, stopFrame} from '../scripts/lib/race-sound.mjs';
import {allRaces, angleMembers, angleShortlist, RACE_SCORES, buildRace, checkRace, candidateId, parseCandidateId, poolOf, raceBeats, scoreRace, shortlist, stagesIn, tableChecksum} from '../scripts/lib/dex.mjs';

type Stats = {hp: number; attack: number; defense: number; spAtk: number; spDef: number; speed: number};
const mon = (id: number, name: string, types: string[], stats: Partial<Stats>, extra: Record<string, unknown> = {}) => ({
  id, slug: name.toLowerCase(), name, types, pastTypes: [],
  stats: {hp: 50, attack: 50, defense: 50, spAtk: 50, spDef: 50, speed: 50, ...stats},
  height: 10, weight: 100, baseExp: 100, captureRate: 45, hatchCounter: 20,
  legendary: false, mythical: false, baby: false, evolvesFrom: null, generation: id <= 151 ? 1 : 2, artworkUrl: `https://example.test/${id}.png`, ...extra,
});

// A small Psychic league: a low-total Pokémon with a huge HP beats two strong ones, and one Kanto Pokémon evolves in Johto.
const pokemon = [
  mon(1, 'Strongone', ['psychic'], {hp: 106, attack: 110, spAtk: 154, speed: 130}, {legendary: true}),
  mon(2, 'Strongtwo', ['psychic'], {hp: 106, attack: 90, spAtk: 90, spDef: 154, speed: 110}),
  mon(3, 'Middling', ['psychic'], {hp: 95, attack: 75, spAtk: 100}),
  mon(4, 'Rocky', ['psychic', 'rock'], {hp: 35, defense: 160}, {height: 88}),
  mon(5, 'Slowish', ['psychic'], {hp: 90, speed: 15}),
  mon(6, 'Sleepy', ['psychic'], {hp: 85, attack: 100, spDef: 100}),
  mon(152, 'Bigheart', ['psychic'], {hp: 190, attack: 33, defense: 58, spAtk: 33, spDef: 58, speed: 33}),
  mon(153, 'Rockier', ['steel'], {hp: 75, defense: 200}, {evolvesFrom: 4}),
];
const table: DexTable = {source: 'test', fetchedAt: '2026-10-30', pokemon};
table.sha256 = tableChecksum(table);

describe('ranked races', () => {
  it('reads and writes race ids', () => {
    const spec = {region: 'both', group: 'psychic', direction: 'top', metric: 'hp'};
    assert.equal(candidateId(spec), 'both-psychic-top-hp');
    assert.deepEqual(parseCandidateId('both-psychic-top-hp'), spec);
    assert.throws(() => parseCandidateId('both-psychic-sideways-hp'), /Not a race id/);
  });

  it('judges evolution within the region: a Pokémon whose evolution came later is fully evolved there', () => {
    const kanto = stagesIn(pokemon.filter((row) => row.id <= 151));
    assert.deepEqual(kanto.get(4), {stage: 1, final: true});
    const both = stagesIn(pokemon);
    assert.deepEqual(both.get(4), {stage: 1, final: false});
    assert.deepEqual(both.get(153), {stage: 2, final: true});
  });

  it('cannot race a tie for first', () => {
    const race = scoreRace(pokemon, {region: 'kanto', group: 'psychic', direction: 'top', metric: 'hp'});
    assert.equal(race?.score, -1);
    assert.throws(() => buildRace(table, {region: 'kanto', group: 'psychic', direction: 'top', metric: 'hp'}), /tie for first/);
  });

  it('scores an underdog win and skips groups too small to race', () => {
    const race = scoreRace(pokemon, {region: 'both', group: 'psychic', direction: 'top', metric: 'hp'});
    assert.equal(race?.winner, 'Bigheart');
    assert.ok(race!.why.includes('underdog wins'));
    assert.equal(scoreRace(pokemon, {region: 'johto', group: 'psychic', direction: 'top', metric: 'hp'}), null);
    assert.ok(allRaces(pokemon).every((entry) => entry.pool >= 6));
  });

  it('keeps one story per winner, group and metric on the shortlist', () => {
    const races = [
      {id: 'a', region: 'johto', group: 'psychic', direction: 'top', metric: 'hp', winner: 'X', score: 4},
      {id: 'b', region: 'both', group: 'psychic', direction: 'top', metric: 'hp', winner: 'X', score: 4},
      {id: 'c', region: 'both', group: 'psychic', direction: 'top', metric: 'speed', winner: 'X', score: 3},
      {id: 'd', region: 'both', group: 'all', direction: 'top', metric: 'speed', winner: 'Y', score: 1},
    ];
    assert.deepEqual(shortlist(races).map((race) => race.id), ['a', 'c']);
  });

  it('builds a top race: the winner is the last bar still counting, then the contrast with its weakest stat', () => {
    const race = buildRace(table, {region: 'both', group: 'psychic', direction: 'top', metric: 'hp'});
    assert.equal(race.racers[0].name, 'Bigheart');
    assert.ok(race.racers[0].hero);
    assert.deepEqual(race.order.final, poolOf(pokemon, {region: 'both', group: 'psychic', direction: 'top', metric: 'hp'}).map((row) => row.id));
    assert.equal(race.order.initial[0], 1, 'starts ordered by total stats');
    assert.deepEqual(race.counter.map((key) => key.value), [0, 106, 190]);
    assert.ok(race.counter.every((key, index) => index === 0 || key.frame > race.counter[index - 1].frame));
    const texts = race.headlines.map((headline) => headline.text);
    assert.ok(texts.includes('106 HP') && texts.includes('190 HP') && texts.includes('JUST 33'));
    assert.match(race.headlines[1].kicker ?? '', /STRONGONE AND STRONGTWO TOP OUT AT/);
    assert.match(race.headlines.at(-1)?.kicker ?? '', /ATTACK AND SP\. ATK/);
    assert.ok(race.headlines.every((headline) => headline.to > headline.from));
    assert.equal(race.question.options[1].label, 'STRONGONE');
  });

  it('builds a bottom race: the winner is the first bar to stop, then its best stat', () => {
    const race = buildRace(table, {region: 'both', group: 'psychic', direction: 'bottom', metric: 'hp'});
    assert.equal(race.racers[0].name, 'Rocky');
    assert.equal(race.headlines[1].kicker ?? '', 'FIRST TO STOP');
    assert.equal(race.counter[1].value, 35);
    assert.equal(race.headlines.at(-1)?.text, '160 · BEST HERE');
  });

  it('shows heights in metres and says when evolution is judged by the region', () => {
    const race = buildRace(table, {region: 'both', group: 'psychic', direction: 'top', metric: 'height'});
    assert.ok(race.headlines.some((headline) => headline.text === '8.8 M'));
    assert.equal(race.caption, 'POKÉDEX DATA · CURRENT GAMES');
    assert.equal(buildRace(table, {region: 'both', group: 'all', direction: 'top', metric: 'hp'}).caption, 'BASE STATS · CURRENT GAMES');
  });

  it('catches a manifest that no longer matches the table', () => {
    const race = buildRace(table, {region: 'both', group: 'psychic', direction: 'top', metric: 'hp'});
    assert.deepEqual(checkRace(table, race), []);
    const edited = {...race, racers: race.racers.map((racer) => (racer.name === 'Bigheart' ? {...racer, value: 255} : racer))};
    assert.match(checkRace(table, edited).join('\n'), /Bigheart: HP is 190, not 255/);
  });

  it('lays the music cues on the race beats, ending with the question', () => {
    const race = buildRace(table, {region: 'both', group: 'psychic', direction: 'top', metric: 'hp'});
    const beats = raceBeats(race);
    assert.equal(beats.at(-1)?.role, 'interaction');
    assert.ok(Math.abs(beats.reduce((sum: number, beat: {durationSeconds: number}) => sum + beat.durationSeconds, 0) - race.timeline.end / 30) < 1e-9);
  });

  it('picks a score that suits the race, and keeps it in the manifest', () => {
    const top = buildRace(table, {region: 'both', group: 'psychic', direction: 'top', metric: 'hp'});
    const bottom = buildRace(table, {region: 'both', group: 'psychic', direction: 'bottom', metric: 'hp'});
    assert.ok(RACE_SCORES.top.includes(top.music.score));
    assert.ok(RACE_SCORES.bottom.includes(bottom.music.score));
  });

  it('plays a note per bar stop, a tie as one, and the hit on a top winner\'s stop', () => {
    const race = buildRace(table, {region: 'both', group: 'psychic', direction: 'top', metric: 'hp'});
    const cues = raceCues(race);
    const stops = cues.filter((cue) => cue.cue === 'stop');
    assert.equal(stops.length, new Set(race.racers.filter((racer) => !racer.hero).map((racer) => racer.value)).size, 'the two 106s stop together');
    const win = cues.find((cue) => cue.cue === 'win');
    assert.equal(win?.time, stopFrame(race.counter, 190) / 30);
    assert.ok(stops.every((cue) => cue.time < (win?.time ?? 0)));
    const riser = cues.find((cue) => cue.cue === 'riser');
    assert.equal(riser?.end, win?.time, 'the riser runs into the winner\'s stop');
    assert.equal(cues.at(-1)?.cue, 'chime');
  });

  it('starts a bottom race on the lowest note and lands the hit on the reveal', () => {
    const race = buildRace(table, {region: 'both', group: 'psychic', direction: 'bottom', metric: 'hp'});
    const cues = raceCues(race);
    const first = cues.find((cue) => cue.cue === 'stop');
    assert.equal(first?.step, 0);
    assert.equal(first?.time, stopFrame(race.counter, 35) / 30);
    assert.equal(cues.find((cue) => cue.cue === 'win')?.time, race.timeline.sortEnd / 30);
    const samples = renderRaceSfx(race, race.music.score);
    assert.equal(samples.length, Math.ceil((race.timeline.end / 30) * 44100));
    assert.ok(samples.some((sample) => Math.abs(sample) > 0.1));
  });

  describe('angles', () => {
    const extra = [
      mon(700, 'Waterone', ['water'], {speed: 70}, {generation: 6}),
      mon(701, 'Watertwo', ['water'], {speed: 122}, {generation: 6}),
      mon(800, 'Waterthree', ['water', 'ice'], {speed: 65}, {generation: 8}),
      mon(900, 'Dragonbase', ['dragon'], {}, {generation: 9}),
      mon(901, 'Dragonmid', ['dragon'], {}, {generation: 9, evolvesFrom: 900}),
      mon(902, 'Dragonend', ['dragon'], {hp: 100, attack: 100, defense: 100, spAtk: 100, spDef: 100, speed: 100}, {generation: 9, evolvesFrom: 901}),
      mon(903, 'Slaker', ['normal'], {hp: 100, attack: 100, defense: 100, spAtk: 100, spDef: 100, speed: 100}, {generation: 9}),
    ];
    const rows = [...pokemon, ...extra];
    const angleTable: DexTable = {source: 'test', fetchedAt: '2026-10-30', pokemon: rows};
    angleTable.sha256 = tableChecksum(angleTable);
    const angles: Angle[] = [
      {id: 'water-starters', title: 'WATER STARTERS', members: [700, 701, 800, 5], requireType: 'water', order: 'region', tag: 'region'},
      {id: 'pseudo-legendaries', title: 'PSEUDO-LEGENDARIES', rule: 'pseudo-legendary'},
    ];

    it('reads angle ids next to regional ones', () => {
      assert.deepEqual(parseCandidateId('water-starters-top-speed', angles), {angle: 'water-starters', direction: 'top', metric: 'speed'});
      assert.deepEqual(parseCandidateId('both-psychic-top-hp', angles), {region: 'both', group: 'psychic', direction: 'top', metric: 'hp'});
      assert.throws(() => parseCandidateId('fire-starters-top-speed', angles), /angles are in races\/angles.json/);
    });

    it('checks members against the table: a wrong type or a missing id is a problem', () => {
      const {members, problems} = angleMembers(rows, angles[0]);
      assert.equal(members.length, 4);
      assert.deepEqual(problems, ['water-starters: Slowish is not water type']);
      assert.match(angleMembers(rows, {id: 'x', title: 'X', members: [9999]}).problems[0], /#9999 is not in the table/);
    });

    it('finds pseudo-legendaries by rule: 600 total on the third stage, not a lone 600', () => {
      assert.deepEqual(angleMembers(rows, angles[1]).members.map((row) => row.name), ['Dragonend']);
    });

    it('builds an angle race in region order, with region tags and the angle as the kicker', () => {
      const valid = [{...angles[0], members: [700, 701, 800], minPool: 3}];
      const race = buildRace(angleTable, {angle: 'water-starters', direction: 'top', metric: 'speed'}, valid);
      assert.equal(race.id, 'water-starters-top-speed');
      assert.equal(race.racers[0].name, 'Watertwo');
      assert.deepEqual(race.racers.map((racer) => racer.tag), ['KALOS', 'KALOS', 'GALAR']);
      assert.deepEqual(race.order.initial, [700, 701, 800]);
      assert.equal(race.order.initialLabel, 'ORDERED BY REGION');
      assert.equal(race.headlines[0].kicker, 'WATER STARTERS');
      assert.equal(race.caption, 'BASE STATS · CURRENT GAMES');
    });

    it('keeps the best few races of each angle, and leaves angles off the regional shortlist', () => {
      const races = [1, 2, 3, 4].map((n) => ({id: `a${n}`, angle: 'water-starters', region: undefined, group: undefined, direction: 'top', metric: `m${n}`, winner: `W${n}`, score: 5 - n}));
      assert.deepEqual(angleShortlist(races).map((race) => race.id), ['a1', 'a2', 'a3']);
      assert.deepEqual(shortlist(races, {minScore: 0}), []);
    });
  });
});

