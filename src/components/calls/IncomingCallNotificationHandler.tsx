import { useCallback, useEffect, useRef, useState } from 'react';
import { Platform } from 'react-native';
import notifee, { EventType } from '@notifee/react-native';
import * as Notifications from 'expo-notifications';
import { useAuth } from '../../contexts/AuthContext';
import { useAppLock } from '../../contexts/AppLockContext';
import { declineIncomingCallOnServer } from '../../lib/incomingCallServerActions';
import {
  INCOMING_CALL_ACTION_ACCEPT,
  INCOMING_CALL_ACTION_DECLINE,
  parseIncomingCallFromNotification,
  parseIncomingCallFromNotifeeNotification,
} from '../../lib/parseIncomingCallPayload';
import { markIncomingCallPushNotification, releaseIncomingCallUi } from '../../lib/incomingCallUiCoordinator';
import { NotificationService } from '../../services/NotificationService';
import { navigationRef } from '../../navigation/navigationRef';

type PendingNav = {
  callId: string;
  channelName: string;
  hasVideo: boolean;
};

async function declineCall(callId: string) {
  releaseIncomingCallUi(callId);
  void NotificationService.dismissIncomingCallNotification(callId);
  try {
    await declineIncomingCallOnServer(callId);
  } catch (e) {
    console.error('[IncomingCallNotif] decline:', e);
  }
}

const recentHandled = new Map<string, number>();
const DEDUPE_MS = 2500;

function markDedupe(key: string): boolean {
  const now = Date.now();
  const prev = recentHandled.get(key);
  if (prev !== undefined && now - prev < DEDUPE_MS) {
    return false;
  }
  recentHandled.set(key, now);
  return true;
}

/**
 * Réponses aux notifications d’appel (Expo iOS + Notifee Android) + cold start.
 * File d’attente navigation vers CallCenter (session, App Lock, navigateur).
 */
export function IncomingCallNotificationHandler() {
  const { isLoading, isAuthenticated, profile } = useAuth();
  const { appLockEnabled, isUnlocked, isReady: appLockReady } = useAppLock();

  const [pendingNav, setPendingNav] = useState<PendingNav | null>(null);
  const handledExpoColdStartRef = useRef(false);
  const handledNotifeeInitialRef = useRef(false);

  const last = Notifications.useLastNotificationResponse();

  const tryNavigateToCallCenter = useCallback(
    (p: PendingNav) => {
      if (isLoading) {
        return false;
      }
      if (!isAuthenticated || !profile) {
        return false;
      }
      if (profile.role === 'hopital') {
        releaseIncomingCallUi(p.callId);
        void NotificationService.dismissIncomingCallNotification(p.callId);
        return true;
      }
      if (!appLockReady) {
        return false;
      }
      if (appLockEnabled && !isUnlocked) {
        return false;
      }
      if (!navigationRef.isReady()) {
        return false;
      }

      navigationRef.navigate('CallCenter', {
        incoming: true,
        callId: p.callId,
        channelName: p.channelName,
        hasVideo: p.hasVideo,
      });
      releaseIncomingCallUi(p.callId);
      void NotificationService.dismissIncomingCallNotification(p.callId);
      return true;
    },
    [isLoading, isAuthenticated, profile, appLockReady, appLockEnabled, isUnlocked]
  );

  useEffect(() => {
    if (!pendingNav) {
      return;
    }
    if (tryNavigateToCallCenter(pendingNav)) {
      setPendingNav(null);
    }
  }, [pendingNav, tryNavigateToCallCenter]);

  useEffect(() => {
    if (!pendingNav) {
      return;
    }
    const id = setInterval(() => {
      if (tryNavigateToCallCenter(pendingNav)) {
        setPendingNav(null);
      }
    }, 200);
    return () => clearInterval(id);
  }, [pendingNav, tryNavigateToCallCenter]);

  const queueNavigateToCallCenter = useCallback((p: PendingNav) => {
    setPendingNav(p);
  }, []);

  const processExpoNotificationResponse = useCallback(
    (response: Notifications.NotificationResponse | null | undefined) => {
      if (!response) {
        return;
      }

      const incoming = parseIncomingCallFromNotification(response.notification);
      if (!incoming) {
        return;
      }

      const { callId, channelName, hasVideo } = incoming;
      const action = response.actionIdentifier;
      const dedupeKey = `expo:${callId}:${action}`;
      if (!markDedupe(dedupeKey)) {
        return;
      }

      if (action === INCOMING_CALL_ACTION_DECLINE) {
        void declineCall(callId);
        return;
      }

      if (action === INCOMING_CALL_ACTION_ACCEPT || action === Notifications.DEFAULT_ACTION_IDENTIFIER) {
        queueNavigateToCallCenter({ callId, channelName, hasVideo });
      }
    },
    [queueNavigateToCallCenter]
  );

  /** iOS / réponses Expo (cold start + listener). */
  useEffect(() => {
    if (Platform.OS === 'android') {
      return;
    }
    if (handledExpoColdStartRef.current) {
      return;
    }
    if (!last?.notification) {
      return;
    }
    const incoming = parseIncomingCallFromNotification(last.notification);
    if (!incoming) {
      return;
    }
    handledExpoColdStartRef.current = true;
    processExpoNotificationResponse(last);
  }, [last, processExpoNotificationResponse]);

  useEffect(() => {
    const sub = Notifications.addNotificationResponseReceivedListener((response) => {
      processExpoNotificationResponse(response);
    });
    return () => sub.remove();
  }, [processExpoNotificationResponse]);

  /** FCM au premier plan : compléter par notif locale (iOS Expo / Android Notifee via NotificationService). */
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

  /** Notifee Android : tap, actions, plein écran. */
  useEffect(() => {
    if (Platform.OS !== 'android') {
      return;
    }

    return notifee.onForegroundEvent(({ type, detail }) => {
      const { notification, pressAction } = detail;
      if (!notification) {
        return;
      }
      const incoming = parseIncomingCallFromNotifeeNotification(notification);
      if (!incoming) {
        return;
      }

      const pid = pressAction?.id ?? '';
      const dedupeKey = `notifee:${incoming.callId}:${type}:${pid}`;
      if (!markDedupe(dedupeKey)) {
        return;
      }

      if (type === EventType.ACTION_PRESS && pid === 'decline') {
        void declineCall(incoming.callId);
        return;
      }

      if (
        type === EventType.PRESS ||
        (type === EventType.ACTION_PRESS && (pid === 'accept' || pid === 'default'))
      ) {
        queueNavigateToCallCenter({
          callId: incoming.callId,
          channelName: incoming.channelName,
          hasVideo: incoming.hasVideo,
        });
      }
    });
  }, [queueNavigateToCallCenter]);

  /** Android : ouverture depuis notif Notifee (cold start). */
  useEffect(() => {
    if (Platform.OS !== 'android') {
      return;
    }
    void (async () => {
      if (handledNotifeeInitialRef.current) {
        return;
      }
      const initial = await notifee.getInitialNotification();
      if (!initial?.notification) {
        return;
      }
      handledNotifeeInitialRef.current = true;

      const incoming = parseIncomingCallFromNotifeeNotification(initial.notification);
      if (!incoming) {
        return;
      }

      const pid = initial.pressAction?.id ?? '';
      const dedupeKey = `notifee-init:${incoming.callId}:${pid}`;
      if (!markDedupe(dedupeKey)) {
        return;
      }

      if (pid === 'decline') {
        void declineCall(incoming.callId);
        return;
      }

      queueNavigateToCallCenter({
        callId: incoming.callId,
        channelName: incoming.channelName,
        hasVideo: incoming.hasVideo,
      });
    })();
  }, [queueNavigateToCallCenter]);

  return null;
}
