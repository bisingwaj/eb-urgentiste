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
            label: "Le patient est-il conscient ?",
            description: "Vérifier la réponse verbale ou tactile (A.V.P.U)",
            options: [
               { label: "Oui", value: true, color: colors.success, icon: "psychology" },
               { label: "Non", value: false, color: colors.primary, icon: "warning", critical: true },
            ],
            advice: {
               if: { fieldId: "conscious", value: false },
               text: "Vérifier la liberté des voies aériennes immédiatement.",
            },
         },
         {
            id: "breathing",
            type: "binary",
            label: "Le patient respire-t-il ?",
            description: "Observer les mouvements du thorax",
            options: [
               { label: "Oui", value: true, color: colors.success, icon: "air" },
               { label: "Non", value: false, color: colors.primary, icon: "error-outline", critical: true },
            ],
            advice: {
               if: { fieldId: "breathing", value: false },
               text: "Commencer les compressions thoraciques (RCR) immédiatement.",
            },
         },
         {
            id: "circulation",
            type: "choice",
            label: "Pouls radial",
            description: "Évaluer la qualité de la circulation",
            options: [
               { label: "Bien frappé", value: "strong", color: colors.success },
               { label: "Filant / Faible", value: "weak", color: "#FF9800" },
               { label: "Absent", value: "none", color: colors.primary, critical: true },
            ],
            advice: [
               {
                  if: { fieldId: "circulation", value: "weak" },
                  text: "Surveiller la tension artérielle. Préparer une voie veineuse.",
               },
               {
                  if: { fieldId: "circulation", value: "none" },
                  text: "Vérifier le pouls carotidien immédiatement.",
               }
            ],
         },
         {
            id: "severity",
            type: "choice",
            label: "État de gravité global",
            options: [
               { label: "Stable / Stationnaire", value: "Stable", color: colors.success, icon: "check-circle-outline" },
               { label: "Urgence Relative", value: "Urgent", color: "#FF9800", icon: "error-outline" },
               { label: "Urgences Vitales (Critique)", value: "Critique", color: colors.primary, icon: "warning" },
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
            label: "Hémorragie externe ?",
            description: "Présence de saignement actif important",
            options: [
               { label: "Aucune", value: "none", color: colors.success },
               { label: "Contrôlée (Pansement)", value: "controlled", color: "#FF9800" },
               { label: "Hémorragie Massive", value: "pulsatile", color: colors.primary, critical: true },
            ],
            advice: {
               if: { fieldId: "hemorrhage", value: "pulsatile" },
               text: "Poser un garrot ou faire une compression directe immédiatement.",
            },
         },
         {
            id: "fracture",
            type: "binary",
            label: "Déformation ou fracture suspectée ?",
            options: [
               { label: "Oui", value: true, color: "#FF9800" },
               { label: "Non", value: false, color: colors.success },
            ],
         },
         {
            id: "pain_level",
            type: "range",
            label: "Niveau de douleur (0 à 10)",
            description: "Échelle visuelle analogique",
         },
         {
            id: "severity",
            type: "choice",
            label: "Gravité estimée",
            options: [
               { label: "Stable", value: "Stable", color: colors.success, icon: "check-circle-outline" },
               { label: "Urgent (Soin rapide)", value: "Urgent", color: "#FF9800", icon: "error-outline" },
               { label: "Pronostic vital engagé", value: "Critique", color: colors.primary, icon: "warning" },
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
            label: "L'enfant interagit-il normalement ?",
            description: "Regard, tonus, pleurs habituels",
            options: [
               { label: "Oui", value: true, color: colors.success },
               { label: "Non (Léthargie/Altéré)", value: false, color: colors.primary, critical: true },
            ],
         },
         {
            id: "work_of_breathing",
            type: "binary",
            label: "Signe de lutte respiratoire ?",
            description: "Tirage, battement ailes du nez",
            options: [
               { label: "Oui (Lutte)", value: true, color: colors.primary, critical: true },
               { label: "Non (Calme)", value: false, color: colors.success },
            ],
         },
         {
            id: "severity",
            type: "choice",
            label: "Classification de l'urgence",
            options: [
               { label: "Stable", value: "Stable", color: colors.success, icon: "check-circle-outline" },
               { label: "Urgent", value: "Urgent", color: "#FF9800", icon: "error-outline" },
               { label: "Urgence pédiatrique majeure", value: "Critique", color: colors.primary, icon: "warning" },
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
