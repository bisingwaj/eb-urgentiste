import React, { useCallback, useMemo, useState } from "react";
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
  Platform} from "react-native";
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

export type UrgencyLevel = "critique" | "urgent" | "stable";
export type CaseStatus =
  | "en_attente"
  | "en_cours"
  | "arrived"
  | "handedOver"
  | "admis"
  | "triage"
  | "prise_en_charge"
  | "monitoring"
  | "termine";

/** Terminé ou Sorti du périmètre actif */
const isCaseClosed = (c: EmergencyCase) => 
  ['termine', 'handedOver'].includes(c.status); 

/** Valeurs `hospital_data.monitoringStatus` (spec Lovable) */
export type MonitoringPatientStatus = "amelioration" | "stable" | "degradation";

/** Sortie patient — spec Lovable (`hospital_data.dischargeType`) */
export type LovableDischargeType =
  | "guerison"
  | "transfert"
  | "deces"
  | "sortie_contre_avis";

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
  distance?: string;
  status: CaseStatus;
  address: string;
  timestamp: string;
  typeUrgence: string; // Ex: Traumatisme, Cardiaque, Obstétrique
  unitId?: string;
  /** Valeur brute `dispatches.status` (ex. `en_route_hospital`) — utile pour l’UI et le debug */
  dispatchStatus?: string;
  /** `dispatches.completed_at` — tri / KPIs historique */
  completedAt?: string;
  /** `dispatches.created_at` ISO — durée de prise en charge */
  dispatchCreatedAt?: string;
  /** Coordonnées de la structure assignée (`dispatches.assigned_structure_*`) — destination carte / itinéraire */
  assignedStructureLat?: number;
  assignedStructureLng?: number;
  /** `dispatches.assigned_structure_name` — libellé carte / UI */
  assignedStructureName?: string;

  /** `incidents.id` — FK pour rapports / historique */
  incidentId?: string;
  /** Référence métier (`incidents.reference`) */
  incidentReference?: string;
  /** Téléphone laissé au signalement (`incidents.caller_phone`) */
  callerPhone?: string;
  /** Contact GSM unité — renseigné si la colonne existe côté Supabase (sinon UI sans numéro unité) */
  unitPhone?: string;
  unitVehicleType?: string;
  unitVehiclePlate?: string;
  /** Agent principal renseigné sur l’unité (`units.agent_name`) */
  unitAgentName?: string;

  // Hospital Assignment fields
  hospitalStatus?: HospitalStatus;
  hospitalNotes?: string;
  hospitalRespondedAt?: string;
  /** Le statut clinique interne déclaré par l'hôpital (ex: 'admis', 'triage', 'termine') */
  hospitalDetailStatus?: string;

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
  /** Aligné sur les codes « mode de transport » urgentiste (`AMBULANCE` | `SMUR` | `MOTO` | `PERSONNEL`) */
  arrivalMode?: TransportModeCode | "";
  arrivalState?: "stable" | "critique" | "inconscient" | "";
  admissionService?: "urgence_generale" | "trauma" | "pediatrie" | "";
  // Triage fields
  triageLevel?: "rouge" | "orange" | "jaune" | "vert" | "";
  vitals?: {
    tension?: string;
    heartRate?: string;
    temperature?: string;
    satO2?: string;
    bloodPressure?: string;
    spO2?: string;
    respiratoryRate?: string;
    glasgowScore?: string;
    painScore?: string;
    weight?: string;
  };
  /** Bilan structuré de l'urgentiste (conscient, respiration, etc.) */
  medicalAssessment?: Record<string, any>;
  /** Liste des soins prodigués par l'urgentiste (careChecklist) */
  careChecklist?: string[];
  /** Symptômes — chaîne ou liste (JSON `hospital_data`) */
  symptoms?: string | string[];
  provisionalDiagnosis?: string;
  triageNotes?: string;
  triageRecordedAt?: string;
  admittedAt?: string;
  // Prise en charge (JSON `hospital_data` — tableaux persistés par `HospitalPriseEnChargeScreen`)
  observations?: unknown[];
  treatments?: unknown[];
  exams?: unknown[];
  timeline?: unknown[];
  /** Résumés dashboard Lovable (`treatment` / `notes` dans `hospital_data`) */
  pecTreatmentSummary?: string;
  pecNotesSummary?: string;
  /** Suivi monitoring (`hospital_data` — spec Lovable) */
  monitoringStatus?: MonitoringPatientStatus;
  monitoringNotes?: string;
  transferTarget?: string | null;
  interventions?: Intervention[];
  // Closure
  outcome?: "hospitalise" | "sorti" | "decede" | string;
  /** Spec Lovable — prioritaire sur `outcome` pour le dashboard */
  dischargeType?: LovableDischargeType;
  dischargedAt?: string;
  finalDiagnosis?: string;
  closureTime?: string;
  reportSent?: boolean;
  reportSentAt?: string;
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
    arrivalMode: "AMBULANCE",
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
    arrivalMode: "AMBULANCE",
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
    arrivalMode: "AMBULANCE",
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
    case "arrived":
      return {
        color: "#E040FB",
        bg: "rgba(224, 64, 251, 0.15)",
        label: "Arrivé",
        icon: "place" as const,
      };
    case "handedOver":
      return {
        color: colors.textMuted,
        bg: "rgba(255, 255, 255, 0.05)",
        label: "Remis",
        icon: "transfer-within-a-station" as const,
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
    case "monitoring":
      return {
        color: "#B388FF",
        bg: "rgba(179, 136, 255, 0.15)",
        label: "Suivi",
        icon: "favorite" as const,
      };
    case "termine":
      return {
        color: colors.textMuted,
        bg: "rgba(255, 255, 255, 0.05)",
        label: "Sorti",
        icon: "archive" as const,
      };
  }
};

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
    try {
      await updateCaseStatus(caseId, { hospitalStatus: 'accepted' });
      // On ne navigue plus vers le détail pour rester sur le dashboard (stay on dashboard)
    } catch (err) {
      console.error("[Dashboard] Error accepting case:", err);
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
