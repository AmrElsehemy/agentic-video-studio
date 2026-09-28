export declare const networkError: (label: string, url: string, error: unknown) => Error;
export declare const fetchWithReason: (label: string, url: string, init?: RequestInit, fetchImpl?: typeof fetch) => Promise<Response>;
