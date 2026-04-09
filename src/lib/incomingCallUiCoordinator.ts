/**
 * Évite les doublons entre : notification système (FCM + locale) et Modal Realtime.
 */
const pushNotificationForCall = new Set<string>();
const realtimeModalForCall = new Set<string>();

export function markIncomingCallPushNotification(callId: string): void {
  pushNotificationForCall.add(callId);
}

export function markIncomingCallRealtimeModal(callId: string): void {
  realtimeModalForCall.add(callId);
}

/** True = ne pas afficher le Modal (déjà couvert par une notif push / locale). */
export function shouldSkipModalForIncomingCall(callId: string): boolean {
  if (pushNotificationForCall.has(callId)) {
    pushNotificationForCall.delete(callId);
    return true;
  }
  return false;
}

/** True = ne pas envoyer une notif locale doublon (Modal Realtime déjà affiché). */
export function shouldSkipDuplicateLocalPushNotification(callId: string): boolean {
  return realtimeModalForCall.has(callId);
}

export function releaseIncomingCallUi(callId: string): void {
  pushNotificationForCall.delete(callId);
  realtimeModalForCall.delete(callId);
}
