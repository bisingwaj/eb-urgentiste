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
      console.log('[AlertAlarmManager] 🚨 NEW_MISSION_ALERT received');
      AlarmService.startAlarm();
      NotificationService.sendMissionAlert({
        title: '🚨 NOUVELLE MISSION URGENTE',
        body: "La centrale vous a assigné une intervention urgente. Ouvrez l'application !",
        data: { type: 'new_mission' },
      });
    });

    // On garde un moyen d'arrêter l'alarme manuellement via le bouton "Accepter" ou "Voir"
    // mais on utilise un événement dédié pour ne pas interférer avec le toucher global de App.tsx
    const stopSub = DeviceEventEmitter.addListener('STOP_URGENTIST_ALARM', () => {
      if (AlarmService.isPlaying()) {
        console.log('[AlertAlarmManager] 🔇 Manual stop requested');
        AlarmService.stopAlarm();
        NotificationService.dismissAll();
      }
    });

    return () => {
      subscription.remove();
      stopSub.remove();
    };
  }, []);

  // ── Arrêt automatique basé sur le changement de statut de la mission ──
  useEffect(() => {
    const currentId = activeMission?.id ?? null;
    const currentStatus = activeMission?.dispatch_status ?? null;
    
    // Si la mission n'est plus en attente (dispatched) ou si elle a disparu, on coupe
    // Cela permet d'arrêter la sonnerie dès que l'urgentiste clique sur "Accepter" (statut -> en_route)
    if (AlarmService.isPlaying()) {
      if (!activeMission || currentStatus !== 'dispatched') {
        console.log('[AlertAlarmManager] 📉 Mission accepted or cleared — stopping alarm');
        AlarmService.stopAlarm();
        NotificationService.dismissAll();
      }
    }
  }, [activeMission?.id, activeMission?.dispatch_status]);

  return null;
}
