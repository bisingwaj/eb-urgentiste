import React from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  StatusBar,
} from "react-native";
import { TabScreenSafeArea } from "../../components/layout/TabScreenSafeArea";
import { colors } from "../../theme/colors";
import { MaterialIcons, MaterialCommunityIcons } from "@expo/vector-icons";

const HISTORY_DATA = [
  {
    id: "MSN-7842",
    date: "Aujourd'hui, 14:24",
    type: "Accident de la voie publique",
    location: "Boulevard du 30 Juin",
    outcome: "Transfert réussi",
    outcomeType: "success",
    destination: "Clinique Ngaliema",
    duration: "42 min",
    actions: ["Immobilisation", "Voie veineuse", "Bilan CRRA"],
  },
  {
    id: "MSN-7840",
    date: "Aujourd'hui, 10:15",
    type: "Malaise vagal",
    location: "Gare Centrale (Quai 2)",
    outcome: "Refus de prise en charge",
    outcomeType: "refused",
    destination: "Aucune (Clôture sur site)",
    duration: "18 min",
    actions: ["Évaluation primaire", "Prise de constantes", "Décharge signée"],
  },
  {
    id: "MSN-7831",
    date: "Hier, 23:45",
    type: "Hémorragie massive",
    location: "Commune de Bandal",
    outcome: "Transfert UA",
    outcomeType: "critical",
    destination: "CHU Kinshasa (Réa Choc)",
    duration: "55 min",
    actions: ["Garrot tourniquet", "Oxygène 15L/min", "Alerte Trauma Center"],
  },
];

import { useMissionHistory } from "../../hooks/useMissionHistory";
import { ActivityIndicator } from "react-native";

export function HistoryTab({ navigation }: any) {
  const { history, isLoading } = useMissionHistory();

  const getOutcomeSpecs = (type: string) => {
    switch (type) {
      case "completed":
        return { icon: "check-circle" as const, color: colors.success };
      case "refused":
        return { icon: "cancel" as const, color: "#FF9800" };
      case "critical":
        return { icon: "error" as const, color: colors.primary };
      default:
        return { icon: "check-circle" as const, color: colors.secondary };
    }
  };

  const successCount = history.filter((m) => m.dispatch_status === "completed")
    .length;

  return (
    <TabScreenSafeArea style={styles.container}>
      <StatusBar barStyle="light-content" />

      <View style={styles.topHeader}>
        <View style={styles.headerRow}>
          <View>
            <Text style={styles.greetingText}>Votre activité</Text>
            <Text style={styles.hospitalName}>Historique</Text>
          </View>
          <View style={styles.headerIconRow}>
            <TouchableOpacity style={styles.headerAvatarBtn}>
              <MaterialIcons
                name="filter-list"
                color={colors.secondary}
                size={26}
              />
            </TouchableOpacity>
          </View>
        </View>

        {/* Summary stats */}
        <View style={styles.summaryContainer}>
          <View
            style={[
              styles.mainSummaryCard,
              { backgroundColor: colors.secondary },
            ]}
          >
            <View style={styles.cardHeader}>
              <MaterialCommunityIcons name="history" color="#FFF" size={20} />
              <Text style={styles.summaryLabel}>Total</Text>
            </View>
            <Text style={styles.summaryNumber}>{history.length}</Text>
          </View>
          <View
            style={[styles.mainSummaryCard, { backgroundColor: "#1A1A1A" }]}
          >
            <View style={styles.cardHeader}>
              <MaterialCommunityIcons
                name="check-decagram"
                color={colors.success}
                size={20}
              />
              <Text style={styles.summaryLabel}>Succès</Text>
            </View>
            <Text style={styles.summaryNumber}>{successCount}</Text>
          </View>
        </View>
      </View>

      <ScrollView
        contentContainerStyle={styles.scrollPad}
        showsVerticalScrollIndicator={false}
      >
        <TouchableOpacity
          style={styles.callHistoryCard}
          onPress={() => navigation.navigate("CallHistoryCalls")}
          activeOpacity={0.88}
        >
          <View
            style={[
              styles.callHistoryIcon,
              { backgroundColor: colors.secondary + "22" },
            ]}
          >
            <MaterialIcons
              name="phone-callback"
              color={colors.secondary}
              size={26}
            />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.callHistoryTitle}>Appels vers la centrale</Text>
            <Text style={styles.callHistorySub}>
              Historique audio / vidéo (mis à jour à chaque visite)
            </Text>
          </View>
          <MaterialIcons
            name="chevron-right"
            color="rgba(255,255,255,0.2)"
            size={24}
          />
        </TouchableOpacity>

        <Text style={styles.sectionTitle}>Missions récentes</Text>

        {isLoading ? (
          <View style={{ marginTop: 40 }}>
            <ActivityIndicator size="large" color={colors.secondary} />
          </View>
        ) : history.length === 0 ? (
          <View style={{ marginTop: 40, alignItems: "center" }}>
            <MaterialCommunityIcons
              name="clipboard-text-outline"
              size={60}
              color="rgba(255,255,255,0.1)"
            />
            <Text
              style={{
                color: "rgba(255,255,255,0.4)",
                marginTop: 15,
                fontSize: 16,
              }}
            >
              Aucune mission terminée
            </Text>
          </View>
        ) : (
          <View style={styles.listContainer}>
            {history.map((mission) => {
              const specs = getOutcomeSpecs(mission.dispatch_status);

              return (
                <TouchableOpacity
                  key={mission.id}
                  style={styles.alertCard}
                  activeOpacity={0.9}
                  onPress={() =>
                    navigation.navigate("MissionDetail", { mission })
                  }
                >
                  <View style={styles.cardInfo}>
                    <View style={styles.cardHeaderRow}>
                      <View style={styles.timePill}>
                        <MaterialCommunityIcons
                          name="clock-outline"
                          color="rgba(255,255,255,0.4)"
                          size={14}
                        />
                        <Text style={styles.timeText}>
                          {new Date(mission.created_at).toLocaleDateString()}{" "}
                          {new Date(mission.created_at)
                            .toLocaleTimeString()
                            .slice(0, 5)}
                        </Text>
                      </View>
                    </View>
                    <Text style={styles.victimName}>{mission.title}</Text>
                    <View style={styles.locationInfo}>
                      <MaterialIcons
                        name="location-on"
                        color={colors.secondary}
                        size={16}
                      />
                      <Text style={styles.addressText} numberOfLines={2}>
                        {mission.location?.address?.trim() ||
                          [
                            mission.location?.commune,
                            mission.location?.ville,
                            mission.location?.province,
                          ]
                            .filter(Boolean)
                            .join(' · ') ||
                          '—'}
                      </Text>
                    </View>
                    <View style={styles.cardDivider} />
                    <View style={styles.cardFooterRow}>
                      <View
                        style={[
                          styles.statusBadge,
                          { backgroundColor: specs.color + "15" },
                        ]}
                      >
                        <MaterialIcons
                          name={specs.icon}
                          color={specs.color}
                          size={14}
                        />
                        <Text
                          style={[
                            styles.statusBadgeText,
                            { color: specs.color },
                          ]}
                        >
                          Terminé
                        </Text>
                      </View>
                      <View style={styles.etaContainer}>
                        <Text style={styles.etaValue}>{mission.type}</Text>
                      </View>
                    </View>
                  </View>
                  <View style={styles.arrowContainer}>
                    <MaterialIcons
                      name="chevron-right"
                      color="rgba(255,255,255,0.2)"
                      size={24}
                    />
                  </View>
                </TouchableOpacity>
              );
            })}
          </View>
        )}
      </ScrollView>
    </TabScreenSafeArea>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.mainBackground },
  topHeader: {
    paddingHorizontal: 24,
    paddingTop: 16,
    paddingBottom: 24,
    borderBottomLeftRadius: 36,
    borderBottomRightRadius: 36,
    backgroundColor: "#0A0A0A",
  },
  headerRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 20,
  },
  greetingText: {
    color: "rgba(255,255,255,0.4)",
    fontSize: 12,
    fontWeight: "800",
    letterSpacing: 1.5,
    textTransform: "uppercase",
  },
  hospitalName: {
    color: "#FFF",
    fontSize: 32,
    fontWeight: "700",
    marginTop: 4,
  },
  headerIconRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  headerAvatarBtn: {
    width: 44,
    height: 44,
    borderRadius: 16,
    backgroundColor: "#1A1A1A",
    justifyContent: "center",
    alignItems: "center",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.1)",
  },
  summaryContainer: { flexDirection: "row", gap: 12 },
  mainSummaryCard: {
    flex: 1,
    height: 110,
    borderRadius: 32,
    padding: 20,
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.05)",
  },
  cardHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginBottom: 8,
  },
  summaryLabel: {
    color: "rgba(255,255,255,0.6)",
    fontSize: 10,
    fontWeight: "900",
    letterSpacing: 0.5,
  },
  summaryNumber: { color: "#FFF", fontSize: 32, fontWeight: "900" },

  scrollPad: { paddingBottom: 40 },
  callHistoryCard: {
    flexDirection: "row",
    alignItems: "center",
    marginHorizontal: 20,
    marginTop: 8,
    padding: 18,
    borderRadius: 28,
    backgroundColor: "#1A1A1A",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
    gap: 14,
  },
  callHistoryIcon: {
    width: 52,
    height: 52,
    borderRadius: 18,
    justifyContent: "center",
    alignItems: "center",
  },
  callHistoryTitle: { color: "#FFF", fontSize: 17, fontWeight: "800" },
  callHistorySub: {
    color: "rgba(255,255,255,0.45)",
    fontSize: 13,
    marginTop: 4,
    fontWeight: "600",
  },
  sectionTitle: {
    color: "#FFF",
    fontSize: 18,
    fontWeight: "600",
    marginHorizontal: 24,
    marginTop: 24,
    marginBottom: 16,
  },

  listContainer: { paddingBottom: 24 },
  alertCard: {
    backgroundColor: "#1A1A1A",
    marginHorizontal: 20,
    borderRadius: 32,
    padding: 22,
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 16,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.05)",
  },
  cardInfo: { flex: 1 },
  cardHeaderRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 16,
  },
  timePill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: "rgba(255,255,255,0.05)",
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 12,
  },
  timeText: { color: "rgba(255,255,255,0.6)", fontSize: 12, fontWeight: "700" },
  victimName: {
    color: "#FFF",
    fontSize: 18,
    fontWeight: "900",
    marginBottom: 8,
  },
  locationInfo: { flexDirection: "row", alignItems: "center", gap: 8 },
  addressText: {
    color: "rgba(255,255,255,0.4)",
    fontSize: 13,
    fontWeight: "600",
  },
  cardDivider: {
    height: 1,
    backgroundColor: "rgba(255,255,255,0.05)",
    marginVertical: 18,
  },
  cardFooterRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  statusBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 12,
  },
  statusBadgeText: { fontSize: 11, fontWeight: "800", letterSpacing: 0.5 },
  etaContainer: { flexDirection: "row", alignItems: "center" },
  etaValue: { color: "rgba(255,255,255,0.3)", fontSize: 13, fontWeight: "800" },
  arrowContainer: { marginLeft: 16 },
});
