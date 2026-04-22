import { Audio } from 'expo-av';
import { Vibration, Platform, DeviceEventEmitter } from 'react-native';

/**
 * AlarmService — Singleton qui gère la sonnerie d'alarme urgente.
 *
 * • Joue un son de sirène en boucle (même en arrière-plan, même écran verrouillé)
 * • Fait vibrer le téléphone en continu
 * • S'arrête quand l'app revient au premier plan (foreground) ou via STOP_ALARM
 */

export const ALARM_STOP_EVENT = 'STOP_ALARM_EVENT';
class AlarmServiceClass {
  private sound: Audio.Sound | null = null;
  private isAlarmPlaying = false;
  private vibrationInterval: ReturnType<typeof setInterval> | null = null;
  private autoStopTimeout: ReturnType<typeof setTimeout> | null = null;
  private startTime = 0;
  private readonly AUTO_STOP_MS = 10 * 60 * 1000; // 10 minutes

  /**
   * Configure le mode audio pour jouer en arrière-plan et ignorer le mode silencieux.
   */
  private async configureAudioMode(): Promise<void> {
    try {
      await Audio.setAudioModeAsync({
        allowsRecordingIOS: false,
        staysActiveInBackground: true,
        playsInSilentModeIOS: true,
        shouldDuckAndroid: false,
        playThroughEarpieceAndroid: false,
        // Correction interruption : ne pas mélanger (DoNotMix) pour garder la priorité
        interruptionModeIOS: (Audio as any).InterruptionModeIOS?.DoNotMix || 1,
        interruptionModeAndroid: (Audio as any).InterruptionModeAndroid?.DoNotMix || 1,
      });
    } catch (err) {
      console.warn('[AlarmService] Failed to configure audio mode:', err);
    }
  }

  /**
   * Démarre l'alarme : son en boucle + vibration continue.
   */
  async startAlarm(): Promise<void> {
    if (this.isAlarmPlaying) {
      console.log('[AlarmService] ⚠️ Alarm already playing, skipping');
      return;
    }

    console.log('[AlarmService] 🚨 Starting alarm...');
    this.isAlarmPlaying = true;
    this.startTime = Date.now();

    try {
      // 1. Configurer le mode audio
      await this.configureAudioMode();

      // 2. Charger et jouer le son en boucle
      const { sound } = await Audio.Sound.createAsync(
        require('../../assets/sounds/alarm_alert.wav'),
        {
          isLooping: true,
          volume: 1.0,
          shouldPlay: true,
        }
      );
      this.sound = sound;

      // Listener pour gérer les erreurs de lecture
      this.sound.setOnPlaybackStatusUpdate((status) => {
        if ('error' in status && status.error) {
          console.error('[AlarmService] Playback error:', status.error);
        }
      });

      // 3. Démarrer la vibration continue
      this.startContinuousVibration();

      // 4. Sécurité : arrêt automatique après 10 minutes pour la batterie
      if (this.autoStopTimeout) clearTimeout(this.autoStopTimeout);
      this.autoStopTimeout = setTimeout(() => {
        console.log('[AlarmService] 🕒 Hard limit reached (10m) — auto-stopping');
        this.stopAlarm();
      }, this.AUTO_STOP_MS);

      console.log('[AlarmService] ✅ Alarm started successfully');
    } catch (err) {
      console.error('[AlarmService] ❌ Failed to start alarm:', err);
      this.isAlarmPlaying = false;
      // Fallback : au moins la vibration
      this.startContinuousVibration();
    }
  }

  /**
   * Arrête l'alarme : stop le son + la vibration.
   */
  async stopAlarm(): Promise<void> {
    if (!this.isAlarmPlaying) return;

    console.log('[AlarmService] 🔇 Stopping alarm...');
    this.isAlarmPlaying = false;

    if (this.autoStopTimeout) {
      clearTimeout(this.autoStopTimeout);
      this.autoStopTimeout = null;
    }

    // Arrêter la vibration
    this.stopContinuousVibration();

    // Arrêter le son
    if (this.sound) {
      try {
        await this.sound.stopAsync();
        await this.sound.unloadAsync();
      } catch (err) {
        console.warn('[AlarmService] Error stopping sound:', err);
      }
      this.sound = null;
    }

    // Annuler toute vibration résiduelle
    Vibration.cancel();

    console.log('[AlarmService] ✅ Alarm stopped');
  }

  /**
   * Vibration en boucle avec un pattern "urgence".
   */
  private startContinuousVibration(): void {
    // Pattern rythmique type sirène / urgence : vibrer 500ms, pause 200ms, vibrer 500ms, pause 200ms...
    const pattern = [0, 500, 200, 500, 200, 500, 800];

    if (Platform.OS === 'android') {
      // Sur Android, le paramètre `true` = repeat
      Vibration.vibrate(pattern, true);
    } else {
      // iOS ne supporte pas la répétition native → utiliser un interval
      Vibration.vibrate(pattern);
      this.vibrationInterval = setInterval(() => {
        if (this.isAlarmPlaying) {
          Vibration.vibrate(pattern);
        }
      }, 4800); // Durée totale du pattern ci-dessus
    }
  }

  /**
   * Arrête la boucle de vibration.
   */
  private stopContinuousVibration(): void {
    Vibration.cancel();
    if (this.vibrationInterval) {
      clearInterval(this.vibrationInterval);
      this.vibrationInterval = null;
    }
  }

  /**
   * Vérifie si l'alarme est en train de sonner.
   */
  isPlaying(): boolean {
    return this.isAlarmPlaying;
  }

  getStartTime(): number {
    return this.startTime;
  }
}

/** Singleton global */
export const AlarmService = new AlarmServiceClass();
