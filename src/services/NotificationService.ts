import * as Notifications from 'expo-notifications';
import * as Device from 'expo-device';
import { Platform } from 'react-native';
import {
  INCOMING_CALL_ACTION_ACCEPT,
  INCOMING_CALL_ACTION_DECLINE,
  INCOMING_CALL_CATEGORY_ID,
} from '../lib/parseIncomingCallPayload';
import { shouldSkipDuplicateLocalPushNotification } from '../lib/incomingCallUiCoordinator';
import {
  cancelIncomingCallNotifee,
  displayIncomingCallWithNotifee,
  ensureNotifeeIncomingChannel,
} from './notifeeIncomingCall';

/**
 * NotificationService — Gère les notifications locales du système (barre de notification).
 *
 * • Demande les permissions au lancement
 * • Affiche des notifications locales avec son et priorité haute
 * • Canal Android dédié « Urgences » avec son d'alarme
 */

// ── Configuration globale du handler de notification ──
// Ceci détermine comment la notification s'affiche quand l'app est au premier plan.
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: true,
    priority: Notifications.AndroidNotificationPriority.MAX,
  }),
});

class NotificationServiceClass {
  private isInitialized = false;

  private async setupAndroidChannels(): Promise<void> {
    if (Platform.OS !== 'android') return;

    await Notifications.setNotificationChannelAsync('urgences', {
      name: 'Alertes Urgentes',
      importance: Notifications.AndroidImportance.MAX,
      vibrationPattern: [0, 500, 200, 500],
      lightColor: '#FF0000',
      lockscreenVisibility: Notifications.AndroidNotificationVisibility.PUBLIC,
      bypassDnd: true,
      sound: 'alarm_alert.wav',
      enableVibrate: true,
      enableLights: true,
    });

    await Notifications.setNotificationChannelAsync('incoming_calls', {
      name: 'Appels entrants',
      importance: Notifications.AndroidImportance.MAX,
      vibrationPattern: [0, 400, 200, 400, 200, 400],
      lightColor: '#1564bf',
      lockscreenVisibility: Notifications.AndroidNotificationVisibility.PUBLIC,
      bypassDnd: true,
      sound: 'incoming_call_ring.wav',
      enableVibrate: true,
      enableLights: true,
      /** Sonnerie type téléphone (volume canal « sonnerie » / heads-up hors app). */
      audioAttributes: {
        usage: Notifications.AndroidAudioUsage.NOTIFICATION_RINGTONE,
        contentType: Notifications.AndroidAudioContentType.SONIFICATION,
      },
    });
  }

  /**
   * Canaux Android + catégories iOS — sans prompt permissions.
   * Appelé depuis la tâche FCM en tête (avant `presentIncomingCallNotification`).
   */
  async ensurePushInfrastructure(): Promise<void> {
    try {
      await this.setupAndroidChannels();
      if (Platform.OS === 'android') {
        await ensureNotifeeIncomingChannel();
      }
      await this.ensureIncomingCallCategories();
    } catch (e) {
      console.warn('[NotificationService] ensurePushInfrastructure:', e);
    }
  }

  /**
   * Initialise les permissions et le canal Android.
   * Doit être appelé une seule fois au démarrage de l'app.
   */
  async initialize(): Promise<void> {
    if (this.isInitialized) return;

    try {
      await this.setupAndroidChannels();
      console.log('[NotificationService] ✅ Canaux Android créés');

      await this.ensureIncomingCallCategories();

      // Demander les permissions
      await this.requestPermissions();
      this.isInitialized = true;
    } catch (err) {
      console.error('[NotificationService] ❌ Initialization error:', err);
    }
  }

  /**
   * Demande les permissions de notification à l'utilisateur.
   */
  async requestPermissions(): Promise<boolean> {
    if (!Device.isDevice) {
      console.warn('[NotificationService] ⚠️ Notifications ne marchent pas sur simulateur');
      return false;
    }

    const { status: existingStatus } = await Notifications.getPermissionsAsync();
    let finalStatus = existingStatus;

    if (existingStatus !== 'granted') {
      const { status } = await Notifications.requestPermissionsAsync({
        ios: {
          allowAlert: true,
          allowBadge: true,
          allowSound: true,
          allowCriticalAlerts: true,
        },
      });
      finalStatus = status;
    }

    if (finalStatus !== 'granted') {
      console.warn('[NotificationService] ⚠️ Permissions de notification refusées');
      return false;
    }

    console.log('[NotificationService] ✅ Permissions accordées');
    return true;
  }

  /**
   * Envoie une notification locale pour une nouvelle mission urgente.
   */
  async sendMissionAlert(options?: {
    title?: string;
    body?: string;
    data?: Record<string, unknown>;
  }): Promise<void> {
    const title = options?.title ?? '🚨 NOUVELLE MISSION';
    const body =
      options?.body ??
      "La centrale vous a assigné une intervention urgente. Ouvrez l'application immédiatement.";
    const data = options?.data ?? {};

    try {
      await Notifications.scheduleNotificationAsync({
        content: {
          title,
          body,
          data,
          sound: Platform.OS === 'android' ? 'alarm_alert.wav' : true,
          priority: Notifications.AndroidNotificationPriority.MAX,
          sticky: true,
          ...(Platform.OS === 'android' && { channelId: 'urgences' }),
          categoryIdentifier: 'mission_alert',
          badge: 1,
        },
        trigger: null,
      });

      console.log('[NotificationService] ✅ Notification mission envoyée');
    } catch (err) {
      console.error('[NotificationService] ❌ Erreur envoi notification:', err);
    }
  }

  /**
   * Supprime toutes les notifications affichées.
   */
  async dismissAll(): Promise<void> {
    await Notifications.dismissAllNotificationsAsync();
    await Notifications.setBadgeCountAsync(0);
  }

  /** Catégories iOS (actions Accepter / Refuser). */
  async ensureIncomingCallCategories(): Promise<void> {
    try {
      await Notifications.setNotificationCategoryAsync(INCOMING_CALL_CATEGORY_ID, [
        {
          identifier: INCOMING_CALL_ACTION_DECLINE,
          buttonTitle: 'Refuser',
          options: {
            isDestructive: true,
            opensAppToForeground: true,
          },
        },
        {
          identifier: INCOMING_CALL_ACTION_ACCEPT,
          buttonTitle: 'Accepter',
          options: { opensAppToForeground: true },
        },
      ]);
    } catch (e) {
      console.warn('[NotificationService] ensureIncomingCallCategories:', e);
    }
  }

  /**
   * Notification locale « appel entrant » (barre système, heads-up Android).
   * Utilisé après FCM data-only ou pour garantir l’affichage dans le tiroir.
   */
  async presentIncomingCallNotification(params: {
    callId: string;
    channelName: string;
    callerName: string;
    hasVideo: boolean;
  }): Promise<void> {
    const { callId, channelName, callerName, hasVideo } = params;

    if (shouldSkipDuplicateLocalPushNotification(callId)) {
      console.log('[NotificationService] Skip notif locale (Modal Realtime déjà affiché)', callId);
      return;
    }

    if (Platform.OS === 'android') {
      try {
        await displayIncomingCallWithNotifee({
          callId,
          channelName,
          callerName,
          hasVideo,
        });
        console.log('[NotificationService] ✅ Notifee appel entrant affiché', callId);
      } catch (err) {
        console.error('[NotificationService] ❌ Erreur Notifee appel entrant:', err);
      }
      return;
    }

    const title = 'Appel entrant — Centrale';
    const body = `${callerName.trim() || 'Opérateur'} · ${hasVideo ? 'Vidéo' : 'Audio'} — Touchez pour répondre`;

    try {
      await Notifications.scheduleNotificationAsync({
        identifier: `incoming-call-${callId}`,
        content: {
          title,
          body,
          subtitle: 'Appuyez pour ouvrir l’appel',
          data: {
            type: 'incoming_call',
            callId,
            channelName,
            callerName,
            hasVideo: hasVideo ? 'true' : 'false',
          },
          sound: 'incoming_call_ring.wav',
          priority: Notifications.AndroidNotificationPriority.MAX,
          sticky: true,
          interruptionLevel: 'timeSensitive',
          categoryIdentifier: INCOMING_CALL_CATEGORY_ID,
        },
        trigger: null,
      });
      console.log('[NotificationService] ✅ Notification appel entrant planifiée', callId);
    } catch (err) {
      console.error('[NotificationService] ❌ Erreur notif appel entrant:', err);
    }
  }

  async dismissIncomingCallNotification(callId: string): Promise<void> {
    if (Platform.OS === 'android') {
      await cancelIncomingCallNotifee(callId);
      return;
    }
    try {
      await Notifications.dismissNotificationAsync(`incoming-call-${callId}`);
    } catch {
      /* ignore */
    }
  }
}

/** Singleton global */
export const NotificationService = new NotificationServiceClass();
