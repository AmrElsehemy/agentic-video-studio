// Video Critic: a vision model looks at one rendered frame per scene (and the
// cover) and checks what OCR and pixel statistics can't judge: legibility,
// overlap, safe areas, visible artwork, and whether each frame shows its beat.
import {parseJsonReply} from './fact-verifier.mjs';

export const VISUAL_CHECKS = {
  legibility: 'All text is legible: enough contrast and size, nothing cut off at the frame edge.',
  overlap: 'No text overlaps other text or is hidden behind artwork (including large faint backdrop words).',
  headline: 'The scene headline is visible; on the hook (scene 1) it is large and immediate.',
  caption: 'The caption appears exactly once, at the bottom.',
  artwork: 'Pokémon artwork is visible unless the scene deliberately hides the subject (a silhouette).',
  'safe-area': 'Nothing important sits where platform UI covers it: the right edge between 45% and 85% of the height (like/comment buttons) or the bottom 8% (the description).',
  beat: 'The frame visually expresses what the scene is about (its beat and visual), not just generic artwork.',
  variety: 'Consecutive scenes look visibly different.',
};
const SEVERITIES = ['blocking', 'warning'];

/** What each frame should show, from the manifest. */
export const frameExpectations = (manifest) => manifest.scenes.map((scene, index) => ({
  scene: index + 1,
  id: scene.id,
  role: scene.role,
  beat: scene.beat,
  shot: scene.shot,
  ...(scene.primitive ? {primitive: scene.primitive.kind} : {}),
  subjectFocus: scene.subjectFocus,
  headline: scene.headline,
  caption: scene.caption,
  ...(scene.eyebrow ? {eyebrow: scene.eyebrow} : {}),
  ...(scene.facts?.length ? {facts: scene.facts} : {}),
  narration: scene.narration,
}));

export const buildVideoCriticPrompt = ({manifest, frames, cover}) => ({
  system: `You are the visual QA lead of PokePulses, a vertical (9:16) short-form video series about Pokémon. You see one frame from the middle of each scene, and the episode's cover. Check every frame against:
${Object.entries(VISUAL_CHECKS).map(([check, description]) => `- ${check}: ${description}`).join('\n')}
For the cover: its title is the hook headline ("${manifest.scenes[0].headline}") and it must be about ${manifest.subject.name}.

Report only real problems you can see. "blocking" means the episode must not ship (missing or duplicated text, unreadable text, text hidden behind artwork, a cover for the wrong episode, a blank frame). "warning" is anything that should be improved.

Reply with a JSON object only: {"issues": [{"where": "scene 2" | "cover" | "episode", "check": one of ${JSON.stringify(Object.keys(VISUAL_CHECKS))}, "severity": "blocking" | "warning", "message": "what is wrong and how to fix it"}]} (an empty list when everything looks right).`,
  messages: [{
    role: 'user',
    content: [
      {type: 'text', text: `Episode: ${manifest.title} (${manifest.subject.name}, ${manifest.direction.storyPattern}).\nWhat each frame should show:\n${JSON.stringify(frameExpectations(manifest), null, 2)}`},
      ...frames.flatMap((frame, index) => [
        {type: 'text', text: `Scene ${index + 1} (${manifest.scenes[index].id}):`},
        {type: 'image', mediaType: 'image/png', data: frame.png},
      ]),
      ...(cover?.png ? [{type: 'text', text: 'Cover:'}, {type: 'image', mediaType: 'image/png', data: cover.png}] : []),
    ],
  }],
});

/**
 * Ask a vision model to review the frames. `frames` are {png: <base64>} per
 * scene, `cover` optional. A model failure is reported, not thrown, so the
 * deterministic audit still stands.
 */
export const critiqueFrames = async ({manifest, frames, cover, complete}) => {
  let reply;
  try {
    reply = parseJsonReply(await complete(buildVideoCriticPrompt({manifest, frames, cover})));
  } catch (error) {
    return {issues: [], modelError: error instanceof Error ? error.message : String(error)};
  }
  const items = Array.isArray(reply) ? reply : Array.isArray(reply?.issues) ? reply.issues : [];
  const issues = items
    .filter((item) => item && typeof item.message === 'string' && item.message.trim())
    .map((item) => ({
      where: typeof item.where === 'string' ? item.where : 'episode',
      check: item.check in VISUAL_CHECKS ? item.check : 'other',
      severity: SEVERITIES.includes(item.severity) ? item.severity : 'warning',
      message: item.message.trim(),
      source: 'vision',
    }));
  return {issues};
};
