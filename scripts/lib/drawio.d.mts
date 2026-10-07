export declare const drawioPages: (xml: string) => {name: string; model: unknown}[];
export declare const parseStyle: (style?: string) => Record<string, string | true>;
export declare const plainText: (value: unknown) => string;
export declare const laneOf: (color?: string) => 'read' | 'write' | 'plain' | 'telemetry';
export declare const AZURE_ICONS: Record<string, string>;
export declare const FALLBACK_ICON: string;
export declare const importDrawio: (xml: string, options?: {page?: string | number; look?: 'clean' | 'sketch'; file?: string}) => {spec: any; assets: Record<string, string>; report: {page: string; pages: string[]; guesses: string[]; unmappedIcons: string[]; nodes: number; groups: number; edges: number; steps: number; labels: number; legend: number; icons: number}};
