// What an episode's YouTube description says (#89): the notices, one credit
// line saying how it was made, attributions its assets ask for, its sources and
// the show's hashtags. Used by `npm run description` and by the upload, so the
// file you review is the text that's published.

const unique = (items) => [...new Set(items.filter(Boolean))];

/** "Natural Earth v5.1.2" → "Natural Earth": the credit names the source, not its release. */
const sourceName = (owner) => owner.replace(/\s+v?\d+(\.\d+)*$/i, '');

/**
 * One line on how the episode was made, e.g. "Animated in code · Narration:
 * AI-generated voice (OpenAI TTS) · Map data: Natural Earth". It names
 * services, never model identifiers.
 */
export const creditLine = (manifest) => {
  const voice = manifest.audio?.voice;
  const maps = unique((manifest.rights?.assets ?? []).filter((asset) => asset.kind === 'map-data').map((asset) => sourceName(asset.owner)));
  return [
    'Animated in code',
    voice ? `Narration: AI-generated voice${{openai: ' (OpenAI TTS)', elevenlabs: ' (ElevenLabs)'}[voice.provider] ?? ''}` : undefined,
    maps.length ? `Map data: ${maps.join(', ')}` : undefined,
  ].filter(Boolean).join(' · ');
};

/** The description, at most 5,000 characters (YouTube's limit). */
export const episodeDescription = (manifest, show) => {
  const attributions = (manifest.rights?.assets ?? []).filter((asset) => asset.kind === 'map-data' && asset.notes).map((asset) => asset.notes);
  const sources = (manifest.sources ?? []).map((source) => `- ${source.label}: ${source.url}`);
  const hashtags = show?.publishing?.hashtags ?? ['#Shorts'];
  return [
    manifest.title,
    '',
    manifest.rights?.nonAffiliationNotice,
    manifest.rights?.ownershipNotice,
    creditLine(manifest),
    ...unique(attributions),
    ...(sources.length ? ['', 'Sources:', ...sources] : []),
    '',
    hashtags.join(' '),
  ].filter((line) => line !== undefined && line !== null).join('\n').slice(0, 5000);
};

/** The video's tags: the show's, then the episode's subject and its identifier; at most 30. */
export const episodeTags = (manifest, show) => {
  const subject = manifest.subject?.name ?? manifest.title;
  const identifier = manifest.subject?.identifier ? String(manifest.subject.identifier).replace(/^#/, '').trim() : undefined;
  return unique([...(show?.publishing?.tags ?? [show?.name ?? manifest.show?.name, 'Shorts']), subject, identifier]).slice(0, 30);
};
