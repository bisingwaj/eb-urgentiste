import { useMission } from '../contexts/MissionContext';

export function useActiveMission() {
  const { activeMission, isLoading, error, refresh, updateDispatchStatus } = useMission();
  return { activeMission, isLoading, error, refresh, updateDispatchStatus };
}
