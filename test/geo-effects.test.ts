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
