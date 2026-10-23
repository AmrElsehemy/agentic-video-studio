import assert from 'node:assert/strict';
import {describe, it} from 'node:test';
import {cameraMotion, sceneMotion} from '../scripts/lib/camera-motion.mjs';

const boxes = new Map<string, number[]>([['country:A', [0, 0, 10, 10]]]);
const key = (target: unknown, at: number, padding = 0.1) => ({target, at, padding, ease: 'in-out'});
const scene = (id: string, camera: unknown[], extra = {}) => ({id, primitive: {kind: 'geo-map', camera, highlights: [], annotations: [], ...extra}});

describe('camera motion', () => {
  it('sees a push-in as a zoom and a parked camera as still', () => {
    assert.equal(sceneMotion(scene('a', [key('country:A', 0)]).primitive as never, boxes)?.moves, false);
    assert.equal(sceneMotion(scene('a', [key('world', 0), key('country:A', 0.9)]).primitive as never, boxes)?.moves, true);
    assert.equal(sceneMotion(scene('a', [key('country:A', 0), key({bbox: [0, 0, 9, 9]}, 0.9)]).primitive as never, boxes)?.moves, false, 'a 10% change is a drift, not a move');
  });

  it('counts a picture that moves itself (satellite, full-frame photo, cartogram) as moving', () => {
    const still = [key('country:A', 0)];
    assert.ok(sceneMotion(scene('s', still, {annotations: [{type: 'satellite'}]}).primitive as never, boxes)?.moves);
    assert.ok(sceneMotion(scene('p', still, {annotations: [{type: 'photo', fill: true}]}).primitive as never, boxes)?.moves);
    assert.ok(sceneMotion(scene('c', still, {series: {view: 'cartogram'}}).primitive as never, boxes)?.moves);
    assert.ok(!sceneMotion(scene('c', still, {annotations: [{type: 'photo'}]}).primitive as never, boxes)?.moves, 'a photo card on a map is not a moving picture');
  });

  it('asks a map episode to move, get close and reveal', () => {
    const wide = (id: string) => scene(id, [key('country:A', 0)]);
    const slideshow = {scenes: ['a', 'b', 'c', 'd', 'e'].map(wide)};
    const problems = cameraMotion(slideshow, boxes).problems.join('\n');
    assert.match(problems, /5 of 5 map scenes keep the camera still/);
    assert.match(problems, /no scene gets close/);
    assert.match(problems, /no scene reveals/);

    const moving = (id: string) => scene(id, [key('world', 0), key({bbox: [4, 4, 6, 6]}, 0.9)]);
    assert.deepEqual(cameraMotion({scenes: ['a', 'b', 'c', 'd', 'e'].map(moving)}, boxes).problems, []);
  });

  it('leaves very short episodes alone', () => {
    assert.deepEqual(cameraMotion({scenes: [scene('a', [key('country:A', 0)])]}, boxes).problems, []);
  });
});
