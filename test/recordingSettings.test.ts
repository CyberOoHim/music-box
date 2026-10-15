import assert from 'node:assert';
import {
  DEFAULT_RECORDING_SETTINGS,
  loadSavedRecordingSettings,
  RECORDING_SETTINGS_STORAGE_KEY,
} from '../src/components/PlayRecordModal';

// Mock browser localStorage for Node test runner
const memoryStorage: Record<string, string> = {};

(globalThis as any).localStorage = {
  getItem: (key: string) => memoryStorage[key] || null,
  setItem: (key: string, value: string) => {
    memoryStorage[key] = String(value);
  },
  removeItem: (key: string) => {
    delete memoryStorage[key];
  },
  clear: () => {
    for (const key of Object.keys(memoryStorage)) {
      delete memoryStorage[key];
    }
  },
};

(globalThis as any).window = globalThis;

async function runTests() {
  console.log('--- Starting Recording Modal Settings Persistence Tests ---');

  // Test 1: Verify defaults: 1 turn, balanced video compression
  console.log('1. Testing defaults: 1 turn and balanced video compression...');
  assert.strictEqual(DEFAULT_RECORDING_SETTINGS.turns, 1, 'Default turn count must be 1');
  assert.strictEqual(
    DEFAULT_RECORDING_SETTINGS.videoCompression,
    'balanced',
    'Default video recording quality must be balanced'
  );
  assert.strictEqual(DEFAULT_RECORDING_SETTINGS.modalTab, 'video', 'Default tab must be video');
  assert.strictEqual(
    DEFAULT_RECORDING_SETTINGS.preferredFormat,
    'mp4',
    'Default format must be iPad-native mp4'
  );
  console.log('   ✓ Default turn count is 1 and video compression is balanced');

  // Test 2: Unset storage returns default values
  console.log('2. Testing fallback to defaults when storage is empty...');
  localStorage.removeItem(RECORDING_SETTINGS_STORAGE_KEY);
  const loadedDefault = loadSavedRecordingSettings();
  assert.strictEqual(loadedDefault.turns, 1);
  assert.strictEqual(loadedDefault.videoCompression, 'balanced');
  assert.strictEqual(loadedDefault.modalTab, 'video');
  assert.strictEqual(loadedDefault.preferredFormat, 'mp4');
  assert.strictEqual(loadedDefault.interTurnSilence, 1.5);
  console.log('   ✓ Fallback when empty passed');

  // Test 3: Persisting custom settings to localStorage and loading them back
  console.log('3. Testing persistent retrieval of user customized settings...');
  const customSettings = {
    modalTab: 'audio',
    turns: 3,
    interTurnSilence: 2.2,
    leadInPadding: 1.8,
    leadOutPadding: 2.5,
    includeAmbiance: true,
    videoCompression: 'high',
    preferredFormat: 'webm',
  };
  localStorage.setItem(RECORDING_SETTINGS_STORAGE_KEY, JSON.stringify(customSettings));
  const retrieved = loadSavedRecordingSettings();
  assert.strictEqual(retrieved.modalTab, 'audio');
  assert.strictEqual(retrieved.turns, 3);
  assert.strictEqual(retrieved.videoCompression, 'high');
  assert.strictEqual(retrieved.preferredFormat, 'webm');
  assert.strictEqual(retrieved.interTurnSilence, 2.2);
  assert.strictEqual(retrieved.leadInPadding, 1.8);
  assert.strictEqual(retrieved.leadOutPadding, 2.5);
  assert.strictEqual(retrieved.includeAmbiance, true);
  console.log('   ✓ Custom persisted settings correctly retrieved');

  // Test 4: Corrupt/out-of-bounds values fall back to defaults gracefully
  console.log('4. Testing resilience against corrupted or invalid values...');
  localStorage.setItem(
    RECORDING_SETTINGS_STORAGE_KEY,
    JSON.stringify({
      turns: 99, // invalid turn count
      videoCompression: 'ultra-hd-extreme', // invalid profile
      modalTab: 'vr', // invalid tab
      preferredFormat: 'avi', // invalid format
      interTurnSilence: -50, // invalid silence
      includeAmbiance: 'yes', // should coerce to boolean
    })
  );
  const sanitized = loadSavedRecordingSettings();
  assert.strictEqual(sanitized.turns, 1, 'Invalid turns must fallback to default 1');
  assert.strictEqual(
    sanitized.videoCompression,
    'balanced',
    'Invalid video compression must fallback to default balanced'
  );
  assert.strictEqual(sanitized.modalTab, 'video', 'Invalid tab must fallback to default video');
  assert.strictEqual(
    sanitized.preferredFormat,
    'mp4',
    'Invalid format must fallback to default mp4'
  );
  assert.strictEqual(
    sanitized.interTurnSilence,
    1.5,
    'Out of bounds silence must fallback to default 1.5'
  );
  console.log('   ✓ Resilience against corrupted data verified');

  console.log('\nAll Recording Modal Settings tests passed successfully!\n');
}

runTests().catch((err) => {
  console.error('Test failed:', err);
  process.exit(1);
});
