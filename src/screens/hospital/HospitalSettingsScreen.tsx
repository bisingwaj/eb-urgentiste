import React from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Dimensions,
} from "react-native";
import { TabScreenSafeArea } from "../../components/layout/TabScreenSafeArea";
import { MaterialCommunityIcons, MaterialIcons } from "@expo/vector-icons";
import { colors } from "../../theme/colors";

const { width } = Dimensions.get("window");

const SETTINGS_GROUPS = [
  {
    title: "DONNÉES & ANALYSES",
    items: [
      {
        id: "analyses",
        label: "Rapports & Analyses",
        icon: "file-chart-outline",
        color: colors.secondary,
        route: "HospitalHistory",
      },
      {
        id: "stats",
        label: "Statistiques du service",
        icon: "chart-box-outline",
        color: "#69F0AE",
        route: null,
      },
    ],
  },
  {
    title: "CONFIGURATION DU SERVICE",
    items: [
      {
        id: "reglages",
        label: "Paramètres Généraux",
        icon: "cog-outline",
        color: "#FF9800",
        route: null,
      },
      {
        id: "staff",
        label: "Gestion du personnel",
        icon: "account-group-outline",
        color: "#E040FB",
        route: null,
      },
      {
        id: "notifications",
        label: "Alertes & Notifications",
        icon: "bell-ring-outline",
        color: "#FF5252",
        route: null,
      },
    ],
  },
  {
    title: "ASSISTANCE & COMPTE",
    items: [
      {
        id: "help",
        label: "Aide & Support",
        icon: "help-circle-outline",
        color: "rgba(255,255,255,0.4)",
        route: null,
      },
      {
        id: "logout",
        label: "Déconnexion",
        icon: "logout",
        color: "#FF5252",
        route: "Login",
      },
    ],
  },
];

export function HospitalSettingsScreen({ navigation }: any) {
  return (
    <TabScreenSafeArea style={styles.safeArea}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity
          onPress={() => navigation.goBack()}
          style={styles.backBtn}
        >
          <MaterialIcons name="arrow-back" size={24} color="#FFF" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Paramètres</Text>
        <View style={{ width: 44 }} />
      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: 40 }}
      >
        {SETTINGS_GROUPS.map((group, idx) => (
          <View key={idx} style={styles.groupContainer}>
            <Text style={styles.groupTitle}>{group.title}</Text>
            <View style={styles.groupCard}>
              {group.items.map((item, itemIdx) => (
                <View key={item.id}>
                  <TouchableOpacity
                    style={styles.settingItem}
                    onPress={() =>
                      item.route && navigation.navigate(item.route)
                    }
                    disabled={!item.route}
                  >
                    <View
                      style={[
                        styles.iconBg,
                        { backgroundColor: item.color + "15" },
                      ]}
                    >
                      <MaterialCommunityIcons
                        name={item.icon as any}
                        color={item.color}
                        size={22}
                      />
                    </View>
                    <Text style={styles.itemLabel}>{item.label}</Text>
                    <MaterialIcons
                      name="chevron-right"
                      color="rgba(255,255,255,0.15)"
                      size={24}
                    />
                  </TouchableOpacity>
                  {itemIdx < group.items.length - 1 && (
                    <View style={styles.divider} />
                  )}
                </View>
              ))}
            </View>
          </View>
        ))}

        <View style={styles.footer}>
          <Text style={styles.versionText}>
            Application Hospitalière v1.2.0
          </Text>
          <Text style={styles.copyrightText}>
            Connecté en tant que Admin HCK
          </Text>
        </View>
      </ScrollView>
    </TabScreenSafeArea>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: colors.mainBackground },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    height: 60,
  },
  backBtn: {
    width: 44,
    height: 44,
    justifyContent: "center",
    alignItems: "center",
  },
  headerTitle: { color: "#FFF", fontSize: 18, fontWeight: "800" },
  groupContainer: { marginTop: 24, paddingHorizontal: 20 },
  groupTitle: {
    color: "rgba(255,255,255,0.25)",
    fontSize: 13,
    fontWeight: "900",
    letterSpacing: 1.5,
    marginBottom: 12,
    marginLeft: 16,
  },
  groupCard: {
    backgroundColor: "#1A1A1A",
    borderRadius: 24,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.05)",
  },
  settingItem: {
    flexDirection: "row",
    alignItems: "center",
    padding: 16,
    gap: 16,
  },
  iconBg: {
    width: 40,
    height: 40,
    borderRadius: 12,
    justifyContent: "center",
    alignItems: "center",
  },
  itemLabel: { flex: 1, color: "#FFF", fontSize: 15, fontWeight: "600" },
  divider: {
    height: 1,
    backgroundColor: "rgba(255,255,255,0.03)",
    marginLeft: 72,
  },
  footer: { marginTop: 40, alignItems: "center", gap: 6 },
  versionText: {
    color: "rgba(255,255,255,0.2)",
    fontSize: 13,
    fontWeight: "700",
  },
  copyrightText: {
    color: colors.secondary,
    fontSize: 13,
    fontWeight: "800",
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
});
