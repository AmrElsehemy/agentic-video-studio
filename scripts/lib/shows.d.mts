import type {Review} from '../episode-fields.mjs';

export type ShowProfile = {
  id: string;
  name: string;
  handle: string;
  description: string;
  wordmark: {lead: string; accent: string};
  fonts: {display: string; body: string};
  palette: {background: string; surface: string; primary: string; secondary: string; ink: string};
  paletteVariants?: Record<string, {background: string; surface: string; primary: string; secondary: string; ink: string}>;
  music: {bpm: number; notes: number[]; volume: number};
  voice: {voice: string; speed: number; model: string; instructions: string};
  notices: {ownership: string; nonAffiliation: string};
  publishing?: {hashtags: string[]; tags: string[]; channelId?: string; playlistId?: string; madeForKids?: boolean};
  subjects?: {identifierLabel: string; identifierPattern: string};
  /** A recorded legal review allowing the show's subject artwork to be published without a licence. */
  artworkClearance?: Review;
  captions?: {mode: 'static' | 'words'};
  archetypes: string[];
};

export declare const parseShow: (raw: unknown, source?: string) => ShowProfile;
export declare const loadShow: (showId: string, options?: {dir?: string}) => ShowProfile;
export declare const loadStyleGuide: (showId: string, options?: {dir?: string}) => string;
export declare const styleGuideSection: (showId: string, options?: {dir?: string}) => string;
