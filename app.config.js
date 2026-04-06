const { loadLocalEnv } = require('./env-bootstrap');

loadLocalEnv(__dirname);

/**
 * Config Expo dynamique : secrets dans `.local.env` (EXPO_PUBLIC_*), non versionné.
 */
const appJson = require('./app.json');

module.exports = () => {
  const mapboxToken = process.env.EXPO_PUBLIC_MAPBOX_TOKEN ?? '';
  const base = appJson.expo;

  // EAS CLI lit `expo.extra.eas` (projectId, etc.) — doit toujours exister comme objet.
  const extra = {
    ...(base.extra || {}),
    eas: {
      ...(base.extra?.eas || {}),
    },
  };

  return {
    expo: {
      ...base,
      owner: 'arack',
      extra,
      ios: {
        ...base.ios,
        infoPlist: {
          ...(base.ios?.infoPlist || {}),
          MBXAccessToken: mapboxToken,
        },
      },
    },
  };
};
