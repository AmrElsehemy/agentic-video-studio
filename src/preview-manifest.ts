import type {VideoManifest} from './schema';

// Default props for Remotion Studio. Real renders always pass an episode's
// manifest; this placeholder keeps the Studio independent of any episode, so
// one broken video.json can't break the others.
const artwork = 'https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/other/official-artwork/132.png';

export const previewManifest: VideoManifest = {
  schemaVersion: 1,
  id: 'studio-preview',
  show: {id: 'studio', name: 'Studio preview', handle: '@studio'},
  title: 'Studio preview',
  direction: {
    engineVersion: 2,
    storyPattern: 'mechanic',
    numberRelevant: false,
    premise: 'A placeholder episode for Remotion Studio.',
    audiencePromise: 'Show every layer of the scene engine.',
    openLoop: 'Which episode will you render?',
    payoff: 'Pass a manifest to render a real episode.',
    targetEmotion: 'curiosity',
    engagementQuestion: 'Shot or primitive?',
    targetSecondsBetweenVisualChanges: 0.65,
  },
  subject: {name: 'Ditto', index: '#132', category: 'Transform Pokémon', artworkUrl: artwork},
  evolutions: [],
  format: {width: 1080, height: 1920, fps: 30},
  palette: {background: '#140b1f', surface: '#2a1640', primary: '#c79bff', secondary: '#6fd3ff', ink: '#fbf7ff'},
  audio: {musicVolume: 0.09},
  rights: {
    releaseStatus: 'internal-prototype',
    publicReleaseApproved: false,
    ownershipNotice: 'Placeholder for local previews only.',
    nonAffiliationNotice: 'Placeholder for local previews only.',
    assets: [{kind: 'preview artwork', sourceUrl: artwork, owner: 'The Pokémon Company / Nintendo / Creatures / GAME FREAK', licenseStatus: 'unverified', publicReleaseApproved: false}],
  },
  scenes: [
    {id: 'hook', durationSeconds: 4, role: 'hook', shot: 'impact', subjectFocus: 'primary', beatEverySeconds: 0.65, visual: 'hook', headline: 'STUDIO PREVIEW', narration: 'Pass an episode manifest to render it.', caption: 'NO EPISODE SELECTED'},
    {id: 'primitive', durationSeconds: 4, role: 'evidence', shot: 'macro', subjectFocus: 'primary', beatEverySeconds: 0.65, visual: 'gauntlet', headline: 'PRIMITIVES', narration: 'Scenes can draw a semantic primitive.', caption: 'A COUNTER, FOR EXAMPLE', primitive: {kind: 'counter', from: 0, to: 132, label: 'PLACEHOLDER'}},
    {id: 'verdict', durationSeconds: 4, role: 'interaction', shot: 'interaction', subjectFocus: 'primary', beatEverySeconds: 0.65, visual: 'cta', headline: 'SHOT OR PRIMITIVE?', narration: 'Which will your next scene use?', caption: 'YOUR CALL'},
  ],
  sources: [{label: 'PokéAPI', url: 'https://pokeapi.co/'}],
};
