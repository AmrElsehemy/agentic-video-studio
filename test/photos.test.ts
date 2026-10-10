import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {describe, it} from 'node:test';
import {fileURLToPath} from 'node:url';
import {attributionLine, describeFile, licenseKind, plainText, refusal, screenCredit} from '../scripts/lib/photos.mjs';
import {compileEpisode} from '../scripts/lib/compiler.mjs';
import {episodeDescription} from '../scripts/lib/description.mjs';
import {geoProblems, loadGeoData, photoProblems} from '../scripts/lib/geo-primitives.mjs';
import {shotToPrimitive} from '../scripts/lib/geo-director.mjs';
import {publishBlockers} from '../scripts/lib/publish-checks.mjs';
import {sha256} from '../scripts/lib/geo-data.mjs';
import {primitiveSchema} from '../scripts/primitive-schema.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (file: string) => JSON.parse(fs.readFileSync(path.join(root, file), 'utf8'));
const geo = loadGeoData();

describe('photo licences', () => {
  it('accept public domain, CC0 and CC BY, and nothing with a condition on the video', () => {
    for (const name of ['Public domain', 'CC0', 'CC BY 2.0', 'CC BY 4.0', 'CC BY 3.0', 'PD-USGov-NASA']) assert.ok(licenseKind(name), name);
    for (const name of ['CC BY-SA 4.0', 'CC BY-SA 3.0', 'CC BY-NC 2.0', 'CC BY-ND 2.0', 'GFDL', 'Fair use', '']) assert.equal(licenseKind(name), undefined, name || '(none)');
    assert.equal(licenseKind('Public domain'), 'public-domain');
    assert.equal(licenseKind('CC BY 2.0'), 'attribution');
  });

  it('say why a licence was refused', () => {
    assert.match(refusal('CC BY-SA 4.0'), /share-alike/);
    assert.match(refusal('CC BY-NC 2.0'), /commercial/);
    assert.match(refusal('GFDL'), /not one of public domain, CC0 or CC BY/);
  });
});

describe('photo credits', () => {
  it('turn Commons HTML into plain words', () => {
    assert.equal(plainText('<a href="x">Frank <b>Vassen</b></a> &amp; friends'), 'Frank Vassen & friends');
  });

  it('name the photographer, Commons and the licence', () => {
    assert.equal(attributionLine({author: 'Frank Vassen', license: 'CC BY 2.0', kind: 'attribution'}), 'Photo: Frank Vassen / Wikimedia Commons / CC BY 2.0.');
    assert.equal(attributionLine({author: 'NASA astronaut', license: 'Public domain', kind: 'public-domain'}), 'Photo: NASA astronaut / Wikimedia Commons (Public domain).');
  });

  it('print a short credit on the photo itself', () => {
    assert.equal(screenCredit({author: 'Frank Vassen', license: 'CC BY 2.0', kind: 'attribution'}), 'PHOTO: FRANK VASSEN · CC BY 2.0');
    assert.equal(screenCredit({author: 'Rinaldo Wurglitsch from Vienna, Austria', license: 'CC BY 2.0', kind: 'attribution'}), 'PHOTO: RINALDO WURGLITSCH · CC BY 2.0');
    assert.equal(screenCredit({author: 'Edouard de Stoeckl and William H. Seward', license: 'Public domain', kind: 'public-domain'}), 'PHOTO: WIKIMEDIA COMMONS · PUBLIC DOMAIN');
  });

  it('read a Commons file into what we need to judge it', () => {
    const file = describeFile({title: 'File:A.jpg', imageinfo: [{descriptionurl: 'https://commons.wikimedia.org/wiki/File:A.jpg', url: 'https://u/A.jpg', thumburl: 'https://u/t.jpg', thumbwidth: 1600, thumbheight: 1000, width: 4000, height: 2500, mime: 'image/jpeg',
      extmetadata: {LicenseShortName: {value: 'CC BY 4.0'}, LicenseUrl: {value: 'https://creativecommons.org/licenses/by/4.0'}, Artist: {value: '<a href="u">Jo Bloggs</a>'}, ImageDescription: {value: '<p>A hill.</p>'}}}]});
    assert.deepEqual([file.kind, file.author, file.width, file.imageUrl, file.description], ['attribution', 'Jo Bloggs', 1600, 'https://u/t.jpg', 'A hill.']);
    assert.throws(() => describeFile({title: 'File:B.jpg'}), /no image information/);
  });
});

describe('the photographs on file', () => {
  const index = read('public/photos/index.json').photos as Record<string, any>;

  it('each have a file, a licence we accept, an author and a credit', () => {
    assert.ok(Object.keys(index).length >= 10);
    for (const [slug, photo] of Object.entries(index)) {
      assert.equal(sha256(fs.readFileSync(path.join(root, 'public', 'photos', `${slug}.jpg`))), photo.sha256, slug);
      assert.ok(licenseKind(photo.license), `${slug}: ${photo.license}`);
      assert.ok(photo.author && photo.pageUrl.startsWith('https://commons.wikimedia.org/'), slug);
      assert.match(photo.attribution, /Wikimedia Commons/);
      assert.ok(photo.screenCredit.startsWith('PHOTO: '), slug);
    }
  });
});

describe('a photo on a map scene', () => {
  const base = {kind: 'geo-map', camera: [{target: 'world', at: 0}], highlights: [], annotations: [], dataset: 'natural-earth'};
  const places = new Map([['country:USA', {id: 'country:USA', kind: 'country', name: 'United States of America', bbox: [-125, 24, -66, 49]}]]);
  const shot = (photo: string) => shotToPrimitive({camera: [{target: 'country:USA', at: 0}], highlights: [], annotations: [{type: 'photo', photo, at: 0.3}]}, {places, research: {claims: []}, photos: geo.photos} as never);

  it('is accepted by the schema', () => {
    assert.ok(primitiveSchema.safeParse({...base, annotations: [{type: 'photo', photo: 'peace-arch', at: 0.3}]}).success);
    assert.ok(!primitiveSchema.safeParse({...base, annotations: [{type: 'photo', photo: '../x', at: 0.3}]}).success);
  });

  it('must be a photo on file', () => {
    assert.equal(shot('peace-arch').annotations[0].type, 'photo');
    assert.throws(() => shot('nowhere'), /isn't a photo on file/);
    const primitive = shot('peace-arch');
    assert.deepEqual(photoProblems(primitive, geo), []);
    assert.match(geoProblems({...primitive, annotations: [{type: 'photo', photo: 'nowhere', at: 0}]}, geo)[0], /no photo "nowhere" on file/);
  });

  it('is credited in the episode rights, in the description and on release', () => {
    const draft = read('drafts/geographica/lesotho-enclave.json');
    const withPhoto = {...draft, scenes: draft.scenes.map((scene: any, i: number) => (i === 0 ? {...scene, primitive: {...scene.primitive, annotations: [...scene.primitive.annotations, {type: 'photo', photo: 'peace-arch', at: 0.3}]}} : scene))};
    const manifest = compileEpisode(withPhoto, {showId: 'geographica'}).manifest;
    const asset = manifest.rights.assets.find((item: any) => item.kind === 'photo');
    assert.equal(asset?.notes, geo.photos!['peace-arch'].attribution);
    assert.match(episodeDescription(manifest, read('shows/geographica.json')), /Photo: Abhinaba Basu from Redmond, United States \/ Wikimedia Commons \/ CC BY 2\.0\./);
    assert.doesNotMatch(episodeDescription(manifest, read('shows/geographica.json')), /Map data:/, 'the show leaves its other credits out, but not a photo\'s');
    const uncredited = {...manifest, rights: {...manifest.rights, releaseStatus: 'cleared', publicReleaseApproved: true, assets: manifest.rights.assets.filter((item: any) => item.kind !== 'photo')}};
    assert.ok(publishBlockers(uncredited as never, geo).some((blocker: string) => blocker.startsWith('photo-credit:')));
    assert.ok(!publishBlockers({...uncredited, rights: manifest.rights} as never, geo).some((blocker: string) => blocker.startsWith('photo-credit:')));
  });
});
