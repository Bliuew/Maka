// Build-time overrides on top of app.json (used by CI):
//   MAKA_VERSION_CODE  Android versionCode / iOS buildNumber (must increase for each store upload)
//   EXPO_PUBLIC_API_URL  the API server baked into the build (also read at runtime via process.env)
module.exports = ({ config }) => {
  const build = process.env.MAKA_VERSION_CODE;
  return {
    ...config,
    android: { ...config.android, ...(build ? { versionCode: Number(build) } : {}) },
    ios: { ...config.ios, ...(build ? { buildNumber: String(build) } : {}) },
    extra: { ...config.extra, apiUrl: process.env.EXPO_PUBLIC_API_URL || config.extra?.apiUrl || '' },
  };
};
