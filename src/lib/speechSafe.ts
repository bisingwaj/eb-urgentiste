/**
 * Chargement paresseux d'expo-speech : si le binaire natif n'inclut pas ExpoSpeech
 * (dev client non reconstruit après `expo install expo-speech`), l'app ne plante pas.
 * Reconstruire : `npx expo run:ios` / `npx expo run:android`.
 */
type SpeechModule = typeof import('expo-speech');

let speechModule: SpeechModule | null | undefined;

function getSpeech(): SpeechModule | null {
  if (speechModule !== undefined) return speechModule;
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    speechModule = require('expo-speech') as SpeechModule;
  } catch {
    speechModule = null;
  }
  return speechModule;
}

export function speakFrench(text: string): void {
  const Speech = getSpeech();
  if (!Speech) return;
  try {
    Speech.speak(text, { language: 'fr-FR' });
  } catch (e) {
    console.warn('[speechSafe] speak', e);
  }
}

export function stopSpeech(): void {
  const Speech = getSpeech();
  if (!Speech) return;
  try {
    Speech.stop();
  } catch (e) {
    console.warn('[speechSafe] stop', e);
  }
}
