// Semantic visual primitives: components that visualise an idea (a count, a
// threshold, a type change) rather than a layout. A scene may carry one; the
// archetype's shot is the fallback. Shared by the draft schema, the compiler
// and the renderer's manifest schema.
import {z} from 'zod';
import {diagramPrimitiveFields} from './diagram-schema.mjs';

export const POKEMON_TYPE_NAMES = ['Normal', 'Fire', 'Water', 'Grass', 'Electric', 'Ice', 'Fighting', 'Poison', 'Ground', 'Flying', 'Psychic', 'Bug', 'Rock', 'Ghost', 'Dragon', 'Dark', 'Steel', 'Fairy'];

const label = z.string().min(1).max(28);
const typeName = z.enum(POKEMON_TYPE_NAMES);

// GeoMotion: places are referenced by a stable id from the geo entity registry
// (public/geo/entities.json), never by hand-drawn outlines; points may use
// longitude/latitude. Times are fractions of the scene (0 = start, 1 = end),
// so choreography follows the scene's narration timing.
export const GEO_ENTITY_ID = /^(country|water|disputed|admin1|lake|river|border|city):[A-Za-z0-9-]+$/;
const geoEntity = z.string().regex(GEO_ENTITY_ID, 'Use a geo entity id such as "country:GEO", "water:black-sea", "river:nile", "border:CAN-USA", "lake:lake-baikal", "admin1:USA-3563" or "city:cairo-egy"');
const point = z.object({lon: z.number().min(-180).max(180), lat: z.number().min(-90).max(90)}).strict();
const anchor = z.union([geoEntity, point]);
const bbox = z.tuple([z.number().min(-180).max(180), z.number().min(-90).max(90), z.number().min(-180).max(180), z.number().min(-90).max(90)]);
const moment = z.number().min(0).max(1);
const hexColor = z.string().regex(/^#[0-9a-f]{6}$/i);
const cameraKey = z.object({
  // "world", a registry id, or an explicit box [west, south, east, north] (west > east crosses the antimeridian).
  target: z.union([z.literal('world'), geoEntity, z.object({bbox}).strict()]),
  at: moment,
  // Margin around the target, as a fraction of the frame.
  padding: z.number().min(0).max(.4).default(.15),
  ease: z.enum(['linear', 'in-out']).default('in-out'),
}).strict();
const geoAnnotation = z.discriminatedUnion('type', [
  // until: fade out, finishing then (e.g. before a pull-out where labels would crowd).
  z.object({type: z.literal('label'), anchor, text: label, at: moment.default(0), until: moment.optional()}).strict(),
  z.object({type: z.literal('marker'), anchor, text: label.optional(), at: moment.default(0), until: moment.optional()}).strict(),
  z.object({type: z.literal('arrow'), from: anchor, to: anchor, text: label.optional(), at: moment.default(0)}).strict(),
  // A route (#90): a path through 2–6 places that draws itself from `at` to `until` along
  // great circles (computed, never hand-drawn), with a marker at its head. follow: the
  // camera's centre tracks the marker, easing back to the keyframes before the scene ends.
  z.object({type: z.literal('route'), path: z.array(anchor).min(2).max(6), text: label.optional(), at: moment.default(0), until: moment.optional(), marker: z.boolean().default(true), follow: z.boolean().default(false)}).strict(),
  // A line of longitude (meridian) or latitude (parallel): the prime meridian, the equator, a tropic, the date line.
  // It comes from the map's own grid, draws itself from `at` (a meridian from north to south, a parallel from west to
  // east, or the other way with reverse), and its text sits where it crosses the middle of the frame.
  // A plate reconstruction: the places in `entities` drawn where a published plate-motion model puts them at age `from`
  // (millions of years ago), drifting to where they are at age `to` (default today) while the place in `fixed` (default
  // South Africa, so Africa) stays put. The map shows an age counter. Positions come only from the pinned model.
  z.object({type: z.literal('reconstruction'), entities: z.array(geoEntity).min(1).max(2), fixed: geoEntity.default('country:ZAF'), from: z.number().min(1).max(230), to: z.number().min(0).max(230).default(0), at: moment.default(0), until: moment.optional(), text: label.optional()}).strict(),
  // A distance ring: a true circle of `radiusKm` around `center` (a place or a named point), drawn on the sphere so it is
  // right in any projection (roundest in azimuthal). It grows from the centre at `at`; its text sits on the ring's east edge.
  // The radius is a claim, so the director only draws one the research states.
  z.object({type: z.literal('ring'), center: anchor, radiusKm: z.number().min(0.1).max(20000), text: label.optional(), at: moment.default(0), until: moment.optional()}).strict(),
  // A true-size comparison: a copy of `entity` slides across the map onto `onto` (rotated on the sphere, so its area and
  // shape stay exact) from `at` to `until`, to show how big one place is against another. Only meaningful in an equal-area
  // projection (albers or equal-earth), which the schema requires; the map says the place was moved.
  z.object({type: z.literal('truesize'), entity: geoEntity, onto: geoEntity, text: label.optional(), at: moment.default(0), until: moment.optional()}).strict(),
  // A timeline strip along the bottom of the map: 2-4 dated steps, the scene's own step lit. Its words come from the research
  // (dates, periods, names); show the same steps in every scene of a sequence so the strip reads as one thing.
  z.object({type: z.literal('timeline'), steps: z.array(z.object({label: z.string().min(1).max(14), detail: z.string().min(1).max(14).optional()}).strict()).min(2).max(4), active: z.number().int().min(0).max(3), at: moment.default(0)}).strict(),
  // A real photograph (public/photos/, from Wikimedia Commons: public domain, CC0 or CC BY) as a card over the lower part of
  // the map with its credit on it, from `at` to `until` (default the end of the scene). The map lifts to keep the camera's
  // centre in view above the card, as it does for a chart.
  // With `fill`, the photograph covers the whole map panel instead of sitting on it as a card, for scenes about a place seen
  // from above or a before and after. It slowly pushes in, and `pan` moves the crop across the picture (the fractions of
  // its width the crop is centred on, at the start and at the end), so a wide image or a side-by-side pair is not cut off.
  // Nothing sits on it but its credit: a label or marker on a picture would claim a position the photo cannot back.
  z.object({type: z.literal('photo'), photo: z.string().regex(/^[a-z0-9-]+$/), fill: z.boolean().optional(), pan: z.tuple([moment, moment]).optional(), at: moment.default(0), until: moment.optional()}).strict(),
  z.object({type: z.literal('line'), kind: z.enum(['meridian', 'parallel']), degrees: z.number().min(-180).max(180), text: label.optional(), at: moment.default(0), until: moment.optional(), reverse: z.boolean().default(false)}).strict(),
]);

/** Places a data map (#91) can shade: enough for every country, so a world dataset fits. */
export const MAX_DATA_PLACES = 250;

/** When a route finishes drawing: its `until`, or half a scene after it starts. */
export const routeUntil = (route) => route.until ?? Math.min(1, route.at + .5);
/** A followed route must finish by this point, so the camera is back on its keyframes when the scene ends. */
export const FOLLOW_LATEST = .85;

export const primitiveSchema = z.discriminatedUnion('kind', [
  // A number climbing to a target: Gimmighoul's 999 coins.
  z.object({kind: z.literal('counter'), from: z.number().min(0).default(0), to: z.number().positive(), label}).strict(),
  // A gauge moving across a threshold, in percent: Darmanitan's HP falling to half.
  z.object({kind: z.literal('meter'), label, from: z.number().min(0).max(100), to: z.number().min(0).max(100), threshold: z.number().min(0).max(100).optional(), thresholdLabel: z.string().min(1).max(24).optional()}).strict(),
  // Values side by side, optionally changing: sizes, weights, a stat swap.
  z.object({kind: z.literal('bars'), unit: z.string().max(8).optional(), bars: z.array(z.object({label: z.string().min(1).max(16), value: z.number().min(0), from: z.number().min(0).optional()}).strict()).min(2).max(4)}).strict(),
  // A type change: Fire becoming Fire/Psychic.
  z.object({kind: z.literal('type-shift'), from: z.array(typeName).min(1).max(2), to: z.array(typeName).min(1).max(2)}).strict(),
  // Ordered steps, e.g. an evolution line; steps named after a Pokémon in the episode show its artwork.
  z.object({kind: z.literal('timeline'), steps: z.array(z.object({label: z.string().min(1).max(20), detail: z.string().min(1).max(24).optional()}).strict()).min(2).max(4), active: z.number().int().min(0).max(3).optional()}).strict(),
  // Requirements ruled in or out: no stone, no trade, 999 coins.
  z.object({kind: z.literal('checklist'), items: z.array(z.object({label: z.string().min(1).max(22), met: z.boolean()}).strict()).min(2).max(4)}).strict(),
  // A map: the camera flies between framings while places light up and labels, markers and arrows appear.
  z.object({
    kind: z.literal('geo-map'),
    camera: z.array(cameraKey).min(1).max(4),
    highlights: z.array(z.object({entity: geoEntity, style: z.enum(['fill', 'outline', 'trace']).default('fill'), at: moment.default(0), color: hexColor.optional()}).strict()).max(4).default([]),
    annotations: z.array(geoAnnotation).max(4).default([]),
    // The pinned map dataset the ids refer to (see docs/geomotion-data.md).
    dataset: z.literal('natural-earth').default('natural-earth'),
    // A map scene that follows another continues its camera (one unbroken flight);
    // cut: true starts this scene's camera fresh instead.
    cut: z.boolean().optional(),
    // How the map is projected (src/video/geo/projections.ts); Mercator when absent.
    projection: z.enum(['mercator', 'equal-earth', 'albers', 'azimuthal']).optional(),
    // Flow from Mercator to Equal Earth over the scene, so sizes stretched by Mercator settle to their true area (a world view).
    morph: z.boolean().optional(),
    // Shade the land by how far it is from the sea (bands at 250, 500, 1000, 1500 and 2000 km), creeping inland from `at`.
    // What the scene sounds like under the music: the sea, wind, a city (scripts/lib/score.mjs). Absent, a street map is a city and a flood the sea.
    ambience: z.enum(['sea', 'wind', 'city', 'jungle', 'desert', 'ice', 'space', 'none']).optional(),
    // Flags beside countries: on their labels, bar-chart rows, bubbles and a border's two countries. A country with no flag of its own has none.
    flags: z.boolean().optional(),
    // A street map of a city (OpenStreetMap, credited on screen): the camera must frame the city, whose id is in public/geo/streets/.
    streets: z.object({city: z.string().regex(/^[a-z0-9-]+$/), at: z.number().min(0).max(1)}).strict().optional(),
    // Elevation (hypsometric bands) and flooding (the land a sea-level rise of `rise` metres would cover) share it.
    surface: z.discriminatedUnion('kind', [
      z.object({kind: z.literal('coast-distance'), at: z.number().min(0).max(1)}).strict(),
      z.object({kind: z.literal('elevation'), at: z.number().min(0).max(1)}).strict(),
      z.object({kind: z.literal('flood'), at: z.number().min(0).max(1), rise: z.union([z.literal(1), z.literal(2), z.literal(5), z.literal(10), z.literal(20), z.literal(50)])}).strict(),
    ]).optional(),
    // Draw the map on a globe (an orthographic projection) that spins between the camera's framings: for openings and closings.
    globe: z.boolean().optional(),
    // Shaded relief (#91) under the map: mountains and valleys from the pinned Natural Earth raster.
    relief: z.boolean().optional(),
    // One number that matters, rolled up on screen over the map's lower part. The director only uses a value the research states.
    figure: z.object({value: z.number().min(0).max(1e13), unit: z.string().min(1).max(14).optional(), text: z.string().min(1).max(28), decimals: z.number().int().min(0).max(2).default(0), at: moment.default(0.3)}).strict().optional(),
    // Yearly figures for countries (World Bank, public/geo/series.json): a line chart that draws itself year by year, or a
    // ranked race where countries overtake one another. The numbers come from the pinned table, never from the model.
    series: z.object({
      indicator: z.enum(['population', 'life-expectancy', 'fertility', 'gdp-per-person']),
      view: z.enum(['line', 'race']),
      // line: the countries drawn (1 to 4). race: the country to light up, if any.
      places: z.array(geoEntity).max(4).default([]),
      from: z.number().int().min(1960).max(2025),
      to: z.number().int().min(1960).max(2025),
      at: moment.default(0.04),
      // The whole map shaded by the indicator, country by country, in the year the chart is showing (rates and averages only).
      shade: z.boolean().optional(),
      // line only: 'zero' starts the axis at zero (honest sizes); 'fit' zooms to the data, to show a turn. The ticks say which.
      axis: z.enum(['zero', 'fit']).default('zero'),
      // line only: a dashed line and a short caption at a year, once the chart reaches it.
      mark: z.object({year: z.number().int().min(1960).max(2025), text: z.string().min(1).max(14)}).strict().optional(),
    }).strict().optional(),
    // A data map (#91): places shaded by a sourced value, with a legend. The Geo Visual Director copies
    // the values from a research dataset; the model never types them.
    data: z.object({
      label,
      unit: z.string().min(1).max(8).optional(),
      values: z.array(z.object({entity: geoEntity, value: z.number()}).strict()).min(2).max(MAX_DATA_PLACES),
      at: moment.default(0),
      legend: z.boolean().default(true),
      // 'map' shades the places; 'bars' shows a ranked bar chart of the values; 'both' does both; 'bubbles' puts a circle
      // on each place, its area in proportion to its value.
      view: z.enum(['map', 'bars', 'both', 'bubbles']).default('map'),
    }).strict().optional(),
  }).strict(),
  // An architecture diagram (#120): actions on the episode's persistent canvas.
  z.object(diagramPrimitiveFields).strict(),
]).superRefine((primitive, context) => {
  if (primitive.kind === 'geo-map') {
    if (primitive.morph && (primitive.globe || (primitive.projection ?? 'mercator') !== 'mercator')) context.addIssue({code: 'custom', path: ['morph'], message: 'A morph runs from Mercator to Equal Earth on a flat map: no globe, and no other projection'});
    if (primitive.figure && (primitive.series || primitive.streets || (primitive.data && (primitive.data.view === 'bars' || primitive.data.view === 'both')) || primitive.annotations.some((annotation) => annotation.type === 'photo' || annotation.type === 'timeline'))) context.addIssue({code: 'custom', path: ['figure'], message: 'A big number takes the lower part of the frame: it cannot share a scene with a chart over time, a street map, a bar view, a photo or a timeline strip'});
    if (primitive.series) {
      if (primitive.series.from === primitive.series.to) context.addIssue({code: 'custom', path: ['series', 'to'], message: 'A chart over time needs different from and to years'});
      if (primitive.series.view === 'line' && primitive.series.places.length === 0) context.addIssue({code: 'custom', path: ['series', 'places'], message: 'A line chart needs 1 to 4 countries to draw'});
      if (primitive.series.view === 'race' && (primitive.series.mark || primitive.series.axis === 'fit')) context.addIssue({code: 'custom', path: ['series'], message: 'axis and mark belong to a line chart'});
      if (primitive.series.mark && (primitive.series.mark.year < Math.min(primitive.series.from, primitive.series.to) || primitive.series.mark.year > Math.max(primitive.series.from, primitive.series.to))) context.addIssue({code: 'custom', path: ['series', 'mark', 'year'], message: 'The marked year must fall inside the chart\'s years'});
      if (primitive.series.view === 'race' && primitive.series.places.length > 1) context.addIssue({code: 'custom', path: ['series', 'places'], message: 'A race lights up at most one country'});
      if (primitive.series.shade && primitive.series.indicator === 'population') context.addIssue({code: 'custom', path: ['series', 'shade'], message: 'A population cannot shade the map (it would only paint the big countries): shade life expectancy, fertility or GDP per person'});
      if (primitive.series.shade && (primitive.data || primitive.surface || primitive.globe)) context.addIssue({code: 'custom', path: ['series', 'shade'], message: 'A shaded map cannot share a scene with a data layer, a surface or a globe'});
      if (primitive.data && (primitive.data.view === 'bars' || primitive.data.view === 'both')) context.addIssue({code: 'custom', path: ['series'], message: 'A chart over time and a bar chart both want the bottom of the frame: use one'});
      if (primitive.streets || primitive.annotations.some((annotation) => annotation.type === 'photo' || annotation.type === 'timeline')) context.addIssue({code: 'custom', path: ['series'], message: 'A chart over time cannot share a scene with a street map, a photo or a timeline strip'});
    }
    const fullPhotos = primitive.annotations.filter((annotation) => annotation.type === 'photo' && annotation.fill);
    if (fullPhotos.length) {
      if (primitive.annotations.some((annotation) => !(annotation.type === 'photo' && annotation.fill))) context.addIssue({code: 'custom', path: ['annotations'], message: 'A full-frame photo covers the map: it takes no labels, markers or other layers, only more full-frame photos one after another'});
      if (fullPhotos.length > 2) context.addIssue({code: 'custom', path: ['annotations'], message: 'A scene shows at most two full-frame photos, one after the other'});
      if (primitive.highlights.length || primitive.series || primitive.streets || primitive.figure || primitive.data || primitive.surface || primitive.globe || primitive.morph || primitive.relief) context.addIssue({code: 'custom', path: ['highlights'], message: 'A full-frame photo hides the map, so the scene has no highlights, globe, relief, chart, street plan, big number or data layer'});
    }
    primitive.annotations.forEach((annotation, index) => {
      if (annotation.type === 'truesize' && (primitive.globe || !['albers', 'equal-earth'].includes(primitive.projection ?? ''))) context.addIssue({code: 'custom', path: ['annotations', index], message: 'A true-size comparison needs an equal-area projection (projection "albers" or "equal-earth") and no globe, or the copy would look the wrong size'});
      if (annotation.type === 'truesize' && annotation.entity === annotation.onto) context.addIssue({code: 'custom', path: ['annotations', index, 'onto'], message: 'A place cannot be compared with itself'});
      if (annotation.type === 'reconstruction' && annotation.from <= annotation.to) context.addIssue({code: 'custom', path: ['annotations', index, 'from'], message: `A reconstruction runs forward in time: from (${annotation.from} Ma) must be older than to (${annotation.to} Ma)`});
      if (annotation.type === 'timeline' && annotation.active >= annotation.steps.length) context.addIssue({code: 'custom', path: ['annotations', index, 'active'], message: `active ${annotation.active} is not one of the ${annotation.steps.length} steps`});
      if (annotation.type === 'line' && annotation.kind === 'parallel' && Math.abs(annotation.degrees) > 90) context.addIssue({code: 'custom', path: ['annotations', index, 'degrees'], message: `A parallel runs between -90 and 90 degrees; ${annotation.degrees} is out of range`});
    });
    // Keyframes start at the beginning of the scene and move forward in time.
    if (primitive.camera[0].at !== 0) context.addIssue({code: 'custom', path: ['camera', 0, 'at'], message: 'The first camera keyframe must be at 0 (the start of the scene)'});
    primitive.camera.forEach((key, index) => {
      if (index > 0 && key.at <= primitive.camera[index - 1].at) context.addIssue({code: 'custom', path: ['camera', index, 'at'], message: `Camera keyframes must move forward in time: ${key.at} follows ${primitive.camera[index - 1].at}`});
      if (typeof key.target === 'object' && key.target.bbox[1] >= key.target.bbox[3]) context.addIssue({code: 'custom', path: ['camera', index, 'target', 'bbox'], message: 'A box must have south below north'});
    });
    primitive.annotations.forEach((annotation, index) => {
      if ((annotation.type === 'label' || annotation.type === 'marker') && annotation.until !== undefined && annotation.until <= annotation.at) {
        context.addIssue({code: 'custom', path: ['annotations', index, 'until'], message: `A ${annotation.type} must leave after it appears: until ${annotation.until} is not after at ${annotation.at}`});
      }
      if (annotation.type !== 'route') return;
      if (routeUntil(annotation) <= annotation.at) context.addIssue({code: 'custom', path: ['annotations', index, 'until'], message: `A route must finish after it starts: until ${routeUntil(annotation)} is not after at ${annotation.at}`});
      if (annotation.follow && routeUntil(annotation) > FOLLOW_LATEST) context.addIssue({code: 'custom', path: ['annotations', index, 'until'], message: `A followed route must finish by ${FOLLOW_LATEST}, so the camera can ease back before the scene ends`});
      if (annotation.follow && primitive.annotations.filter((other) => other.type === 'route' && other.follow).length > 1) context.addIssue({code: 'custom', path: ['annotations', index, 'follow'], message: 'Only one route per shot can be followed'});
    });
    return;
  }
  if (primitive.kind !== 'meter') return;
  // A meter must move, and its threshold must be one it actually crosses.
  if (primitive.from === primitive.to) context.addIssue({code: 'custom', path: ['to'], message: 'A meter must move: from and to are equal'});
  if (primitive.thresholdLabel !== undefined && primitive.threshold === undefined) context.addIssue({code: 'custom', path: ['thresholdLabel'], message: 'thresholdLabel needs a threshold'});
  if (primitive.threshold !== undefined && (primitive.threshold < Math.min(primitive.from, primitive.to) || primitive.threshold > Math.max(primitive.from, primitive.to))) {
    context.addIssue({code: 'custom', path: ['threshold'], message: `threshold ${primitive.threshold} is never crossed between ${primitive.from} and ${primitive.to}`});
  }
});

export const PRIMITIVE_KINDS = primitiveSchema.options.map((option) => option.shape.kind.value);

/** Every number a primitive states, for checking against the research. */
export const primitiveNumbers = (primitive) => {
  switch (primitive.kind) {
    case 'counter': return [primitive.from, primitive.to];
    case 'meter': return [primitive.from, primitive.to, ...(primitive.threshold === undefined ? [] : [primitive.threshold])];
    case 'bars': return primitive.bars.flatMap((bar) => [bar.value, ...(bar.from === undefined ? [] : [bar.from])]);
    // A data map shows its values (the legend's ends, and every shade).
    case 'geo-map': return primitive.data ? primitive.data.values.map(({value}) => value) : [];
    default: return [];
  }
};

/** The primitive's words as plain text, for the fact checks. */
export const primitiveText = (primitive) => {
  switch (primitive.kind) {
    case 'counter': return `${primitive.label}: ${primitive.from} to ${primitive.to}`;
    case 'meter': return `${primitive.label}: ${primitive.from}% to ${primitive.to}%${primitive.threshold === undefined ? '' : `, ${primitive.thresholdLabel ?? 'threshold'} at ${primitive.threshold}%`}`;
    case 'bars': return primitive.bars.map((bar) => `${bar.label} ${bar.from === undefined ? '' : `${bar.from} to `}${bar.value}${primitive.unit ? ` ${primitive.unit}` : ''}`).join(', ');
    case 'type-shift': return `${primitive.from.join('/')} becomes ${primitive.to.join('/')}`;
    case 'timeline': return primitive.steps.map((step) => `${step.label}${step.detail ? ` (${step.detail})` : ''}`).join(' → ');
    case 'checklist': return primitive.items.map((item) => `${item.met ? 'yes' : 'no'}: ${item.label}`).join(', ');
    // Only the words on screen are claims; the places come from the map data.
    case 'geo-map': return [...primitive.annotations.map((annotation) => annotation.text).filter(Boolean), ...(primitive.data ? [`${primitive.data.label}: ${primitive.data.values.map(({entity, value}) => `${entity} ${value}${primitive.data.unit ? ` ${primitive.data.unit}` : ''}`).join(', ')}`] : [])].join(', ');
    default: return '';
  }
};
