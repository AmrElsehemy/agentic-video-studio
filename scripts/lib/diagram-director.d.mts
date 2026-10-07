import type {DiagramPrimitive} from '../primitive-schema.mjs';

type Complete = (prompt: {system: string; messages: {role: string; content: string}[]}) => Promise<string>;

export declare const canvasAfter: (spec: any, scenes: {primitive?: unknown}[]) => Set<string>;
export declare const repairActions: (actions: unknown[], context: {spec: any; scene: {narration: string}; previous: any[]}) => {actions: any[]; repairs: string[]};
export declare const shotToActions: (shot: unknown, context: {spec: any; scene: any; previous: any[]}) => {primitive: DiagramPrimitive; repairs: string[]};
export declare const fallbackActions: (spec: any, scene: {id: string; narration: string}, context: {shown: Set<string>; scenesLeft: number; first?: boolean; previousLane?: 'read' | 'write'}) => DiagramPrimitive;
export declare const buildDiagramDirectorPrompt: (input: {draft: any; showId?: string}) => {system: string; messages: {role: 'user'; content: string}[]};
export declare const directDiagram: (input: {draft: any; complete?: Complete; showId?: string}) => Promise<{
  draft: any;
  manifest: any;
  assigned: {id: string; why: string; repairs?: string[]}[];
  fallbacks: {id: string; reason: string}[];
  modelError?: string;
}>;
