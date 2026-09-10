const { withAppBuildGradle } = require('expo/config-plugins');

const marker = '// Furnio upload signing (credentials supplied only at build time)';
function configureUploadSigning(source) {
  if (source.includes(marker)) return source;
  const anchor = '    signingConfigs {';
  if (!source.includes(anchor) || !source.includes('signingConfig signingConfigs.debug')) {
    throw new Error('Android Gradle template changed; refusing to guess release signing configuration.');
  }
  const signing = `${marker}
    signingConfigs {
        if (System.getenv('FURNIO_ANDROID_UPLOAD_STORE')) {
            upload {
                storeFile file(System.getenv('FURNIO_ANDROID_UPLOAD_STORE'))
                storePassword System.getenv('FURNIO_ANDROID_UPLOAD_PASSWORD')
                keyAlias System.getenv('FURNIO_ANDROID_UPLOAD_ALIAS')
                keyPassword System.getenv('FURNIO_ANDROID_UPLOAD_PASSWORD')
            }
        }`;
  const release = /release \{([\s\S]*?)signingConfig signingConfigs\.debug/;
  if (!release.test(source)) throw new Error('Cannot locate Android release signing block.');
  return source.replace(anchor, signing).replace(release,
    `release {$1signingConfig System.getenv('FURNIO_ANDROID_UPLOAD_STORE') ? signingConfigs.upload : signingConfigs.debug`);
}

module.exports = config => withAppBuildGradle(config, mod => {
  if (mod.modResults.language !== 'groovy') throw new Error('Furnio upload signing requires Groovy Gradle.');
  mod.modResults.contents = configureUploadSigning(mod.modResults.contents);
  return mod;
});
module.exports.configureUploadSigning = configureUploadSigning;
