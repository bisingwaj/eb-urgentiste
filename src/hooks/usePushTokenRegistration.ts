import { useEffect, useRef } from 'react';
import * as Notifications from 'expo-notifications';
import * as Device from 'expo-device';
import { supabase } from '../lib/supabase';
import { NotificationService } from '../services/NotificationService';

/**
 * Enregistre le token push natif (FCM / APNs via Expo) dans `users_directory.fcm_token`
 * pour l’Edge `send-call-push`.
 */
export function usePushTokenRegistration(enabled: boolean, authUserId: string | undefined) {
  const lastWrittenRef = useRef<string | null>(null);

  useEffect(() => {
    lastWrittenRef.current = null;
  }, [authUserId]);

  const persistToken = async (token: string) => {
    if (!authUserId || token === lastWrittenRef.current) {
      return;
    }
    try {
      const { error } = await supabase
        .from('users_directory')
        .update({ fcm_token: token })
        .eq('auth_user_id', authUserId);

      if (error) {
        console.warn('[PushToken] Erreur enregistrement fcm_token:', error.message);
        return;
      }
      lastWrittenRef.current = token;
      console.log('[PushToken] ✅ fcm_token enregistré');
    } catch (e) {
      console.warn('[PushToken] Exception:', e);
    }
  };

  const fetchAndPersist = async () => {
    if (!enabled || !authUserId || !Device.isDevice) {
      return;
    }

    await NotificationService.initialize();

    try {
      const { status } = await Notifications.getPermissionsAsync();
      if (status !== 'granted') {
        return;
      }

      const devicePush = await Notifications.getDevicePushTokenAsync();
      const token =
        typeof devicePush.data === 'string' ? devicePush.data : JSON.stringify(devicePush.data);
      await persistToken(token);
    } catch (e) {
      console.warn('[PushToken] getDevicePushTokenAsync:', e);
    }
  };

  useEffect(() => {
    if (!enabled || !authUserId) {
      return;
    }

    void fetchAndPersist();

    const sub = Notifications.addPushTokenListener((tok) => {
      const token =
        typeof tok.data === 'string' ? tok.data : JSON.stringify(tok.data);
      void persistToken(token);
    });

    return () => {
      sub.remove();
    };
  }, [enabled, authUserId]);
}
