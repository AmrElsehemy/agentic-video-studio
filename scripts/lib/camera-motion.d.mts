type Boxes = Map<string, number[] | undefined>;
export declare const MIN_ZOOM_RATIO: number;
export declare const MIN_PAN_SHARE: number;
export declare const MIN_MOVING_SHARE: number;
export declare const CLOSE_SPAN: number;
export declare const REVEAL_RATIO: number;
export declare const sceneMotion: (primitive: {[key: string]: any}, boxes: Boxes) => {zoom: number; pan: number; close: number; moves: boolean; own: boolean} | undefined;
export declare const cameraMotion: (manifest: {scenes: {id: string; primitive?: {kind?: string; [key: string]: any}}[]}, boxes: Boxes) => {scenes: number; still: string[]; problems: string[]};
