import React, { useCallback, useMemo, useState, useEffect } from "react";
import { useFocusEffect } from "@react-navigation/native";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  StatusBar,
  Dimensions,
  ActivityIndicator,
  RefreshControl,
  Platform
} from "react-native";
import { AppTouchableOpacity } from '../../components/ui/AppTouchableOpacity';
import { TabScreenSafeArea } from "../../components/layout/TabScreenSafeArea";
import { MaterialIcons, MaterialCommunityIcons } from "@expo/vector-icons";
import { colors } from "../../theme/colors";
import type { TransportModeCode } from "../../lib/transportMode";
import { useAuth } from "../../contexts/AuthContext";
import { useHospital } from "../../contexts/HospitalContext";
import { CapacitySelector } from "./components/CapacitySelector";
import { ALARM_STOP_EVENT } from "../../services/AlarmService";
import { DeviceEventEmitter } from "react-native";
import { DashboardSegmentedControl, HospitalTab } from "./components/DashboardSegmentedControl";
import { ActiveCaseItem } from "./components/ActiveCaseItem";
import { IncomingCaseItem } from "./components/IncomingCaseItem";
import { formatRelativeTime } from "../../utils/timeFormat";
import { HospitalHeader } from "./components/HospitalHeader";

const { width } = Dimensions.get("window");

import {
  UrgencyLevel,
  CaseStatus,
  HospitalStatus,
  EmergencyCase,
  LovableDischargeType,
  MonitoringPatientStatus,
  Intervention,
  isCaseClosed
} from "./hospitalTypes";


import { getLevelConfig, getStatusConfig } from "./hospitalUtils";

function EmptyState({ title, sub }: { title: string, sub: string }) {
  return (
    <View style={styles.emptyContainer}>
      <View style={styles.emptyIconCircle}>
        <MaterialCommunityIcons name="check-all" size={32} color="rgba(255,255,255,0.2)" />
      </View>
      <Text style={styles.emptyTitle}>{title}</Text>
      <Text style={styles.emptySub}>{sub}</Text>
    </View>
  );
}

const formatCaseTime = (dateString?: string) => {
  return formatRelativeTime(dateString);
};

export function HospitalDashboardTab({ navigation }: any) {
  const { profile, refreshProfile } = useAuth();
  const { activeCases, isLoading, listBlocker, lastFetchError, refresh, updateCaseStatus } = useHospital();
  const [refreshing, setRefreshing] = useState(false);
  const [acceptingId, setAcceptingId] = useState<string | null>(null);

  useFocusEffect(
    useCallback(() => {
      void refreshProfile();
      // Silencer l'alarme si on revient sur le dashboard 
      // (interraction implicite avec la liste)
      DeviceEventEmitter.emit(ALARM_STOP_EVENT);
    }, [refreshProfile]),
  );

  const onRefresh = useMemo(
    () => async () => {
      setRefreshing(true);
      try {
        await refreshProfile();
        await refresh();
      } finally {
        setRefreshing(false);
      }
    },
    [refresh, refreshProfile],
  );

  const { displayName } = useMemo(() => {
    const userLabel =
      profile?.first_name || profile?.last_name
        ? `${profile?.first_name ?? ""} ${profile?.last_name ?? ""}`.trim()
        : "";
    const struct = profile?.linkedStructure;
    const displayNameResolved =
      struct?.name?.trim() ||
      userLabel ||
      "Structure sanitaire";
    return {
      displayName: displayNameResolved,
    };
  }, [profile]);

  const [activeTab, setActiveTab] = useState<HospitalTab>("requests");

  // 1. DEMANDES (Pending Triage)
  const requestCases = useMemo(() => {
    return activeCases
      .filter(c => c.hospitalStatus === 'pending' && !isCaseClosed(c))
      .sort((a, b) => new Date(b.dispatchCreatedAt || 0).getTime() - new Date(a.dispatchCreatedAt || 0).getTime());
  }, [activeCases]);

  // 2. EN ROUTE & ARRIVÉS (Incoming but not admitted)
  const enRouteCases = useMemo(() => {
    return activeCases
      .filter(c =>
        c.hospitalStatus === 'accepted' &&
        (c.dispatchStatus === 'en_route_hospital' || c.dispatchStatus === 'arrived_hospital' || c.dispatchStatus === 'completed' || c.dispatchStatus === 'mission_end') &&
        !['admis', 'triage', 'prise_en_charge', 'monitoring', 'termine'].includes(c.hospitalDetailStatus || '')
      )
      .sort((a, b) => {
        const timeA = new Date(a.hospitalRespondedAt || a.dispatchCreatedAt || 0).getTime();
        const timeB = new Date(b.hospitalRespondedAt || b.dispatchCreatedAt || 0).getTime();
        return timeB - timeA;
      });
  }, [activeCases]);

  // 3. ADMISSIONS (Officially at the clinic)
  const admissionCases = useMemo(() => {
    return activeCases
      .filter(c =>
        c.hospitalStatus === 'accepted' &&
        ['admis', 'triage', 'prise_en_charge', 'monitoring'].includes(c.hospitalDetailStatus || '')
      )
      .sort((a, b) => {
        const timeA = new Date(a.triageRecordedAt || a.arrivalTime || a.hospitalRespondedAt || a.dispatchCreatedAt || 0).getTime();
        const timeB = new Date(b.triageRecordedAt || b.arrivalTime || b.hospitalRespondedAt || b.dispatchCreatedAt || 0).getTime();
        return timeB - timeA;
      });
  }, [activeCases]);

  const tabCounts: Record<HospitalTab, number> = useMemo(() => ({
    requests: requestCases.length,
    en_route: enRouteCases.length,
    admissions: admissionCases.length,
  }), [requestCases.length, enRouteCases.length, admissionCases.length]);

  const handleQuickAccept = async (caseId: string) => {
    setAcceptingId(caseId);
    try {
      await updateCaseStatus(caseId, { hospitalStatus: 'accepted' });
    } catch (err) {
      console.error("[Dashboard] Error accepting case:", err);
    } finally {
      setAcceptingId(null);
    }
  };

  const handleQuickRefuse = (caseId: string) => {
    // On redirige vers le détail pour choisir la raison du refus (workflow sécurisé)
    const caseItem = activeCases.find(c => c.id === caseId);
    if (caseItem) {
      navigation.navigate("HospitalCaseDetail", { caseData: caseItem, autoOpenRefuse: true });
    }
  };


  return (
    <View style={styles.safeArea}>
      <StatusBar barStyle="light-content" />
      <HospitalHeader />

      <View style={styles.topHeader}>
        <DashboardSegmentedControl
          activeTab={activeTab}
          onTabChange={setActiveTab}
          counts={tabCounts}
        />
      </View>

      <ScrollView
        style={styles.scrollView}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: 120 }}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={colors.secondary}
          />
        }
      >
        {listBlocker === "no_structure_link" && profile?.role === "hopital" ? (
          <View style={styles.configBanner}>
            <MaterialIcons name="link-off" size={22} color="#FFB74D" />
            <Text style={styles.configBannerText}>
              Aucune structure n’est liée à votre compte. Vérifiez en base que la ligne{" "}
              <Text style={styles.configBannerMono}>health_structures</Text> a{" "}
              <Text style={styles.configBannerMono}>linked_user_id</Text> égal à votre{" "}
              <Text style={styles.configBannerMono}>users_directory.id</Text> (ou à votre{" "}
              <Text style={styles.configBannerMono}>auth_user_id</Text> selon votre schéma). La centrale doit
              renseigner <Text style={styles.configBannerMono}>dispatches.assigned_structure_id</Text> avec le{" "}
              <Text style={styles.configBannerMono}>id</Text> de cette même structure.
            </Text>
          </View>
        ) : null}
        {listBlocker === "supabase_error" && lastFetchError ? (
          <View style={[styles.configBanner, { borderColor: "rgba(255,82,82,0.4)" }]}>
            <MaterialIcons name="error-outline" size={22} color="#FF5252" />
            <Text style={styles.configBannerText}>
              Impossible de charger les dispatches ({lastFetchError}). Vérifiez les droits RLS (rôle hopital) et la
              connexion.
            </Text>
          </View>
        ) : null}

        {/* --- DYNAMIC LIST BASED ON TAB --- */}
        <View style={styles.tabContentContainer}>
          {activeTab === 'requests' && (
            <>
              <View style={styles.sectionHeader}>
                <Text style={styles.sectionTitle}>Demandes Entrantes</Text>
              </View>
              {requestCases.length > 0 ? (
                requestCases.map((caseItem) => (
                  <IncomingCaseItem
                    key={caseItem.id}
                    caseItem={caseItem}
                    onAccept={handleQuickAccept}
                    onRefuse={handleQuickRefuse}
                    onPress={() => navigation.navigate("HospitalCaseDetail", { caseData: caseItem })}
                    displayTime={formatCaseTime(caseItem.dispatchCreatedAt)}
                    isAccepting={acceptingId === caseItem.id}
                  />
                ))
              ) : (
                <EmptyState title="Aucune demande en attente" sub="Toutes les alertes ont été traitées." />
              )}
            </>
          )}

          {activeTab === 'en_route' && (
            <>
              <View style={styles.sectionHeader}>
                <Text style={styles.sectionTitle}>Urgences en approche</Text>
              </View>
              {enRouteCases.length > 0 ? (
                enRouteCases.map((caseItem) => (
                  <ActiveCaseItem
                    key={caseItem.id}
                    caseItem={caseItem}
                    mode="en_route"
                    onPress={() => navigation.navigate("HospitalCaseDetail", { caseData: caseItem })}
                    displayTime={formatCaseTime(caseItem.hospitalRespondedAt || caseItem.dispatchCreatedAt)}
                  />
                ))
              ) : (
                <EmptyState title="Aucune urgence en route" sub="Aucun patient n'est actuellement en approche." />
              )}
            </>
          )}

          {activeTab === 'admissions' && (
            <>
              <View style={styles.sectionHeader}>
                <Text style={styles.sectionTitle}>Patients Admis / Triage</Text>
              </View>
              {admissionCases.length > 0 ? (
                admissionCases.map((caseItem) => (
                  <ActiveCaseItem
                    key={caseItem.id}
                    caseItem={caseItem}
                    mode="admissions"
                    onPress={() => navigation.navigate("HospitalCaseDetail", { caseData: caseItem })}
                    displayTime={formatCaseTime(caseItem.triageRecordedAt || caseItem.arrivalTime || caseItem.hospitalRespondedAt)}
                  />
                ))
              ) : (
                <EmptyState title="Aucune admission active" sub="Aucun patient n'est actuellement hospitalisé." />
              )}
            </>
          )}
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: colors.mainBackground },
  topHeader: {
    paddingHorizontal: 24,
    paddingTop: 4,
    paddingBottom: 8,
    backgroundColor: "#0A0A0A",
  },
  headerRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 12 },
  headerTextBlock: { flex: 1, paddingRight: 12 },
  greetingText: { color: "rgba(255,255,255,0.4)", fontSize: 13, fontWeight: "800", letterSpacing: 0.5 },
  hospitalName: { color: "#FFF", fontSize: 24, fontWeight: "700", marginTop: 4 },
  headerIdLine: {
    color: "rgba(255,255,255,0.45)",
    fontSize: 12,
    fontWeight: "600",
    marginTop: 6,
  },
  headerMetaRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 6,
    marginTop: 8,
    maxWidth: "100%",
  },
  headerMetaText: {
    flex: 1,
    color: "rgba(255,255,255,0.75)",
    fontSize: 13,
    fontWeight: "600",
    lineHeight: 18,
  },
  notifBtn: { width: 50, height: 50, borderRadius: 18, backgroundColor: "rgba(255,255,255,0.05)", justifyContent: "center", alignItems: "center", borderWidth: 1, borderColor: "rgba(255,255,255,0.1)" },
  notifBadge: {
    position: "absolute",
    top: 6,
    right: 4,
    minWidth: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: "#FF5252",
    borderWidth: 2,
    borderColor: "#0A0A0A",
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 3,
  },
  notifBadgeText: { color: "#FFF", fontSize: 11, fontWeight: "900" },
  summaryContainer: { flexDirection: "row", gap: 12, marginBottom: 4 },
  mainSummaryCard: { flex: 1, height: 110, borderRadius: 28, padding: 20, overflow: "hidden", justifyContent: "center" },
  cardHeader: { flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 8 },
  summaryLabel: { color: "rgba(255,255,255,0.8)", fontSize: 12, fontWeight: "900", letterSpacing: 0.5 },
  summaryNumber: { color: "#FFF", fontSize: 36, fontWeight: "900" },
  cardGlow: { position: "absolute", right: -20, bottom: -20, width: 80, height: 80, borderRadius: 40, backgroundColor: "rgba(255,255,255,0.15)" },
  scrollView: { flex: 1 },
  decisionCenter: {
    marginTop: 10,
    marginBottom: 10,
  },
  decisionScroll: {
    paddingLeft: 20,
    paddingRight: 10,
    paddingBottom: 20,
    paddingTop: 5,
  },
  configBanner: {
    marginHorizontal: 20,
    marginTop: 12,
    marginBottom: 4,
    padding: 14,
    borderRadius: 16,
    backgroundColor: "rgba(255, 183, 77, 0.08)",
    borderWidth: 1,
    borderColor: "rgba(255, 183, 77, 0.25)",
    flexDirection: "row",
    gap: 12,
    alignItems: "flex-start",
  },
  configBannerText: {
    flex: 1,
    color: "rgba(255,255,255,0.85)",
    fontSize: 12,
    lineHeight: 18,
    fontWeight: "600",
  },
  configBannerMono: {
    fontFamily: Platform.OS === "ios" ? "Menlo" : "monospace",
    color: "#FFB74D",
    fontWeight: "700",
  },
  sectionHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingHorizontal: 24, paddingTop: 16, marginBottom: 12 },
  sectionTitle: { color: "rgba(255,255,255,0.3)", fontSize: 11, fontWeight: "900", letterSpacing: 1, textTransform: "uppercase" },
  tabContentContainer: { marginTop: 8 },
  liveBadge: { flexDirection: "row", alignItems: "center", gap: 6, backgroundColor: "rgba(255, 82, 82, 0.1)", paddingHorizontal: 10, paddingVertical: 4, borderRadius: 8 },
  liveDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: "#FF5252" },
  liveText: { color: "#FF5252", fontSize: 10, fontWeight: "900" },
  headerSeparator: {
    height: 1,
    backgroundColor: "rgba(255,255,255,0.06)",
    marginVertical: 12,
  },
  emptyContainer: {
    padding: 40,
    alignItems: "center",
    justifyContent: "center",
  },
  emptyIconCircle: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: "rgba(255,255,255,0.03)",
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 16,
  },
  emptyTitle: {
    color: "#FFF",
    fontSize: 18,
    fontWeight: "700",
    marginBottom: 8,
  },
  emptySub: {
    color: "rgba(255,255,255,0.4)",
    fontSize: 14,
    textAlign: "center",
    marginBottom: 24,
    lineHeight: 20,
  },
  admissionsBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: "rgba(56, 182, 255, 0.1)",
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "rgba(56, 182, 255, 0.2)",
  },
  admissionsBtnText: {
    color: colors.secondary,
    fontSize: 14,
    fontWeight: "700",
  },
});
export { EmergencyCase };

