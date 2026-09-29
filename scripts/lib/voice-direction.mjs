// Scene-aware performance direction for expressive TTS narration.
// Story generation decides what is said; this module only directs performance.
const DELIVERY_BY_BEAT = {
  hook: 'Open immediately with punch and intrigue. Sound slightly conspiratorial, like you cannot wait to share the discovery. Stress the surprising word or phrase; do not sound like an announcer.',
  evidence: 'Sound curious and conversational. Keep momentum while making the fact feel like a clue, not a list item.',
  escalation: 'Increase urgency and energy slightly. Make this feel like the story is getting stranger or more important, without shouting or rushing.',
  twist: 'Create contrast. Give a tiny pause before the turn, then land the unexpected part with clear emphasis.',
  reveal: 'Build anticipation, use a tiny pause immediately before the reveal, then land the key words cleanly and confidently.',
  payoff: 'Sound satisfied and decisive, like the earlier setup just clicked into place. Emphasize the payoff rather than speeding through it.',
  verdict: 'Relax into a genuinely conversational question. Sound like you actually want the viewer’s opinion; avoid presenter or game-show intonation.',
  interaction: 'Relax into a genuinely conversational question. Sound like you actually want the viewer’s opinion; avoid presenter or game-show intonation.',
};

const DELIVERY_BY_ROLE = {
  hook: DELIVERY_BY_BEAT.hook,
  evidence: DELIVERY_BY_BEAT.evidence,
  escalation: DELIVERY_BY_BEAT.escalation,
  payoff: DELIVERY_BY_BEAT.payoff,
  interaction: DELIVERY_BY_BEAT.interaction,
};

export const sceneDelivery = (scene = {}) => DELIVERY_BY_BEAT[scene.beat] || DELIVERY_BY_ROLE[scene.role] || 'Keep the delivery energetic, conversational, and specific to this line. Vary emphasis naturally; never fall into neutral TTS cadence.';

export const buildVoiceInstructions = ({baseInstructions, scene}) => [
  baseInstructions,
  'Performance rule: this is a short-form creator performance, not narration read from a page. Use natural pitch movement, varied emphasis, micro-pauses, and emotional contrast. Never become theatrical, cartoony, corporate, documentary-like, or monotone.',
  `Scene direction: ${sceneDelivery(scene)}`,
].filter(Boolean).join('\n');
