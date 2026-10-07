import type {ArchSpec} from '../diagram-arch-schema.mjs';
export declare const stepRoute: (spec: ArchSpec, step: ArchSpec['steps'][number], taken?: Set<string>) => string | undefined;
export declare const starterDraft: (options: {id: string; title: string; show: {id: string; name: string; handle: string}; spec: ArchSpec; file: string}) => any;
