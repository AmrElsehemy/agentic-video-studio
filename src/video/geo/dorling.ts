// A Dorling cartogram's layout: every country is a circle whose AREA follows its value, placed near where the country
// is and pushed apart until no two circles overlap. Deterministic (the same input always gives the same picture), so a
// render is repeatable, and pure, so it is tested without a browser.

export type Disc = {id: string; x: number; y: number; r: number};

/** The gap kept between circles (px). */
export const GAP = 4;

/** Radius for a value against the largest value shown: area in proportion to value, never smaller than `min`. */
export const discRadius = (value: number, max: number, maxRadius: number, min = 12) => (max > 0 ? Math.max(min, maxRadius * Math.sqrt(Math.max(0, value) / max)) : min);

/**
 * Push the discs apart until they do not overlap, keeping each near its starting place (a weak spring) and inside `bounds`.
 * The bigger of two overlapping discs moves less. Returns new discs in the input order.
 */
export const relax = (discs: Disc[], bounds: {left: number; top: number; right: number; bottom: number}, iterations = 300): Disc[] => {
  const order = discs.map((disc, index) => ({disc, index})).sort((a, b) => (a.disc.id < b.disc.id ? -1 : 1));
  const start = new Map(discs.map((disc) => [disc.id, {x: disc.x, y: disc.y}]));
  const p = order.map(({disc}) => ({id: disc.id, x: disc.x, y: disc.y, r: disc.r}));
  // The first rounds pull each disc towards home as they separate; the last rounds only separate, so nothing is left touching.
  const settle = 200;
  for (let step = 0; step < iterations + settle; step++) {
    const spring = step < iterations ? 0.012 : 0;
    for (let i = 0; i < p.length; i++) {
      for (let j = i + 1; j < p.length; j++) {
        const dx = p[j].x - p[i].x;
        const dy = p[j].y - p[i].y;
        const distance = Math.hypot(dx, dy) || 0.01;
        const gap = p[i].r + p[j].r + GAP - distance;
        if (gap <= 0) continue;
        // The smaller disc takes more of the move.
        const wi = p[j].r ** 2 / (p[i].r ** 2 + p[j].r ** 2);
        const [ux, uy] = distance > 0.02 ? [dx / distance, dy / distance] : [1, 0];
        p[i].x -= ux * gap * wi; p[i].y -= uy * gap * wi;
        p[j].x += ux * gap * (1 - wi); p[j].y += uy * gap * (1 - wi);
      }
    }
    for (const disc of p) {
      const home = start.get(disc.id)!;
      disc.x += (home.x - disc.x) * spring;
      disc.y += (home.y - disc.y) * spring;
      disc.x = Math.min(bounds.right - disc.r, Math.max(bounds.left + disc.r, disc.x));
      disc.y = Math.min(bounds.bottom - disc.r, Math.max(bounds.top + disc.r, disc.y));
    }
  }
  const byId = new Map(p.map((disc) => [disc.id, disc]));
  return discs.map((disc) => ({...disc, x: byId.get(disc.id)!.x, y: byId.get(disc.id)!.y}));
};

/** The largest overlap left between any two discs (negative when they all clear each other). */
export const worstOverlap = (discs: Disc[]) => {
  let worst = -Infinity;
  for (let i = 0; i < discs.length; i++) for (let j = i + 1; j < discs.length; j++) worst = Math.max(worst, discs[i].r + discs[j].r - Math.hypot(discs[i].x - discs[j].x, discs[i].y - discs[j].y));
  return worst;
};
