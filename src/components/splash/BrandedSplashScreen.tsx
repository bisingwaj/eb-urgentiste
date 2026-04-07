import React from "react";
import {
  View,
  Text,
  StyleSheet,
  ActivityIndicator,
  useWindowDimensions,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { colors } from "../../theme/colors";

/** Couleurs drapeau RDC (bandes verticales). */
const FLAG_BLUE = "#007FFF";
const FLAG_YELLOW = "#F7D116";
const FLAG_RED = "#CE1126";

const BG = "#0D0D0D";
/** Même ancrage gauche pour drapeau, titres, baseline, croix et pied de page (comme la maquette). */
const H_PADDING = 28;

type Props = {
  showSpinner?: boolean;
};

export function BrandedSplashScreen({ showSpinner = false }: Props) {
  const { width } = useWindowDimensions();
  const flagWidth = Math.min(132, width - H_PADDING * 2);

  return (
    <View style={styles.root}>
      <SafeAreaView style={styles.safe} edges={["top", "bottom"]}>
        {/* Bloc central : drapeau + gros titre + petit titre — alignés à gauche, centrés verticalement dans la zone utile */}
        <View style={styles.upper}>
          <View style={styles.upperInner}>
            <View
              style={[styles.flagRow, { width: flagWidth, height: flagWidth * 0.52 }]}
            >
              <View style={[styles.flagStripe, { backgroundColor: FLAG_BLUE }]}>
                <Text style={styles.star} accessibilityLabel="Étoile">
                  ★
                </Text>
              </View>
              <View style={[styles.flagStripe, { backgroundColor: FLAG_YELLOW }]} />
              <View style={[styles.flagStripe, { backgroundColor: FLAG_RED }]} />
            </View>

            <Text style={styles.titleBig}>ÉTOILE</Text>
            <Text style={[styles.titleBig, styles.titleSecondLine]}>BLEUE</Text>

            <Text style={styles.tagline}>
              Vital emergency, at your fingertips.
            </Text>

            {showSpinner ? (
              <ActivityIndicator
                style={styles.spinner}
                size="small"
                color={colors.secondary}
              />
            ) : null}
          </View>
        </View>

        {/* Bas : croix rouge puis texte légal — même marge gauche que le haut, tout aligné à gauche */}
        <View style={styles.bottomBlock}>
          <MaterialCommunityIcons
            name="plus"
            size={24}
            color="#E53935"
            style={styles.crossIcon}
            accessibilityLabel="Croix médicale"
          />
          <Text style={styles.footer}>
            sante.gouv.cd ©2026 — ÉTOILE BLEUE is the official vital emergency{"\n"}
            application of the Ministry of Health of the Democratic Republic of{"\n"}
            the Congo.
          </Text>
        </View>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: BG,
  },
  safe: {
    flex: 1,
  },
  upper: {
    flex: 1,
    justifyContent: "center",
    paddingHorizontal: H_PADDING,
  },
  upperInner: {
    alignSelf: "stretch",
    alignItems: "flex-start",
  },
  flagRow: {
    flexDirection: "row",
    borderRadius: 4,
    overflow: "hidden",
    marginBottom: 22,
  },
  flagStripe: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
  },
  star: {
    color: "#FFFFFF",
    fontSize: 30,
    lineHeight: 34,
    fontWeight: "700",
  },
  titleBig: {
    color: "#FFFFFF",
    fontSize: 32,
    fontWeight: "800",
    letterSpacing: 0.5,
    textAlign: "left",
    width: "100%",
    lineHeight: 38,
  },
  titleSecondLine: {
    marginTop: -2,
  },
  tagline: {
    marginTop: 16,
    color: "rgba(255,255,255,0.85)",
    fontSize: 16,
    lineHeight: 24,
    fontWeight: "400",
    textAlign: "left",
    width: "100%",
    maxWidth: 340,
  },
  spinner: {
    marginTop: 18,
    alignSelf: "flex-start",
  },
  bottomBlock: {
    paddingHorizontal: H_PADDING,
    paddingBottom: 8,
    alignItems: "flex-start",
  },
  crossIcon: {
    marginBottom: 10,
  },
  footer: {
    color: "rgba(255,255,255,0.45)",
    fontSize: 11,
    lineHeight: 16,
    textAlign: "left",
    width: "100%",
  },
});
