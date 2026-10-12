// Render stills of an episode's scenes in each map look, to compare art directions without changing
// the episode. Usage: npm run looks -- <episode-id> [--looks=classic,neon,atlas,terrain] [--scenes=1,2,4] [--voice=none]
// --dataview=map|bars|both|bubbles changes every data layer's view; --projection=equal-earth|albers|azimuthal draws every flat map scene in that projection; --globe=1,7 draws those scenes on a globe; --flags=1 puts flags on every map scene; --streets=2:vatican-city draws a street map of that city in scene 2; --figure=3:8848:M:HEIGHT OF EVEREST puts a rolling big number on scene 3; --series=2:population:race:from:to[:country:IND] [--shade=1 shades the map by the indicator] or --series=2:life-expectancy:line:1960:2023:country:JPN,country:NGA draws a chart over time in scene 2; --surface=2 [--surfacekind=coast-distance|elevation|flood --rise=10] shades the land by distance from the sea; --morph=2 flows those scenes from Mercator to Equal Earth; --transition=3:wipe|zoom|flash sets how scene 3 arrives; --framing=bleed,loop sets how the episode opens and ends (bleed: first picture fills the frame then settles; loop: the end dissolves into the first frame); --at=0.1,0.5,0.9 takes several moments of each scene (default 0.72).
// Writes out/<show>/<id>/looks/<id>-<look>-scene<N>.png (N counts from 1, taken 72% into the scene).
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {bundle} from '@remotion/bundler';
import {openBrowser, renderStill, selectComposition} from '@remotion/renderer';
import {prepareRenderProps} from './lib/render-props.mjs';
import {resolveEpisodeId} from './catalog.mjs';
import {episodeOutPath} from './lib/out.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const option = (name, fallback) => args.find((arg) => arg.startsWith(`--${name}=`))?.slice(name.length + 3) ?? fallback;
const episodeId = resolveEpisodeId(args.find((arg) => !arg.startsWith('--')));
if (!episodeId) throw new Error('Usage: npm run looks -- <episode-id> [--looks=classic,neon,atlas,terrain] [--scenes=1,2,4]');
const looks = option('looks', 'classic,neon,atlas,terrain').split(',');
const voice = option('voice', 'auto');
const moments = option('at', '0.72').split(',').map(Number);

/** The palette each look is designed with; the headline and caption areas wear it too. */
const PALETTES = {
  neon: {background: '#050818', surface: '#18284f', primary: '#ff3d9a', secondary: '#6c5ce7', ink: '#ffffff'},
  atlas: {background: '#cfe9f2', surface: '#f4e3b8', primary: '#d9482b', secondary: '#2a7fa6', ink: '#14263a'},
  terrain: {background: '#06161c', surface: '#2f5d3c', primary: '#ffd166', secondary: '#10424d', ink: '#f7f2dc'},
};

const {manifest} = prepareRenderProps(episodeId, {voice, log: () => {}});
const scenes = option('scenes', manifest.scenes.map((_, index) => index + 1).join(',')).split(',').map(Number);
const fps = manifest.format.fps;
const starts = manifest.scenes.reduce((list, scene) => [...list, (list.at(-1) ?? 0) + (list.length ? manifest.scenes[list.length - 1].durationSeconds : 0)], []);

const serveUrl = await bundle({entryPoint: path.join(root, 'src', 'index.ts')});
const browser = await openBrowser('chrome', {browserExecutable: process.env.REMOTION_BROWSER_EXECUTABLE || null});
try {
  for (const look of looks) {
    const globes = option('globe', '').split(',').filter(Boolean).map(Number);
    const dataview = option('dataview');
    const projection = option('projection');
    const withData = dataview ? {...manifest, scenes: manifest.scenes.map((scene) => (scene.primitive?.kind === 'geo-map' && scene.primitive.data ? {...scene, primitive: {...scene.primitive, data: {...scene.primitive.data, view: dataview}}} : scene))} : manifest;
    const withProjection = projection ? {...withData, scenes: withData.scenes.map((scene) => (scene.primitive?.kind === 'geo-map' && !scene.primitive.globe ? {...scene, primitive: {...scene.primitive, projection}} : scene))} : withData;
    const withGlobes = globes.length ? {...withProjection, scenes: withProjection.scenes.map((scene, index) => (globes.includes(index + 1) && scene.primitive?.kind === 'geo-map' ? {...scene, primitive: {...scene.primitive, globe: true}} : scene))} : withProjection;
    const morphs = option('morph', '').split(',').filter(Boolean).map(Number);
    const withMorph = morphs.length ? {...withGlobes, scenes: withGlobes.scenes.map((scene, index) => (morphs.includes(index + 1) && scene.primitive?.kind === 'geo-map' ? {...scene, primitive: {...scene.primitive, morph: true, projection: undefined, globe: false, relief: false}} : scene))} : withGlobes;
    const surfaces = option('surface', '').split(',').filter(Boolean).map(Number);
    const withSurface = surfaces.length ? {...withMorph, scenes: withMorph.scenes.map((scene, index) => (surfaces.includes(index + 1) && scene.primitive?.kind === 'geo-map' ? {...scene, primitive: {...scene.primitive, surface: {kind: option('surfacekind', 'coast-distance'), at: 0.1, ...(option('surfacekind') === 'flood' ? {rise: Number(option('rise', '10'))} : {})}}} : scene))} : withMorph;
    const [streetScene, streetCity] = option('streets', '').split(':');
    const withStreets = streetScene ? (() => {
      const {box} = JSON.parse(fs.readFileSync(path.join(root, 'public', 'geo', 'streets', `${streetCity}.json`), 'utf8'));
      const inner = [box[1], box[0], box[3], box[2]].map((v, i) => v + (i < 2 ? 1 : -1) * 0);
      return {...withSurface, scenes: withSurface.scenes.map((scene, index) => (index + 1 === Number(streetScene) && scene.primitive?.kind === 'geo-map' ? {...scene, primitive: {...scene.primitive, globe: false, relief: false, morph: false, camera: [{target: {bbox: inner.map((v, i) => v + (i < 2 ? 1 : -1) * (i % 2 ? 0.002 : 0.003))}, at: 0, padding: 0.02, ease: 'linear'}], streets: {city: streetCity, at: 0.05}}} : scene))};
    })() : withSurface;
    const [seriesScene, seriesIndicator, seriesView, seriesFrom, seriesTo, seriesPlaces = ''] = option('series', '').split(':').reduce((list, part, index) => (index >= 6 ? [...list.slice(0, 5), `${list[5] ?? ''}${list[5] ? ':' : ''}${part}`] : [...list, part]), []);
    const withSeries = seriesScene ? {...withStreets, scenes: withStreets.scenes.map((scene, index) => (index + 1 === Number(seriesScene) && scene.primitive?.kind === 'geo-map' ? {...scene, primitive: {...scene.primitive, series: {indicator: seriesIndicator, view: seriesView, from: Number(seriesFrom), to: Number(seriesTo), places: seriesPlaces.split(',').filter(Boolean), at: 0.04, ...(option('shade') ? {shade: true} : {})}}} : scene))} : withStreets;
    const [figureScene, figureValue, figureUnit, figureText] = option('figure', '').split(':');
    const withFigure = figureScene ? {...withSeries, scenes: withSeries.scenes.map((scene, index) => (index + 1 === Number(figureScene) && scene.primitive?.kind === 'geo-map' ? {...scene, primitive: {...scene.primitive, figure: {value: Number(figureValue), unit: figureUnit || undefined, text: figureText || 'A KEY NUMBER', decimals: 0, at: 0.05}}} : scene))} : withSeries;
    const withFlags = option('flags') ? {...withStreets, scenes: withFigure.scenes.map((scene) => (scene.primitive?.kind === 'geo-map' ? {...scene, primitive: {...scene.primitive, flags: true}} : scene))} : withFigure;
    const [transitionScene, transitionKind] = option('transition', '').split(':');
    const withTransition = transitionScene ? {...withFlags, scenes: withFlags.scenes.map((scene, index) => (index + 1 === Number(transitionScene) ? {...scene, transition: transitionKind, ...(scene.primitive?.kind === 'geo-map' ? {primitive: {...scene.primitive, cut: true}} : {})} : scene))} : withFlags;
    const framing = option('framing', '').split(',').filter(Boolean);
    const withFraming = framing.length ? {...withTransition, framing: {...(framing.includes('bleed') ? {opening: 'bleed'} : {}), ...(framing.includes('loop') ? {ending: 'loop'} : {})}} : withTransition;
    const styled = {...withFraming, look, ...(PALETTES[look] ? {palette: PALETTES[look]} : {})};
    const inputProps = {manifest: styled};
    const composition = await selectComposition({serveUrl, id: 'VerticalEpisode', inputProps, puppeteerInstance: browser});
    for (const number of scenes) for (const moment of moments) {
      const scene = manifest.scenes[number - 1];
      const frame = Math.min(composition.durationInFrames - 1, Math.round((starts[number - 1] + scene.durationSeconds * moment) * fps));
      const output = episodeOutPath(root, episodeId, 'looks', `${episodeId}-${look}-scene${number}${moments.length > 1 ? `-at${Math.round(moment * 100)}` : ''}.png`);
      fs.mkdirSync(path.dirname(output), {recursive: true});
      await renderStill({composition, serveUrl, inputProps, frame, output, imageFormat: 'png', puppeteerInstance: browser, overwrite: true});
      console.log(`✓ ${look} scene ${number} → ${path.relative(root, output)}`);
    }
  }
} finally {
  await browser.close({silent: true});
}
