import notifee, { EventType } from '@notifee/react-native';
import { declineIncomingCallOnServer } from '../lib/incomingCallServerActions';

/**
 * Refus depuis l’action « Refuser » quand l’app est en arrière-plan (Android).
 * Un seul handler global — doit être chargé tôt (voir `index.ts`).
 */
notifee.onBackgroundEvent(async ({ type, detail }) => {
  const { notification, pressAction } = detail;
  if (!notification?.data) {
    return;
  }
  if (String(notification.data.type ?? '') !== 'incoming_call') {
    return;
  }
  if (type !== EventType.ACTION_PRESS || pressAction?.id !== 'decline') {
    return;
  }
  const callId = String(notification.data.callId ?? '');
  if (!callId) {
    return;
  }
  try {
    await declineIncomingCallOnServer(callId);
  } catch (e) {
    console.warn('[Notifee] onBackgroundEvent decline:', e);
  }
});
