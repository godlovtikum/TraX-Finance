/**
 * Font loader stub.
 *
 * The app no longer ships custom fonts — every screen uses the platform
 * system font (Roboto / San Francisco) via plain `fontWeight` styles.
 * This file is kept as a no-op so existing call sites
 * (`await loadFonts()` in App.tsx history) compile without changes.
 *
 * If you reintroduce a custom font in the future, place the .ttf files in
 *   android/app/src/main/assets/fonts/   (Android)
 *   ios/<AppName>/Fonts/                 (iOS, plus Info.plist entry)
 * and add an `assets: ['./assets/fonts']` entry to react-native.config.js.
 */
export async function loadFonts(): Promise<void> {
  return Promise.resolve();
}
