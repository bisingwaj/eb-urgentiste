import type { TransportModeCode } from "../../lib/transportMode";

export type UrgencyLevel = "critique" | "urgent" | "stable";

export type CaseStatus =
  | "en_attente"
  | "en_cours"
  | "arrived"
  | "handedOver"
  | "admis"
  | "triage"
  | "prise_en_charge"
  | "monitoring"
  | "termine";

export type MonitoringPatientStatus = "amelioration" | "stable" | "degradation";

export type LovableDischargeType =
  | "guerison"
  | "transfert"
  | "deces"
  | "sortie_contre_avis";

export type HospitalStatus = 
  | "pending"
  | "accepted"
  | "refused";

export interface Intervention {
  id: string;
  type: "acte_medical" | "examen" | "traitement" | "intervenant";
  category: string;
  detail: string;
  time: string;
  by?: string;
}

export interface EmergencyCase {
  id: string;
  victimName: string;
  age: number;
  sex: "M" | "F" | "Inconnu";
  description: string;
  level: UrgencyLevel;
  urgentisteName: string;
  urgentistePhone: string;
  eta: string;
  distance?: string;
  status: CaseStatus;
  address: string;
  timestamp: string;
  typeUrgence: string; // Ex: Traumatisme, Cardiaque, Obstétrique
  unitId?: string;
  /** Valeur brute `dispatches.status` (ex. `en_route_hospital`) — utile pour l’UI et le debug */
  dispatchStatus?: string;
  /** `dispatches.completed_at` — tri / KPIs historique */
  completedAt?: string;
  /** `dispatches.created_at` ISO — durée de prise en charge */
  dispatchCreatedAt?: string;
  /** Coordonnées de la structure assignée (`dispatches.assigned_structure_*`) — destination carte / itinéraire */
  assignedStructureLat?: number;
  assignedStructureLng?: number;
  /** `dispatches.assigned_structure_name` — libellé carte / UI */
  assignedStructureName?: string;

  /** `incidents.id` — FK pour rapports / historique */
  incidentId?: string;
  /** Référence métier (`incidents.reference`) */
  incidentReference?: string;
  /** Téléphone laissé au signalement (`incidents.caller_phone`) */
  callerPhone?: string;
  /** Contact GSM unité — renseigné si la colonne existe côté Supabase (sinon UI sans numéro unité) */
  unitPhone?: string;
  unitVehicleType?: string;
  unitVehiclePlate?: string;
  /** Agent principal renseigné sur l’unité (`units.agent_name`) */
  unitAgentName?: string;

  // Hospital Assignment fields
  hospitalStatus?: HospitalStatus;
  hospitalNotes?: string;
  hospitalRespondedAt?: string;
  /** Le statut clinique interne déclaré par l'hôpital (ex: 'admis', 'triage', 'termine') */
  hospitalDetailStatus?: string;

  // Patient Profile Extended details
  patientProfile?: {
    bloodType?: string;
    allergies?: string[];
    medicalHistory?: string[];
    medications?: string[];
    emergencyContactName?: string;
    emergencyContactPhone?: string;
    dateOfBirth?: string;
  };

  // SOS Questionnaire responses
  sosResponses?: Array<{
    questionText: string;
    answer: string;
    gravityScore: number;
    gravityLevel: string;
  }>;
  gravityScore?: number;
  
  // Clinical data (hData)fields
  arrivalTime?: string;
  /** Aligné sur les codes « mode de transport » urgentiste (`AMBULANCE` | `SMUR` | `MOTO` | `PERSONNEL`) */
  arrivalMode?: TransportModeCode | "";
  arrivalState?: "stable" | "critique" | "inconscient" | "";
  admissionService?: "urgence_generale" | "trauma" | "pediatrie" | "";
  // Triage fields
  triageLevel?: "rouge" | "orange" | "jaune" | "vert" | "";
  vitals?: {
    tension?: string;
    heartRate?: string;
    temperature?: string;
    satO2?: string;
    bloodPressure?: string;
    spO2?: string;
    respiratoryRate?: string;
    glasgowScore?: string;
    painScore?: string;
    weight?: string;
  };
  /** Bilan structuré de l'urgentiste (conscient, respiration, etc.) */
  medicalAssessment?: Record<string, any>;
  /** Liste des soins prodigués par l'urgentiste (careChecklist) */
  careChecklist?: string[];
  /** Symptômes — chaîne ou liste (JSON `hospital_data`) */
  symptoms?: string | string[];
  provisionalDiagnosis?: string;
  triageNotes?: string;
  triageRecordedAt?: string;
  admittedAt?: string;
  // Prise en charge (JSON `hospital_data` — tableaux persistés par `HospitalPriseEnChargeScreen`)
  observations?: unknown[];
  treatments?: unknown[];
  exams?: unknown[];
  timeline?: unknown[];
  /** Résumés dashboard Lovable (`treatment` / `notes` dans `hospital_data`) */
  pecTreatmentSummary?: string;
  pecNotesSummary?: string;
  /** Suivi monitoring (`hospital_data` — spec Lovable) */
  monitoringStatus?: MonitoringPatientStatus;
  monitoringNotes?: string;
  transferTarget?: string | null;
  interventions?: Intervention[];
  // Closure
  outcome?: "hospitalise" | "sorti" | "decede" | string;
  /** Spec Lovable — prioritaire sur `outcome` pour le dashboard */
  dischargeType?: LovableDischargeType;
  dischargedAt?: string;
  finalDiagnosis?: string;
  closureTime?: string;
  reportSent?: boolean;
  reportSentAt?: string;
}

export interface HealthStructure {
  id: string;
  name: string;
  short_name: string | null;
  type?: string;
  address: string | null;
  phone: string | null;
  email?: string | null;
  opening_hours?: string | null;
  primary_contact?: string | null;
  capacity?: number;
  available_beds?: number;
  is_open?: boolean;
  latitude?: number;
  longitude?: number;
  specialties?: string[];
  equipments?: string[];
  capacity_status?: string;
  metadata?: Record<string, any>;
}

/** Terminé ou Sorti du périmètre actif */
export const isCaseClosed = (c: EmergencyCase) => 
  ['termine', 'handedOver'].includes(c.status); 
