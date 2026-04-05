import { TextStyle } from 'react-native';

/**
 * Titres en casse phrase (pas de TITRE EN CAPS), interlignage lisible.
 * Style proche apps messagerie modernes : discret, hiérarchie claire.
 */
export const typography = {
  /** Titre écran principal */
  screenTitle: {
    fontSize: 26,
    fontWeight: '700' as const,
    letterSpacing: -0.4,
    color: '#FFFFFF',
  },
  /** Sous-titre / contexte sous le titre */
  screenSubtitle: {
    fontSize: 14,
    fontWeight: '500' as const,
    letterSpacing: 0,
    color: 'rgba(255,255,255,0.55)',
    marginTop: 6,
    lineHeight: 20,
  },
  /** Label de section (petit, pas tout en majuscules agressif) */
  sectionLabel: {
    fontSize: 12,
    fontWeight: '600' as const,
    letterSpacing: 0.2,
    color: 'rgba(255,255,255,0.45)',
  },
  body: {
    fontSize: 15,
    fontWeight: '400' as const,
    letterSpacing: 0,
    color: 'rgba(255,255,255,0.92)',
    lineHeight: 22,
  },
  bodyMuted: {
    fontSize: 14,
    fontWeight: '400' as const,
    color: 'rgba(255,255,255,0.5)',
    lineHeight: 20,
  },
  /** Chiffres / stats */
  metric: {
    fontSize: 20,
    fontWeight: '700' as const,
    letterSpacing: -0.3,
    color: '#FFFFFF',
  },
  metricUnit: {
    fontSize: 12,
    fontWeight: '600' as const,
    color: 'rgba(255,255,255,0.45)',
  },
} satisfies Record<string, TextStyle>;
