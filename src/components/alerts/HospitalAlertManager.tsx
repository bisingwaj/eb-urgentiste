import { useEffect, useRef } from 'react';
import { AppState, AppStateStatus, DeviceEventEmitter } from 'react-native';
import { AlarmService, ALARM_STOP_EVENT } from '../../services/AlarmService';
import { NotificationService } from '../../services/NotificationService';
import { NEW_HOSPITAL_ALERT } from '../../contexts/HospitalContext';

/**
 * Alarme + notification système lors d’une nouvelle alerte hôpital (réponse attendue),
 * aligné sur AlertAlarmManager / urgentiste.
 */
export function HospitalAlertManager() {
  const appStateRef = useRef<AppStateStatus>(AppState.currentState);

  useEffect(() => {
    NotificationService.initialize();
  }, []);

  useEffect(() => {
    const subscription = DeviceEventEmitter.addListener(
      NEW_HOSPITAL_ALERT,
      (payload: { dispatchId?: string }) => {
        const dispatchId = payload?.dispatchId;
        console.log('[HospitalAlertManager] NEW_HOSPITAL_ALERT', dispatchId);
        AlarmService.startAlarm();
        void NotificationService.sendHospitalAlert({
          data: dispatchId ? { dispatchId } : undefined,
        });
      },
    );

    const stopSub = DeviceEventEmitter.addListener(ALARM_STOP_EVENT, () => {
      if (AlarmService.isPlaying()) {
        console.log('[HospitalAlertManager] 🛑 STOP_ALARM_EVENT received — stopping alarm');
        AlarmService.stopAlarm();
        NotificationService.dismissAll();
      }
    });

    return () => {
      subscription.remove();
      stopSub.remove();
    };
  }, []);

  useEffect(() => {
    const subscription = AppState.addEventListener('change', (nextState: AppStateStatus) => {
      const previousState = appStateRef.current;
      appStateRef.current = nextState;

      if (
        nextState === 'active' &&
        (previousState === 'background' || previousState === 'inactive')
      ) {
        if (AlarmService.isPlaying()) {
          AlarmService.stopAlarm();
        }
        NotificationService.dismissAll();
      }
    });

    return () => subscription.remove();
  }, []);

  return null;
}
