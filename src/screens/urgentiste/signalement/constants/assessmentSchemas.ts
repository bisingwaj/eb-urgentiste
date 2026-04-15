import { AssessmentSchema } from "../types";
import { colors } from "../../../../theme/colors";

export const ASSESSMENT_SCHEMAS: Record<string, AssessmentSchema> = {
   default: {
      incident_type: "default",
      version: "1.0.0",
      steps: [
         {
            id: "conscious",
            type: "binary",
            label: "Conscience (A/V/P/U)",
            description: "Le patient est-il conscient ?",
            options: [
               { label: "Oui", value: true, color: colors.success, icon: "psychology" },
               { label: "Non", value: false, color: colors.primary, icon: "warning", critical: true },
            ],
            advice: {
               if: { fieldId: "conscious", value: false },
               text: "Alerte : Patient inconscient. Vérifier la liberté des voies aériennes.",
            },
         },
         {
            id: "breathing",
            type: "binary",
            label: "Respiration (L/V/S)",
            description: "Observe-t-on des mouvements thoraciques ?",
            options: [
               { label: "Oui", value: true, color: colors.success, icon: "air" },
               { label: "Non", value: false, color: colors.primary, icon: "error-outline", critical: true },
            ],
            advice: {
               if: { fieldId: "breathing", value: false },
               text: "URGENCE : Commencer les compressions thoraciques (RCR).",
            },
         },
         {
            id: "circulation",
            type: "choice",
            label: "Circulation",
            description: "Qualité du pouls radial",
            options: [
               { label: "Fort", value: "strong", color: colors.success },
               { label: "Faible", value: "weak", color: "#FF9800" },
               { label: "Absent", value: "none", color: colors.primary, critical: true },
            ],
         },
         {
            id: "severity",
            type: "choice",
            label: "Niveau de gravité",
            options: [
               { label: "Critique", value: "Critique", color: colors.primary, icon: "warning" },
               { label: "Urgent", value: "Urgent", color: "#FF9800", icon: "error-outline" },
               { label: "Stable", value: "Stable", color: colors.success, icon: "check-circle-outline" },
            ],
         },
      ],
   },
   trauma: {
      incident_type: "trauma",
      version: "1.0.0",
      steps: [
         {
            id: "hemorrhage",
            type: "choice",
            label: "Hémorragie",
            description: "Présence de saignement actif",
            options: [
               { label: "Aucune", value: "none", color: colors.success },
               { label: "Contrôlée", value: "controlled", color: "#FF9800" },
               { label: "Pulsatile", value: "pulsatile", color: colors.primary, critical: true },
            ],
            advice: {
               if: { fieldId: "hemorrhage", value: "pulsatile" },
               text: "URGENCE : Poser un garrot immédiatement.",
            },
         },
         {
            id: "fracture",
            type: "binary",
            label: "Fracture suspectée",
            options: [
               { label: "Oui", value: true, color: "#FF9800" },
               { label: "Non", value: false, color: colors.success },
            ],
         },
         {
            id: "pain_level",
            type: "range",
            label: "Niveau de douleur (EVA)",
            description: "Sur une échelle de 1 à 10",
         },
         {
            id: "severity",
            type: "choice",
            label: "Niveau de gravité",
            options: [
               { label: "Critique", value: "Critique", color: colors.primary, icon: "warning" },
               { label: "Urgent", value: "Urgent", color: "#FF9800", icon: "error-outline" },
               { label: "Stable", value: "Stable", color: colors.success, icon: "check-circle-outline" },
            ],
         },
      ],
   },
   pediatrie: {
      incident_type: "pediatrie",
      version: "1.0.0",
      steps: [
         {
            id: "appearance",
            type: "binary",
            label: "Apparence / Interaction",
            description: "Teint, tonus, regard",
            options: [
               { label: "Normal", value: true, color: colors.success },
               { label: "Altéré", value: false, color: colors.primary, critical: true },
            ],
         },
         {
            id: "work_of_breathing",
            type: "binary",
            label: "Effort respiratoire",
            description: "Tirage ou geignement ?",
            options: [
               { label: "Normal", value: false, color: colors.success },
               { label: "Augmenté", value: true, color: colors.primary, critical: true },
            ],
         },
         {
            id: "severity",
            type: "choice",
            label: "Niveau de gravité",
            options: [
               { label: "Critique", value: "Critique", color: colors.primary, icon: "warning" },
               { label: "Urgent", value: "Urgent", color: "#FF9800", icon: "error-outline" },
               { label: "Stable", value: "Stable", color: colors.success, icon: "check-circle-outline" },
            ],
         },
      ],
   },
};

/**
 * Helper to select the best schema based on incident type string.
 */
export function getAssessmentSchema(type?: string): AssessmentSchema {
   if (!type) return ASSESSMENT_SCHEMAS.default;
   const key = type.toLowerCase();
   if (ASSESSMENT_SCHEMAS[key]) return ASSESSMENT_SCHEMAS[key];

   // Handle common mappings
   if (key.includes("trauma") || key.includes("accident")) return ASSESSMENT_SCHEMAS.trauma;
   if (key.includes("pedia") || key.includes("enfant")) return ASSESSMENT_SCHEMAS.pediatrie;

   return ASSESSMENT_SCHEMAS.default;
}
