const { loadLocalEnv } = require('./env-bootstrap');

loadLocalEnv(__dirname);

const { getDefaultConfig } = require('expo/metro-config');

module.exports = getDefaultConfig(__dirname);
