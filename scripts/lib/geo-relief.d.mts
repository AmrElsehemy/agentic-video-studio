export declare const sha256: (data: Buffer | string) => string;
export declare const RELIEF: {url: string; sha256: string; version: string; pixelsPerDegree: number; flat: number; gain: number; images: {id: string; bbox: [number, number, number, number]; downsample: number}[]};
export declare const mercatorY: (lat: number) => number;
export declare const reliefRows: (source: Buffer | Uint8Array, options: {width: number; height: number; south: number; north: number; flat: number; gain: number}) => {pixels: Buffer; outHeight: number};
