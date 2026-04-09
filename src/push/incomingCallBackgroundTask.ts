import * as TaskManager from 'expo-task-manager';
import type { NotificationTaskPayload } from 'expo-notifications';
import * as Notifications from 'expo-notifications';
import { NotificationService } from '../services/NotificationService';
import { parseIncomingCallFromTaskPayload } from '../lib/parseIncomingCallPayload';
import { markIncomingCallPushNotification } from '../lib/incomingCallUiCoordinator';

export const INCOMING_CALL_BACKGROUND_TASK = 'INCOMING-CALL-BACKGROUND-TASK';

/**
 * Pour que cette tâche s’exécute hors app (accueil, autre app, app tuée), le serveur doit envoyer
 * un message FCM **data-only** haute priorité — voir `src/lib/incomingCallFcmContract.ts`.
 */
TaskManager.defineTask<NotificationTaskPayload>(INCOMING_CALL_BACKGROUND_TASK, async ({ data, error }) => {
  if (error) {
    return;
  }
  if (data && typeof data === 'object' && 'actionIdentifier' in data) {
    return;
  }

  const parsed = parseIncomingCallFromTaskPayload(data);
  if (!parsed) {
    return;
  }

  await NotificationService.ensurePushInfrastructure();
  markIncomingCallPushNotification(parsed.callId);
  await NotificationService.presentIncomingCallNotification(parsed);
});

void Notifications.registerTaskAsync(INCOMING_CALL_BACKGROUND_TASK);
