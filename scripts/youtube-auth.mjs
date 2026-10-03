import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {loadShow} from './lib/shows.mjs';
import {assertShowChannel, authorizeInteractively, channelOf} from './lib/youtube.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const portArg = process.argv.find((arg) => arg.startsWith('--port='));
const port = portArg ? Number(portArg.split('=')[1]) : 53682;
if (!Number.isInteger(port) || port <= 0) throw new Error(`Invalid port: ${port}`);

// Each show signs in to its own channel: npm run youtube:auth -- --show=geographica
const show = loadShow(process.argv.find((arg) => arg.startsWith('--show='))?.slice('--show='.length) ?? 'pokepulses');
console.log(`▶ signing in to ${show.name}'s YouTube channel${show.publishing?.channelId ? ` (${show.publishing.channelId})` : ''}`);
const token = await authorizeInteractively(root, {port, show: show.id});
if (!token.refresh_token) {
  console.warn('⚠ Google did not return a refresh token. Revoke the app grant and run youtube:auth again if unattended uploads are required.');
}
const channel = await channelOf(token.access_token);
console.log(`✓ connected to ${channel.title} (${channel.id}); login stored for ${show.id} in .secrets/`);
if (!show.publishing?.channelId) console.log(`  Add "channelId": "${channel.id}" to publishing in shows/${show.id}.json, so uploads can't go to another channel.`);
assertShowChannel(show, channel);
