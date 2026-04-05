/**
 * Charge `.local.env` dans `process.env` avec `override: true`
 * (priorité sur un éventuel `.env` encore chargé par Expo).
 * Utilisé au démarrage de Metro et dans `app.config.js`.
 * Tu peux supprimer `.env` si tu n’utilises que `.local.env`.
 */
const path = require('path');
const fs = require('fs');

function loadLocalEnv(projectRoot) {
  const envPath = path.join(projectRoot, '.local.env');
  if (fs.existsSync(envPath)) {
    require('dotenv').config({ path: envPath, override: true });
  }
}

module.exports = { loadLocalEnv };
