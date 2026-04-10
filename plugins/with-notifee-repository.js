const { withProjectBuildGradle } = require('@expo/config-plugins');

/**
 * Expo Config Plugin to add Notifee's local Maven repository to the project's build.gradle.
 * This is required when Gradle cannot find 'app.notifee:core'.
 */
const withNotifeeRepository = (config) => {
  return withProjectBuildGradle(config, (config) => {
    if (config.modResults.contents.includes('node_modules/@notifee/react-native/android/libs')) {
      return config;
    }

    const notifeeRepo = `
// @generated begin notifee-repository - expo prebuild
allprojects {
  repositories {
    maven {
      url "$rootDir/../node_modules/@notifee/react-native/android/libs"
    }
  }
}
// @generated end notifee-repository
`;

    config.modResults.contents += notifeeRepo;
    return config;
  });
};

module.exports = withNotifeeRepository;
