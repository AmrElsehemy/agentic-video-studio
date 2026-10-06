// Twins (#92): an episode that retells another with a different palette, or
// (for an architecture walkthrough) a different drawing style, so the two can
// be compared with the topic held fixed. The story must be the same, the
// palette mode or the look must differ, and the titles must differ so the
// channel can tell the uploads apart.
import {paletteMode} from './palette.mjs';
import {narrationProvider, voiceInputHash} from './voice-lock.mjs';

const narration = (manifest) => manifest.scenes.map((scene) => scene.narration).join('\n');

/** What's wrong with `manifest` as the twin of `twin` (missing when it isn't in the catalog); [] when nothing is. */
export const twinProblems = (manifest, twin) => {
  if (!manifest.twinOf) return [];
  if (!twin) return [`its twin "${manifest.twinOf}" isn't in the catalog`];
  const problems = [];
  if (twin.id === manifest.id) problems.push('it is its own twin');
  if (twin.twinOf) problems.push(`its twin ${twin.id} is itself a twin of ${twin.twinOf}; point both at the original`);
  if (twin.show.id !== manifest.show.id) problems.push(`its twin ${twin.id} is a ${twin.show.id} episode, not ${manifest.show.id}`);
  // What a twin changes is its palette (light vs dark) or how its diagram is drawn (clean vs sketch).
  const look = (episode) => (episode.diagram?.spec.theme === 'architecture' ? episode.diagram.spec.look ?? 'clean' : undefined);
  if (paletteMode(twin.palette) === paletteMode(manifest.palette) && look(twin) === look(manifest)) problems.push(look(manifest) ? `it and its twin ${twin.id} have the same palette and are both drawn ${look(manifest)}` : `it and its twin ${twin.id} both have a ${paletteMode(manifest.palette)} palette`);
  if (twin.title.trim().toLowerCase() === manifest.title.trim().toLowerCase()) problems.push(`it has the same title as its twin ${twin.id}, so their uploads can't be told apart`);
  if (narration(twin) !== narration(manifest)) problems.push(`its narration differs from its twin ${twin.id}'s; twins tell the same story`);
  // It plays the original's narration track, which only fits when the voice and scene timing match too.
  else if (voiceInputHash(twin, narrationProvider(twin)) !== voiceInputHash(manifest, narrationProvider(manifest))) problems.push(`its voice settings or scene timing differ from its twin ${twin.id}'s, so it can't share their narration`);
  if (manifest.audio?.voice && twin.audio?.voice && manifest.audio.voice.output !== twin.audio.voice.output) problems.push(`it doesn't play its twin ${twin.id}'s narration track`);
  return problems;
};

/**
 * Twin pairs with their latest numbers, from report rows: the topic and
 * script are the same, so what's left to differ is the palette and when each
 * went out (`daysApart`).
 */
export const twinPairs = (rows) => {
  const byId = new Map(rows.map((row) => [row.episodeId, row]));
  const side = (row) => ({
    episodeId: row.episodeId,
    paletteMode: row.paletteMode,
    ...(row.publishedAt ? {publishedAt: row.publishedAt} : {}),
    views: row.snapshot?.views,
    averageViewPercent: row.snapshot?.views ? row.snapshot.averageViewPercent : undefined,
  });
  return rows.filter((row) => row.twinOf && byId.has(row.twinOf)).map((row) => {
    const [original, twin] = [byId.get(row.twinOf), row];
    const daysApart = original.publishedAt && twin.publishedAt ? Math.round(Math.abs(Date.parse(twin.publishedAt) - Date.parse(original.publishedAt)) / 864e5 * 10) / 10 : undefined;
    return {topic: original.topic, original: side(original), twin: side(twin), ...(daysApart === undefined ? {} : {daysApart})};
  });
};
