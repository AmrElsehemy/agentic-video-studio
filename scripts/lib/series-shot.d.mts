export function extremeYear(table: {years: number[]; countries: Record<string, (number | null)[]>}, code: string, from: number, to: number, kind: 'peak' | 'low'): number | undefined;
export function seriesFromShot(raw: unknown, options: {series: any; placeId: (id: unknown, where: string) => string}): Record<string, unknown>;
export function seriesDigest(series: any, places: Map<string, unknown>): string;
