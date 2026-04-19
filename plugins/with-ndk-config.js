const { withProjectBuildGradle } = require('@expo/config-plugins');

/**
 * Expo Config Plugin to read ndkVersion from local.properties instead of hardcoding it.
 */
const withNdkConfig = (config) => {
  return withProjectBuildGradle(config, (config) => {
    let contents = config.modResults.contents;

    // We look for the ext block in build.gradle
    const extBlockRegex = /ext\s*\{[\s\S]*?\}/;
    const match = contents.match(extBlockRegex);

    if (match) {
      const extBlock = match[0];
      
      // Check if the logic is already there
      if (contents.includes('def localPropsFile = rootProject.file(\'local.properties\')')) {
        return config;
      }

      const ndkLogic = `
    // NDK version is read from local.properties (gitignored)
    def localProps = new Properties()
    def localPropsFile = rootProject.file('local.properties')
    if (localPropsFile.exists()) {
      localPropsFile.withInputStream { localProps.load(it) }
    }
    ndkVersion = localProps.getProperty('ndk.version', '27.1.12297006')
`;

      // Replace any existing hardcoded ndkVersion in the ext block or just prepend it
      let newExtBlock = extBlock;
      if (extBlock.includes('ndkVersion =')) {
        newExtBlock = extBlock.replace(/ndkVersion\s*=\s*".*?"/, ndkLogic.trim());
      } else {
        newExtBlock = extBlock.replace('{', '{\n' + ndkLogic);
      }

      config.modResults.contents = contents.replace(extBlock, newExtBlock);
    }

    return config;
  });
};

module.exports = withNdkConfig;
