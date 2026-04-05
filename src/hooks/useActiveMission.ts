import { useMission } from '../contexts/MissionContext';

export interface AssignedStructure {
  id: string;
  name: string;
  lat: number | null;
  lng: number | null;
  phone: string | null;
  address: string | null;
  type: string;
}

export interface Mission {
  id: string;
  incident_id: string;
  reference: string;
  type: string;
  title: string;
  description: string | null;
  priority: 'critical' | 'high' | 'medium' | 'low';
  incident_status: string;
  dispatch_status: 'dispatched' | 'en_route' | 'on_scene' | 'en_route_hospital' | 'arrived_hospital' | 'mission_end' | 'completed';
  location: {
    lat: number;
    lng: number;
    address: string | null;
    commune?: string | null;
  };
  caller: {
    name: string;
    phone: string;
  };
  assigned_structure?: AssignedStructure | null;
  destination?: string;
  created_at: string;
  dispatched_at?: string;
  arrived_at?: string;
  completed_at?: string;
}

export function useActiveMission() {
  const { activeMission, isLoading, error, refresh, updateDispatchStatus } = useMission();
  return { activeMission, isLoading, error, refresh, updateDispatchStatus };
}
