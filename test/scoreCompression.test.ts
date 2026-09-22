import assert from 'node:assert';
import {
  isUnmodifiedPreset,
  findBasePresetForSong,
  createPresetDelta,
  decodePresetDelta,
  encodeCompactSong,
  decodeCompactSong,
  compressString,
  decompressBytes,
  uint8ArrayToBase64Url,
  base64UrlToUint8Array,
  generateSongShareUrl,
  extractSongParamsFromUrl,
  parseSongFromUrl,
  sanitizeSong,
  generateScoreQrCode,
  generateSongQrCodeImage,
  MAX_URL_PAYLOAD_CHARS,
} from '../src/utils/scoreCompression';
import { DEFAULT_SONGS } from '../src/data/defaultSongs';
import { MusicBoxSong } from '../src/types';

async function runTests() {
  console.log('--- Starting Score Compression & QR Code Pipeline Tests ---');

  // Test 1: Base64URL Roundtrip
  console.log('1. Testing RFC 4648 §5 Base64URL encoding/decoding...');
  const testBytes = new Uint8Array([0, 255, 128, 64, 32, 16, 8, 4, 2, 1, 63, 62]);
  const b64Url = uint8ArrayToBase64Url(testBytes);
  assert(!b64Url.includes('+'), 'Base64URL should not contain +');
  assert(!b64Url.includes('/'), 'Base64URL should not contain /');
  assert(!b64Url.includes('='), 'Base64URL should not contain =');
  const restoredBytes = base64UrlToUint8Array(b64Url);
  assert.deepStrictEqual(restoredBytes, testBytes, 'Restored bytes must match original');
  console.log('   ✓ RFC 4648 §5 Base64URL roundtrip passed');

  // Test 2: CompressionStream / DecompressionStream Roundtrip
  console.log('2. Testing Native Stream Compression & Decompression...');
  const sampleJson = JSON.stringify({
    title: 'Test Melody (測試旋律 / Mélodie)',
    pins: [
      { step: 0, tineIndex: 15 },
      { step: 2, tineIndex: 14 },
      { step: 4, tineIndex: 15 },
    ],
  });
  const compressed = await compressString(sampleJson);
  assert(compressed.length > 0, 'Compressed bytes should not be empty');
  const decompressed = await decompressBytes(compressed);
  assert.strictEqual(decompressed, sampleJson, 'Decompressed string must match original');
  console.log('   ✓ Stream compression roundtrip passed');

  // Test 3: Tier 1 - Unmodified Factory Preset
  console.log('3. Testing Tier 1: Unmodified Factory Preset...');
  const furElise = DEFAULT_SONGS[0];
  assert(isUnmodifiedPreset(furElise), 'Für Elise should be recognized as unmodified preset');

  const presetResult = await generateSongShareUrl(furElise, 'https://musicbox.app/');
  assert.strictEqual(presetResult.tier, 'preset', 'Tier should be preset');
  assert(presetResult.url.includes('#preset=fur-elise'), 'URL should contain #preset=fur-elise');
  assert(presetResult.urlChars < 60, `URL chars (${presetResult.urlChars}) must be under 60 chars`);

  // Hydrate preset from URL
  const hydratedPreset = await parseSongFromUrl(presetResult.url);
  assert(hydratedPreset !== null, 'Preset should parse successfully');
  assert.strictEqual(hydratedPreset?.title, furElise.title);
  assert.strictEqual(hydratedPreset?.pins.length, furElise.pins.length);
  console.log(`   ✓ Tier 1 passed: URL length ${presetResult.urlChars} chars`);

  // Test 4: Tier 2 - Modified Preset Delta (_d: 1)
  console.log('4. Testing Tier 2: Differential Preset Delta (_d: 1)...');
  // Clone Für Elise and modify measure 1 (steps 16-31) and tempo
  const modifiedFurElise: MusicBoxSong = {
    ...furElise,
    id: 'fur-elise-edited',
    title: 'Für Elise (My Remix)',
    tempoBpm: 120, // Changed from 108
    pins: [
      ...furElise.pins.filter((p) => p.step < 16 || p.step >= 32), // keep measures 0 and 2..7
      { step: 16, tineIndex: 5, note: 'F5' }, // Custom pins in measure 1
      { step: 20, tineIndex: 9, note: 'A5' },
    ],
  };

  const detectedBase = findBasePresetForSong(modifiedFurElise);
  assert.strictEqual(detectedBase?.id, 'fur-elise', 'Should detect fur-elise as base preset');

  const delta = createPresetDelta(modifiedFurElise, detectedBase!);
  assert.strictEqual(delta._d, 1, 'Delta schema version must be 1');
  assert.strictEqual(delta.bId, 'fur-elise');
  assert.strictEqual(delta.t, 'Für Elise (My Remix)');
  assert.strictEqual(delta.b, 120);
  assert(delta.m !== undefined, 'Delta must have modified measure diffs');
  assert.deepStrictEqual(Object.keys(delta.m!), ['1'], 'Only measure 1 should be in diff!');

  // Roundtrip decode delta
  const reconstructedSong = decodePresetDelta(delta);
  assert.strictEqual(reconstructedSong.title, 'Für Elise (My Remix)');
  assert.strictEqual(reconstructedSong.tempoBpm, 120);
  const m1Pins = reconstructedSong.pins.filter((p) => p.step >= 16 && p.step < 32);
  assert.strictEqual(m1Pins.length, 2, 'Measure 1 should have 2 modified pins');
  assert.strictEqual(m1Pins[0].step, 16);
  assert.strictEqual(m1Pins[0].tineIndex, 5);
  assert.strictEqual(m1Pins[1].step, 20);
  assert.strictEqual(m1Pins[1].tineIndex, 9);

  // Unmodified measures should be preserved
  const m0Pins = reconstructedSong.pins.filter((p) => p.step < 16);
  const origM0Pins = furElise.pins.filter((p) => p.step < 16);
  assert.strictEqual(m0Pins.length, origM0Pins.length, 'Measure 0 pins must match original base');

  // Test full URL generation for Delta
  const deltaResult = await generateSongShareUrl(modifiedFurElise, 'https://musicbox.app/');
  assert.strictEqual(deltaResult.tier, 'delta', 'Tier should be delta');
  console.log(`   ✓ Tier 2 Delta passed: ${deltaResult.originalJsonBytes} B JSON -> ${deltaResult.compressedBinaryBytes} B binary -> ${deltaResult.urlChars} URL chars (reduction: ${(deltaResult.compressionRatio * 100).toFixed(1)}%)`);

  // Test 5: Tier 3 - Original Custom Song Compact Schema (_c: 2)
  console.log('5. Testing Tier 3: Compact V2 Schema (_c: 2)...');
  const customPins = [];
  for (let s = 0; s < 64; s += 2) {
    customPins.push({ step: s, tineIndex: (s % 12) + 2 });
  }
  const customSong: MusicBoxSong = {
    id: 'original-composition-1',
    title: 'Starry Night Promenade',
    category: 'custom',
    description: 'An original 64-step mechanical music box piece.',
    tempoBpm: 92,
    totalSteps: 64,
    combScaleId: 'romantic-flat',
    pins: customPins,
  };

  const compact = encodeCompactSong(customSong);
  assert.strictEqual(compact._c, 2);
  assert.strictEqual(compact.t, 'Starry Night Promenade');
  assert.strictEqual(compact.b, 92);
  assert.strictEqual(compact.p.length, customPins.length);

  const decodedCustom = decodeCompactSong(compact);
  assert.strictEqual(decodedCustom.title, customSong.title);
  assert.strictEqual(decodedCustom.tempoBpm, customSong.tempoBpm);
  assert.strictEqual(decodedCustom.pins.length, customPins.length);
  for (let i = 0; i < customPins.length; i++) {
    assert.strictEqual(decodedCustom.pins[i].step, customPins[i].step);
    assert.strictEqual(decodedCustom.pins[i].tineIndex, customPins[i].tineIndex);
    assert(decodedCustom.pins[i].note !== undefined, 'Note label should be populated');
  }

  const customResult = await generateSongShareUrl(customSong, 'https://musicbox.app/');
  assert.strictEqual(customResult.tier, 'compact');
  console.log(`   ✓ Tier 3 Compact passed: ${customResult.originalJsonBytes} B JSON -> ${customResult.compressedBinaryBytes} B binary -> ${customResult.urlChars} URL chars (reduction: ${(customResult.compressionRatio * 100).toFixed(1)}%)`);

  // Hydrate custom song from URL
  const hydratedCustom = await parseSongFromUrl(customResult.url);
  assert(hydratedCustom !== null, 'Custom song should parse from URL');
  assert.strictEqual(hydratedCustom?.title, customSong.title);
  assert.strictEqual(hydratedCustom?.pins.length, customPins.length);

  // Test 6: URL extraction variants (#song=, ?song=, #preset=, ?preset=)
  console.log('6. Testing URL Parameter Extraction...');
  const hashUrl = 'https://musicbox.app/#song=ABC123_-';
  assert.deepStrictEqual(extractSongParamsFromUrl(hashUrl), { type: 'song', payload: 'ABC123_-' });

  const queryUrl = 'https://musicbox.app/?song=DEF456_-';
  assert.deepStrictEqual(extractSongParamsFromUrl(queryUrl), { type: 'song', payload: 'DEF456_-' });

  const presetHashUrl = 'https://musicbox.app/#preset=clair-de-lune';
  assert.deepStrictEqual(extractSongParamsFromUrl(presetHashUrl), { type: 'preset', payload: 'clair-de-lune' });

  const presetQueryUrl = 'https://musicbox.app/?preset=clair-de-lune';
  assert.deepStrictEqual(extractSongParamsFromUrl(presetQueryUrl), { type: 'preset', payload: 'clair-de-lune' });
  console.log('   ✓ URL parameter extraction passed');

  // Test 7: Safety limits (300 KB max URL payload)
  console.log('7. Testing Safety Ceiling & DoS Defense...');
  const oversizedUrl = 'https://musicbox.app/#song=' + 'A'.repeat(MAX_URL_PAYLOAD_CHARS + 10);
  assert.strictEqual(extractSongParamsFromUrl(oversizedUrl), null, 'Oversized URL should be rejected');
  console.log('   ✓ Safety thresholds passed');

  // Test 8: QR Code Generation
  console.log('8. Testing Level L QR Code Generation...');
  const qrDataUrl = await generateScoreQrCode(customResult.url);
  assert(qrDataUrl.startsWith('data:image/png;base64,'), 'QR Code should be a PNG data URL');
  console.log('   ✓ Level L QR code generation passed');

  // Test 9: QR Code Generation with Song Title & 'music-box' Footer
  console.log('9. Testing QR Code Generation with Song Title & "music-box" Footer...');
  const titledQrUrl = await generateSongQrCodeImage(customResult.url, customSong.title, 'music-box');
  assert(titledQrUrl.startsWith('data:image/png;base64,'), 'Titled QR Code should be a PNG data URL');
  const wrappedScoreQr = await generateScoreQrCode(customResult.url, { title: customSong.title, footerText: 'music-box' });
  assert(wrappedScoreQr.startsWith('data:image/png;base64,'), 'Wrapped QR Code should be a PNG data URL');
  console.log('   ✓ QR code with song title and music-box footer generation passed');

  console.log('\nAll 9 test suites passed with 100% success!\n');
}

runTests().catch((err) => {
  console.error('Test failed:', err);
  process.exit(1);
});
