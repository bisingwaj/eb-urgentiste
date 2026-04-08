import { useEffect, useRef } from 'react';
import * as Notifications from 'expo-notifications';
import { supabase } from '../../lib/supabase';
import { navigationRef } from '../../navigation/navigationRef';
import {
  INCOMING_CALL_ACTION_ACCEPT,
  INCOMING_CALL_ACTION_DECLINE,
  parseIncomingCallFromNotification,
} from '../../lib/parseIncomingCallPayload';
import { markIncomingCallPushNotification, releaseIncomingCallUi } from '../../lib/incomingCallUiCoordinator';
import { NotificationService } from '../../services/NotificationService';

function navigateAccept(callId: string, channelName: string, hasVideo: boolean) {
  releaseIncomingCallUi(callId);
  void NotificationService.dismissIncomingCallNotification(callId);
  if (navigationRef.isReady()) {
    navigationRef.navigate('CallCenter', {
      incoming: true,
      callId,
      channelName,
      hasVideo,
    });
  }
}

async function declineCall(callId: string) {
  releaseIncomingCallUi(callId);
  void NotificationService.dismissIncomingCallNotification(callId);
  try {
    await supabase
      .from('call_history')
      .update({
        status: 'missed',
        ended_at: new Date().toISOString(),
        ended_by: 'rescuer',
      })
      .eq('id', callId);
  } catch (e) {
    console.error('[IncomingCallNotif] decline:', e);
  }
}

const recentHandled = new Map<string, number>();
const DEDUPE_MS = 2500;

function handleResponse(response: Notifications.NotificationResponse | null | undefined) {
  if (!response) {
    return;
  }

  const incoming = parseIncomingCallFromNotification(response.notification);
  if (!incoming) {
    return;
  }

  const { callId, channelName, hasVideo } = incoming;
  const action = response.actionIdentifier;
  const dedupeKey = `${callId}:${action}`;
  const now = Date.now();
  const prev = recentHandled.get(dedupeKey);
  if (prev !== undefined && now - prev < DEDUPE_MS) {
    return;
  }
  recentHandled.set(dedupeKey, now);

  if (action === INCOMING_CALL_ACTION_DECLINE) {
    void declineCall(callId);
    return;
  }

  if (action === INCOMING_CALL_ACTION_ACCEPT || action === Notifications.DEFAULT_ACTION_IDENTIFIER) {
    navigateAccept(callId, channelName, hasVideo);
  }
}

/**
 * Réponses aux notifications d’appel (tap, Accepter, Refuser) + cold start via useLastNotificationResponse.
 */
export function IncomingCallNotificationHandler() {
  const handledColdStartRef = useRef(false);

  const last = Notifications.useLastNotificationResponse();

  useEffect(() => {
    if (handledColdStartRef.current) {
      return;
    }
    if (last?.notification) {
      const incoming = parseIncomingCallFromNotification(last.notification);
      if (incoming) {
        handledColdStartRef.current = true;
        handleResponse(last);
      }
    }
  }, [last]);

  useEffect(() => {
    const sub = Notifications.addNotificationResponseReceivedListener((response) => {
      handleResponse(response);
    });
    return () => sub.remove();
  }, []);

  /** FCM au premier plan : data-only → compléter par une notif locale (évite boucle sur nos propres id). */
  useEffect(() => {
    const sub = Notifications.addNotificationReceivedListener((notification) => {
      const id = notification.request.identifier ?? '';
      if (id.startsWith('incoming-call-')) {
        return;
      }
      const incoming = parseIncomingCallFromNotification(notification);
      if (!incoming) {
        return;
      }
      markIncomingCallPushNotification(incoming.callId);
      void NotificationService.presentIncomingCallNotification(incoming);
    });
    return () => sub.remove();
  }, []);

  return null;
}
