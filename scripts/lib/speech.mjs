// How long narration takes to say, estimated from its text. Calibrated against
// OpenAI short-form narration from this project: a base reading pace plus
// pauses for punctuation and extra time for numbers, which are spoken slowly.
// The compiler sizes scenes from it; the voice preflight checks scenes with it.

export const BASE_WPM = 145;
/** Silence left at the end of each scene. */
export const END_PADDING = 0.12;
/**
 * The compiler sizes a scene so the estimate fills at most this share of it,
 * leaving headroom for delivery that runs slower than the estimate.
 */
export const COMPILE_FILL = 0.86;
/**
 * The voice preflight fails a scene whose estimate exceeds its time by more
 * than this. It is looser than COMPILE_FILL because it only catches
 * hand-edited manifests; real overruns expand scene timing when narration is
 * generated.
 */
export const PREFLIGHT_MAX_RATIO = 1.05;

export const spokenWords = (text) => text.trim().split(/\s+/).filter(Boolean).length;
const pauses = (text) => ((text.match(/[,;:]/g) ?? []).length * 0.10) + ((text.match(/[.!?]/g) ?? []).length * 0.16) + ((text.match(/[—–-]/g) ?? []).length * 0.08);
const numbers = (text) => (text.match(/\b\d[\d,]*\b/g) ?? []).length * 0.18;

/** Estimated seconds to say `text` at a voice speed (1 = normal). */
export const estimatedSpeech = (text, speed) => (spokenWords(text) / BASE_WPM) * 60 / speed + pauses(text) + numbers(text);
