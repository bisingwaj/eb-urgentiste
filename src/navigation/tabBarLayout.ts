import { Platform } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

/** Marge entre la navigation système et le bas de la pill (CustomTabBar) */
export const TAB_BAR_FLOAT_GAP = 8;
/** Hauteur de la barre d’onglets flottante */
export const FLOATING_TAB_BAR_HEIGHT = 64;
/** Respiration entre contenu scrollable et bord haut de la pill */
export const TAB_SCREEN_CONTENT_GAP = 12;
/**
 * Sur Android la pill + ombres / hit-area réelle dépassent souvent la hauteur logique ;
 * sans marge supplémentaire, des overlays (carte) passent sous la barre.
 */
const ANDROID_TAB_BAR_HEIGHT_EXTRA = 16;

/**
 * Padding bas à appliquer au contenu des écrans sous les tabs (au-dessus de la barre flottante + nav système).
 */
export function useTabScreenBottomPadding(): number {
  const insets = useSafeAreaInsets();
  const barH =
    FLOATING_TAB_BAR_HEIGHT +
    (Platform.OS === 'android' ? ANDROID_TAB_BAR_HEIGHT_EXTRA : 0);
  return insets.bottom + TAB_BAR_FLOAT_GAP + barH + TAB_SCREEN_CONTENT_GAP;
}
