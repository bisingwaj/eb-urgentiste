import notifee, {
  AndroidCategory,
  AndroidImportance,
  AndroidVisibility,
} from '@notifee/react-native';
import { Platform } from 'react-native';

/** Canal Notifee dédié (distinct du canal Expo `incoming_calls`). */
export const NOTIFEE_INCOMING_CHANNEL_ID = 'notifee_incoming_calls';

/**
 * Canal Android haute priorité + catégorie « call » pour heads-up / full-screen intent.
 */
export async function ensureNotifeeIncomingChannel(): Promise<void> {
  if (Platform.OS !== 'android') {
    return;
  }

  await notifee.createChannel({
    id: NOTIFEE_INCOMING_CHANNEL_ID,
    name: 'Appels entrants — Centrale',
    importance: AndroidImportance.HIGH,
    sound: 'default',
    vibration: true,
    bypassDnd: true,
    lights: true,
    lightColor: '#1564bf',
    vibrationPattern: [300, 400, 200, 400, 200, 400],
    visibility: AndroidVisibility.PUBLIC,
  });
}

export type IncomingCallNotifeeParams = {
  callId: string;
  channelName: string;
  callerName: string;
  hasVideo: boolean;
};

/**
 * Notification style appel : plein écran possible (USE_FULL_SCREEN_INTENT), actions Rapides.
 */
export async function displayIncomingCallWithNotifee(params: IncomingCallNotifeeParams): Promise<void> {
  if (Platform.OS !== 'android') {
    return;
  }

  const { callId, channelName, callerName, hasVideo } = params;
  await ensureNotifeeIncomingChannel();

  const id = `incoming-call-${callId}`;
  const label = callerName.trim() || 'Centrale';

  await notifee.displayNotification({
    id,
    title: 'Appel entrant',
    subtitle: 'Centrale de régulation',
    body: `${label} · ${hasVideo ? 'Vidéo' : 'Audio'} — Touchez pour répondre`,
    data: {
      type: 'incoming_call',
      callId,
      channelName,
      callerName: label,
      hasVideo: hasVideo ? 'true' : 'false',
    },
    android: {
      channelId: NOTIFEE_INCOMING_CHANNEL_ID,
      category: AndroidCategory.CALL,
      importance: AndroidImportance.HIGH,
      visibility: AndroidVisibility.PUBLIC,
      ongoing: true,
      autoCancel: false,
      lightUpScreen: true,
      pressAction: {
        id: 'default',
      },
      fullScreenAction: {
        id: 'incoming_fullscreen',
      },
      actions: [
        {
          title: 'Refuser',
          pressAction: { id: 'decline' },
        },
        {
          title: 'Accepter',
          pressAction: {
            id: 'accept',
          },
        },
      ],
    },
  });
}

export async function cancelIncomingCallNotifee(callId: string): Promise<void> {
  if (Platform.OS !== 'android') {
    return;
  }
  try {
    await notifee.cancelNotification(`incoming-call-${callId}`);
  } catch {
    /* ignore */
  }
}
