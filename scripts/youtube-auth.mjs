import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {authorizeInteractively} from './lib/youtube.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const portArg = process.argv.find((arg) => arg.startsWith('--port='));
const port = portArg ? Number(portArg.split('=')[1]) : 53682;
if (!Number.isInteger(port) || port <= 0) throw new Error(`Invalid port: ${port}`);

const token = await authorizeInteractively(root, {port});
if (!token.refresh_token) {
  console.warn('⚠ Google did not return a refresh token. Revoke the app grant and run youtube:auth again if unattended uploads are required.');
}
console.log('✓ YouTube OAuth connected. Token stored in .secrets/youtube-token.json');
