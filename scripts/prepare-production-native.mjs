// Owner explicitly requested the real Furnio backend. Public build values only.
import assert from 'node:assert/strict';
import {readFileSync,writeFileSync} from 'node:fs';
import {parseEnv} from 'node:util';
import {nativeBuildEnvironment,productionPublicValues} from './local-native-environment.mjs';
assert.deepEqual(process.argv.slice(2),['--production']);
const root='/Users/alipashaamidi/Dev/Furnio Mobile';
const web=parseEnv(readFileSync('/Users/alipashaamidi/Dev/AI Virtual Staging/apps/web/.env','utf8'));
assert(['https://sgsjkgfwgxmlqcgyuyeh.supabase.co','https://auth.furnio.ai'].includes(web.VITE_SUPABASE_URL));
const mobileMap=parseEnv(readFileSync(`${root}/.env.mobile-map.local`,'utf8'));
assert(mobileMap.EXPO_PUBLIC_MAPBOX_PUBLIC_TOKEN?.startsWith('pk.'),'A separate public mobile Mapbox token is required');
const values={...productionPublicValues,EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY:web.VITE_SUPABASE_PUBLISHABLE_KEY,EXPO_PUBLIC_MAPBOX_PUBLIC_TOKEN:mobileMap.EXPO_PUBLIC_MAPBOX_PUBLIC_TOKEN};
nativeBuildEnvironment('production',{},values);
const response=await fetch('https://auth.furnio.ai/auth/v1/settings',{headers:{apikey:values.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY},redirect:'error',signal:AbortSignal.timeout(15000)});
assert.equal(response.status,200,'Branded production Auth/public key check failed');
await response.body?.cancel();
writeFileSync(`${root}/.env.production-native.local`,Object.entries(values).map(([k,v])=>`${k}=${v}\n`).join(''),{mode:0o600});
console.log('Prepared public-only production configuration; branded Auth verified. No server secrets, staging data, account changes or processing calls. Map token remains subject to native validation.');
