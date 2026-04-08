const { loadLocalEnv } = require('./env-bootstrap');

loadLocalEnv(__dirname);

/**
 * Config Expo dynamique : secrets dans `.local.env` (EXPO_PUBLIC_*), non versionné.
 *
 * FCM (send-call-push) : placer `google-services.json` (Firebase) à la racine du repo
 * ou renseigner `android.googleServicesFile` dans app.json, puis `eas build` — requis pour
 * `getDevicePushTokenAsync` / enregistrement `users_directory.fcm_token`.
 *
 * Notifee (`@notifee/react-native`) : notifications d’appel Android (plein écran, actions).
 * Après ajout, exécuter `npx expo prebuild` (ou `eas build`) pour régénérer le natif.
 * Si Gradle ne trouve pas `app.notifee:core`, le dépôt local est déjà ajouté dans
 * `android/build.gradle` (allprojects.repositories) — à réappliquer après un prebuild clean si besoin.
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
