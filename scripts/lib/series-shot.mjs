// The director's side of charts over time: turn a model's `series` choice into the primitive's field, checking it against the
// pinned World Bank table, and summarise the table so the model picks years that exist. The model never writes a figure:
// it picks an indicator, countries and years; a marked year's caption is derived here, and "peak" and "low" are verified.
import {INDICATORS, SHADEABLE} from './series.mjs';

const MARKS = ['peak', 'low', 'year'];

/** The year in [from, to] where a country's figure is highest (or lowest), among years that have one. */
export const extremeYear = (table, code, from, to, kind) => {
  const values = table.countries[code];
  if (!values) return undefined;
  let best;
  for (let year = Math.min(from, to); year <= Math.max(from, to); year++) {
    const value = values[year - table.years[0]];
    if (value === null || value === undefined) continue;
    if (!best || (kind === 'peak' ? value > best.value : value < best.value)) best = {year, value};
  }
  return best?.year;
};

/**
 * `raw` is the shot's series: {indicator, view: "line"|"race", from, to, places?, axis?: "fit", mark?: {year, kind: "peak"|"low"|"year"}, at?}.
 * `placeId(id, where)` is the director's own check that an id is one of the episode's places.
 */
export const seriesFromShot = (raw, {series, placeId}) => {
  if (!raw || typeof raw !== 'object') throw new Error('series: expected an object {indicator, view, from, to, places}');
  const table = series?.indicators?.[raw.indicator];
  if (!table) throw new Error(`series: "${raw.indicator}" isn't an indicator we have (${Object.keys(series?.indicators ?? {}).join(', ') || 'none; run npm run series:prepare'})`);
  if (!['line', 'race'].includes(raw.view)) throw new Error('series.view must be "line" or "race"');
  const places = (Array.isArray(raw.places) ? raw.places : []).map((id, index) => {
    const checked = placeId(id, `series.places[${index}]`);
    if (!checked.startsWith('country:')) throw new Error(`series.places[${index}]: "${id}" isn't a country; yearly figures are per country`);
    return checked;
  });
  const out = {indicator: raw.indicator, view: raw.view, places, from: raw.from, to: raw.to};
  if (typeof raw.at === 'number') out.at = raw.at;
  if (raw.shade === true) {
    if (!SHADEABLE.includes(raw.indicator)) throw new Error(`series.shade: ${raw.indicator} cannot shade the map (only ${SHADEABLE.join(', ')})`);
    out.shade = true;
  }
  if (raw.mark !== undefined && raw.mark !== null) {
    if (raw.view !== 'line') throw new Error('series.mark belongs to a line chart');
    if (!MARKS.includes(raw.mark.kind)) throw new Error(`series.mark.kind must be one of ${MARKS.join(', ')}`);
    if (!Number.isInteger(raw.mark.year)) throw new Error('series.mark.year must be a whole year');
    if (raw.mark.kind !== 'year') {
      const first = places[0];
      if (!first) throw new Error(`series.mark: a "${raw.mark.kind}" needs the country it is about as the first of places`);
      const actual = extremeYear(table, first.slice('country:'.length), raw.from, raw.to, raw.mark.kind);
      if (actual !== raw.mark.year) throw new Error(`series.mark: ${first}'s ${raw.mark.kind} between ${Math.min(raw.from, raw.to)} and ${Math.max(raw.from, raw.to)} is ${actual ?? 'unknown'}, not ${raw.mark.year}`);
    }
    out.mark = {year: raw.mark.year, text: raw.mark.kind === 'year' ? String(raw.mark.year) : `${raw.mark.kind.toUpperCase()} ${raw.mark.year}`};
  }
  // A zoomed axis exaggerates a gap, so it is only for showing a turn: a verified peak or low. Otherwise the axis starts at zero.
  if (raw.axis === 'fit' && raw.view === 'line' && (raw.mark?.kind === 'peak' || raw.mark?.kind === 'low')) out.axis = 'fit';
  return out;
};

const compact = (value, {decimals}, unit) => {
  if (unit === 'people') return value >= 1e9 ? `${(value / 1e9).toPrecision(3)}B` : value >= 1e6 ? `${(value / 1e6).toPrecision(3)}M` : `${Math.round(value / 1e3)}K`;
  return unit === 'US$' ? `$${Math.round(value).toLocaleString('en-US')}` : value.toFixed(decimals);
};

/** For the prompt: per indicator the years covered and, per country in the episode, a few readings, its peak and its low. */
export const seriesDigest = (series, places) => {
  if (!series?.indicators) return '';
  const codes = [...places.keys()].filter((id) => id.startsWith('country:')).map((id) => id.slice('country:'.length));
  return Object.entries(INDICATORS).filter(([key]) => series.indicators[key]).map(([key, info]) => {
    const table = series.indicators[key];
    const rows = codes.filter((code) => table.countries[code]).map((code) => {
      const first = table.years.findIndex((_, index) => table.countries[code][index] !== null);
      const last = table.years.length - 1 - [...table.years].reverse().findIndex((_, index) => table.countries[code][table.years.length - 1 - index] !== null);
      const peak = extremeYear(table, code, table.years[first], table.years[last], 'peak');
      const low = extremeYear(table, code, table.years[first], table.years[last], 'low');
      const at = (year) => `${year} ${compact(table.countries[code][year - table.years[0]], info, info.unit)}`;
      const picks = [...new Set([table.years[first], ...[1980, 2000].filter((year) => year > table.years[first] && year < table.years[last]), table.years[last]])];
      return `  country:${code}: ${picks.map(at).join(', ')}; highest ${at(peak)}; lowest ${at(low)}`;
    });
    return `- ${key} (${info.name}, ${info.unit}; years ${table.years[0]}-${table.years.at(-1)})${rows.length ? `:\n${rows.join('\n')}` : ': none of the episode\'s countries'}`;
  }).join('\n');
};
