type Palette = {background: string; surface: string; primary: string; secondary: string; ink: string};
export declare const luminance: (hex: string) => number;
export declare const contrastRatio: (a: string, b: string) => number;
export declare const paletteMode: (palette: Pick<Palette, 'background'>) => 'light' | 'dark';
export declare const MIN_CONTRAST: {ink: number; accent: number};
export declare const paletteProblems: (palette: Palette) => string[];
