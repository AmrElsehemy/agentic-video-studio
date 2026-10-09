import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {describe, it} from 'node:test';
import {fileURLToPath} from 'node:url';
import {buildModel, absolute, parseRotations, quatFromPole, quatInverse, quatMul, reconstruction, rotateGeometry, rotatePoint, sampleTable, tableRotation, type PlateTable} from '../scripts/lib/plates.mjs';
import {plateOfCountry} from '../scripts/lib/plate-model.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const near = (actual: number[], expected: number[], tolerance = 1e-6) => actual.forEach((value, index) => assert.ok(Math.abs(value - expected[index]) < tolerance, `${actual} vs ${expected}`));

describe('plate rotation maths', () => {
  it('turns a point a quarter turn about the north pole', () => {
    near(rotatePoint(quatFromPole(90, 0, 90), [0, 0]), [90, 0]);
    near(rotatePoint(quatFromPole(90, 0, 90), [90, 0]), [180, 0]);
  });

  it('leaves everything where it is for no rotation, and undoes a rotation with its inverse', () => {
    near(rotatePoint(quatFromPole(10, 20, 0), [33, 44]), [33, 44]);
    const q = quatFromPole(23, -67, 41);
    near(rotatePoint(quatInverse(q), rotatePoint(q, [12, 34])), [12, 34], 1e-9);
  });

  it('composes: the second rotation acts after the first', () => {
    const a = quatFromPole(90, 0, 30);
    const b = quatFromPole(90, 0, 60);
    near(rotatePoint(quatMul(b, a), [0, 0]), [90, 0], 1e-9);
  });

  it('rotates every point of an outline and keeps its shape type', () => {
    const geometry = {type: 'Polygon', coordinates: [[[0, 0], [10, 0], [10, 10], [0, 0]]]};
    const turned = rotateGeometry(geometry, quatFromPole(90, 0, 90));
    assert.equal(turned.type, 'Polygon');
    near(turned.coordinates[0][1], [100, 0], 1e-9);
  });
});

describe('a rotation file', () => {
  const rot = `
001 0.0 90.0 0.0 0.0 000 !root
100 0.0 90.0 0.0 0.0 001 !A fixed to root
100 10.0 90.0 0.0 10.0 001 !A turns 10 degrees by 10 Ma
200 0.0 90.0 0.0 0.0 100 !B fixed to A
200 10.0 90.0 0.0 20.0 100 !B turns 20 more degrees against A
`;
  const model = buildModel(parseRotations(rot));
  it('reads the rows and ignores comments', () => {
    assert.equal(parseRotations(rot).length, 5);
    assert.equal(parseRotations('! only a comment\n').length, 0);
  });
  it('composes a plate through the plate it is fixed to', () => {
    // At 10 Ma B is 20 degrees against A, which is 10 against the root: 30 about the same pole.
    near(rotatePoint(absolute(model, 200, 10), [0, 0]), [30, 0], 1e-9);
    near(rotatePoint(absolute(model, 200, 5), [0, 0]), [15, 0], 1e-9);
    near(rotatePoint(absolute(model, 200, 0), [0, 0]), [0, 0], 1e-9);
  });
  it('gives a plate its place against another plate, with that one held still', () => {
    const table = sampleTable(model, [100, 200], [0, 5, 10]);
    near(rotatePoint(reconstruction(table, 200, 100, 10)!, [0, 0]), [20, 0], 1e-3);
    assert.equal(reconstruction(table, 999, 100, 10), null);
  });
  it('changes the fixed plate where the file does, instead of blending across it', () => {
    const switched = buildModel(parseRotations('100 0.0 90 0 0 001\n100 10.0 90 0 10 001\n100 10.0 90 0 50 200\n100 20.0 90 0 60 200\n200 0.0 90 0 0 001\n200 20.0 90 0 0 001\n'));
    near(rotatePoint(absolute(switched, 100, 5), [0, 0]), [5, 0], 1e-9);
    near(rotatePoint(absolute(switched, 100, 15), [0, 0]), [55, 0], 1e-9);
  });
});

describe('the pinned Müller et al. (2016) model', () => {
  const plates = JSON.parse(fs.readFileSync(path.join(root, 'public/geo/plates.json'), 'utf8')) as {source: {license: string; attribution: string; fileSha256: string}; entityPlates: Record<string, number>; table: PlateTable};
  const centre = (plate: number, point: [number, number], age: number) => rotatePoint(reconstruction(plates.table, plate, 701, age)!, point);

  it('is credited and licensed for reuse', () => {
    assert.equal(plates.source.license, 'CC BY 4.0');
    assert.match(plates.source.attribution, /Müller et al\. \(2016\)/);
    assert.match(plates.source.fileSha256, /^[0-9a-f]{64}$/);
  });

  it('holds Africa still against itself, and every plate at its present place at 0 Ma', () => {
    near(centre(701, [20, 5], 90), [20, 5], 1e-9);
    for (const plate of [702, 501, 802, 801, 201]) near(centre(plate, [30, -10], 0), [30, -10], 1e-6);
  });

  it('has Madagascar tucked up against East Africa long ago, and in place since about 120 Ma', () => {
    const [lonNow, latNow] = [46.7, -19.4];
    near(centre(702, [lonNow, latNow], 100), [lonNow, latNow], 1e-6);
    const [, lat180] = centre(702, [lonNow, latNow], 180);
    assert.ok(lat180 > -6 && lat180 < 0, `Madagascar's centre is near the equator at 180 Ma (${lat180.toFixed(1)}°)`);
  });

  it('has India beside Madagascar at 100 Ma and then crossing the equator on its way north', () => {
    const [lon100, lat100] = centre(501, [78.5, 22.5], 100);
    assert.ok(lon100 > 52 && lon100 < 66 && lat100 < -8, `India at 100 Ma: ${lon100.toFixed(1)}, ${lat100.toFixed(1)}`);
    const [, lat60] = centre(501, [78.5, 22.5], 60);
    const [, lat0] = centre(501, [78.5, 22.5], 0);
    assert.ok(lat60 < lat0 && lat100 < lat60, 'India moves steadily north');
  });

  it('blends between sampled ages smoothly', () => {
    const a = tableRotation(plates.table, 501, 70)!;
    const b = tableRotation(plates.table, 501, 71)!;
    const c = tableRotation(plates.table, 501, 72)!;
    const mid = rotatePoint(b, [78.5, 22.5]);
    const [pa, pc] = [rotatePoint(a, [78.5, 22.5]), rotatePoint(c, [78.5, 22.5])];
    near(mid, [(pa[0] + pc[0]) / 2, (pa[1] + pc[1]) / 2], 0.2);
  });

  it('places countries on plates, and leaves out the ones it cannot place', () => {
    assert.equal(plates.entityPlates['country:MDG'], 702);
    assert.equal(plates.entityPlates['country:IND'], 501);
    assert.equal(plates.entityPlates['country:TZA'], 701);
    assert.equal(plates.entityPlates['country:BRA'], 201);
    assert.equal(plates.entityPlates['country:CHN'], undefined);
    assert.equal(plateOfCountry('country:RUS', 'Europe'), undefined);
  });
});
