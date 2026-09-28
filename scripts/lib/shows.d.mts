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
  archetypes: string[];
};

export declare const parseShow: (raw: unknown, source?: string) => ShowProfile;
export declare const loadShow: (showId: string, options?: {dir?: string}) => ShowProfile;
