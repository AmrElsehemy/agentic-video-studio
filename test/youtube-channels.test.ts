import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {describe, it} from 'node:test';
import {loadShow} from '../scripts/lib/shows.mjs';
import {assertShowChannel, channelOf, envRefreshToken, listUploads, matchUploads, titleKey, tokenPath} from '../scripts/lib/youtube.mjs';

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), {status, headers: {'content-type': 'application/json'}});

describe('a login per show', () => {
  it('keeps each show in its own token file, and PokePulses keeps its old one', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'yt-'));
    assert.equal(tokenPath(root, 'geographica'), path.join(root, '.secrets', 'youtube-token-geographica.json'));
    assert.equal(tokenPath(root, 'pokepulses'), path.join(root, '.secrets', 'youtube-token-pokepulses.json'));
    fs.mkdirSync(path.join(root, '.secrets'));
    fs.writeFileSync(path.join(root, '.secrets', 'youtube-token.json'), '{}');
    assert.equal(tokenPath(root, 'pokepulses'), path.join(root, '.secrets', 'youtube-token.json'));
    assert.equal(tokenPath(root, 'geographica'), path.join(root, '.secrets', 'youtube-token-geographica.json'));
  });

  it("reads a show's refresh token from its own variable, never another show's", () => {
    const env = {YOUTUBE_REFRESH_TOKEN: 'poke', YOUTUBE_REFRESH_TOKEN_GEOGRAPHICA: 'geo'};
    assert.equal(envRefreshToken('geographica', env), 'geo');
    assert.equal(envRefreshToken('pokepulses', env), 'poke');
    assert.equal(envRefreshToken('geographica', {YOUTUBE_REFRESH_TOKEN: 'poke'}), undefined);
  });
});

describe('the right channel', () => {
  const geographica = loadShow('geographica');

  it('knows Geographica\'s channel', () => {
    assert.equal(geographica.publishing?.channelId, 'UCAdCQV1ieA3NjmNiutIRwHQ');
  });

  it('refuses a login for another channel', () => {
    assert.doesNotThrow(() => assertShowChannel(geographica, {id: 'UCAdCQV1ieA3NjmNiutIRwHQ', title: 'Geographica'}));
    assert.throws(() => assertShowChannel(geographica, {id: 'UCxxxxxxxxxxxxxxxxxxxxxx', title: 'PokePulses'}), /login is for the channel "PokePulses".*Geographica publishes to UCAdCQV1ieA3NjmNiutIRwHQ/);
  });

  it('reads which channel a login belongs to', async () => {
    const channel = await channelOf('token', {fetchImpl: (async () => json({items: [{id: 'UCAdCQV1ieA3NjmNiutIRwHQ', snippet: {title: 'Geographica'}, contentDetails: {relatedPlaylists: {uploads: 'UUAdCQV1ieA3NjmNiutIRwHQ'}}}]})) as typeof fetch});
    assert.deepEqual(channel, {id: 'UCAdCQV1ieA3NjmNiutIRwHQ', title: 'Geographica', uploads: 'UUAdCQV1ieA3NjmNiutIRwHQ'});
  });

  it('asks for a new login when an old one lacks the channel permission', async () => {
    await assert.rejects(channelOf('token', {fetchImpl: (async () => json({error: 'insufficientPermissions'}, 403)) as typeof fetch}), /youtube:auth/);
  });
});

describe('linking a channel\'s uploads', () => {
  it('reads every page of uploads', async () => {
    const pages = [
      {items: [{snippet: {title: 'A'}, contentDetails: {videoId: 'aaaaaaaaaaa', videoPublishedAt: '2026-10-01T10:00:00Z'}}], nextPageToken: 'p2'},
      {items: [{snippet: {title: 'B'}, contentDetails: {videoId: 'bbbbbbbbbbb', videoPublishedAt: '2026-10-02T10:00:00Z'}}]},
    ];
    const seen: string[] = [];
    const videos = await listUploads('token', 'UU1', {fetchImpl: (async (url: URL) => { seen.push(url.searchParams.get('pageToken') ?? ''); return json(pages.shift()); }) as unknown as typeof fetch});
    assert.deepEqual(videos.map((video) => video.videoId), ['aaaaaaaaaaa', 'bbbbbbbbbbb']);
    assert.deepEqual(seen, ['', 'p2']);
  });

  it('matches titles despite #Shorts, punctuation, case and accents', () => {
    assert.equal(titleKey('Why Bulbasaur Is the Perfect First Pokémon #Shorts'), titleKey('why bulbasaur is the perfect first pokemon'));
  });

  it('links clear matches and leaves the rest for a person', () => {
    const episodes = [{episodeId: 'bulbasaur-001', title: 'Why Bulbasaur Is the Perfect First Pokémon'}, {episodeId: 'ivysaur-002', title: 'Ivysaur Is Halfway There'}];
    const videos = [
      {videoId: 'mjQ2YcEQ3B4', title: 'Why Bulbasaur Is the Perfect First Pokémon #Shorts'},
      {videoId: 'ivyivyivy01', title: 'Ivysaur is halfway there!'},
      {videoId: 'trailer0001', title: 'Channel trailer'},
    ];
    const {matched, unmatched} = matchUploads(videos, episodes);
    assert.deepEqual(matched.map(({episodeId, video}) => [episodeId, video.videoId]), [['bulbasaur-001', 'mjQ2YcEQ3B4'], ['ivysaur-002', 'ivyivyivy01']]);
    assert.deepEqual(unmatched.map((video) => video.videoId), ['trailer0001']);
  });

  it("doesn't guess when two uploads share an episode's title", () => {
    const {matched, unmatched} = matchUploads([{videoId: 'a1a1a1a1a1a', title: 'Same'}, {videoId: 'b2b2b2b2b2b', title: 'Same #Shorts'}], [{episodeId: 'x', title: 'Same'}]);
    assert.equal(matched.length, 0);
    assert.equal(unmatched.length, 2);
  });
});
