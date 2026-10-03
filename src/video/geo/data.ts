import {useEffect, useState} from 'react';
import {cancelRender, continueRender, delayRender, staticFile} from 'remotion';
import type {Feature, FeatureCollection, Geometry} from 'geojson';
import type {ReliefManifest} from './relief';

// The pinned map data (public/geo/, see docs/geomotion-data.md), loaded once per
// render tab from the bundle's own static files: no network, no tiles.

export type GeoEntity = {id: string; kind: string; name: string; bbox: [number, number, number, number]; frame?: [number, number, number, number]; label?: [number, number]};
export type GeoData = {
  entities: Map<string, GeoEntity>;
  features: Map<string, Feature<Geometry>>;
  countries: Feature<Geometry>[];
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
]).then(([entities, countries, water, disputed]) => {
  loaded = {
    entities: new Map(entities.map((entity) => [entity.id, entity])),
    features: new Map([...countries.features, ...water.features, ...disputed.features].map((feature) => [String(feature.id), feature])),
    countries: countries.features,
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
