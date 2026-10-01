import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import {spawn} from 'node:child_process';

export const YOUTUBE_UPLOAD_SCOPE = 'https://www.googleapis.com/auth/youtube.upload';
/** Full channel access: needed to add an upload to a playlist and to read the channel's scheduled releases. Covers upload too. */
export const YOUTUBE_MANAGE_SCOPE = 'https://www.googleapis.com/auth/youtube';
/** Read-only analytics, for npm run analytics -- fetch (#25). */
export const YOUTUBE_ANALYTICS_SCOPE = 'https://www.googleapis.com/auth/yt-analytics.readonly';

const secretDir = (root) => path.join(root, '.secrets');
const tokenPath = (root) => path.join(secretDir(root), 'youtube-token.json');
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

export const saveToken = (root, token) => writeJson(tokenPath(root), token);

export const refreshAccessToken = async (root, existing = {}) => {
  const client = loadClient(root);
  const refreshToken = process.env.YOUTUBE_REFRESH_TOKEN || existing.refresh_token;
  if (!refreshToken) throw new Error('No YouTube refresh token. Run: npm run youtube:auth');
  const token = await tokenRequest({
    client_id: client.client_id,
    client_secret: client.client_secret,
    refresh_token: refreshToken,
    grant_type: 'refresh_token',
  });
  const merged = {...existing, ...token, refresh_token: refreshToken, expires_at: Date.now() + token.expires_in * 1000};
  if (!process.env.YOUTUBE_REFRESH_TOKEN) saveToken(root, merged);
  return merged;
};

export const getAccessToken = async (root) => {
  if (process.env.YOUTUBE_ACCESS_TOKEN) return process.env.YOUTUBE_ACCESS_TOKEN;
  const file = tokenPath(root);
  const stored = fs.existsSync(file) ? readJson(file) : {};
  if (stored.access_token && stored.expires_at && stored.expires_at > Date.now() + 60_000) return stored.access_token;
  return (await refreshAccessToken(root, stored)).access_token;
};

const openBrowser = (url) => {
  const [command, args] = process.platform === 'darwin'
    ? ['open', [url]]
    : process.platform === 'win32'
      ? ['cmd', ['/c', 'start', '', url]]
      : ['xdg-open', [url]];
  spawn(command, args, {detached: true, stdio: 'ignore'}).unref();
};

export const authorizeInteractively = async (root, {port = 53682} = {}) => {
  const client = loadClient(root);
  const redirectUri = `http://127.0.0.1:${port}/oauth2callback`;
  const state = crypto.randomUUID();
  const authUrl = new URL('https://accounts.google.com/o/oauth2/v2/auth');
  authUrl.search = new URLSearchParams({
    client_id: client.client_id,
    redirect_uri: redirectUri,
    response_type: 'code',
    scope: [YOUTUBE_UPLOAD_SCOPE, YOUTUBE_MANAGE_SCOPE, YOUTUBE_ANALYTICS_SCOPE].join(' '),
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
  saveToken(root, stored);
  return stored;
};

const unique = (items) => [...new Set(items.filter(Boolean))];
const cleanTag = (value) => String(value).replace(/^#/, '').trim();

/**
 * The upload body. `categoryId`, `alteredContent`, `paidPromotion` and
 * `madeForKids` are the Studio checkboxes (a show's `youtube` presets); a field
 * left undefined is left for YouTube's own default, never guessed.
 */
export const youtubeMetadata = (manifest, {privacy = 'private', publishAt, madeForKids, categoryId, alteredContent, paidPromotion} = {}) => {
  const subject = manifest.subject?.name ?? manifest.title;
  const titleBase = manifest.title.length > 91 ? `${manifest.title.slice(0, 88).trim()}…` : manifest.title;
  const title = /#shorts/i.test(titleBase) ? titleBase : `${titleBase} #Shorts`;
  const sourceLines = (manifest.sources ?? []).map((source) => `- ${source.label}: ${source.url}`).join('\n');
  const disclosure = manifest.audio?.voice ? '\nNarration: AI-generated voice.' : '';
  const description = [
    `${manifest.title}`,
    '',
    manifest.rights?.nonAffiliationNotice,
    manifest.rights?.ownershipNotice,
    disclosure.trim(),
    '',
    'Sources:',
    sourceLines,
    '',
    '#Pokemon #PokePulses #Shorts',
  ].filter((line) => line !== undefined && line !== null).join('\n').slice(0, 5000);
  const tags = unique(['Pokemon', 'Pokémon', 'PokePulses', 'Shorts', 'Pokemon facts', subject, cleanTag(manifest.subject?.identifier)]).slice(0, 30);
  const status = {privacyStatus: publishAt ? 'private' : privacy};
  if (publishAt) status.publishAt = new Date(publishAt).toISOString();
  if (madeForKids !== undefined) status.selfDeclaredMadeForKids = madeForKids;
  if (alteredContent !== undefined) status.containsSyntheticMedia = alteredContent;
  const metadata = {
    snippet: {title, description, tags, categoryId: categoryId || process.env.YOUTUBE_CATEGORY_ID || '27', defaultLanguage: 'en'},
    status,
  };
  // "No paid promotion" is YouTube's default, so only a "yes" needs its own part.
  if (paidPromotion) metadata.paidProductPlacementDetails = {hasPaidProductPlacement: true};
  return metadata;
};

// --- Daily release slots ----------------------------------------------------

const localParts = (date, timeZone) => Object.fromEntries(new Intl.DateTimeFormat('en-CA', {
  timeZone, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit',
}).formatToParts(date).map((part) => [part.type, part.value]));

/** The calendar day ("2026-10-08") an instant falls on in a time zone. */
export const localDay = (date, timeZone) => {
  const {year, month, day} = localParts(date, timeZone);
  return `${year}-${month}-${day}`;
};

/** The UTC instant at which a time zone's wall clock reads `day` `time` ("2026-10-09", "07:00"). */
export const zonedInstant = (day, time, timeZone) => {
  const wanted = Date.parse(`${day}T${time}:00Z`);
  let guess = wanted;
  // The offset depends on the instant itself (daylight saving), so settle it in two passes.
  for (let pass = 0; pass < 2; pass += 1) {
    const p = localParts(new Date(guess), timeZone);
    const shown = Date.parse(`${p.year}-${p.month}-${p.day}T${p.hour}:${p.minute}:${p.second}Z`);
    guess += wanted - shown;
  }
  return new Date(guess);
};

/**
 * The next release slot: the first day whose slot is still at least
 * `leadMinutes` away and that has no release yet. `taken` is every scheduled
 * publish time (ISO strings or dates); gaps in the schedule are filled first.
 */
export const nextReleaseSlot = ({time, timeZone}, taken = [], {now = new Date(), leadMinutes = 15} = {}) => {
  const takenDays = new Set(taken.map((value) => localDay(new Date(value), timeZone)));
  const earliest = now.getTime() + leadMinutes * 60_000;
  let cursor = Date.parse(`${localDay(now, timeZone)}T12:00:00Z`);
  for (let i = 0; i < 4000; i += 1, cursor += 86_400_000) {
    const day = new Date(cursor).toISOString().slice(0, 10);
    const slot = zonedInstant(day, time, timeZone);
    if (!takenDays.has(day) && slot.getTime() >= earliest) return slot;
  }
  throw new Error('No free release slot found.');
};

// --- Channel reads and playlists --------------------------------------------

const api = async (accessToken, resource, {method = 'GET', params = {}, body} = {}) => {
  const url = new URL(`https://www.googleapis.com/youtube/v3/${resource}`);
  for (const [key, value] of Object.entries(params)) url.searchParams.set(key, String(value));
  const response = await fetch(url, {
    method,
    headers: {authorization: `Bearer ${accessToken}`, ...(body ? {'content-type': 'application/json; charset=UTF-8'} : {})},
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await response.text();
  if (!response.ok) {
    const hint = response.status === 403 && /insufficient|scope/i.test(text) ? ' Your token predates the playlist/schedule scope: run npm run youtube:auth once more.' : '';
    throw new Error(`YouTube ${method} ${resource} failed (${response.status}): ${text}${hint}`);
  }
  return JSON.parse(text);
};

const pages = async (accessToken, resource, params, maxPages = 10) => {
  const items = [];
  let pageToken;
  for (let i = 0; i < maxPages; i += 1) {
    const page = await api(accessToken, resource, {params: {...params, maxResults: 50, ...(pageToken ? {pageToken} : {})}});
    items.push(...(page.items ?? []));
    pageToken = page.nextPageToken;
    if (!pageToken) break;
  }
  return items;
};

/** Publish times (ISO) of every video on the channel that is scheduled and still in the future. */
export const listScheduledPublishTimes = async (accessToken, {now = new Date()} = {}) => {
  const channel = await api(accessToken, 'channels', {params: {part: 'contentDetails', mine: true}});
  const uploads = channel.items?.[0]?.contentDetails?.relatedPlaylists?.uploads;
  if (!uploads) throw new Error('Could not find the channel uploads playlist.');
  const entries = await pages(accessToken, 'playlistItems', {part: 'contentDetails', playlistId: uploads});
  const ids = entries.map((entry) => entry.contentDetails?.videoId).filter(Boolean);
  const times = [];
  for (let i = 0; i < ids.length; i += 50) {
    const videos = await api(accessToken, 'videos', {params: {part: 'status', id: ids.slice(i, i + 50).join(',')}});
    for (const video of videos.items ?? []) {
      const publishAt = video.status?.publishAt;
      if (publishAt && new Date(publishAt) > now) times.push(publishAt);
    }
  }
  return times.sort();
};

/** The id of the channel's playlist with this title (case-insensitive), creating it (public) when missing. */
export const findOrCreatePlaylist = async (accessToken, title) => {
  const lists = await pages(accessToken, 'playlists', {part: 'snippet', mine: true});
  const found = lists.find((list) => list.snippet?.title?.trim().toLowerCase() === title.trim().toLowerCase());
  if (found) return {id: found.id, created: false};
  const created = await api(accessToken, 'playlists', {method: 'POST', params: {part: 'snippet,status'}, body: {snippet: {title}, status: {privacyStatus: 'public'}}});
  return {id: created.id, created: true};
};

export const addToPlaylist = (accessToken, playlistId, videoId) => api(accessToken, 'playlistItems', {
  method: 'POST',
  params: {part: 'snippet'},
  body: {snippet: {playlistId, resourceId: {kind: 'youtube#video', videoId}}},
});
