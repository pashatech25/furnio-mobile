import {describe,it} from 'node:test';
import assert from 'node:assert/strict';
import {nativeBuildEnvironment,productionPublicValues,stagingPublicValues} from './local-native-environment.mjs';
const publicKeys={EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY:'sb_publishable_fixture',EXPO_PUBLIC_MAPBOX_PUBLIC_TOKEN:'pk.fixture'};
describe('explicit production native builds',()=>{
  it('pins the real API and branded authentication without native purchases',()=>{
    const env=nativeBuildEnvironment('production',{FAL_KEY:'private',SUPABASE_SECRET_KEY:'private',EXPO_PUBLIC_APP_MODE:'staging'}, {...productionPublicValues,...publicKeys});
    assert.equal(env.EXPO_PUBLIC_SUPABASE_URL,'https://auth.furnio.ai');
    assert.equal(env.EXPO_PUBLIC_PURCHASES_ENABLED,'false');
    assert.equal(env.FAL_KEY,undefined);assert.equal(env.SUPABASE_SECRET_KEY,undefined);
  });
  it('rejects staging endpoints in a production build',()=>assert.throws(()=>nativeBuildEnvironment('production',{}, {...stagingPublicValues,...publicKeys})));
  it('rejects production endpoints in a staging build',()=>assert.throws(()=>nativeBuildEnvironment('staging',{}, {...productionPublicValues,...publicKeys})));
  it('rejects extra fields and secret keys',()=>{
    assert.throws(()=>nativeBuildEnvironment('production',{}, {...productionPublicValues,...publicKeys,FAL_KEY:'private'}));
    assert.throws(()=>nativeBuildEnvironment('production',{}, {...productionPublicValues,...publicKeys,EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY:'sb_secret_private'}));
  });
});
