export const COMMONS_API: string;
export const USER_AGENT: string;
export const licenseKind: (shortName?: string) => 'public-domain' | 'attribution' | undefined;
export const refusal: (shortName?: string) => string;
export const plainText: (html?: string) => string;
export const attributionLine: (photo: {author: string; license: string; kind?: string}) => string;
export const screenCredit: (photo: {author: string; license: string; kind?: string}) => string;
export const describeFile: (page: {title: string; imageinfo?: any[]}) => {title: string; pageUrl: string; imageUrl: string; width: number; height: number; originalWidth: number; originalHeight: number; mime: string; license: string; licenseUrl?: string; kind?: 'public-domain' | 'attribution'; author: string; description: string};
