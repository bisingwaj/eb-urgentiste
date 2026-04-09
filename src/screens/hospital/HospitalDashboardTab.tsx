import React, { useMemo, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  StatusBar,
  Dimensions,
  ActivityIndicator,
} from "react-native";
import { TabScreenSafeArea } from "../../components/layout/TabScreenSafeArea";
import { MaterialIcons, MaterialCommunityIcons } from "@expo/vector-icons";
import { colors } from "../../theme/colors";
import { useAuth } from "../../contexts/AuthContext";
import { useHospital } from "../../contexts/HospitalContext";

const { width } = Dimensions.get("window");

export type UrgencyLevel = "critique" | "urgent" | "stable";
export type CaseStatus =
  | "en_attente"
  | "en_cours"
  | "admis"
  | "triage"
  | "prise_en_charge"
  | "termine";

export type HospitalStatus = 
  | "pending"
  | "accepted"
  | "refused";

export interface EmergencyCase {
  id: string;
  victimName: string;
  age: number;
  sex: "M" | "F" | "Inconnu";
  description: string;
  level: UrgencyLevel;
  urgentisteName: string;
  urgentistePhone: string;
  eta: string;
  status: CaseStatus;
  address: string;
  timestamp: string;
  typeUrgence: string; // Ex: Traumatisme, Cardiaque, Obstétrique
  
  // Hospital Assignment fields
  hospitalStatus?: HospitalStatus;
  hospitalNotes?: string;
  hospitalRespondedAt?: string;

  // Patient Profile Extended details
  patientProfile?: {
    bloodType?: string;
    allergies?: string[];
    medicalHistory?: string[];
    medications?: string[];
    emergencyContactName?: string;
    emergencyContactPhone?: string;
    dateOfBirth?: string;
  };

  // SOS Questionnaire responses
  sosResponses?: Array<{
    questionText: string;
    answer: string;
    gravityScore: number;
    gravityLevel: string;
  }>;
  gravityScore?: number;
  
  // Clinical data (hData)fields
  arrivalTime?: string;
  arrivalMode?: "ambulance" | "transport_prive" | "";
  arrivalState?: "stable" | "critique" | "inconscient" | "";
  admissionService?: "urgence_generale" | "trauma" | "pediatrie" | "";
  // Triage fields
  triageLevel?: "rouge" | "orange" | "jaune" | "vert" | "";
  vitals?: {
    tension: string;
    heartRate: string;
    temperature: string;
    satO2: string;
  };
  symptoms?: string;
  provisionalDiagnosis?: string;
  // Prise en charge
  interventions?: Intervention[];
  // Closure
  outcome?: "hospitalise" | "sorti" | "decede" | string;
  finalDiagnosis?: string;
  closureTime?: string;
}

export interface Intervention {
  id: string;
  type: "acte_medical" | "examen" | "traitement" | "intervenant";
  category: string;
  detail: string;
  time: string;
  by?: string;
}

export const MOCK_CASES: EmergencyCase[] = [
  {
    id: "URG-2026-006",
    victimName: "Alice Mbuyi",
    age: 32,
    sex: "F",
    description: "Accouchement imminent, contractions toutes les 2 min, rupture des membranes",
    level: "critique",
    urgentisteName: "Dr. Nabintu",
    urgentistePhone: "+243 811 000 111",
    eta: "4 min",
    status: "en_attente",
    address: "Bandalungwa, Kinshasa",
    timestamp: "18:45",
    typeUrgence: "Obstétrique",
  },
  {
    id: "URG-2026-007",
    victimName: "Inconnu (Enfant)",
    age: 7,
    sex: "M",
    description: "Chute d'un arbre, possible fracture ouverte du fémur, pleleurs intenses",
    level: "urgent",
    urgentisteName: "Dr. Bakadi",
    urgentistePhone: "+243 811 222 999",
    eta: "15 min",
    status: "en_attente",
    address: "Lemba Echangeur",
    timestamp: "18:50",
    typeUrgence: "Pédiatrie",
  },
  {
    id: "URG-2026-008",
    victimName: "Samuel Mutombo",
    age: 68,
    sex: "M",
    description: "Détresse respiratoire sévère, antécédents d'asthme, cyanose des extrémités",
    level: "critique",
    urgentisteName: "Dr. Kapita",
    urgentistePhone: "+243 811 555 111",
    eta: "6 min",
    status: "en_attente",
    address: "Kintambo Magasin",
    timestamp: "18:52",
    typeUrgence: "Respiratoire",
  },
  {
    id: "URG-2026-001",
    victimName: "Jean Dupont",
    age: 45,
    sex: "M",
    description:
      "Suspicion d'infarctus, douleur thoracique intense irradiant bras gauche",
    level: "critique",
    urgentisteName: "Dr. Kabamba",
    urgentistePhone: "+243 811 222 333",
    eta: "5 min",
    status: "prise_en_charge",
    address: "Place Victoire, Kalamu",
    timestamp: "10:30",
    typeUrgence: "Cardiaque",
    interventions: [
      { id: "i1", type: "acte_medical", category: "Soin", detail: "VVP 18G posée", time: "10:45", by: "Inf. Sarah" },
      { id: "i2", type: "examen", category: "Diagnostic", detail: "ECG 12 dérivations - Tachycardie", time: "10:50", by: "Dr. Kabamba" },
      { id: "i3", type: "traitement", category: "Médicament", detail: "Aspirine 300mg + Clopidogrel 300mg", time: "11:00", by: "Dr. Kabamba" },
      { id: "i4", type: "examen", category: "Labo", detail: "Troponine en cours", time: "11:15", by: "Lab" },
    ],
  },
  {
    id: "URG-2026-002",
    victimName: "Marie Claire",
    age: 28,
    sex: "F",
    description:
      "Accident moto, plaie ouverte jambe droite, hémorragie contrôlée",
    level: "urgent",
    urgentisteName: "Dr. Mukendi",
    urgentistePhone: "+243 811 444 555",
    eta: "12 min",
    status: "en_cours",
    address: "Boulevard du 30 Juin",
    timestamp: "23:30",
    typeUrgence: "Traumatisme",
    interventions: [
      {
        id: "int1",
        type: "acte_medical",
        category: "Soin",
        detail: "Nettoyage et pansement compressif",
        time: "23:45",
        by: "Dr. Mukendi",
      },
    ],
  },
  {
    id: "URG-2026-003",
    victimName: "Inconnu",
    age: 60,
    sex: "Inconnu",
    description: "Trouvé inconscient sur la voie publique, pas de papiers",
    level: "critique",
    urgentisteName: "Dr. Lelo",
    urgentistePhone: "+243 811 666 777",
    eta: "2 min",
    status: "triage",
    address: "Gare Centrale, Gombe",
    timestamp: "11:05",
    typeUrgence: "Inconscience",
    arrivalTime: "11:15",
    arrivalMode: "ambulance",
    vitals: { tension: "90/60", heartRate: "120", temperature: "36.2", satO2: "88" },
    interventions: [
      { id: "i5", type: "acte_medical", category: "Urgence", detail: "Intubation et Ventilation Assistée", time: "11:20", by: "Dr. Lelo" },
    ],
  },
  {
    id: "URG-2026-004",
    victimName: "Pierre Kalonji",
    age: 35,
    sex: "M",
    description: "Brûlures 2ème degré visage et mains, explosion gaz",
    level: "urgent",
    urgentisteName: "Dr. Mpoy",
    urgentistePhone: "+243 811 888 999",
    eta: "8 min",
    status: "triage",
    address: "Marché Gambela",
    timestamp: "23:15",
    typeUrgence: "Brûlure",
    arrivalTime: "23:25",
    arrivalMode: "ambulance",
    arrivalState: "stable",
    admissionService: "trauma",
    interventions: [
      {
        id: "int2",
        type: "traitement",
        category: "Médicament",
        detail: "Morphine 5mg IV",
        time: "23:30",
        by: "Dr. Mpoy",
      },
      {
        id: "int3",
        type: "acte_medical",
        category: "Soin",
        detail: "Refroidissement et sulfadiazine argentique",
        time: "23:35",
        by: "Inf. Sarah",
      },
    ],
  },
  {
    id: "URG-2026-005",
    victimName: "Robert Nkolo",
    age: 55,
    sex: "M",
    description: "Chute de hauteur (3m), traumatisme crânien suspecté",
    level: "critique",
    urgentisteName: "Dr. Zola",
    urgentistePhone: "+243 822 333 444",
    eta: "5 min",
    status: "admis",
    address: "Ave Nguma, Ngaliema",
    timestamp: "11:30",
    typeUrgence: "Traumatisme",
    arrivalTime: "11:45",
    arrivalMode: "ambulance",
    interventions: [
      { id: "i6", type: "examen", category: "Imagerie", detail: "Scanner Corps Entier demandé", time: "11:55", by: "Dr. Zola" },
    ],
  },
];

export const getLevelConfig = (level: UrgencyLevel) => {
  switch (level) {
    case "critique":
      return {
        color: "#FF5252",
        bg: "rgba(255, 82, 82, 0.12)",
        label: "Critique",
        emoji: "🔴",
      };
    case "urgent":
      return {
        color: "#FF9800",
        bg: "rgba(255, 152, 0, 0.12)",
        label: "Urgent",
        emoji: "🟠",
      };
    case "stable":
      return {
        color: "#69F0AE",
        bg: "rgba(105, 240, 174, 0.12)",
        label: "Stable",
        emoji: "🟢",
      };
  }
};

export const getStatusConfig = (status: CaseStatus) => {
  switch (status) {
    case "en_attente":
      return {
        color: "#FF9800",
        bg: "rgba(255, 152, 0, 0.15)",
        label: "Signalé",
        icon: "hourglass-empty" as const,
      };
    case "en_cours":
      return {
        color: colors.secondary,
        bg: "rgba(56, 182, 255, 0.15)",
        label: "En route",
        icon: "local-shipping" as const,
      };
    case "admis":
      return {
        color: "#00E676",
        bg: "rgba(0, 230, 118, 0.15)",
        label: "Admis",
        icon: "check-circle" as const,
      };
    case "triage":
      return {
        color: "#E040FB",
        bg: "rgba(224, 64, 251, 0.15)",
        label: "Triage",
        icon: "assignment" as const,
      };
    case "prise_en_charge":
      return {
        color: "#00B0FF",
        bg: "rgba(0, 176, 255, 0.15)",
        label: "Soin",
        icon: "medical-services" as const,
      };
    case "termine":
      return {
        color: colors.textMuted,
        bg: "rgba(255, 255, 255, 0.05)",
        label: "Terminé",
        icon: "archive" as const,
      };
  }
};

export function HospitalDashboardTab({ navigation }: any) {
  const { profile } = useAuth();
  const { activeCases, isLoading } = useHospital();

  const { displayName, displayIdLine } = useMemo(() => {
    const name =
      profile?.first_name || profile?.last_name
        ? `${profile?.first_name ?? ""} ${profile?.last_name ?? ""}`.trim()
        : "";
    const displayNameResolved = name.length > 0 ? name : "Structure sanitaire";
    const displayIdLineResolved =
      profile?.agent_login_id != null &&
      String(profile.agent_login_id).length > 0
        ? `Identifiant : ${profile.agent_login_id}`
        : profile?.matricule != null && String(profile.matricule).length > 0
          ? `Matricule : ${profile.matricule}`
          : profile?.id != null
            ? `ID : ${profile.id.slice(0, 8)}…`
            : null;
    return { displayName: displayNameResolved, displayIdLine: displayIdLineResolved };
  }, [profile]);

  const [filter, setFilter] = useState<
    "all" | "en_attente" | "en_cours" | "termine"
  >("all");

  const filteredCases = activeCases.filter((c) => {
    if (filter === "all") return c.status !== "termine" && c.status !== "completed";
    return c.status === filter;
  });

  const criticalCount = activeCases.filter(
    (c) => c.level === "critique" && c.status !== "termine" && c.status !== "completed"
  ).length;
  const activeCount = activeCases.filter((c) =>
    ["en_cours", "triage", "prise_en_charge"].includes(c.status)
  ).length;

  return (
    <TabScreenSafeArea style={styles.safeArea}>
      <StatusBar barStyle="light-content" />

      <View style={styles.topHeader}>
        <View style={styles.headerRow}>
          <View style={styles.headerTextBlock}>
            <Text style={styles.greetingText}>Centre hospitalier</Text>
            {!profile ? (
              <ActivityIndicator
                color={colors.secondary}
                style={{ marginTop: 14, alignSelf: "flex-start" }}
              />
            ) : (
              <>
                <Text style={styles.hospitalName} numberOfLines={2}>
                  {displayName}
                </Text>
                {displayIdLine ? (
                  <Text style={styles.headerIdLine}>{displayIdLine}</Text>
                ) : null}
                {profile.address?.trim() ? (
                  <View style={styles.headerMetaRow}>
                    <MaterialIcons
                      name="location-on"
                      size={15}
                      color={colors.secondary}
                    />
                    <Text style={styles.headerMetaText} numberOfLines={2}>
                      {profile.address.trim()}
                    </Text>
                  </View>
                ) : null}
                {profile.phone?.trim() ? (
                  <View style={styles.headerMetaRow}>
                    <MaterialIcons
                      name="phone"
                      size={15}
                      color={colors.success}
                    />
                    <Text style={styles.headerMetaText} numberOfLines={1}>
                      {profile.phone.trim()}
                    </Text>
                  </View>
                ) : null}
                {profile.zone?.trim() ? (
                  <View style={styles.headerMetaRow}>
                    <MaterialIcons name="map" size={15} color="#90CAF9" />
                    <Text style={styles.headerMetaText} numberOfLines={1}>
                      {profile.zone.trim()}
                    </Text>
                  </View>
                ) : null}
              </>
            )}
          </View>
          <TouchableOpacity style={styles.notifBtn}>
            <MaterialCommunityIcons name="bell-badge-outline" color="#FFF" size={26} />
            <View style={styles.notifBadge} />
          </TouchableOpacity>
        </View>

        <View style={styles.summaryContainer}>
          <View style={[styles.mainSummaryCard, { backgroundColor: "#FF5252" }]}>
            <View style={styles.cardHeader}>
              <MaterialCommunityIcons name="alert-decagram" color="#FFF" size={22} />
              <Text style={styles.summaryLabel}>Urgences vitales</Text>
            </View>
            <Text style={styles.summaryNumber}>{criticalCount}</Text>
            <View style={styles.cardGlow} />
          </View>
          <View style={[styles.mainSummaryCard, { backgroundColor: colors.secondary }]}>
            <View style={styles.cardHeader}>
              <MaterialCommunityIcons name="account-clock" color="#FFF" size={22} />
              <Text style={styles.summaryLabel}>Admissions actives</Text>
            </View>
            <Text style={styles.summaryNumber}>{activeCount}</Text>
            <View style={styles.cardGlow} />
          </View>
        </View>
      </View>

      <ScrollView style={styles.scrollView} showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 24 }}>
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>Alertes récentes</Text>
          <View style={styles.filterOptions}>
            <TouchableOpacity onPress={() => setFilter("all")}><Text style={[styles.filterLabel, filter === "all" && styles.filterLabelActive]}>Tous</Text></TouchableOpacity>
            <TouchableOpacity onPress={() => setFilter("en_attente")}><Text style={[styles.filterLabel, filter === "en_attente" && styles.filterLabelActive]}>Signalés</Text></TouchableOpacity>
          </View>
        </View>

        {isLoading ? (
          <ActivityIndicator color={colors.secondary} style={{ marginTop: 40 }} />
        ) : filteredCases.length === 0 ? (
          <View style={{ alignItems: 'center', marginTop: 40 }}>
            <MaterialIcons name="inbox" size={48} color="rgba(255,255,255,0.2)" />
            <Text style={{ color: "rgba(255,255,255,0.4)", marginTop: 16 }}>Aucun cas à afficher</Text>
          </View>
        ) : (
          filteredCases.map((caseItem) => {
            const lCfg = getLevelConfig(caseItem.level);
            const sCfg = getStatusConfig(caseItem.status);
            return (
              <TouchableOpacity key={caseItem.id} style={styles.alertCard} onPress={() => navigation.navigate("HospitalCaseDetail", { caseData: caseItem })} activeOpacity={0.9}>
                <View style={styles.cardInfo}>
                  <View style={styles.cardHeaderRow}>
                    <View style={styles.timePill}><MaterialCommunityIcons name="clock-outline" color="rgba(255,255,255,0.4)" size={14} /><Text style={styles.timeText}>{caseItem.timestamp}</Text></View>
                    <View style={[styles.levelTag, { borderColor: lCfg?.color }]}><Text style={[styles.levelLabelText, { color: lCfg?.color }]}>{lCfg?.label}</Text></View>
                  </View>
                  <Text style={styles.victimName}>{caseItem.victimName}</Text>
                  <Text style={styles.urgencyType}>{caseItem.typeUrgence?.toUpperCase()}</Text>
                  <View style={styles.locationInfo}><MaterialIcons name="location-on" color={colors.secondary} size={16} /><Text style={styles.addressText} numberOfLines={1}>{caseItem.address}</Text></View>
                  <View style={styles.cardDivider} />
                  <View style={styles.cardFooterRow}>
                    {sCfg && <View style={[styles.statusBadge, { backgroundColor: sCfg.bg }]}><MaterialIcons name={sCfg.icon} color={sCfg.color} size={14} /><Text style={[styles.statusBadgeText, { color: sCfg.color }]}>{sCfg.label}</Text></View>}
                    <View style={styles.etaContainer}><Text style={styles.etaLabel}>Arrivée : </Text><Text style={styles.etaValue}>{caseItem.eta}</Text></View>
                  </View>
                </View>
                <View style={styles.arrowContainer}><MaterialIcons name="chevron-right" color="rgba(255,255,255,0.2)" size={24} /></View>
              </TouchableOpacity>
            );
          })
        )}
      </ScrollView>
    </TabScreenSafeArea>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: colors.mainBackground },
  topHeader: { paddingHorizontal: 24, paddingTop: 16, paddingBottom: 24, borderBottomLeftRadius: 36, borderBottomRightRadius: 36, backgroundColor: "#0A0A0A" },
  headerRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 24 },
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
  notifBtn: { width: 50, height: 50, borderRadius: 18, backgroundColor: "#1A1A1A", justifyContent: "center", alignItems: "center", borderWidth: 1, borderColor: "rgba(255,255,255,0.1)" },
  notifBadge: { position: "absolute", top: 14, right: 14, width: 10, height: 10, borderRadius: 5, backgroundColor: "#FF5252", borderWidth: 2, borderColor: "#1A1A1A" },
  summaryContainer: { flexDirection: "row", gap: 12 },
  mainSummaryCard: { flex: 1, height: 110, borderRadius: 28, padding: 20, overflow: "hidden", justifyContent: "center" },
  cardHeader: { flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 8 },
  summaryLabel: { color: "rgba(255,255,255,0.8)", fontSize: 12, fontWeight: "900", letterSpacing: 0.5 },
  summaryNumber: { color: "#FFF", fontSize: 36, fontWeight: "900" },
  cardGlow: { position: "absolute", right: -20, bottom: -20, width: 80, height: 80, borderRadius: 40, backgroundColor: "rgba(255,255,255,0.15)" },
  scrollView: { flex: 1 },
  sectionHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingHorizontal: 24, marginVertical: 20 },
  sectionTitle: { color: "#FFF", fontSize: 18, fontWeight: "600" },
  filterOptions: { flexDirection: "row", gap: 16 },
  filterLabel: { color: "rgba(255,255,255,0.3)", fontSize: 13, fontWeight: "800" },
  filterLabelActive: { color: colors.secondary },
  alertCard: { backgroundColor: "#1A1A1A", marginHorizontal: 20, borderRadius: 32, padding: 22, flexDirection: "row", alignItems: "center", marginBottom: 16, borderWidth: 1, borderColor: "rgba(255,255,255,0.05)" },
  cardInfo: { flex: 1 },
  cardHeaderRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 16 },
  timePill: { flexDirection: "row", alignItems: "center", gap: 6, backgroundColor: "rgba(255,255,255,0.05)", paddingHorizontal: 10, paddingVertical: 6, borderRadius: 12 },
  timeText: { color: "rgba(255,255,255,0.6)", fontSize: 12, fontWeight: "700" },
  levelTag: { borderWidth: 1, paddingHorizontal: 10, paddingVertical: 4, borderRadius: 10 },
  levelLabelText: { fontSize: 12, fontWeight: "900", letterSpacing: 0.5 },
  victimName: { color: "#FFF", fontSize: 20, fontWeight: "900", marginBottom: 4 },
  urgencyType: { color: colors.secondary, fontSize: 12, fontWeight: "800", letterSpacing: 1, marginBottom: 10 },
  locationInfo: { flexDirection: "row", alignItems: "center", gap: 8 },
  addressText: { color: "rgba(255,255,255,0.4)", fontSize: 13, fontWeight: "600" },
  cardDivider: { height: 1, backgroundColor: "rgba(255,255,255,0.05)", marginVertical: 18 },
  cardFooterRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  statusBadge: { flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: 12, paddingVertical: 8, borderRadius: 14 },
  statusBadgeText: { fontSize: 13, fontWeight: "800" },
  etaContainer: { flexDirection: "row", alignItems: "center" },
  etaLabel: { color: "rgba(255,255,255,0.3)", fontSize: 13, fontWeight: "800" },
  etaValue: { color: "#FFF", fontSize: 16, fontWeight: "900" },
  arrowContainer: { marginLeft: 16 },
});
