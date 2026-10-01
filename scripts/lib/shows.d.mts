import type {Review} from '../episode-fields.mjs';

export type YoutubePresets = {
  categoryId: string;
  paidPromotion: boolean;
  alteredContent: boolean;
  madeForKids: boolean;
  playlist?: string;
  schedule: {time: string; timeZone: string};
};

export type ShowProfile = {
  id: string;
  name: string;
  handle: string;
  description: string;
  wordmark: {lead: string; accent: string};
  fonts: {display: string; body: string};
  palette: {background: string; surface: string; primary: string; secondary: string; ink: string};
  music: {bpm: number; notes: number[]; volume: number};
  voice: {voice: string; speed: number; model: string; instructions: string};
  notices: {ownership: string; nonAffiliation: string};
  subjects?: {identifierLabel: string; identifierPattern: string};
  /** A recorded legal review allowing the show's subject artwork to be published without a licence. */
  artworkClearance?: Review;
  youtube?: YoutubePresets;
  archetypes: string[];
};

export declare const parseShow: (raw: unknown, source?: string) => ShowProfile;
export declare const loadShow: (showId: string, options?: {dir?: string}) => ShowProfile;
