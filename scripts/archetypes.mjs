export const archetypes = {
  profile: {
    sceneRoles: ['hook', 'evidence', 'evidence', 'escalation', 'twist', 'interaction'],
    visuals: ['hook', 'gauntlet', 'advantage', 'race', 'tradeoff', 'cta'],
    shots: ['mystery', 'tracking', 'macro', 'comparison', 'impact', 'interaction'],
    subjectFocus: ['hidden', 'secondary', 'secondary', 'primary', 'primary', 'primary'],
    defaultBeat: 0.72,
  },
  mechanic: {
    sceneRoles: ['hook', 'evidence', 'escalation', 'payoff', 'payoff', 'interaction'],
    visuals: ['hook', 'gauntlet', 'advantage', 'race', 'tradeoff', 'cta'],
    shots: ['impact', 'macro', 'comparison', 'tracking', 'impact', 'interaction'],
    subjectFocus: ['primary', 'primary', 'secondary', 'primary', 'primary', 'primary'],
    defaultBeat: 0.65,
  },
  transformation: {
    sceneRoles: ['hook', 'evidence', 'escalation', 'payoff', 'payoff', 'interaction'],
    visuals: ['hook', 'gauntlet', 'race', 'advantage', 'tradeoff', 'cta'],
    shots: ['impact', 'macro', 'tracking', 'comparison', 'wide', 'interaction'],
    subjectFocus: ['primary', 'primary', 'secondary', 'primary', 'secondary', 'primary'],
    defaultBeat: 0.62,
  },
  mystery: {
    sceneRoles: ['hook', 'evidence', 'escalation', 'payoff', 'payoff', 'interaction'],
    visuals: ['hook', 'gauntlet', 'advantage', 'race', 'tradeoff', 'cta'],
    shots: ['mystery', 'macro', 'tracking', 'comparison', 'impact', 'interaction'],
    subjectFocus: ['hidden', 'secondary', 'secondary', 'primary', 'primary', 'primary'],
    defaultBeat: 0.68,
  },
  comparison: {
    sceneRoles: ['hook', 'evidence', 'evidence', 'escalation', 'twist', 'interaction'],
    visuals: ['hook', 'gauntlet', 'advantage', 'race', 'tradeoff', 'cta'],
    shots: ['comparison', 'wide', 'macro', 'tracking', 'impact', 'interaction'],
    subjectFocus: ['secondary', 'secondary', 'secondary', 'primary', 'primary', 'primary'],
    defaultBeat: 0.7,
  },
};

export const getArchetype = (name) => {
  const archetype = archetypes[name];
  if (!archetype) throw new Error(`Unknown story archetype: ${name}. Supported: ${Object.keys(archetypes).join(', ')}`);
  return archetype;
};
