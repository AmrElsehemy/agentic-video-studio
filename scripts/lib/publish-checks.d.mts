import type {VideoManifest} from '../../src/schema';
import type {GeoData} from './geo-primitives.mjs';

export declare const publishBlockers: (manifest: VideoManifest, geo?: Pick<GeoData, 'entities'>) => string[];
