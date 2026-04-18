import { UrgencyLevel, CaseStatus } from "./hospitalTypes";
import { colors } from "../../theme/colors";

export const getLevelConfig = (level: UrgencyLevel) => {
  switch (level) {
    case "critique":
      return {
        color: "#FF5252",
        bg: "rgba(255, 82, 82, 0.12)",
        label: "Critique",
        emoji: "🔴",
      };
    case "urgent":
      return {
        color: "#FF9800",
        bg: "rgba(255, 152, 0, 0.12)",
        label: "Urgent",
        emoji: "🟠",
      };
    case "stable":
      return {
        color: "#69F0AE",
        bg: "rgba(105, 240, 174, 0.12)",
        label: "Stable",
        emoji: "🟢",
      };
  }
};

export const getStatusConfig = (status: CaseStatus) => {
  switch (status) {
    case "en_attente":
      return {
        color: "#FF9800",
        bg: "rgba(255, 152, 0, 0.15)",
        label: "Signalé",
        icon: "hourglass-empty" as const,
      };
    case "en_cours":
      return {
        color: colors.secondary,
        bg: "rgba(56, 182, 255, 0.15)",
        label: "En route",
        icon: "local-shipping" as const,
      };
    case "arrived":
      return {
        color: "#E040FB",
        bg: "rgba(224, 64, 251, 0.15)",
        label: "Arrivé",
        icon: "place" as const,
      };
    case "handedOver":
      return {
        color: colors.textMuted,
        bg: "rgba(255, 255, 255, 0.05)",
        label: "Remis",
        icon: "transfer-within-a-station" as const,
      };
    case "admis":
      return {
        color: "#00E676",
        bg: "rgba(0, 230, 118, 0.15)",
        label: "Admis",
        icon: "check-circle" as const,
      };
    case "triage":
      return {
        color: "#E040FB",
        bg: "rgba(224, 64, 251, 0.15)",
        label: "Triage",
        icon: "assignment" as const,
      };
    case "prise_en_charge":
      return {
        color: "#00B0FF",
        bg: "rgba(0, 176, 255, 0.15)",
        label: "Soin",
        icon: "medical-services" as const,
      };
    case "monitoring":
      return {
        color: "#B388FF",
        bg: "rgba(179, 136, 255, 0.15)",
        label: "Suivi",
        icon: "favorite" as const,
      };
    case "termine":
      return {
        color: colors.textMuted,
        bg: "rgba(255, 255, 255, 0.05)",
        label: "Sorti",
        icon: "archive" as const,
      };
  }
};
