import type {DiagramLayout, DiagramSpec} from './diagram-layout.mjs';
export declare const PAGE_WIDTH: number;
export declare const SKETCH_TYPE: {title: number; label: number; detail: number};
export declare const SKETCH_EM: number;
export declare const layoutSketch: (spec: DiagramSpec) => DiagramLayout;
export declare const sketchTextProblems: (spec: DiagramSpec) => string[];
