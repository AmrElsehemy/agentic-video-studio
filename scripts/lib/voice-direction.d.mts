export type VoiceScene = {
  beat?: string;
  role?: string;
};

export declare const sceneDelivery: (scene?: VoiceScene) => string;

export declare const buildVoiceInstructions: (options: {
  baseInstructions?: string;
  scene?: VoiceScene;
}) => string;
