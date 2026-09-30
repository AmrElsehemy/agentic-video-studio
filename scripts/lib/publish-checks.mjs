// What stops an episode going public. `preflight:publish` prints these and
// exits non-zero; passing them is necessary, not sufficient: a person still
// approves the release (rights.publicReleaseApproved, releaseStatus "cleared").
import {geoReferences} from './geo-primitives.mjs';

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
    if (!asset.publicReleaseApproved || !['owned', 'licensed', 'public-domain'].includes(asset.licenseStatus)) blockers.push(`${asset.kind}: ${asset.notes ?? asset.licenseStatus}`);
  }

  const maps = manifest.scenes.filter((scene) => scene.primitive?.kind === 'geo-map');
  if (maps.length) {
    // Map data must be credited, in the rights (which feed the description).
    if (!rights.assets.some((asset) => asset.kind === 'map-data' && asset.notes)) blockers.push('map-data: Map scenes need a map-data rights entry with its attribution line.');
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
