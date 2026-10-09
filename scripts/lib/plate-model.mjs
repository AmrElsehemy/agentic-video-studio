// The pinned plate-motion model and which countries ride on which plate (shared by scripts/plates.mjs and the tests).

export const MODEL = {
  name: 'Müller et al. (2016) global plate motion model, 230-0 Ma',
  citation: 'Müller, R. D., Seton, M., Zahirovic, S., Williams, S. E., Matthews, K. J., Wright, N. M., et al. (2016). Ocean basin evolution and global-scale plate reorganization events since Pangea breakup. Annual Review of Earth and Planetary Sciences, 44, 107-138.',
  doi: '10.5281/zenodo.11607841',
  license: 'CC BY 4.0',
  licenseUrl: 'https://creativecommons.org/licenses/by/4.0/',
  url: 'https://zenodo.org/api/records/11607841/files/Muller_etal_2016_AREPS_Supp_v1.17.zip/content',
  zipSha256: '843c5eec8eaa18ca3eaa34c85ad4dcd5707d85bc1eb4866d0b133d7ac8b454ea',
  file: 'Rotations/Global_230-0Ma_GK07_AREPS.rot',
  fileSha256: 'baaf8d988f837baea92e37362b058843c29019ff5ecc92d19059ffec76c65a16',
  attribution: 'Plate reconstructions: Müller et al. (2016), Annual Review of Earth and Planetary Sciences, CC BY 4.0.',
};

/** The plates the table covers (GPlates ids). */
export const PLATES = {701: 'Africa', 702: 'Madagascar', 501: 'India', 802: 'Antarctica', 801: 'Australia', 201: 'South America', 101: 'North America', 102: 'Greenland', 503: 'Arabia', 301: 'Europe'};
const ARABIA = ['SAU', 'YEM', 'OMN', 'ARE', 'QAT', 'KWT', 'BHR', 'JOR'];
/** The plate a country rides on, or undefined when it sits on a plate (or a mix) the table doesn't cover. */
export const plateOfCountry = (id, continent) => {
  const code = id.slice('country:'.length);
  if (code === 'MDG') return 702;
  if (code === 'IND' || code === 'LKA') return 501;
  if (code === 'GRL') return 102;
  if (code === 'ATA') return 802;
  if (code === 'AUS') return 801;
  if (ARABIA.includes(code)) return 503;
  if (continent === 'Africa') return 701;
  if (continent === 'South America') return 201;
  if (continent === 'North America') return code === 'USA' || code === 'CAN' ? 101 : undefined;
  if (continent === 'Europe') return code === 'RUS' || code === 'TUR' || code === 'GEO' || code === 'ARM' || code === 'AZE' ? undefined : 301;
  return undefined;
};

