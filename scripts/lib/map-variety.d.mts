export declare const MIN_CHANGING_SHARE: number;
export declare const MIN_DISTINCT_SHARE: number;
export declare const mapVariety: (manifest: {scenes: {id: string; primitive?: {kind?: string; [key: string]: any}}[]}) => {scenes: number; distinct: number; repeats: string[]; problems: string[]};
export declare const mapDirectionProblems: (manifest: {scenes: {id: string; primitive?: {kind?: string; [key: string]: any}}[]}) => string[];
export declare const mapDevices: (primitive: {[key: string]: any}) => Set<string>;
export declare const MIN_DEVICES: number;
export declare const mapDeviceProblems: (manifest: {scenes: {id: string; primitive?: {kind?: string; [key: string]: any}}[]}) => string[];
