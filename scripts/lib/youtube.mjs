import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import {spawn} from 'node:child_process';

export const YOUTUBE_UPLOAD_SCOPE = 'https://www.googleapis.com/auth/youtube.upload';

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
    scope: YOUTUBE_UPLOAD_SCOPE,
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

export const youtubeMetadata = (manifest, {privacy = 'private', publishAt, madeForKids} = {}) => {
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
  return {
    snippet: {title, description, tags, categoryId: process.env.YOUTUBE_CATEGORY_ID || '27', defaultLanguage: 'en'},
    status,
  };
};
