import { useMission } from '../contexts/MissionContext';

/** Aligné sur `dispatches.hospital_status` (Lovable / workflow urgentiste). */
export type HospitalStatus = 'pending' | 'accepted' | 'refused';

export function normalizeHospitalStatus(v: unknown): HospitalStatus | null {
  if (v === 'pending' || v === 'accepted' || v === 'refused') return v;
  return null;
}

/** Coordonnées hôpital : uniquement après acceptation par la structure. */
export function canShowHospitalCoordinates(m: { hospital_status?: HospitalStatus | null } | null): boolean {
  return m?.hospital_status === 'accepted';
}

export interface AssignedStructure {
  id: string;
  name: string;
  lat: number | null;
  lng: number | null;
  phone: string | null;
  address: string | null;
  type: string;
}

export interface SosResponseItem {
  question_key: string;
  question_text: string | null;
  answer: string | null;
  answered_at: string;
}

export interface Mission {
  id: string;
  incident_id: string;
  /** `auth.users.id` du citoyen — pour appel in-app (Edge `rescuer-call-citizen`). */
  citizen_id: string | null;
  reference: string;
  type: string;
  title: string;
  description: string | null;
  priority: 'critical' | 'high' | 'medium' | 'low';
  incident_status: string;
  dispatch_status: 'dispatched' | 'en_route' | 'on_scene' | 'en_route_hospital' | 'arrived_hospital' | 'mission_end' | 'completed';
  location: {
    lat: number | null;
    lng: number | null;
    address: string | null;
    commune?: string | null;
    ville?: string | null;
    province?: string | null;
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
  /** Notes côté dispatch (unité) */
  dispatch_notes?: string | null;
  /** Notes incident / opérateur */
  incident_notes?: string | null;
  recommended_actions?: string | null;
  incident_at?: string | null;
  caller_realtime_lat?: number | null;
  caller_realtime_lng?: number | null;
  caller_realtime_updated_at?: string | null;
  sos_responses?: SosResponseItem[];
  media_urls?: string[] | null;
  battery_level?: string | null;
  network_state?: string | null;
  incident_updated_at?: string | null;
  /** `dispatches.hospital_status` — GPS / nav hôpital uniquement si `accepted`. */
  hospital_status?: HospitalStatus | null;
  hospital_notes?: string | null;
  hospital_data?: Record<string, unknown> | null;
}

export function useActiveMission() {
  const { activeMission, isLoading, error, refresh, updateDispatchStatus } = useMission();
  return { activeMission, isLoading, error, refresh, updateDispatchStatus };
}
