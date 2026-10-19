// The arithmetic for a stored satellite still (scripts/satellite.mjs): it is a Web Mercator image of a lon/lat box,
// so a place sits where the Mercator scale puts it, not where a straight lat line would.

const mercatorY = (lat: number) => Math.asinh(Math.tan((lat * Math.PI) / 180));

/** Where a lon/lat falls in an image of `bbox` (west, south, east, north), as fractions across and down (0 to 1). */
export const fractionIn = (bbox: [number, number, number, number], lon: number, lat: number) => {
  const [west, south, east, north] = bbox;
  return {x: (lon - west) / (east - west), y: (mercatorY(north) - mercatorY(lat)) / (mercatorY(north) - mercatorY(south))};
};

const MONTHS = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];

/** The date as printed on the picture: an annual layer is a year ("1990"), a daily one a month and year ("JUL 2024"). */
export const stampOf = (date: string, annual: boolean) => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return '';
  const [year, month] = date.split('-');
  return annual ? year : `${MONTHS[Number(month) - 1]} ${year}`;
};
