// What stops an episode going public. `preflight:publish` prints these and
// exits non-zero; passing them is necessary, not sufficient: a person still
// approves the release (rights.publicReleaseApproved, releaseStatus "cleared").
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {geoReferences} from './geo-primitives.mjs';
import {mapVariety} from './map-variety.mjs';
import {cameraMotion} from './camera-motion.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
/** Episodes already uploaded (they have an analytics record) were released before the camera-motion rule and are not held to it. */
// Older prototypes that were never uploaded are likewise left as they were.
const BEFORE_MOTION_RULE = new Set(['silk-road', 'silk-road-light', 'georgia-wine', 'lesotho-enclave', 'lesotho-enclave-light', 'mapkit-demo']);
const uploaded = (manifest) => BEFORE_MOTION_RULE.has(manifest.id) || fs.existsSync(path.join(root, 'analytics', manifest.show?.id ?? '', `${manifest.id}.json`));

/**
 * @param manifest a parsed video manifest
 * @param geo the pinned geo data ({entities}), needed only for map episodes
 * @returns {string[]} blockers, empty when the episode may be published
 */
export const publishBlockers = (manifest, geo) => {
  const blockers = [];
  const {rights} = manifest;
  if (rights.releaseStatus !== 'cleared') blockers.push(`release-status: Status is ${rights.releaseStatus}, not cleared.`);
  if (!rights.publicReleaseApproved) blockers.push('episode: Episode-level public release has not been approved.');
  for (const asset of rights.assets) {
    // Without a licence, art may go out only when approved and backed by a recorded legal review; unverified art never does.
    const cleared = ['owned', 'licensed', 'public-domain'].includes(asset.licenseStatus) || (asset.licenseStatus === 'permission-required' && rights.artworkReview);
    if (!asset.publicReleaseApproved || !cleared) {
      const why = asset.licenseStatus === 'permission-required' && !rights.artworkReview ? 'permission-required without a recorded rights.artworkReview' : asset.notes ?? asset.licenseStatus;
      blockers.push(`${asset.kind}: ${why}`);
    }
  }

  const maps = manifest.scenes.filter((scene) => scene.primitive?.kind === 'geo-map');
  if (maps.length) {
    // Map data must be credited, in the rights (which feed the description).
    if (!rights.assets.some((asset) => asset.kind === 'map-data' && asset.notes)) blockers.push('map-data: Map scenes need a map-data rights entry with its attribution line.');
    // A reconstruction shows places where a model puts them: the model must be credited.
    if (maps.some((scene) => scene.primitive.annotations.some((annotation) => annotation.type === 'reconstruction')) && !rights.assets.some((asset) => asset.kind === 'map-data' && /plate model/.test(asset.owner) && asset.notes)) {
      blockers.push('plate-model: A reconstruction needs a rights entry crediting the plate-motion model (kind map-data, owner naming the plate model, with its attribution line).');
    }
    // A street map is OpenStreetMap data: the licence requires the credit, in the rights (which feed the description).
    if (maps.some((scene) => scene.primitive.streets) && !rights.assets.some((asset) => asset.kind === 'map-data' && /OpenStreetMap/.test(asset.owner) && asset.notes)) {
      blockers.push('osm-credit: A street map needs a rights entry crediting OpenStreetMap contributors (kind map-data, owner OpenStreetMap contributors, with its attribution line).');
    }
    // Yearly figures are World Bank data (CC BY 4.0): the credit goes in the rights, which feed the description.
    if (maps.some((scene) => scene.primitive.series) && !rights.assets.some((asset) => asset.kind === 'map-data' && /World Bank/.test(asset.owner) && asset.notes)) {
      blockers.push('series-credit: A chart over time needs a rights entry crediting the World Bank (kind map-data, owner World Bank, with its attribution line).');
    }
    // A photograph is used only with its credit, in the rights (which feed the description) as well as on screen.
    const photoCount = maps.flatMap((scene) => scene.primitive.annotations.filter((annotation) => annotation.type === 'photo')).length;
    if (photoCount && rights.assets.filter((asset) => asset.kind === 'photo' && asset.notes).length === 0) {
      blockers.push('photo-credit: A photograph needs a rights entry (kind photo, owner the photographer, with its attribution line).');
    }
    // A map that never changes is not worth publishing: it should have been directed.
    for (const problem of mapVariety(manifest).problems) blockers.push(`map-variety: ${problem}`);
    // A camera that hardly moves, or never gets near anything, reads as a slideshow of far views.
    if (!uploaded(manifest)) for (const problem of cameraMotion(manifest, new Map([...geo.entities].map(([id, entity]) => [id, entity.bbox]))).problems) blockers.push(`camera-motion: ${problem}`);
    // Places with disputed borders or names need a person's recorded decision on how they're shown.
    const flagged = [...new Set(maps.flatMap((scene) => geoReferences(scene.primitive).map(([, id]) => id)))]
      .map((id) => geo.entities.get(id))
      .filter((entity) => entity?.review?.length);
    if (flagged.length && !rights.bordersReview) {
      const details = flagged.map((entity) => `${entity.name} (${entity.review.map((item) => item.name).join(', ')})`).join('; ');
      blockers.push(`borders-review: This episode shows places with disputed borders or names: ${details}. Record how they are shown in rights.bordersReview {reviewer, date, decision} after a person has checked.`);
    }
  }
  return blockers;
};
