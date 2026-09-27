export type Beat = {
  id: string;
  role: 'hook' | 'evidence' | 'escalation' | 'twist' | 'payoff' | 'interaction';
  minScenes: number;
  maxScenes: number;
  shots: string[];
  visuals: string[];
  subjectFocus: string[];
  maxSeconds?: number;
};

export type Archetype = {
  description: string;
  defaultBeat: number;
  beats: Beat[];
};

export type ScenePlan = {
  beat: string;
  role: Beat['role'];
  shot: string;
  visual: string;
  subjectFocus: string;
  maxSeconds?: number;
};

import type {z} from 'zod';

export declare const archetypeSchema: z.ZodType<Archetype>;
export declare const archetypes: Record<string, Archetype>;
export declare const getArchetype: (name: string) => Archetype;
export declare const planScenes: (archetype: Archetype, scenes: {id: string; beat?: string}[]) => ScenePlan[];
