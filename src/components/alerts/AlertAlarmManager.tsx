import { useEffect, useRef } from 'react';
import { AppState, AppStateStatus, DeviceEventEmitter } from 'react-native';
import { AlarmService } from '../../services/AlarmService';
import { useMission } from '../../contexts/MissionContext';

/**
 * AlertAlarmManager — Composant global (monté dans App.tsx) qui gère l'alarme
 * sonore lors de la réception d'une nouvelle mission.
 *
 * Comportement :
 * 1. Quand MissionContext émet 'NEW_MISSION_ALERT' → déclenche l'alarme
 * 2. Quand l'app revient au foreground (AppState 'active') → stoppe l'alarme
 * 3. Quand l'utilisateur interagit avec la mission → stoppe l'alarme
 */
export function AlertAlarmManager() {
  const { activeMission } = useMission();
  const prevMissionRef = useRef<string | null>(null);
  const appStateRef = useRef<AppStateStatus>(AppState.currentState);

  // ── Écouter l'événement 'NEW_MISSION_ALERT' émis par MissionContext ──
  useEffect(() => {
    const subscription = DeviceEventEmitter.addListener('NEW_MISSION_ALERT', () => {
      console.log('[AlertAlarmManager] 🚨 NEW_MISSION_ALERT received — starting alarm');
      AlarmService.startAlarm();
    });

    return () => subscription.remove();
  }, []);

  // ── Stopper l'alarme quand l'app revient au foreground ──
  useEffect(() => {
    const subscription = AppState.addEventListener('change', (nextState: AppStateStatus) => {
      const previousState = appStateRef.current;
      appStateRef.current = nextState;

      // L'app revient au premier plan
      if (
        nextState === 'active' &&
        (previousState === 'background' || previousState === 'inactive')
      ) {
        if (AlarmService.isPlaying()) {
          console.log('[AlertAlarmManager] 📱 App returned to foreground — stopping alarm');
          AlarmService.stopAlarm();
        }
      }
    });

    return () => subscription.remove();
  }, []);

  // ── Stopper l'alarme si la mission change (par ex. l'utilisateur l'a ouverte) ──
  useEffect(() => {
    const currentId = activeMission?.id ?? null;
    const prevId = prevMissionRef.current;

    // Si la mission est la même et qu'on la consulte (status a changé depuis 'dispatched'),
    // stopper l'alarme
    if (
      activeMission &&
      currentId === prevId &&
      activeMission.dispatch_status !== 'dispatched' &&
      AlarmService.isPlaying()
    ) {
      console.log('[AlertAlarmManager] 🔇 Mission status changed from dispatched — stopping alarm');
      AlarmService.stopAlarm();
    }

    prevMissionRef.current = currentId;
  }, [activeMission?.id, activeMission?.dispatch_status]);

  // Ce composant ne rend rien visuellement
  return null;
}
