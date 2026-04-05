const { loadLocalEnv } = require('./env-bootstrap');

loadLocalEnv(__dirname);

/**
 * Config Expo dynamique : secrets dans `.local.env` (EXPO_PUBLIC_*), non versionné.
 */
const appJson = require('./app.json');

module.exports = () => {
  const mapboxToken = process.env.EXPO_PUBLIC_MAPBOX_TOKEN ?? '';

  return {
    expo: {
      ...appJson.expo,
      ios: {
        ...appJson.expo.ios,
        infoPlist: {
          ...(appJson.expo.ios?.infoPlist || {}),
          MBXAccessToken: mapboxToken,
        },
      },
    },
  };
};
