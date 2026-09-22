import { it } from 'node:test';
import assert from 'node:assert/strict';
import { storeBuildArguments } from './store-build-number.mjs';

it('requires an explicit new upload build without consuming other flags', () => {
  assert.deepEqual(storeBuildArguments(['--production', '--native-purchases', '--build-number=5']), {
    buildNumber: '5', args: ['--production', '--native-purchases'],
  });
});
it('rejects missing, duplicate, old and malformed build numbers', () => {
  for (const args of [[], ['--build-number=5', '--build-number=6'],
    ...['4', '0', '05', '5.1', '10000', '', 'NaN'].map(value => [`--build-number=${value}`])]) {
    assert.throws(() => storeBuildArguments(args));
  }
});
