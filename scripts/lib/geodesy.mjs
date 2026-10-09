// A little spherical geometry for distance rings: how far is a kilometre in degrees, and where do you
// land going a distance in a direction. (Great-circle maths on a sphere of the mean Earth radius.)

/** Mean Earth radius (km), as in the plate and area calculations. */
export const EARTH_RADIUS_KM = 6371.0088;
const RAD = Math.PI / 180;

/** A distance in km as an angle on the globe, in degrees. */
export const kmToDegrees = (km) => (km / EARTH_RADIUS_KM) / RAD;

/** Where you land travelling `km` from `[lon, lat]` on `bearing` degrees (0 = north, 90 = east). */
export const destination = ([lon, lat], km, bearing) => {
  const [distance, theta] = [km / EARTH_RADIUS_KM, bearing * RAD];
  const [phi1, lambda1] = [lat * RAD, lon * RAD];
  const phi2 = Math.asin(Math.sin(phi1) * Math.cos(distance) + Math.cos(phi1) * Math.sin(distance) * Math.cos(theta));
  const lambda2 = lambda1 + Math.atan2(Math.sin(theta) * Math.sin(distance) * Math.cos(phi1), Math.cos(distance) - Math.sin(phi1) * Math.sin(phi2));
  return [((lambda2 / RAD + 540) % 360) - 180, phi2 / RAD];
};
