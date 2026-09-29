// Deterministic sound-design planning from story beats. This keeps audio
// punctuation data-driven: every generated episode gets cues without manual
// timeline editing or subject-specific hard-coding.
const CUE_BY_BEAT = {
  hook: 'impact',
  evidence: 'whoosh',
  escalation: 'riser',
  twist: 'reveal',
  reveal: 'reveal',
  payoff: 'impact',
  verdict: 'chime',
  interaction: 'chime',
};

const CUE_BY_ROLE = {
  hook: 'impact',
  evidence: 'whoosh',
  escalation: 'riser',
  payoff: 'impact',
  interaction: 'chime',
};

export const cueForScene = (scene = {}) => CUE_BY_BEAT[scene.beat] || CUE_BY_ROLE[scene.role] || 'whoosh';

export const sceneEnergy = (scene = {}) => {
  const beat = scene.beat || scene.role;
  if (beat === 'hook') return 1.08;
  if (beat === 'escalation' || beat === 'twist' || beat === 'reveal') return 1.12;
  if (beat === 'payoff') return 1.06;
  if (beat === 'verdict' || beat === 'interaction') return 0.9;
  return 1;
};

export const planSoundEvents = (scenes = []) => {
  let cursor = 0;
  return scenes.map((scene, index) => {
    const event = {
      sceneId: scene.id,
      index,
      time: cursor,
      cue: cueForScene(scene),
      energy: sceneEnergy(scene),
    };
    cursor += scene.durationSeconds;
    return event;
  });
};
