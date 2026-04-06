import { useSafeAreaInsets } from 'react-native-safe-area-context';

/** Marge entre la navigation système et le bas de la pill (CustomTabBar) */
export const TAB_BAR_FLOAT_GAP = 8;
/** Hauteur de la barre d’onglets flottante */
export const FLOATING_TAB_BAR_HEIGHT = 64;
/** Respiration entre contenu scrollable et bord haut de la pill */
export const TAB_SCREEN_CONTENT_GAP = 12;

/**
 * Padding bas à appliquer au contenu des écrans sous les tabs (au-dessus de la barre flottante + nav système).
 */
export function useTabScreenBottomPadding(): number {
  const insets = useSafeAreaInsets();
  return insets.bottom + TAB_BAR_FLOAT_GAP + FLOATING_TAB_BAR_HEIGHT + TAB_SCREEN_CONTENT_GAP;
}
