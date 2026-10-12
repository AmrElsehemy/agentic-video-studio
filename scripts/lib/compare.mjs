// Compare published episodes by feature (see feature-tags.mjs). Honest about how little a handful of videos can say:
// groups under MIN_GROUP are listed but not ranked, and views are read at the same age, from the saved live counts.
export const MIN_GROUP = 4;
const DAY = 86_400_000;

const median = (values) => {
  if (!values.length) return undefined;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
};

/** Views the video had `ageDays` after publishing, interpolated between saved counts; undefined if history doesn't reach that far. */
export const viewsAtAge = (history, videoId, publishedAt, ageDays) => {
  const start = Date.parse(publishedAt);
  const points = [{t: start, views: 0}, ...history.flatMap((entry) => (entry.videos[videoId] ? [{t: Date.parse(entry.capturedAt), views: entry.videos[videoId].views}] : []))]
    .filter((point) => point.t >= start).sort((a, b) => a.t - b.t);
  const target = start + ageDays * DAY;
  if (points.length < 2 || points.at(-1).t < target) return undefined;
  const after = points.findIndex((point) => point.t >= target);
  const [a, b] = [points[after - 1] ?? points[after], points[after]];
  return a.t === b.t ? b.views : a.views + (b.views - a.views) * ((target - a.t) / (b.t - a.t));
};

/**
 * rows: [{episodeId, videoId, publishedAt, views, likes, tags}] for public videos. Returns each tag's group against the rest,
 * measured by views per day of age (episodes at least `minAgeDays` old) and like rate.
 */
export const compareByTag = (rows, {now = new Date(), minAgeDays = 2, history = [], matchAge} = {}) => {
  const aged = rows.map((row) => {
    const ageDays = (now - Date.parse(row.publishedAt)) / DAY;
    const atAge = matchAge ? viewsAtAge(history, row.videoId, row.publishedAt, matchAge) : undefined;
    return {...row, ageDays, rate: matchAge ? atAge : row.views / Math.max(ageDays, 1), likeRate: row.views ? row.likes / row.views : undefined};
  }).filter((row) => row.ageDays >= minAgeDays && row.rate !== undefined);
  const tags = [...new Set(aged.flatMap((row) => row.tags))];
  const summary = (group) => ({n: group.length, medianRate: median(group.map((row) => row.rate)), medianLikeRate: median(group.filter((row) => row.likeRate !== undefined).map((row) => row.likeRate)), episodes: group.map((row) => row.episodeId)});
  const groups = tags.map((tag) => {
    const [withTag, without] = [aged.filter((row) => row.tags.includes(tag)), aged.filter((row) => !row.tags.includes(tag))];
    const [a, b] = [summary(withTag), summary(without)];
    const readable = a.n >= MIN_GROUP && b.n >= MIN_GROUP;
    return {tag, with: a, without: b, readable, ratio: readable && b.medianRate ? a.medianRate / b.medianRate : undefined};
  }).filter((group) => group.without.n > 0).sort((a, b) => Number(b.readable) - Number(a.readable) || (b.ratio ?? 0) - (a.ratio ?? 0) || b.with.n - a.with.n);
  return {episodes: aged.length, metric: matchAge ? `views at day ${matchAge}` : 'views per day of age', groups};
};

/** Add a live-counts entry to the history, replacing one taken less than an hour earlier. */
export const appendHistory = (history, entry) => [...history.filter((old) => Math.abs(Date.parse(old.capturedAt) - Date.parse(entry.capturedAt)) > 3_600_000), entry].sort((a, b) => a.capturedAt.localeCompare(b.capturedAt));
