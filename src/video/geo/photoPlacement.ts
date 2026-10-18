import {MAP_SIZE, type Size} from './camera';

/** How far a full-frame photo pushes in over its scene (10%). */
export const PUSH = 0.1;

/** Where the picture sits in the panel: its top-left corner and size, for a crop centred on `focusX` (0 to 1 across the picture). */
export const photoPlacement = (photo: {width: number; height: number}, focusX: number, progress: number, size: Size = MAP_SIZE) => {
  const cover = Math.max(size.width / photo.width, size.height / photo.height) * (1 + PUSH * progress);
  const [width, height] = [photo.width * cover, photo.height * cover];
  const left = Math.min(0, Math.max(size.width - width, size.width / 2 - focusX * width));
  const top = Math.min(0, Math.max(size.height - height, (size.height - height) / 2));
  return {left, top, width, height};
};
