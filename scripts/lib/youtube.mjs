import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import {spawn} from 'node:child_process';
import {episodeDescription, episodeTags} from './description.mjs';
import {loadShow} from './shows.mjs';

export const YOUTUBE_UPLOAD_SCOPE = 'https://www.googleapis.com/auth/youtube.upload';
/** Read-only analytics, for npm run analytics -- fetch (#25). */
export const YOUTUBE_ANALYTICS_SCOPE = 'https://www.googleapis.com/auth/yt-analytics.readonly';
/** Read-only channel data: which channel a login belongs to, and its uploads. */
export const YOUTUBE_READONLY_SCOPE = 'https://www.googleapis.com/auth/youtube.readonly';

// Each show has its own channel, so its own login: .secrets/youtube-token-<show>.json, or
// YOUTUBE_REFRESH_TOKEN_<SHOW> (e.g. YOUTUBE_REFRESH_TOKEN_GEOGRAPHICA). PokePulses, the
// first channel, also accepts the older .secrets/youtube-token.json and YOUTUBE_REFRESH_TOKEN.
const LEGACY_SHOW = 'pokepulses';
const secretDir = (root) => path.join(root, '.secrets');
export const tokenPath = (root, show = LEGACY_SHOW) => {
  const own = path.join(secretDir(root), `youtube-token-${show}.json`);
  const legacy = path.join(secretDir(root), 'youtube-token.json');
  return show === LEGACY_SHOW && !fs.existsSync(own) && fs.existsSync(legacy) ? legacy : own;
};
/** The refresh token set in the environment for a show, if any. */
export const envRefreshToken = (show = LEGACY_SHOW, env = process.env) => env[`YOUTUBE_REFRESH_TOKEN_${show.toUpperCase().replace(/[^A-Z0-9]/g, '_')}`] ?? (show === LEGACY_SHOW ? env.YOUTUBE_REFRESH_TOKEN : undefined);
const clientPath = (root) => process.env.YOUTUBE_CLIENT_SECRETS || path.join(secretDir(root), 'youtube-client.json');

const readJson = (file) => JSON.parse(fs.readFileSync(file, 'utf8'));
const writeJson = (file, value) => {
  fs.mkdirSync(path.dirname(file), {recursive: true});
  fs.writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`, {mode: 0o600});
};

export const loadClient = (root) => {
  if (process.env.YOUTUBE_CLIENT_ID && process.env.YOUTUBE_CLIENT_SECRET) {
    return {client_id: process.env.YOUTUBE_CLIENT_ID, client_secret: process.env.YOUTUBE_CLIENT_SECRET};
  }
  const file = clientPath(root);
  if (!fs.existsSync(file)) throw new Error(`Missing YouTube OAuth client. Put Desktop OAuth credentials at ${path.relative(root, file)} or set YOUTUBE_CLIENT_ID/YOUTUBE_CLIENT_SECRET.`);
  const json = readJson(file);
  const client = json.installed ?? json.web ?? json;
  if (!client.client_id || !client.client_secret) throw new Error(`Invalid OAuth client file: ${file}`);
  return client;
};

const tokenRequest = async (body) => {
  const response = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: {'content-type': 'application/x-www-form-urlencoded'},
    body: new URLSearchParams(body),
  });
  const payload = await response.json();
  if (!response.ok) throw new Error(`YouTube OAuth failed (${response.status}): ${payload.error_description ?? payload.error ?? JSON.stringify(payload)}`);
  return payload;
};

export const saveToken = (root, token, {show = LEGACY_SHOW} = {}) => writeJson(tokenPath(root, show), token);

export const refreshAccessToken = async (root, existing = {}, {show = LEGACY_SHOW} = {}) => {
  const client = loadClient(root);
  const fromEnv = envRefreshToken(show);
  const refreshToken = fromEnv || existing.refresh_token;
  if (!refreshToken) throw new Error(`No YouTube login for ${show}. Run: npm run youtube:auth -- --show=${show}`);
  const token = await tokenRequest({
    client_id: client.client_id,
    client_secret: client.client_secret,
    refresh_token: refreshToken,
    grant_type: 'refresh_token',
  });
  const merged = {...existing, ...token, refresh_token: refreshToken, expires_at: Date.now() + token.expires_in * 1000};
  if (!fromEnv) saveToken(root, merged, {show});
  return merged;
};

export const getAccessToken = async (root, {show = LEGACY_SHOW} = {}) => {
  if (process.env.YOUTUBE_ACCESS_TOKEN) return process.env.YOUTUBE_ACCESS_TOKEN;
  const file = tokenPath(root, show);
  const stored = fs.existsSync(file) ? readJson(file) : {};
  if (stored.access_token && stored.expires_at && stored.expires_at > Date.now() + 60_000) return stored.access_token;
  return (await refreshAccessToken(root, stored, {show})).access_token;
};

const youtubeGet = async (accessToken, resource, params, fetchImpl = fetch) => {
  const url = new URL(`https://www.googleapis.com/youtube/v3/${resource}`);
  url.search = new URLSearchParams(params).toString();
  const response = await fetchImpl(url, {headers: {authorization: `Bearer ${accessToken}`}});
  if (response.status === 403) throw new Error(`YouTube refused to read ${resource} (403). The login may predate the channel-check permission: run npm run youtube:auth -- --show=<show> again.`);
  if (!response.ok) throw new Error(`YouTube ${resource} request failed (${response.status}): ${await response.text()}`);
  return response.json();
};

/** The channel a login belongs to: {id, title, uploads} (uploads is its uploads playlist). */
export const channelOf = async (accessToken, {fetchImpl = fetch} = {}) => {
  const data = await youtubeGet(accessToken, 'channels', {part: 'id,snippet,contentDetails', mine: 'true'}, fetchImpl);
  const channel = data.items?.[0];
  if (!channel) throw new Error('This YouTube login has no channel.');
  return {id: channel.id, title: channel.snippet?.title, uploads: channel.contentDetails?.relatedPlaylists?.uploads};
};

/**
 * Refuse to act for `show` on the wrong channel: a show with a channelId only
 * uploads to (and links videos from) that channel.
 */
export const assertShowChannel = (show, channel) => {
  const expected = show.publishing?.channelId;
  if (expected && channel.id !== expected) {
    throw new Error(`This login is for the channel "${channel.title}" (${channel.id}), but ${show.name} publishes to ${expected}. Run: npm run youtube:auth -- --show=${show.id} and sign in to ${show.name}'s channel.`);
  }
};

/** Every video in an uploads playlist, newest first: [{videoId, title, publishedAt}]. */
export const listUploads = async (accessToken, playlistId, {fetchImpl = fetch} = {}) => {
  const videos = [];
  let pageToken;
  do {
    const data = await youtubeGet(accessToken, 'playlistItems', {part: 'snippet,contentDetails', playlistId, maxResults: '50', ...(pageToken ? {pageToken} : {})}, fetchImpl);
    for (const item of data.items ?? []) videos.push({videoId: item.contentDetails?.videoId ?? item.snippet?.resourceId?.videoId, title: item.snippet?.title ?? '', publishedAt: item.contentDetails?.videoPublishedAt ?? item.snippet?.publishedAt});
    pageToken = data.nextPageToken;
  } while (pageToken);
  return videos;
};

/** A title reduced to its words: no hashtags, punctuation or case, so "Why Bulbasaur Is…  #Shorts" matches its episode. */
export const titleKey = (title) => title.toLowerCase().replace(/#\S+/g, ' ').normalize('NFKD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, ' ').trim();

/**
 * Pair a channel's uploads with episodes by title. Returns {matched: [{episodeId,
 * video}], unmatched: [video]}; a title that fits several episodes, or several
 * videos for one episode, is left unmatched rather than guessed.
 */
export const matchUploads = (videos, episodes) => {
  const byKey = new Map();
  for (const episode of episodes) byKey.set(titleKey(episode.title), [...(byKey.get(titleKey(episode.title)) ?? []), episode.episodeId]);
  const claims = new Map();
  for (const video of videos) {
    const ids = byKey.get(titleKey(video.title)) ?? [];
    if (ids.length === 1) claims.set(ids[0], [...(claims.get(ids[0]) ?? []), video]);
  }
  const matched = [...claims].filter(([, list]) => list.length === 1).map(([episodeId, [video]]) => ({episodeId, video}));
  const used = new Set(matched.map(({video}) => video.videoId));
  return {matched, unmatched: videos.filter((video) => !used.has(video.videoId))};
};

const openBrowser = (url) => {
  const [command, args] = process.platform === 'darwin'
    ? ['open', [url]]
    : process.platform === 'win32'
      ? ['cmd', ['/c', 'start', '', url]]
      : ['xdg-open', [url]];
  spawn(command, args, {detached: true, stdio: 'ignore'}).unref();
};

export const authorizeInteractively = async (root, {port = 53682, show = LEGACY_SHOW} = {}) => {
  const client = loadClient(root);
  const redirectUri = `http://127.0.0.1:${port}/oauth2callback`;
  const state = crypto.randomUUID();
  const authUrl = new URL('https://accounts.google.com/o/oauth2/v2/auth');
  authUrl.search = new URLSearchParams({
    client_id: client.client_id,
    redirect_uri: redirectUri,
    response_type: 'code',
    scope: [YOUTUBE_UPLOAD_SCOPE, YOUTUBE_ANALYTICS_SCOPE, YOUTUBE_READONLY_SCOPE].join(' '),
    access_type: 'offline',
    prompt: 'consent',
    state,
  }).toString();

  const code = await new Promise((resolve, reject) => {
    const server = http.createServer((req, res) => {
      const url = new URL(req.url, redirectUri);
      if (url.pathname !== '/oauth2callback') return;
      if (url.searchParams.get('state') !== state) {
        res.writeHead(400).end('Invalid OAuth state.');
        server.close();
        reject(new Error('Invalid OAuth state.'));
        return;
      }
      const error = url.searchParams.get('error');
      const authCode = url.searchParams.get('code');
      if (error || !authCode) {
        res.writeHead(400).end(`Authorization failed: ${error ?? 'missing code'}`);
        server.close();
        reject(new Error(`YouTube authorization failed: ${error ?? 'missing code'}`));
        return;
      }
      res.writeHead(200, {'content-type': 'text/html'}).end('<h2>YouTube connected.</h2><p>You can close this tab and return to Agentic Video Studio.</p>');
      server.close();
      resolve(authCode);
    });
    server.listen(port, '127.0.0.1', () => {
      console.log(`Open this URL if the browser does not open automatically:\n${authUrl}`);
      openBrowser(authUrl.toString());
    });
    server.on('error', reject);
  });

  const token = await tokenRequest({
    client_id: client.client_id,
    client_secret: client.client_secret,
    code,
    grant_type: 'authorization_code',
    redirect_uri: redirectUri,
  });
  const stored = {...token, expires_at: Date.now() + token.expires_in * 1000};
  saveToken(root, stored, {show});
  return stored;
};

export const youtubeMetadata = (manifest, {privacy = 'private', publishAt, madeForKids, show = loadShow(manifest.show?.id ?? 'pokepulses')} = {}) => {
  const titleBase = manifest.title.length > 91 ? `${manifest.title.slice(0, 88).trim()}…` : manifest.title;
  const title = /#shorts/i.test(titleBase) ? titleBase : `${titleBase} #Shorts`;
  const description = episodeDescription(manifest, show);
  const tags = episodeTags(manifest, show);
  const status = {privacyStatus: publishAt ? 'private' : privacy};
  if (publishAt) status.publishAt = new Date(publishAt).toISOString();
  if (madeForKids !== undefined) status.selfDeclaredMadeForKids = madeForKids;
  return {
    snippet: {title, description, tags, categoryId: process.env.YOUTUBE_CATEGORY_ID || '27', defaultLanguage: 'en'},
    status,
  };
};
