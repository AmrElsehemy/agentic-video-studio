import type {Quat} from './plates.mjs';
export declare const toVector: (point: [number, number]) => [number, number, number];
export declare const alignRotation: (from: [number, number], to: [number, number]) => Quat;
export declare const trueSizeRotation: (from: [number, number], to: [number, number]) => Quat;
export declare const partialRotation: (q: Quat, share: number) => Quat;
