import type { Notification as NotifeeNotification } from '@notifee/react-native';
import type { Notification, NotificationContent, NotificationTaskPayload } from 'expo-notifications';

export type IncomingCallPayload = {
  callId: string;
  channelName: string;
  callerName: string;
  hasVideo: boolean;
};

function mergeStringRecord(
  target: Record<string, string>,
  source: Record<string, unknown> | undefined
): void {
  if (!source) return;
  for (const [k, v] of Object.entries(source)) {
    if (v == null) continue;
    target[k] = typeof v === 'string' ? v : String(v);
  }
}

/** Aplatit les payloads FCM / Expo (chaînes, dataString JSON, content.data). */
export function flattenNotificationData(payload: NotificationTaskPayload | unknown): Record<string, string> {
  const out: Record<string, string> = {};

  if (payload && typeof payload === 'object' && 'actionIdentifier' in payload) {
    return out;
  }

  if (payload && typeof payload === 'object' && 'data' in payload) {
    const raw = payload as { data?: Record<string, unknown> };
    const d = raw.data;
    if (d && typeof d === 'object') {
      mergeStringRecord(out, d);
      if (typeof d.dataString === 'string') {
        try {
          const parsed = JSON.parse(d.dataString) as unknown;
          if (parsed && typeof parsed === 'object') {
            mergeStringRecord(out, parsed as Record<string, unknown>);
          }
        } catch {
          /* ignore */
        }
      }
    }
  }

  return out;
}

function pickString(map: Record<string, string>, ...keys: string[]): string | null {
  for (const k of keys) {
    const v = map[k];
    if (v != null && String(v).trim() !== '') {
      return String(v).trim();
    }
  }
  return null;
}

export function parseIncomingCallFromFlatData(
  flat: Record<string, string>
): IncomingCallPayload | null {
  const type = pickString(flat, 'type');
  if (type?.toLowerCase() !== 'incoming_call') {
    return null;
  }
  const callId = pickString(flat, 'callId', 'call_id');
  const channelName = pickString(flat, 'channelName', 'channel_name');
  if (!callId || !channelName) {
    return null;
  }
  const callerName = pickString(flat, 'callerName', 'caller_name') ?? 'Centrale';
  const hv = pickString(flat, 'hasVideo', 'has_video');
  const hasVideo = hv === 'true' || hv === '1' || hv?.toLowerCase() === 'video';
  return { callId, channelName, callerName, hasVideo };
}

export function parseIncomingCallFromTaskPayload(
  payload: NotificationTaskPayload
): IncomingCallPayload | null {
  if ('actionIdentifier' in payload) {
    return null;
  }
  const flat = flattenNotificationData(payload);
  const p = payload as Record<string, unknown>;
  for (const [k, v] of Object.entries(p)) {
    if (v != null && typeof v === 'string' && flat[k] === undefined) {
      flat[k] = v;
    }
  }
  return parseIncomingCallFromFlatData(flat);
}

export function parseIncomingCallFromContent(content: NotificationContent): IncomingCallPayload | null {
  const data = content.data as Record<string, unknown> | undefined;
  if (!data || typeof data !== 'object') {
    return null;
  }
  const flat: Record<string, string> = {};
  mergeStringRecord(flat, data);
  return parseIncomingCallFromFlatData(flat);
}

export function parseIncomingCallFromNotification(
  notification: Notification
): IncomingCallPayload | null {
  return parseIncomingCallFromContent(notification.request.content);
}

/** Payload attaché par Notifee (`displayNotification` → `data`). */
export function parseIncomingCallFromNotifeeNotification(
  notification: NotifeeNotification | null | undefined
): IncomingCallPayload | null {
  if (!notification?.data) {
    return null;
  }
  const flat: Record<string, string> = {};
  mergeStringRecord(flat, notification.data as Record<string, unknown>);
  return parseIncomingCallFromFlatData(flat);
}

export const INCOMING_CALL_CATEGORY_ID = 'incoming_call';
export const INCOMING_CALL_ACTION_ACCEPT = 'INCOMING_ACCEPT';
export const INCOMING_CALL_ACTION_DECLINE = 'INCOMING_DECLINE';
