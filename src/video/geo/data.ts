import {useEffect, useState} from 'react';
import {cancelRender, continueRender, delayRender, staticFile} from 'remotion';
import type {Feature, FeatureCollection, Geometry} from 'geojson';
import type {ReliefManifest} from './relief';
import type {PlateTable} from '../../../scripts/lib/plates.mjs';

// The pinned map data (public/geo/, see docs/geomotion-data.md), loaded once per
// render tab from the bundle's own static files: no network, no tiles.

export type GeoEntity = {id: string; kind: string; name: string; country?: string; bbox: [number, number, number, number]; frame?: [number, number, number, number]; label?: [number, number]};
export type GeoData = {
  entities: Map<string, GeoEntity>;
  features: Map<string, Feature<Geometry>>;
  countries: Feature<Geometry>[];
  /** States and provinces, lakes and rivers (Natural Earth), each with a Natural Earth importance `rank` where it has one. */
  admin1: Feature<Geometry>[];
  lakes: Feature<Geometry>[];
  rivers: Feature<Geometry>[];
  /** Land borders between two countries (a line each). */
  borders: Feature<Geometry>[];
  /** Which plate each country rides on, and the plate-motion model's rotations (scripts/plates.mjs). */
  plates: {entityPlates: Record<string, number>; table: PlateTable};
  /** The land at least 250, 500, 1000, 1500 and 2000 km from the sea (scripts/coast-distance.mjs), one feature per level in `km`. */
  coastBands: Feature<Geometry>[];
};

let loaded: GeoData | undefined;
let loading: Promise<GeoData> | undefined;

const fetchJson = async <T,>(file: string): Promise<T> => {
  const response = await fetch(staticFile(`geo/${file}`));
  if (!response.ok) throw new Error(`Map data geo/${file} failed to load (${response.status}). Run: npm run geo:prepare`);
  return response.json() as Promise<T>;
};

export const loadGeoData = () => loading ??= Promise.all([
  fetchJson<GeoEntity[]>('entities.json'),
  fetchJson<FeatureCollection>('countries.geojson'),
  fetchJson<FeatureCollection>('water.geojson'),
  fetchJson<FeatureCollection>('disputed.geojson'),
  fetchJson<FeatureCollection>('admin1.geojson'),
  fetchJson<FeatureCollection>('lakes.geojson'),
  fetchJson<FeatureCollection>('rivers.geojson'),
  fetchJson<FeatureCollection>('borders.geojson'),
  fetchJson<GeoData['plates']>('plates.json'),
  fetchJson<{bands: Feature<Geometry>[]}>('coast-distance.json'),
]).then(([entities, countries, water, disputed, admin1, lakes, rivers, borders, plates, coast]) => {
  loaded = {
    entities: new Map(entities.map((entity) => [entity.id, entity])),
    features: new Map([...countries.features, ...water.features, ...disputed.features, ...admin1.features, ...lakes.features, ...rivers.features, ...borders.features].map((feature) => [String(feature.id), feature])),
    countries: countries.features,
    admin1: admin1.features,
    lakes: lakes.features,
    rivers: rivers.features,
    borders: borders.features,
    plates,
    coastBands: coast.bands,
  };
  return loaded;
});

/** The map data, holding the render until it has loaded. */
export const useGeoData = (): GeoData | undefined => {
  const [data, setData] = useState(loaded);
  const [handle] = useState(() => (loaded ? undefined : delayRender('Loading map data')));
  useEffect(() => {
    if (!handle) return;
    loadGeoData().then((result) => {
      setData(result);
      continueRender(handle);
    }).catch((error) => cancelRender(error));
  }, [handle]);
  return data;
};

let relief: ReliefManifest | undefined;
let reliefLoading: Promise<ReliefManifest> | undefined;
const loadRelief = () => reliefLoading ??= fetchJson<ReliefManifest>('relief/manifest.json').then((manifest) => (relief = manifest));

/** The shaded relief manifest (#91), loaded only for shots that use relief; holds the render until it has. */
export const useReliefData = (enabled: boolean): ReliefManifest | undefined => {
  const [data, setData] = useState(enabled ? relief : undefined);
  const [handle] = useState(() => (enabled && !relief ? delayRender('Loading relief') : undefined));
  useEffect(() => {
    if (!handle) return;
    loadRelief().then((result) => {
      setData(result);
      continueRender(handle);
    }).catch((error) => cancelRender(error));
  }, [handle]);
  return data;
};

/** Elevation bands and sea-level-rise flood bands (scripts/elevation.mjs), one feature per level in `metres`. */
export type ElevationData = {elevation: Feature<Geometry>[]; flood: Feature<Geometry>[]};
let elevationData: ElevationData | undefined;
let elevationLoading: Promise<ElevationData> | undefined;
const loadElevation = () => elevationLoading ??= fetchJson<ElevationData>('elevation.json').then((result) => (elevationData = result));

/** The elevation data, loaded only for shots that use it (it is large); holds the render until it has. */
export const useElevationData = (enabled: boolean): ElevationData | undefined => {
  const [data, setData] = useState(enabled ? elevationData : undefined);
  const [handle] = useState(() => (enabled && !elevationData ? delayRender('Loading elevation') : undefined));
  useEffect(() => {
    if (!handle) return;
    loadElevation().then((result) => {
      setData(result);
      continueRender(handle);
    }).catch((error) => cancelRender(error));
  }, [handle]);
  return data;
};

/** A city's street map (scripts/streets.mjs, © OpenStreetMap contributors): roads by class (major first), rails, water, coast, buildings, all as lon/lat lines and rings. */
export type StreetsData = {id: string; name: string; center: [number, number]; radiusKm: number; box: [number, number, number, number]; roads: [number, number][][][]; rails: [number, number][][]; water: [number, number][][]; rivers: [number, number][][]; coast: [number, number][][]; buildings: [number, number][][]; /** The place's own national boundary, when it has one (the Vatican). */ outline?: [number, number][][]; outlineBox?: [number, number, number, number]};
const streetCache = new Map<string, StreetsData>();
const streetLoading = new Map<string, Promise<StreetsData>>();
const loadStreets = (city: string) => {
  let loading = streetLoading.get(city);
  if (!loading) streetLoading.set(city, loading = fetchJson<StreetsData>(`streets/${city}.json`).then((result) => {streetCache.set(city, result); return result;}));
  return loading;
};

/** A city's street map, loaded only for shots that use it; holds the render until it has. */
export const useStreetsData = (city: string | undefined): StreetsData | undefined => {
  const [data, setData] = useState(city ? streetCache.get(city) : undefined);
  const [handle] = useState(() => (city && !streetCache.has(city) ? delayRender(`Loading streets of ${city}`) : undefined));
  useEffect(() => {
    if (!handle || !city) return;
    loadStreets(city).then((result) => {
      setData(result);
      continueRender(handle);
    }).catch((error) => cancelRender(error));
  }, [handle, city]);
  return data;
};

/** Yearly figures per country (scripts/series.mjs, World Bank WDI, CC BY 4.0). */
export type SeriesFile = {attribution: string; firstYear: number; lastYear: number; indicators: Record<string, {name: string; unit: string; decimals: number; years: number[]; countries: Record<string, (number | null)[]>}>};
let seriesData: SeriesFile | undefined;
let seriesLoading: Promise<SeriesFile> | undefined;
const loadSeries = () => seriesLoading ??= fetchJson<SeriesFile>('series.json').then((result) => (seriesData = result));

/** The yearly figures, loaded only for shots that chart them; holds the render until they have. */
export const useSeriesData = (enabled: boolean): SeriesFile | undefined => {
  const [data, setData] = useState(enabled ? seriesData : undefined);
  const [handle] = useState(() => (enabled && !seriesData ? delayRender('Loading yearly figures') : undefined));
  useEffect(() => {
    if (!handle) return;
    loadSeries().then((result) => {
      setData(result);
      continueRender(handle);
    }).catch((error) => cancelRender(error));
  }, [handle]);
  return data;
};
