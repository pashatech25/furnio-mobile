import assert from 'node:assert/strict';
import {test} from 'node:test';
import {nativeAuthRedirects,withNativeAuthRedirects} from './native-auth-redirects.mjs';

test('preserves all existing web callbacks and includes the flow-bearing deletion route',()=>{
  const existing='https://furnio.ai/auth/callback,https://www.furnio.ai/auth/callback,furnio://auth/callback';
  const result=withNativeAuthRedirects(existing).split(',');
  for(const url of existing.split(',')) assert(result.includes(url));
  assert(result.includes('furnio://auth/deletion-callback?flow=*'));
  assert.equal(result.filter(x=>x==='furnio://auth/callback').length,1);
});
test('configuration is idempotent and has no unrestricted native wildcard',()=>{
  const once=withNativeAuthRedirects('https://furnio.ai');
  assert.equal(withNativeAuthRedirects(once),once);
  assert.deepEqual(nativeAuthRedirects.filter(x=>x.includes('*')),['furnio://auth/deletion-callback?flow=*']);
});
