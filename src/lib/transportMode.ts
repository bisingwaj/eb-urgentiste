import { colors } from '../theme/colors';

/** Codes alignés sur le choix « Mode de transport » urgentiste (`SignalementScreen`) */
export const TRANSPORT_MODE_CODES = ['AMBULANCE', 'SMUR', 'MOTO', 'PERSONNEL'] as const;
export type TransportModeCode = (typeof TRANSPORT_MODE_CODES)[number];

export type TransportModeAccent = 'secondary' | 'primary' | 'success';

export interface TransportModeOption {
  key: TransportModeCode;
  label: string;
  /** Nom d’icône MaterialCommunityIcons */
  icon: string;
  accent: TransportModeAccent;
  /** Bordure accentuée (ex. SMUR) */
  emphasizeBorder?: boolean;
}

/** Même libellés / icônes / accents que l’étape `transport_mode` urgentiste */
export const TRANSPORT_MODE_OPTIONS: TransportModeOption[] = [
  { key: 'AMBULANCE', label: 'Ambulance standard', icon: 'ambulance', accent: 'secondary' },
  {
    key: 'SMUR',
    label: 'Unité SMUR / Réa',
    icon: 'truck-plus',
    accent: 'primary',
    emphasizeBorder: true,
  },
  { key: 'MOTO', label: 'Moto intervention', icon: 'moped', accent: 'secondary' },
  { key: 'PERSONNEL', label: 'Transport perso', icon: 'car-side', accent: 'success' },
];

const LABEL_BY_CODE: Record<TransportModeCode, string> = Object.fromEntries(
  TRANSPORT_MODE_OPTIONS.map((o) => [o.key, o.label]),
) as Record<TransportModeCode, string>;

export function transportModeAccentColor(accent: TransportModeAccent): string {
  switch (accent) {
    case 'primary':
      return colors.primary;
    case 'success':
      return colors.success;
    default:
      return colors.secondary;
  }
}

/** Libellé français pour affichage (rapport, résumés) */
export function getTransportModeLabel(code: string | undefined | null): string {
  if (code == null || code === '') return '—';
  const normalized = normalizeLegacyTransportMode(code);
  if (!normalized) return String(code);
  return LABEL_BY_CODE[normalized] ?? String(code);
}

/** Anciens codes admission hôpital → codes transport communs */
export function normalizeLegacyTransportMode(raw: string | undefined | null): TransportModeCode | '' {
  if (raw == null || raw === '') return '';
  const u = String(raw).trim();
  const upper = u.toUpperCase();
  if ((TRANSPORT_MODE_CODES as readonly string[]).includes(upper)) {
    return upper as TransportModeCode;
  }
  if (u === 'ambulance') return 'AMBULANCE';
  if (u === 'transport_prive') return 'PERSONNEL';
  return '';
}
