// Config plugin: sign Android release builds with your own upload keystore when
// one is provided, instead of the template's public debug keystore.
//
// Provide (e.g. as CI secrets):
//   MAKA_UPLOAD_STORE_FILE      absolute path to the .jks/.keystore file
//   MAKA_UPLOAD_STORE_PASSWORD  keystore password
//   MAKA_UPLOAD_KEY_ALIAS       key alias
//   MAKA_UPLOAD_KEY_PASSWORD    key password
// Without them, release APKs stay signed with the debug key: fine for test
// installs (and updates install over each other), NOT acceptable for Google Play.
const { withAppBuildGradle } = require('expo/config-plugins');

const MARKER = '// maka: release signing';

function addReleaseSigning(gradle) {
  if (gradle.includes(MARKER)) return gradle;
  const release = `
        release {
            ${MARKER}
            if (System.getenv('MAKA_UPLOAD_STORE_FILE')) {
                storeFile file(System.getenv('MAKA_UPLOAD_STORE_FILE'))
                storePassword System.getenv('MAKA_UPLOAD_STORE_PASSWORD')
                keyAlias System.getenv('MAKA_UPLOAD_KEY_ALIAS')
                keyPassword System.getenv('MAKA_UPLOAD_KEY_PASSWORD')
            }
        }`;
  const withConfig = gradle.replace(/signingConfigs\s*\{\s*\n(\s*)debug\s*\{/, (m) => m.replace(/signingConfigs\s*\{/, 'signingConfigs {' + release));
  if (withConfig === gradle) throw new Error('withReleaseSigning: could not find signingConfigs { debug { … } } in app/build.gradle');
  // In buildTypes.release, use the release config when a keystore was provided.
  const out = withConfig.replace(
    /(release\s*\{[^{}]*?)signingConfig signingConfigs\.debug/,
    "$1signingConfig System.getenv('MAKA_UPLOAD_STORE_FILE') ? signingConfigs.release : signingConfigs.debug",
  );
  if (out === withConfig) throw new Error('withReleaseSigning: could not find buildTypes.release signingConfig');
  return out;
}

module.exports = function withReleaseSigning(config) {
  return withAppBuildGradle(config, (c) => {
    if (c.modResults.language !== 'groovy') throw new Error('withReleaseSigning expects a Groovy build.gradle');
    c.modResults.contents = addReleaseSigning(c.modResults.contents);
    return c;
  });
};
module.exports.addReleaseSigning = addReleaseSigning;
