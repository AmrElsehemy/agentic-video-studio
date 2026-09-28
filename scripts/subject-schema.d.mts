import type {z} from 'zod';

export type Relation = 'evolves-to' | 'evolves-from' | 'form' | 'related';
export type Subject = {name: string; category: string; artworkUrl: string; identifier?: string; attributes?: Record<string, string | number>};
export type RelatedSubject = {name: string; relation: Relation; artworkUrl: string; identifier?: string};

export declare const RELATIONS: Relation[];
export declare const subjectSchema: z.ZodType<Subject>;
export declare const relatedSchema: z.ZodType<RelatedSubject>;
export declare const upgradeLegacySubject: <T>(draft: T) => T;
