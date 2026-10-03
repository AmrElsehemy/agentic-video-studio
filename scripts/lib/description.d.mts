import type {ShowProfile} from './shows.mjs';
type DescribedManifest = {title: string; show?: {name?: string}; subject?: {name?: string; identifier?: string}; audio?: {voice?: {provider?: string}}; rights?: {nonAffiliationNotice?: string; ownershipNotice?: string; assets?: {kind: string; owner: string; notes?: string}[]}; sources?: {label: string; url: string}[]};
export declare const creditLine: (manifest: DescribedManifest) => string;
export declare const episodeDescription: (manifest: DescribedManifest, show?: Pick<ShowProfile, 'publishing' | 'name'>) => string;
export declare const episodeTags: (manifest: DescribedManifest, show?: Pick<ShowProfile, 'publishing' | 'name'>) => string[];
