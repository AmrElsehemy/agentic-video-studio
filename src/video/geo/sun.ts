// Where the sun is: the subsolar point (where it stands straight overhead) for a UTC moment, from the usual
// low-precision solar position formulas (good to well under a degree, plenty for a shaded night side).
// Night is the half of the globe more than 90 degrees from that point; civil twilight reaches 96 degrees.

const rad = Math.PI / 180;
const wrap360 = (degrees: number) => ((degrees % 360) + 360) % 360;

/** The subsolar point as {lon, lat} in degrees, for a moment given as milliseconds since the epoch (UTC). */
export const subsolarPoint = (utcMillis: number) => {
  const n = utcMillis / 86400000 + 2440587.5 - 2451545.0; // days since J2000
  const meanLongitude = wrap360(280.46 + 0.9856474 * n);
  const anomaly = wrap360(357.528 + 0.9856003 * n) * rad;
  const eclipticLongitude = (meanLongitude + 1.915 * Math.sin(anomaly) + 0.02 * Math.sin(2 * anomaly)) * rad;
  const obliquity = (23.439 - 0.0000004 * n) * rad;
  const declination = Math.asin(Math.sin(obliquity) * Math.sin(eclipticLongitude));
  const rightAscension = Math.atan2(Math.cos(obliquity) * Math.sin(eclipticLongitude), Math.cos(eclipticLongitude)) / rad;
  const siderealTime = wrap360(280.46061837 + 360.98564736629 * n);
  const lon = wrap360(rightAscension - siderealTime + 180) - 180;
  return {lon, lat: declination / rad};
};

/** The angle (degrees) at which the sun stands above the horizon at a place: positive by day, negative by night. */
export const sunAltitude = (sun: {lon: number; lat: number}, lon: number, lat: number) => {
  const sinAlt = Math.sin(lat * rad) * Math.sin(sun.lat * rad) + Math.cos(lat * rad) * Math.cos(sun.lat * rad) * Math.cos((lon - sun.lon) * rad);
  return Math.asin(Math.max(-1, Math.min(1, sinAlt))) / rad;
};

/** The clock on screen for a moment: "14:00 UTC · 21 JUN". */
export const clockLabel = (utcMillis: number) => {
  const d = new Date(utcMillis);
  const months = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];
  const pad = (value: number) => String(value).padStart(2, '0');
  return `${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())} UTC · ${d.getUTCDate()} ${months[d.getUTCMonth()]}`;
};
