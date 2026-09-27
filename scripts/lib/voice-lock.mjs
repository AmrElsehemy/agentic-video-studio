import crypto from 'node:crypto';

/**
 * Hash of everything a generated narration track and its timing depend on.
 * If any of it changes, the track no longer matches the manifest.
 */
export const voiceInputHash = (manifest, provider) => {
  const voice = manifest.audio?.voice ?? {};
  const inputs = {
    provider,
    model: voice.model,
    voice: voice.voice,
    speed: voice.speed,
    instructions: voice.instructions,
    scenes: manifest.scenes.map((scene) => ({id: scene.id, narration: scene.narration, durationSeconds: scene.durationSeconds})),
  };
  return crypto.createHash('sha256').update(JSON.stringify(inputs)).digest('hex');
};

/**
 * Why a timing file doesn't match the manifest, or null when it does.
 * Timing files written before input hashes existed are treated as stale.
 */
export const voiceStaleReason = (manifest, provider, timing) => {
  if (!timing) return 'no timing file was found for the track';
  if (!timing.inputHash) return 'the track was generated before narration locking existed';
  if (timing.inputHash !== voiceInputHash(manifest, provider)) return 'narration, scene timing or voice settings changed since the track was generated';
  return null;
};
