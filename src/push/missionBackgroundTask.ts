import * as TaskManager from 'expo-task-manager';
import type { NotificationTaskPayload } from 'expo-notifications';
import * as Notifications from 'expo-notifications';
import { AlarmService } from '../services/AlarmService';
import { NotificationService } from '../services/NotificationService';
import { flattenNotificationData } from '../lib/parseIncomingCallPayload';

export const MISSION_BACKGROUND_TASK = 'MISSION-BACKGROUND-TASK';

/**
 * Handle mission alerts in the background.
 * This starts the siren siren even if the app is killed/backgrounded.
 */
TaskManager.defineTask<NotificationTaskPayload>(MISSION_BACKGROUND_TASK, async ({ data, error }) => {
  if (error) {
    console.error('[MissionBackgroundTask] Task error:', error);
    return;
  }

  const flatData = flattenNotificationData(data);
  const category = (data as any)?.notification?.request?.content?.categoryIdentifier;

  // Detect if this is a mission alert
  // We check categoryIdentifier or specific data keys
  const isMission = 
     category === 'mission_alert' || 
     flatData.type === 'new_mission' ||
     flatData.type === 'mission_alert';

  if (isMission) {
    console.log('[MissionBackgroundTask] 🚨 New mission received in background — starting siren');
    
    // 1. Start the siren
    await AlarmService.startAlarm();
    
    // 2. Ensure a local notification is visible even if the remote one was swallowed
    await NotificationService.sendMissionAlert({
        title: '🚨 NOUVELLE MISSION URGENTE',
        body: "Mission assignée ! Ouvrez l'application immédiatement pour voir les détails.",
        data: flatData
    });
  }
});

void Notifications.registerTaskAsync(MISSION_BACKGROUND_TASK);
