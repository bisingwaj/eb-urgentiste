import * as Notifications from 'expo-notifications';
import * as Device from 'expo-device';
import { Platform } from 'react-native';

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

  /**
   * Initialise les permissions et le canal Android.
   * Doit être appelé une seule fois au démarrage de l'app.
   */
  async initialize(): Promise<void> {
    if (this.isInitialized) return;

    try {
      // Créer le canal Android pour les alertes urgentes
      if (Platform.OS === 'android') {
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
        console.log('[NotificationService] ✅ Canal Android "urgences" créé');
      }

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
}

/** Singleton global */
export const NotificationService = new NotificationServiceClass();
