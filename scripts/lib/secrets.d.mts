export const SECRET_KEYS: string[];
export function parseEnvFile(text: string, name?: string): Record<string, string>;
export function loadSecrets(options?: {root?: string; env?: Record<string, string | undefined>; tracked?: (root: string, file: string) => boolean}): string[];
