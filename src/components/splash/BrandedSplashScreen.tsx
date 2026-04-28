import React from "react";
import {
  View,
  Text,
  StyleSheet,
  ActivityIndicator,
  useWindowDimensions,
  Image,
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
  const logoSize = 100;

  return (
    <View style={styles.root}>
      <SafeAreaView style={styles.safe} edges={["top", "bottom"]}>
        <View style={styles.upper}>
          <View style={styles.upperInner}>
            <Image 
              source={require("../../../assets/logo-etoiel-blue-urgence.png")}
              style={{ width: logoSize, height: logoSize, marginBottom: 24 }}
              resizeMode="contain"
            />

            <Text style={styles.titleBig}>EB URGENCE</Text>

            <Text style={styles.tagline}>
              VITAL EMERGENCY, AT YOUR FINGERTIPS.
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

        <View style={styles.bottomBlock}>
          <Text style={styles.footer}>
            sante.gouv.cd — 2026
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
    alignItems: "center",
    paddingHorizontal: H_PADDING,
  },
  upperInner: {
    alignItems: "center",
  },
  titleBig: {
    color: "#FFFFFF",
    fontSize: 24,
    fontWeight: "900",
    letterSpacing: 2,
    textAlign: "center",
    lineHeight: 32,
  },
  tagline: {
    marginTop: 12,
    color: "rgba(255,255,255,0.45)",
    fontSize: 10,
    fontWeight: "800",
    letterSpacing: 1.5,
    textAlign: "center",
    textTransform: "uppercase",
  },
  spinner: {
    marginTop: 32,
  },
  bottomBlock: {
    paddingBottom: 24,
    alignItems: "center",
  },
  footer: {
    color: "rgba(255,255,255,0.25)",
    fontSize: 10,
    fontWeight: "700",
    letterSpacing: 1,
    textAlign: "center",
  },
});
