import type {VideoManifest} from '../../src/schema';
import type {Primitive} from '../primitive-schema.mjs';
import type {Angle} from './angles.mjs';
import type {Research} from './pokeapi.mjs';
import type {Complete, Draft} from './writer.mjs';

export type VisualAssignment = {id: string; kind: Primitive['kind']; why: string};

export declare const PRIMITIVE_GUIDE: [string, string, string][];
export declare const checkPrimitive: (primitive: Primitive, research: Research) => string[];
export declare const buildDirectorPrompt: (options: {draft: Draft; manifest: VideoManifest; research: Research; angle?: Angle; showId?: string}) => {system: string; messages: {role: string; content: string}[]};
export declare const directVisuals: (options: {draft: Draft; research: Research; angle?: Angle; complete?: Complete | null; showId?: string}) => Promise<{draft: Draft; manifest: VideoManifest; assigned: VisualAssignment[]; rejected: {id: string; reason: string}[]; modelError?: string}>;
