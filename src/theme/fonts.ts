import { Text, TextInput, type TextStyle } from "react-native";

/**
 * Polices Marianne (État français, DSFR) — fichiers dans assets/fonts/.
 * Les noms correspondent aux clés passées à useFonts dans App.tsx.
 */
export const fonts = {
  light: "Marianne-Light",
  regular: "Marianne-Regular",
  medium: "Marianne-Medium",
  bold: "Marianne-Bold",
} as const;

let appliedDefaults = false;

/** Applique Marianne comme police par défaut pour Text et TextInput (une seule fois). */
export function applyMarianneDefaultTextStyle(): void {
  if (appliedDefaults) return;
  appliedDefaults = true;

  const base: TextStyle = { fontFamily: fonts.regular };

  const merge = (prev: TextStyle | TextStyle[] | undefined) => {
    if (prev == null) return base;
    return Array.isArray(prev) ? [...prev, base] : [prev, base];
  };

  const T = Text as typeof Text & { defaultProps?: { style?: TextStyle | TextStyle[] } };
  const TI = TextInput as typeof TextInput & { defaultProps?: { style?: TextStyle | TextStyle[] } };

  T.defaultProps = T.defaultProps ?? {};
  T.defaultProps.style = merge(T.defaultProps.style);

  TI.defaultProps = TI.defaultProps ?? {};
  TI.defaultProps.style = merge(TI.defaultProps.style);
}

/** Carte poids CSS → famille Marianne (pour styles explicites). */
export function marianneFamilyForWeight(
  weight?: TextStyle["fontWeight"]
): string {
  if (weight == null || weight === "normal" || weight === "400") return fonts.regular;
  const n = typeof weight === "number" ? weight : parseInt(String(weight), 10);
  if (!Number.isFinite(n)) {
    if (String(weight).includes("bold")) return fonts.bold;
    return fonts.regular;
  }
  if (n <= 300) return fonts.light;
  if (n <= 450) return fonts.regular;
  if (n <= 550) return fonts.medium;
  return fonts.bold;
}
