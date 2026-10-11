// Yearly figures per country, pinned from the World Bank (World Development Indicators, CC BY 4.0).
// Pure helpers: the network fetch lives in scripts/series.mjs so these can be tested.

/** The indicators we pin: id, what to call it, its unit label and how to show it. */
export const INDICATORS = {
  population: {code: 'SP.POP.TOTL', name: 'Population', unit: 'people', decimals: 0},
  'life-expectancy': {code: 'SP.DYN.LE00.IN', name: 'Life expectancy at birth', unit: 'years', decimals: 1},
  fertility: {code: 'SP.DYN.TFRT.IN', name: 'Children per woman', unit: 'children', decimals: 2},
  'gdp-per-person': {code: 'NY.GDP.PCAP.CD', name: 'GDP per person', unit: 'US$', decimals: 0},
};

export const FIRST_YEAR = 1960;

/**
 * Turn the World Bank's rows into {years, countries: {ISO3: [value|null per year]}}, keeping only countries we draw.
 * `rows` are the API's records ({countryiso3code, date, value}); aggregates (World, regions) and codes we do not draw are dropped.
 */
export function pivot(rows, {iso3, firstYear = FIRST_YEAR, lastYear}) {
  const known = new Set(iso3);
  const years = [];
  for (let y = firstYear; y <= lastYear; y++) years.push(y);
  const countries = {};
  for (const row of rows) {
    const code = row.countryiso3code;
    if (!known.has(code)) continue;
    const year = Number(row.date);
    if (!(year >= firstYear && year <= lastYear)) continue;
    countries[code] ??= years.map(() => null);
    if (typeof row.value === 'number' && Number.isFinite(row.value)) countries[code][year - firstYear] = row.value;
  }
  // A country with no figure at all adds nothing.
  for (const [code, values] of Object.entries(countries)) if (values.every((v) => v === null)) delete countries[code];
  return {years, countries};
}

/** The last year in which at least `share` of the countries have a figure (the newest year is often half empty). */
export function lastCompleteYear({years, countries}, share = 0.8) {
  const codes = Object.values(countries);
  for (let i = years.length - 1; i >= 0; i--) if (codes.filter((v) => v[i] !== null).length >= share * codes.length) return years[i];
  return years[0];
}

/** One country's figure in a year, linearly filled between its neighbouring years and null outside what it has. */
export function valueAt(series, code, year) {
  const values = series.countries[code];
  if (!values) return null;
  const position = year - series.years[0];
  if (position < 0 || position > series.years.length - 1) return null;
  const low = Math.floor(position);
  const high = Math.ceil(position);
  const a = values[low];
  const b = values[high];
  if (a === null || b === null) return a === null && b === null ? null : low === high ? a : null;
  return a + (b - a) * (position - low);
}

/** Whole-number years from `from` to `to` (either order). */
const span = (from, to) => {
  const list = [];
  for (let y = Math.min(from, to); y <= Math.max(from, to); y++) list.push(y);
  return list;
};

/** The countries that are ever among the `top` highest in a year of the span: the only ones a ranked race needs to draw. */
export function raceCandidates(series, from, to, top = 6, exclude = []) {
  const skip = new Set(exclude);
  const found = new Set();
  for (const year of span(from, to)) {
    const ranked = Object.keys(series.countries).filter((code) => !skip.has(code)).map((code) => [code, valueAt(series, code, year)]).filter(([, v]) => v !== null).sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : 1));
    for (const [code] of ranked.slice(0, top + 1)) found.add(code);
  }
  return [...found].sort();
}

/**
 * The rows of a ranked race at a (fractional) year: each candidate's value and a rank that glides between its
 * ranks at the two whole years either side, so countries slide past each other instead of jumping.
 */
export function raceAt(series, candidates, year) {
  const low = Math.floor(year);
  const high = Math.ceil(year);
  const mix = year - low;
  const rankAt = (y) => {
    const order = candidates.map((code) => [code, valueAt(series, code, y)]).filter(([, v]) => v !== null).sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : 1));
    return new Map(order.map(([code], index) => [code, index]));
  };
  const a = rankAt(low);
  const b = low === high ? a : rankAt(high);
  const rows = [];
  for (const code of candidates) {
    const value = valueAt(series, code, year);
    if (value === null) continue;
    const r0 = a.get(code) ?? candidates.length;
    const r1 = b.get(code) ?? candidates.length;
    rows.push({code, value, rank: r0 + (r1 - r0) * mix});
  }
  return rows.sort((x, y) => x.rank - y.rank);
}

/** A "nice" axis ceiling at or above `value` (1, 2, 2.5, 5 or 10 times a power of ten). */
export function niceCeiling(value) {
  if (!(value > 0)) return 1;
  const power = 10 ** Math.floor(Math.log10(value));
  for (const step of [1, 2, 2.5, 5, 10]) if (step * power >= value * 0.999999) return step * power;
  return 10 * power;
}

/** An axis that fits the data tightly (for a turning point): tidy bounds at whole steps of a tidy size, at most five ticks. */
export function niceRange(min, max) {
  const span = max - min;
  if (!(span > 0)) return {low: Math.floor(min), high: Math.ceil(max) + 1, step: 1};
  const step = niceCeiling(span / 4);
  return {low: Math.floor(min / step + 1e-9) * step, high: Math.ceil(max / step - 1e-9) * step, step};
}
