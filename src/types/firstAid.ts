export interface CareAction {
   id: string;
   label: string;
   icon: string;
   color: string;
}

export const FIRST_AID_ACTIONS: CareAction[] = [
   { id: "Hémorragie", label: "Pansement &\nCompression", icon: "opacity", color: "#FF3B30" },
   { id: "Oxygène", label: "Soutien\nOxygène", icon: "air", color: "#007AFF" },
   { id: "Immobilisation", label: "Immobilisation\nMembre/Cou", icon: "accessibility", color: "#FF9500" },
   { id: "RCR", label: "RCR &\nDéfibrillation", icon: "bolt", color: "#FFCC00" },
   { id: "Perfusion", label: "Pose de\nVoie (VVP)", icon: "colorize", color: "#5856D6" },
   { id: "Monitor", label: "Monitoring\nECG / Sat", icon: "favorite", color: "#34C759" },
];
