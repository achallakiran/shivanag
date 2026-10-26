import { test } from 'node:test';
import assert from 'node:assert/strict';
import { matchRef, refs } from '../tools/refmatch';

// The skeleton, posed in each reference's stance, is fitted (camera angle, scale, offset) to the landmarks marked on
// the reference photos. These bounds stop later changes drifting away from the references.
test('the Ready stance matches the reference photos', () => {
  let sum = 0;
  for (const r of refs) {
    const m = matchRef(r);
    assert.ok(m.rms < 0.12, `${r.id} rms ${(m.rms * 100).toFixed(1)}% of height`);
    sum += m.rms;
  }
  assert.ok(sum / refs.length < 0.075, `mean ${(sum / refs.length * 100).toFixed(1)}%`);
});
