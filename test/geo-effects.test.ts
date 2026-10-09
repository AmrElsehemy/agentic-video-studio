import assert from 'node:assert/strict';
import {describe, it} from 'node:test';
import {countUp, COUNT_FRAMES, flash, FLASH_FRAMES, marchOffset, ripple, RIPPLE_FRAMES} from '../src/video/geo/effects';

describe('map effects', () => {
  it('spreads a ripple from the moment a place lights up, then stops', () => {
    assert.equal(ripple(9, 10), null);
    const [early, late] = [ripple(11, 10)!, ripple(10 + RIPPLE_FRAMES - 1, 10)!];
    assert.ok(late.radius > early.radius, 'it spreads');
    assert.ok(late.opacity < early.opacity && late.width < early.width, 'it fades and thins');
    assert.equal(ripple(10 + RIPPLE_FRAMES, 10), null);
  });

  it('flashes a fill as it lands and settles', () => {
    assert.equal(flash(9, 10), 0);
    assert.equal(flash(10, 10), 1);
    assert.ok(flash(14, 10) > 0 && flash(14, 10) < 1);
    assert.equal(flash(10 + FLASH_FRAMES, 10), 0);
  });

  it('marches the dashes steadily along an outline', () => {
    assert.equal(marchOffset(0), 0);
    assert.ok(marchOffset(10) < marchOffset(5));
    assert.equal(marchOffset(20) - marchOffset(10), marchOffset(10) - marchOffset(0));
  });

  describe('counting numbers up', () => {
    it('counts the first number in the same style, and ends on the text exactly', () => {
      assert.equal(countUp('3.5 MILLION PEOPLE', 0), '0.0 MILLION PEOPLE');
      assert.equal(countUp('3.5 MILLION PEOPLE', 1), '3.5 MILLION PEOPLE');
      assert.equal(countUp('3.5 MILLION PEOPLE', 1.4), '3.5 MILLION PEOPLE');
      assert.equal(countUp('1,564,116 KM²', 0), '0 KM²');
      assert.match(countUp('1,564,116 KM²', 0.5), /^\d{1,3}(,\d{3})+ KM²$/);
      assert.equal(countUp('$7.2 MILLION', 0.0001), '$0.0 MILLION');
      assert.equal(countUp('10 COUNTRIES', 0), '0 COUNTRIES');
    });

    it('is monotonic and never overshoots the value', () => {
      let last = -1;
      for (let frame = 0; frame <= COUNT_FRAMES; frame++) {
        const value = Number(countUp('1,564,116 KM²', frame / COUNT_FRAMES).replace(/[^\d]/g, '') || 0);
        assert.ok(value >= last, `frame ${frame}`);
        last = value;
      }
    });

    it('leaves words with digits, years and number-free text alone', () => {
      for (const text of ['18TH-LARGEST', 'ROUTE A4', 'SOLD BY RUSSIA, 1867', 'THE EMPTIEST COUNTRY', '1,642 METRES (APPROX.)'.replace('1,642', 'NEAR')]) {
        assert.equal(countUp(text, 0.2), text);
      }
    });
  });
});

import {LOOKS, tiltPoint} from '../src/video/geo/look';

describe('tilted stage', () => {
  const size = {width: 1010, height: 1375};
  it('leaves a flat look alone', () => {
    assert.deepEqual(tiltPoint(LOOKS.classic, [123, 456], size), [123, 456]);
  });

  it('keeps the top-centre fixed when the stage turns about its top edge', () => {
    const [x, y] = tiltPoint({...LOOKS.atlas, tilt: {degrees: 22, scale: 1, originY: 0}}, [505, 0], size);
    assert.ok(Math.abs(x - 505) < 1e-9 && Math.abs(y) < 1e-9);
  });

  it('magnifies the near (bottom) edge and spreads it sideways', () => {
    const look = {...LOOKS.atlas, tilt: {degrees: 22, scale: 1, originY: 0}};
    const [topLeft] = tiltPoint(look, [0, 100], size);
    const [bottomLeft] = tiltPoint(look, [0, 1300], size);
    assert.ok(bottomLeft < topLeft, 'the bottom-left corner is further out than the top-left');
    // A point further down lands further down, and not past where it would without the tilt's stretch.
    const [, y1] = tiltPoint(look, [505, 400], size);
    const [, y2] = tiltPoint(look, [505, 900], size);
    assert.ok(y2 > y1);
  });

  it('puts the centre of the frame where the stage turns', () => {
    for (const name of ['neon', 'atlas', 'terrain'] as const) {
      const [x] = tiltPoint(LOOKS[name], [505, 700], size);
      assert.ok(Math.abs(x - 505) < 1e-6, `${name} stays centred horizontally`);
    }
  });
});
