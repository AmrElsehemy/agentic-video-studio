export type CreativeReference = {
  id: string;
  subject: string;
  source: string;
  archetypes: string[];
  whyItWorks: string[];
  episode: {title: string; premise: string; openLoop: string; payoff: string; engagementQuestion: string; scenes: {role: string; headline: string; narration: string; caption: string}[]} & Record<string, unknown>;
};

export declare const referenceSchema: unknown;
export declare const loadReferences: (dir?: string) => CreativeReference[];
export declare const selectReferences: (references: CreativeReference[], storyPattern?: string) => CreativeReference[];
