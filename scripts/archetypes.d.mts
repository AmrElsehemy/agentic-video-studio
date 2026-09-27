export type Archetype = {
  sceneRoles: string[];
  visuals: string[];
  shots: string[];
  subjectFocus: string[];
  defaultBeat: number;
};

export declare const archetypes: Record<string, Archetype>;
export declare const getArchetype: (name: string) => Archetype;
