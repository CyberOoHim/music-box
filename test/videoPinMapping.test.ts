import assert from 'node:assert';
import { pinSlotX, wrapStepDelta, isPinStriking, combTineWidth } from '../src/audio/videoRecorder';

async function runTests() {
  console.log('--- Starting Video Pin Mapping Parity Tests ---');

  // Test 1: Centered slot mapping matches the main 2D view formula
  console.log('1. Testing pinSlotX centered-slot mapping...');
  const drumLeft = 200;
  const drumWidth = 570;
  const tinesCount = 22;
  const slotW = drumWidth / tinesCount;
  for (const tineIndex of [0, 10, 21]) {
    const expected = drumLeft + (tineIndex + 0.5) * slotW;
    assert.strictEqual(
      pinSlotX(drumLeft, drumWidth, tineIndex, tinesCount),
      expected,
      `tine ${tineIndex} must sit in its centered slot`
    );
  }
  // First and last columns stay inside the drum bounds
  assert(
    pinSlotX(drumLeft, drumWidth, 0, tinesCount) > drumLeft,
    'first column must be inside the drum left edge'
  );
  assert(
    pinSlotX(drumLeft, drumWidth, tinesCount - 1, tinesCount) < drumLeft + drumWidth,
    'last column must be inside the drum right edge'
  );
  console.log('   ✓ pinSlotX centered-slot mapping passed');

  // Test 2: Wrap-aware strike delta at the turn boundary
  console.log('2. Testing wrapStepDelta turn-boundary wrap...');
  assert(
    Math.abs(wrapStepDelta(0, 63.9, 64)) < 0.65,
    'pin step 0 at smoothStep 63.9 must be a near-zero strike delta'
  );
  assert.strictEqual(wrapStepDelta(10, 8, 64), 2, 'simple forward delta must pass through');
  assert.strictEqual(wrapStepDelta(8, 10, 64), -2, 'simple backward delta must pass through');
  const wrapped = wrapStepDelta(0, 32, 64);
  assert(
    wrapped <= 32 && wrapped >= -32,
    'delta must stay within half a turn'
  );
  console.log('   ✓ wrapStepDelta turn-boundary wrap passed');

  // Test 3: Strike test honors the active tine set and the 0.65 threshold
  console.log('3. Testing isPinStriking threshold and tine gating...');
  const active = new Set([5]);
  assert(isPinStriking(active, 5, 0.1) === true, 'active tine within threshold must strike');
  assert(isPinStriking(active, 5, 0.64) === true, 'delta just under 0.65 must strike');
  assert(isPinStriking(active, 5, 0.66) === false, 'delta over 0.65 must not strike');
  assert(isPinStriking(active, 6, 0.0) === false, 'inactive tine must never strike');
  assert(isPinStriking(new Set(), 5, 0.0) === false, 'empty active set must never strike');
  console.log('   ✓ isPinStriking threshold and tine gating passed');

  // Test 4: Comb tine widths are slot-proportional like the main view
  console.log('4. Testing combTineWidth slot-proportional taper...');
  for (const count of [18, 22, 30]) {
    const slotW = 570 / count;
    const bass = combTineWidth(570, count, 0);
    const treble = combTineWidth(570, count, count - 1);
    assert(bass > treble, `bass tine must be wider than treble tine (${count} tines)`);
    assert(
      bass <= slotW && treble > slotW * 0.3,
      `tine widths must fill a healthy share of the ${slotW.toFixed(1)}-unit slot (${count} tines)`
    );
  }
  assert(combTineWidth(570, 30, 0) > 9.5, '30-tine bass must exceed the old fixed 9.5-unit cap');
  console.log('   ✓ combTineWidth slot-proportional taper passed');

  console.log('\nAll 4 test suites passed with 100% success!\n');
}

runTests().catch((err) => {
  console.error('Test failed:', err);
  process.exit(1);
});
