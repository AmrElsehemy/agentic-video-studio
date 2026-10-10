import assert from 'node:assert/strict';
import {describe, it} from 'node:test';
import {FIRST_REVEAL, retimeReveals} from '../scripts/lib/enrich.mjs';

const shot = (highlights: number[], annotations: {at: number; until?: number}[], data?: number) => ({
  highlights: highlights.map((at) => ({entity: 'country:FRA', style: 'fill', at})),
  annotations: annotations.map((a, i) => ({type: 'label', anchor: 'country:FRA', text: `L${i}`, ...a})),
  ...(data === undefined ? {} : {data: {at: data}}),
});
const earliest = (p: ReturnType<typeof shot>) => Math.min(...p.highlights.map((h) => h.at), ...p.annotations.map((a) => a.at), ...(p.data ? [p.data.at] : []));

describe('retiming a scene so it does not start with dead air', () => {
  it('brings the first reveal to the start, keeping the order of the rest', () => {
    const before = shot([0.3], [{at: 0.5}, {at: 0.8}]);
    const after = retimeReveals(before);
    assert.equal(earliest(after), FIRST_REVEAL);
    const order = [after.highlights[0].at, after.annotations[0].at, after.annotations[1].at];
    assert.deepEqual([...order].sort((a, b) => a - b), order);
    assert.ok(after.annotations[1].at <= 0.9, 'the last still leaves time to read');
  });

  it('counts a data layer among the reveals', () => {
    const after = retimeReveals(shot([0.4], [{at: 0.6}], 0.25));
    assert.equal(after.data!.at, FIRST_REVEAL);
    assert.ok(after.highlights[0].at > FIRST_REVEAL);
  });

  it('changes nothing in a scene that already starts promptly, so a second pass is a no-op', () => {
    const prompt = shot([0.05], [{at: 0.4}]);
    assert.deepEqual(retimeReveals(prompt), prompt);
    const once = retimeReveals(shot([0.3], [{at: 0.6}]));
    assert.deepEqual(retimeReveals(once), once);
  });

  it('keeps an until after its own at, and a scene with nothing to reveal as it was', () => {
    const after = retimeReveals(shot([0.3], [{at: 0.4, until: 0.45}]));
    assert.ok(after.annotations[0].until! > after.annotations[0].at);
    const empty = {highlights: [], annotations: []};
    assert.deepEqual(retimeReveals(empty), empty);
  });
});
