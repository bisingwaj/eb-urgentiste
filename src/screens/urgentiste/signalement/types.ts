export type MissionStep =
   | "standby"
   | "reception"
   | "arrival"
   | "assessment"
   | "aid"
   | "decision"
   | "assignment"
   | "transport_mode"
   | "transport"
   | "closure";

export interface TimelineEvent {
   id: string;
   time: string;
   label: string;
   icon: string;
   status?: string;
}

export interface AlertData {
   id: string;
   time: string;
   type: string;
   typeIcon: string;
   location: string;
   description: string;
   priority: "CRITIQUE" | "URGENTE" | "MODÉRÉE";
   coordinates: { latitude: number; longitude: number };
   patient: {
      nom: string;
      age: number;
      sexe: string;
      groupeSanguin: string;
   };
}

export const STEP_LABELS: Record<MissionStep, string> = {
   standby: "Attente",
   reception: "Réception",
   arrival: "En route",
   assessment: "Évaluation initiale",
   aid: "Premiers soins",
   decision: "Plan d'évacuation",
   assignment: "Affectation",
   transport_mode: "Mode de transport",
   transport: "Transport en cours",
   closure: "Clôture",
};

export const STEP_ORDER: MissionStep[] = ["standby", "reception", "arrival", "assessment", "aid", "decision", "assignment", "transport_mode", "transport", "closure"];

/** TYPES POUR LE SYSTÈME DE QUESTIONNAIRE DYNAMIQUE (BILAN MÉDICAL) */

export interface AssessmentOption {
   label: string;
   value: any;
   color?: string;
   icon?: string;
   critical?: boolean;
}

export interface AssessmentStep {
   id: string;
   type: "binary" | "choice" | "range" | "info";
   label: string;
   description?: string;
   options?: AssessmentOption[];
   advice?: {
      if: { fieldId: string; value: any };
      text: string;
   } | Array<{
      if: { fieldId: string; value: any };
      text: string;
   }>;
}

export interface AssessmentSchema {
   incident_type: string;
   version: string;
   steps: AssessmentStep[];
}
