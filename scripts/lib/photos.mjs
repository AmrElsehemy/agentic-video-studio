// Real photographs from Wikimedia Commons, used on map scenes with their credit. Only a licence that lets
// the photo be reused with attribution is accepted: public domain, CC0 and CC BY. Share-alike (CC BY-SA) and
// non-commercial or no-derivatives licences are refused, so no photo ever drags a condition into a video.

export const COMMONS_API = 'https://commons.wikimedia.org/w/api.php';
export const USER_AGENT = 'agentic-video-studio/0.1 (explainer videos; contact: aelsehemy@gmail.com)';

/** A share-alike, non-commercial or no-derivatives term in a licence name ("CC BY-SA 4.0"), not letters inside a word ("PD-USGov-NASA"). */
const CONDITION = /[-\s](NC|ND|SA)\b/i;

/** The licences accepted, from a Commons `LicenseShortName`: [kind, matches]. */
export const licenseKind = (shortName = '') => {
  const name = shortName.trim();
  if (/^(CC0|Public domain|PD\b|PD-|Copyrighted free use)/i.test(name) && !CONDITION.test(name)) return 'public-domain';
  if (/^CC BY( \d(\.\d)?)?( [A-Z]{2,3})?$/i.test(name) || /^CC BY \d(\.\d)?( [A-Za-z]+)?$/i.test(name)) return 'attribution';
  return undefined;
};

/** Why a licence is refused, in words for the person choosing photos. */
export const refusal = (shortName = '') => {
  if (/[-\s]SA\b/i.test(shortName)) return `${shortName} is share-alike: reusing the photo in a video could carry that condition, so it is not used`;
  if (/[-\s](NC|ND)\b/i.test(shortName)) return `${shortName} restricts commercial use or changes, so it is not used`;
  return `${shortName || 'no licence'} is not one of public domain, CC0 or CC BY`;
};

const entities = {'&amp;': '&', '&lt;': '<', '&gt;': '>', '&quot;': '"', '&#39;': "'", '&nbsp;': ' '};
/** Commons metadata is HTML: plain text out of it. */
export const plainText = (html = '') => html.replace(/<[^>]*>/g, ' ').replace(/&(amp|lt|gt|quot|#39|nbsp);/g, (match) => entities[match]).replace(/\s+/g, ' ').trim();

/** The credit line printed on the photo and in the description: "Photo: <author> / Wikimedia Commons / CC BY 2.0". */
export const attributionLine = ({author, license, kind}) => (kind === 'public-domain'
  ? `Photo: ${author && !/unknown|own work/i.test(author) ? `${author} / ` : ''}Wikimedia Commons (${license}).`
  : `Photo: ${author} / Wikimedia Commons / ${license}.`);

/** A short line for the screen, in capitals: "PHOTO: LAFIGURADELPADRE / CC BY 2.0". */
export const screenCredit = ({author, license, kind}) => {
  // A public-domain work with a long or multi-name author line (a document, a government photo) is credited to the archive.
  const who = author && !/unknown|own work/i.test(author) && !(kind === 'public-domain' && (author.length > 24 || / and /i.test(author))) ? author : 'Wikimedia Commons';
  // "Rinaldo Wurglitsch from Vienna, Austria" is printed on the photo as "Rinaldo Wurglitsch"; the description keeps the full line.
  const short = who.replace(/\s+from\s+.+$/i, '');
  const clipped = short.length > 26 ? `${short.slice(0, 25).trim()}…` : short;
  return `PHOTO: ${clipped} · ${kind === 'public-domain' ? 'PUBLIC DOMAIN' : license}`.toUpperCase();
};

/** What a Commons imageinfo reply says about a file, ready to judge. */
export const describeFile = (page) => {
  const info = page.imageinfo?.[0];
  if (!info) throw new Error(`${page.title} has no image information`);
  const meta = info.extmetadata ?? {};
  const license = meta.LicenseShortName?.value ?? '';
  const author = plainText(meta.Artist?.value ?? '');
  return {
    title: page.title,
    pageUrl: info.descriptionurl,
    imageUrl: info.thumburl ?? info.url,
    width: info.thumbwidth ?? info.width,
    height: info.thumbheight ?? info.height,
    originalWidth: info.width,
    originalHeight: info.height,
    mime: info.mime,
    license,
    licenseUrl: meta.LicenseUrl?.value,
    kind: licenseKind(license),
    author,
    description: plainText(meta.ImageDescription?.value ?? ''),
  };
};
