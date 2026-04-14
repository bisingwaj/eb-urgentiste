import { useMission } from '../contexts/MissionContext';
import { Mission } from '../types/mission';

export function useActiveMission() {
  const { activeMission, isLoading, error, refresh, updateDispatchStatus } = useMission();
  return { activeMission, isLoading, error, refresh, updateDispatchStatus };
}
