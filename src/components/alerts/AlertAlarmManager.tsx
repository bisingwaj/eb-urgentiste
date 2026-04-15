import { useEffect, useRef } from 'react';
import { AppState, AppStateStatus, DeviceEventEmitter } from 'react-native';
import { AlarmService, ALARM_STOP_EVENT } from '../../services/AlarmService';
import { NotificationService } from '../../services/NotificationService';
import { useMission } from '../../contexts/MissionContext';

/**
 * AlertAlarmManager — Composant global (monté dans App.tsx) qui gère l'alarme
 * sonore + notification système lors de la réception d'une nouvelle mission.
 *
 * Comportement :
 * 1. Quand MissionContext émet 'NEW_MISSION_ALERT' → alarme + notification barre système
 * 2. Quand l'app revient au foreground → stoppe l'alarme + efface les notifications
 * 3. Quand l'utilisateur interagit avec la mission → stoppe l'alarme + efface les notifications
 */
export function AlertAlarmManager() {
  const { activeMission } = useMission();
  const prevMissionRef = useRef<string | null>(null);
  const appStateRef = useRef<AppStateStatus>(AppState.currentState);

  // ── Initialiser le service de notifications au montage ──
  useEffect(() => {
    NotificationService.initialize();
  }, []);

  // ── Écouter l'événement 'NEW_MISSION_ALERT' émis par MissionContext ──
  useEffect(() => {
    const subscription = DeviceEventEmitter.addListener('NEW_MISSION_ALERT', () => {
      console.log('[AlertAlarmManager] 🚨 NEW_MISSION_ALERT — alarm + notification');
      AlarmService.startAlarm();
      NotificationService.sendMissionAlert({
        title: '🚨 NOUVELLE MISSION URGENTE',
        body: "La centrale vous a assigné une intervention urgente. Ouvrez l'application !",
        data: { type: 'new_mission' },
      });
    });

    const stopSub = DeviceEventEmitter.addListener(ALARM_STOP_EVENT, () => {
      if (AlarmService.isPlaying()) {
        console.log('[AlertAlarmManager] 🛑 STOP_ALARM_EVENT received — stopping alarm');
        AlarmService.stopAlarm();
        NotificationService.dismissAll();
      }
    });

    return () => {
      subscription.remove();
      stopSub.remove();
    };
  }, []);

  // ── Stopper l'alarme quand l'app revient au foreground ──
  useEffect(() => {
    const subscription = AppState.addEventListener('change', (nextState: AppStateStatus) => {
      const previousState = appStateRef.current;
      appStateRef.current = nextState;

      if (
        nextState === 'active' &&
        (previousState === 'background' || previousState === 'inactive')
      ) {
        if (AlarmService.isPlaying()) {
          console.log('[AlertAlarmManager] 📱 Foreground — stopping alarm');
          AlarmService.stopAlarm();
        }
        NotificationService.dismissAll();
      }
    });

    return () => subscription.remove();
  }, []);

  // ── Stopper l'alarme si la mission change ──
  useEffect(() => {
    const currentId = activeMission?.id ?? null;
    const prevId = prevMissionRef.current;

    if (
      activeMission &&
      currentId === prevId &&
      activeMission.dispatch_status !== 'dispatched' &&
      AlarmService.isPlaying()
    ) {
      console.log('[AlertAlarmManager] 🔇 Mission status changed — stopping alarm');
      AlarmService.stopAlarm();
      NotificationService.dismissAll();
    }

    prevMissionRef.current = currentId;
  }, [activeMission?.id, activeMission?.dispatch_status]);

  return null;
}
