import type { CaseStatus, EmergencyCase } from '../screens/hospital/HospitalDashboardTab';

/**
 * Statuts après lesquels le suivi ambulance n’est plus l’action principale sur l’écran détail
 * (carte live masquée ; CTA orientés vers l’étape clinique suivante).
 */
export const POST_AMBULANCE_TRACKING_STATUSES: readonly CaseStatus[] = [
  'admis',
  'triage',
  'prise_en_charge',
  'monitoring',
  'arrived',
  'handedOver',
] as const;

/**
 * Matrice liste « Admissions » → écran d’entrée (une seule source pour ce flux).
 *
 * - monitoring : écran dédié à la surveillance.
 * - admis, triage, prise_en_charge, en_cours : détail dossier (carte + CTA selon status).
 *
 * Les étapes cliniques (triage, PEC) se rejoignent depuis le détail pour garder la pile
 * cohérente et permettre « Voir le suivi / carte ».
 */
export function navigateFromHospitalAdmissionsList(
  navigation: { navigate: (name: string, params: { caseData: EmergencyCase }) => void },
  item: EmergencyCase,
): void {
  if (item.status === 'monitoring') {
    navigation.navigate('HospitalMonitoring', { caseData: item });
  } else {
    navigation.navigate('HospitalCaseDetail', { caseData: item });
  }
}
