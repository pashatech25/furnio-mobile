const { test } = require('node:test');
const assert = require('node:assert/strict');
const { configureUploadSigning } = require('../plugins/with-android-upload-signing.cjs');
const fixture = `android {
    signingConfigs {
        debug { keyAlias 'androiddebugkey' }
    }
    buildTypes {
        debug { signingConfig signingConfigs.debug }
        release {
            signingConfig signingConfigs.debug
        }
    }
}`;
test('upload signing is additive, credential-free and idempotent', () => {
  const result = configureUploadSigning(fixture);
  assert.ok(result.includes("debug { signingConfig signingConfigs.debug }"));
  assert.ok(result.includes('signingConfigs.upload : signingConfigs.debug'));
  assert.ok(result.includes("System.getenv('FURNIO_ANDROID_UPLOAD_PASSWORD')"));
  assert.equal(configureUploadSigning(result), result);
});
test('unrecognized templates fail closed', () => {
  assert.throws(() => configureUploadSigning('android {}'));
});
