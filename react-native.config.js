/**
 * React Native CLI config.
 *
 * We intentionally ship no custom font assets. The app renders all text
 * with the platform's system font — Roboto on Android, San Francisco on
 * iOS — via plain `fontWeight` styles. That keeps the APK ~600 KB smaller
 * (no .ttf payload) and removes the runtime risk of unloaded fonts
 * silently flashing the wrong glyphs.
 *
 * If you ever need to add an asset directory back (e.g. a brand
 * display font), restore an `assets: ['./assets/fonts']` entry here.
 */
module.exports = {};
