import test from 'node:test';
import assert from 'node:assert/strict';
import { detectStage, stageLabel, validateFiles } from '../../src/workflowUtils';

const fakeFile = (name: string, sizeBytes: number): File => ({
  name,
  size: sizeBytes
} as File);

test('detectStage maps progress bands', () => {
  assert.equal(detectStage(0), 'validating');
  assert.equal(detectStage(10), 'analyzing');
  assert.equal(detectStage(45), 'syncing');
  assert.equal(detectStage(70), 'rendering');
  assert.equal(detectStage(96), 'finalizing');
  assert.equal(detectStage(100), 'done');
});

test('stageLabel returns readable text', () => {
  assert.equal(stageLabel('syncing'), 'Synchronizing audio/video');
  assert.equal(stageLabel('cancelled'), 'Cancelled');
});

test('validateFiles accepts supported files', () => {
  const files = [fakeFile('clip01.mp4', 10 * 1024 * 1024)];
  const errors = validateFiles(files);
  assert.equal(errors.length, 0);
});

test('validateFiles rejects unsupported extensions and oversize files', () => {
  const files = [
    fakeFile('clip01.exe', 10 * 1024 * 1024),
    fakeFile('clip02.mov', 600 * 1024 * 1024)
  ];
  const errors = validateFiles(files);
  assert.ok(errors.some(e => e.includes('unsupported format')));
  assert.ok(errors.some(e => e.includes('exceeds 500MB')));
});
