import {describe,it} from 'node:test';
import assert from 'node:assert/strict';
import {nativeBuildEnvironment,productionPublicValues,stagingPublicValues,iosCommerceEnvironment} from './local-native-environment.mjs';
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
describe('explicit iOS commerce build',()=>{
  const base=()=>nativeBuildEnvironment('production',{}, {...productionPublicValues,...publicKeys});
  it('enables only the explicit iOS build without mutating shared values',()=>{
    const original=base();
    const result=iosCommerceEnvironment(original,{EXPO_PUBLIC_REVENUECAT_IOS_KEY:'appl_fixture123'});
    assert.equal(result.EXPO_PUBLIC_PURCHASES_ENABLED,'true');
    assert.equal(original.EXPO_PUBLIC_PURCHASES_ENABLED,'false');
  });
  it('rejects secret keys and unrelated configuration',()=>{
    for(const key of ['sk_private','goog_android','']) assert.throws(()=>iosCommerceEnvironment(base(),{EXPO_PUBLIC_REVENUECAT_IOS_KEY:key}));
    assert.throws(()=>iosCommerceEnvironment(base(),{EXPO_PUBLIC_REVENUECAT_IOS_KEY:'appl_fixture',REVENUECAT_SECRET:'private'}));
  });
  it('does not allow the shared Android path to enable purchases',()=>{
    assert.throws(()=>nativeBuildEnvironment('production',{}, {...productionPublicValues,...publicKeys,EXPO_PUBLIC_REVENUECAT_IOS_KEY:'appl_fixture'}));
  });
  it('rejects nonproduction use of the production commerce configuration',()=>{
    assert.throws(()=>iosCommerceEnvironment({EXPO_PUBLIC_APP_MODE:'staging'},{EXPO_PUBLIC_REVENUECAT_IOS_KEY:'appl_fixture'}));
  });
});
