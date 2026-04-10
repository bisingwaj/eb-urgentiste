import React, { useState, useEffect, useRef } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Dimensions,
  TextInput,
  ActivityIndicator,
  StatusBar,
  Modal,
  KeyboardAvoidingView,
  Platform,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { MaterialIcons, MaterialCommunityIcons } from "@expo/vector-icons";
import { colors } from "../../theme/colors";
import type { EmergencyCase } from "./HospitalDashboardTab";
import { useHospital } from "../../contexts/HospitalContext";

const { width, height } = Dimensions.get("window");

interface TimelineEntry {
  id: string;
  time: string;
  action: string;
  user: string;
  type: "action" | "test" | "medication" | "status" | "alert";
  isTreatment?: boolean;
}

interface Observation {
  id: string;
  time: string;
  text: string;
  status: "Amélioration" | "Stable" | "Aggravation";
}

interface Exam {
  id: string;
  label: string;
  status: "Planifié" | "En cours" | "Fait" | "En attente";
  result?: string;
  time: string;
}

interface Treatment {
  id: string;
  name: string;
  time: string;
  user: string;
}

type TabType = "PC" | "EXAMENS" | "TIMELINE";
type ModalType = "note" | "exam_add" | "exam_edit" | "treatment_add";

export function HospitalPriseEnChargeScreen({ route, navigation }: any) {
  const { caseData } = route.params as { caseData: EmergencyCase };
  const { updateCaseStatus } = useHospital();
  const insets = useSafeAreaInsets();
  const scrollRef = useRef<ScrollView>(null);

  const [activeTab, setActiveTab] = useState<TabType>("PC");
  const [timer, setTimer] = useState(0);

  // Modal State
  const [modalType, setModalType] = useState<ModalType | null>(null);
  const [newText, setNewText] = useState("");
  const [examStatus, setExamStatus] = useState<Exam["status"]>("Planifié");
  const [noteStatus, setNoteStatus] = useState<"Amélioration" | "Stable" | "Aggravation">("Stable");
  const [selectedExam, setSelectedExam] = useState<Exam | null>(null);

  const [observations, setObservations] = useState<Observation[]>(() =>
    Array.isArray(caseData.observations) ? (caseData.observations as Observation[]) : [],
  );

  const [treatments, setTreatments] = useState<Treatment[]>(() =>
    Array.isArray(caseData.treatments) ? (caseData.treatments as Treatment[]) : [],
  );

  const [exams, setExams] = useState<Exam[]>(() =>
    Array.isArray(caseData.exams) ? (caseData.exams as Exam[]) : [],
  );

  const [timeline, setTimeline] = useState<TimelineEntry[]>(() =>
    Array.isArray(caseData.timeline) ? (caseData.timeline as TimelineEntry[]) : [],
  );

  const [isSyncing, setIsSyncing] = useState(false);

  useEffect(() => {
    const interval = setInterval(() => setTimer((prev) => prev + 1), 1000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    scrollRef.current?.scrollTo({ y: 0, animated: true });
  }, [activeTab]);

  const formatTime = (seconds: number) => {
    const min = Math.floor(seconds / 60);
    const sec = seconds % 60;
    return `${min}:${sec < 10 ? "0" : ""}${sec}`;
  };

  const syncDataToDB = async (newData: any) => {
    try {
      setIsSyncing(true);
      const mergedObs = Array.isArray(newData.observations) ? newData.observations : observations;
      const mergedTreatments = Array.isArray(newData.treatments) ? newData.treatments : treatments;
      const treatmentSummary = mergedTreatments.map((t: Treatment) => t.name).filter(Boolean).join(' · ');
      const notesSummary = (mergedObs[0] as Observation | undefined)?.text?.trim() ?? '';
      await updateCaseStatus(caseData.id, {
        status: 'prise_en_charge',
        data: {
          ...newData,
          ...(treatmentSummary ? { treatment: treatmentSummary.slice(0, 4000) } : {}),
          ...(notesSummary ? { notes: notesSummary.slice(0, 4000) } : {}),
        },
      });
    } catch (err) {
      console.error('Erreur synchronisation', err);
    } finally {
      setIsSyncing(false);
    }
  };

  const addTimelineEntry = (action: string, type: TimelineEntry["type"], isTreatment = false) => {
    const now = new Date();
    const timeStr = `${now.getHours()}:${now.getMinutes() < 10 ? "0" : ""}${now.getMinutes()}`;
    const newEntry = { id: Math.random().toString(), time: timeStr, action, user: "Dr. Kabamba", type, isTreatment };
    const newTimeline = [newEntry, ...timeline];
    setTimeline(newTimeline);
    syncDataToDB({ timeline: newTimeline });
  };

  const handleSave = () => {
    if (!newText.trim() && modalType !== "exam_edit") return;
    const now = new Date();
    const timeStr = `${now.getHours()}:${now.getMinutes() < 10 ? "0" : ""}${now.getMinutes()}`;
    const updatePayload: Record<string, unknown> = {};

    if (modalType === "note") {
      const newObs: Observation = { id: Math.random().toString(), time: timeStr, text: newText, status: noteStatus };
      const updatedObs = [newObs, ...observations];
      setObservations(updatedObs);
      updatePayload.observations = updatedObs;
      const entry: TimelineEntry = {
        id: Math.random().toString(),
        time: timeStr,
        action: `Note: ${noteStatus}`,
        user: "Dr. Kabamba",
        type: "status",
      };
      const newTimeline = [entry, ...timeline];
      setTimeline(newTimeline);
      updatePayload.timeline = newTimeline;
    } else if (modalType === "exam_add") {
      const newE: Exam = { id: Math.random().toString(), label: newText, status: examStatus, time: timeStr };
      const updatedExams = [newE, ...exams];
      setExams(updatedExams);
      updatePayload.exams = updatedExams;
      const entry: TimelineEntry = {
        id: Math.random().toString(),
        time: timeStr,
        action: `Exam demandé: ${newText}`,
        user: "Dr. Kabamba",
        type: "test",
      };
      const newTimeline = [entry, ...timeline];
      setTimeline(newTimeline);
      updatePayload.timeline = newTimeline;
    } else if (modalType === "exam_edit" && selectedExam) {
      const updatedExams = exams.map((e) =>
        e.id === selectedExam.id ? { ...e, status: examStatus, result: newText || e.result } : e,
      );
      setExams(updatedExams);
      updatePayload.exams = updatedExams;
      const entry: TimelineEntry = {
        id: Math.random().toString(),
        time: timeStr,
        action: `Exam mis à jour: ${selectedExam.label}`,
        user: "Dr. Kabamba",
        type: "test",
      };
      const newTimeline = [entry, ...timeline];
      setTimeline(newTimeline);
      updatePayload.timeline = newTimeline;
    } else if (modalType === "treatment_add") {
      const newT: Treatment = { id: Math.random().toString(), name: newText, time: timeStr, user: "Dr. Kabamba" };
      const updatedT = [newT, ...treatments];
      setTreatments(updatedT);
      updatePayload.treatments = updatedT;
      const entry: TimelineEntry = {
        id: Math.random().toString(),
        time: timeStr,
        action: `Traitement: ${newText}`,
        user: "Dr. Kabamba",
        type: "medication",
        isTreatment: true,
      };
      const newTimeline = [entry, ...timeline];
      setTimeline(newTimeline);
      updatePayload.timeline = newTimeline;
    }

    void syncDataToDB(updatePayload);

    setNewText("");
    setModalType(null);
    setSelectedExam(null);
  };

  const openExamEdit = (exam: Exam) => {
    setSelectedExam(exam);
    setNewText(exam.result || "");
    setExamStatus(exam.status);
    setModalType("exam_edit");
  };

  const getModalConfig = () => {
    switch (modalType) {
      case "note": return { title: "Nouvelle Observation", placeholder: "Décrivez l'état du patient...", btn: "ENREGISTRER LA NOTE", icon: "edit" };
      case "exam_add": return { title: "Ajouter un Examen", placeholder: "Scanner, Bilan sanguin, Radio...", btn: "DEMANDER L'EXAMEN", icon: "search" };
      case "exam_edit": return { title: selectedExam?.label || "Résultat d'Examen", placeholder: "Saisir le compte-rendu...", btn: "METTRE À JOUR", icon: "assignment" };
      case "treatment_add": return { title: "Prescrire un Traitement", placeholder: "Médicament, Dosage (ex: Ceftriaxone 2g IV)...", btn: "VALIDER LE TRAITEMENT", icon: "medication" };
      default: return { title: "", placeholder: "", btn: "", icon: "" };
    }
  };

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : "height"}>
    <View style={styles.container}>
      <StatusBar barStyle="light-content" />

      {/* 🔝 HEADER */}
      <View style={[styles.header, { paddingTop: insets.top + 8 }]}>
        <View style={styles.headerRow}>
          <TouchableOpacity onPress={() => navigation.goBack()} style={styles.closeBtn}>
            <MaterialIcons name="close" color="#FFF" size={22} />
          </TouchableOpacity>
          <View style={styles.headerTitleBox}>
            <Text style={styles.patientName} numberOfLines={1}>{caseData.victimName}</Text>
            <Text style={styles.caseMeta}>{caseData.id} · {caseData.age} ans</Text>
          </View>
          <View style={styles.headerTimer}>
            <MaterialIcons name="timer" color={colors.secondary} size={14} />
            <Text style={styles.timerText}>{formatTime(timer)}</Text>
          </View>
        </View>
      </View>

      <View style={styles.tabBar}>
        {([
          { id: "PC", label: "PRISE EN CHARGE" },
          { id: "EXAMENS", label: "EXAMENS" },
          { id: "TIMELINE", label: "HISTORIQUE" }
        ] as any[]).map((t) => (
          <TouchableOpacity key={t.id} style={[styles.tabItem, activeTab === t.id && styles.tabItemActive]} onPress={() => setActiveTab(t.id)}>
            <Text style={[styles.tabLabel, activeTab === t.id && styles.tabLabelActive]}>{t.label}</Text>
            {activeTab === t.id && <View style={styles.tabIndicator} />}
          </TouchableOpacity>
        ))}
      </View>

      <ScrollView
        ref={scrollRef}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={[
          styles.scrollContent,
          { paddingBottom: Math.max(insets.bottom, 16) + 88 },
        ]}
      >
        {activeTab === "PC" && (
          <View style={styles.tabContent}>

            {/* 🩺 SECTION 1 : SOINS (CARE / SUPPORT) */}
            <View style={styles.sectionHeaderRow}>
              <View style={styles.sectionTitleGroup}>
                <MaterialCommunityIcons name="stethoscope" color={colors.secondary} size={18} />
                <Text style={styles.sectionTitle}>SOINS DE SUPPORT (CARE)</Text>
              </View>
            </View>
            <View style={styles.careCard}>
              <CareItem label="Oxygénothérapie" icon="fan" onToggle={(v) => addTimelineEntry(v ? "O2 branché" : "O2 débranché", "action")} />
              <CareItem label="Perfusion (IV Fluids)" icon="water" onToggle={(v) => addTimelineEntry(v ? "VVP branchée" : "VVP stoppée", "action")} />
              <CareItem label="Monitoring Vital" icon="heart-pulse" onToggle={(v) => addTimelineEntry(v ? "Monitoring actif" : "Monitoring coupé", "action")} />
              <CareItem label="Soins de plaie" icon="medical-bag" onToggle={(v) => addTimelineEntry(v ? "Plaie nettoyée" : "Soin terminé", "action")} />
            </View>

            {/* 💊 SECTION 2 : TRAITEMENTS (TREATMENT / CURE) */}
            <View style={[styles.sectionHeaderRow, { marginTop: 24 }]}>
              <View style={styles.sectionTitleGroup}>
                <MaterialCommunityIcons name="pill" color="#FF5252" size={18} />
                <Text style={[styles.sectionTitle, { color: "#FF5252" }]}>TRAITEMENTS CURATIFS</Text>
              </View>
              <TouchableOpacity style={styles.addTreatmentBtn} onPress={() => setModalType("treatment_add")}>
                <MaterialIcons name="add" color="#FFF" size={20} />
                <Text style={styles.addTreatmentLabel}>AJOUTER</Text>
              </TouchableOpacity>
            </View>
            <View style={styles.treatmentList}>
              {treatments.map(t => (
                <View key={t.id} style={styles.treatmentCard}>
                  <View style={styles.treatmentIconBox}>
                    <MaterialCommunityIcons name="pill" color="#FF5252" size={20} />
                  </View>
                  <View style={styles.treatmentInfo}>
                    <Text style={styles.treatmentName}>{t.name}</Text>
                    <Text style={styles.treatmentMeta}>{t.time} · {t.user}</Text>
                  </View>
                  <MaterialIcons name="check-circle" color="rgba(255,82,82,0.3)" size={20} />
                </View>
              ))}
            </View>

            {/* 📝 SECTION 3 : ÉVOLUTION */}
            <View style={[styles.sectionHeaderRow, { marginTop: 32 }]}>
              <Text style={styles.groupLabel}>ÉVOLUTION & NOTES</Text>
              <TouchableOpacity style={styles.addSmallCircleBtn} onPress={() => setModalType("note")}>
                <MaterialIcons name="add" color="#FFF" size={18} />
              </TouchableOpacity>
            </View>
            <View style={styles.observationList}>
              {observations.map((obs) => (
                <View key={obs.id} style={styles.obsCard}>
                  <View style={styles.obsHeader}>
                    <View style={[styles.obsStatusDot, { backgroundColor: getStatusColor(obs.status) }]} />
                    <Text style={[styles.obsStatusText, { color: getStatusColor(obs.status) }]}>{obs.status}</Text>
                    <Text style={styles.obsTime}>{obs.time}</Text>
                  </View>
                  <Text style={styles.obsText}>{obs.text}</Text>
                </View>
              ))}
            </View>
          </View>
        )}

        {activeTab === "EXAMENS" && (
          <View style={styles.tabContent}>
            <View style={styles.sectionHeaderRow}>
              <Text style={styles.groupLabel}>DEMANDES D'EXAMENS</Text>
              <TouchableOpacity style={styles.addSmallCircleBtn} onPress={() => { setModalType("exam_add"); setExamStatus("Planifié"); }}>
                <MaterialIcons name="add" color="#FFF" size={18} />
              </TouchableOpacity>
            </View>
            <View style={styles.card}>
              {exams.map((exam) => (
                <TouchableOpacity key={exam.id} onPress={() => openExamEdit(exam)}>
                  <ExamRow label={exam.label} status={exam.status} result={exam.result} />
                </TouchableOpacity>
              ))}
            </View>
          </View>
        )}

        {activeTab === "TIMELINE" && (
          <View style={styles.tabContent}>
            <Text style={styles.groupLabel}>HISTORIQUE COMPLET</Text>
            <View style={styles.timelineBox}>
              {timeline.map((item, idx) => (
                <TimelineItem key={item.id} item={item} isLast={idx === timeline.length - 1} />
              ))}
            </View>
          </View>
        )}
      </ScrollView>

      <View style={[styles.pecBottomBar, { paddingBottom: Math.max(insets.bottom, 16) }]}>
        <TouchableOpacity
          style={styles.pecNextBtn}
          onPress={() => navigation.navigate('HospitalMonitoring', { caseData })}
          activeOpacity={0.9}
        >
          <MaterialCommunityIcons name="heart-pulse" color="#000" size={22} />
          <Text style={styles.pecNextBtnText}>Passer au monitoring patient</Text>
          <MaterialIcons name="chevron-right" color="#000" size={24} />
        </TouchableOpacity>
      </View>

      {/* 📝 MODAL */}
      <Modal visible={modalType !== null} animationType="slide" transparent={true} onRequestClose={() => setModalType(null)}>
        <View style={styles.modalOverlay}>
          <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : "height"} style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <View style={styles.modalTitleBox}>
                <MaterialIcons name={getModalConfig().icon as any} color={colors.secondary} size={20} />
                <Text style={styles.modalTitle}>{getModalConfig().title}</Text>
              </View>
              <TouchableOpacity onPress={() => setModalType(null)}>
                <MaterialIcons name="close" color="rgba(255,255,255,0.4)" size={24} />
              </TouchableOpacity>
            </View>

            <TextInput
              style={styles.modalInput}
              placeholder={getModalConfig().placeholder}
              placeholderTextColor="rgba(255,255,255,0.3)"
              multiline
              autoFocus
              value={newText}
              onChangeText={setNewText}
            />

            {modalType === "note" && (
              <View style={styles.modalStatusRow}>
                {(["Amélioration", "Stable", "Aggravation"] as const).map(s => (
                  <TouchableOpacity key={s} style={[styles.modalStatusBtn, noteStatus === s && { backgroundColor: getStatusColor(s) }]} onPress={() => setNoteStatus(s)}>
                    <Text style={[styles.modalStatusText, noteStatus === s && { color: "#000" }]}>{s}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            )}

            <TouchableOpacity style={[styles.saveBtn, modalType === "treatment_add" && { backgroundColor: "#FF5252" }]} onPress={handleSave}>
              <Text style={styles.saveBtnText}>{getModalConfig().btn}</Text>
            </TouchableOpacity>
          </KeyboardAvoidingView>
        </View>
      </Modal>
    </View>
    </KeyboardAvoidingView>
  );
}

const CareItem = ({ label, icon, onToggle }: { label: string; icon: string; onToggle: (v: boolean) => void }) => {
  const [active, setActive] = useState(false);
  return (
    <TouchableOpacity style={[styles.careRow, active && styles.careRowActive]} onPress={() => { setActive(!active); onToggle(!active); }}>
      <View style={styles.careIconBox}>
        <MaterialCommunityIcons name={icon as any} color={active ? "#FFF" : "rgba(255,255,255,0.4)"} size={20} />
      </View>
      <Text style={[styles.careLabel, active && { color: "#FFF" }]}>{label}</Text>
      <MaterialIcons name={active ? "check-circle" : "radio-button-unchecked"} color={active ? colors.success : "rgba(255,255,255,0.1)"} size={22} />
    </TouchableOpacity>
  );
}

const ExamRow = ({ label, status, result }: { label: string; status: string; result?: string }) => (
  <View style={styles.examRow}>
    <View style={{ flex: 1 }}><Text style={styles.examLabel}>{label}</Text>{result && <Text style={styles.examResult}>{result}</Text>}</View>
    <View style={[styles.statusTag, { backgroundColor: getExamStatusBg(status) }]}>
      <Text style={[styles.examStatus, { color: getExamStatusColor(status) }]}>{status}</Text>
    </View>
  </View>
);

const TimelineItem = ({ item, isLast }: { item: TimelineEntry; isLast: boolean }) => (
  <View style={styles.timeItem}>
    <View style={styles.timeLineCol}>
      <View style={[styles.timeDot, { backgroundColor: item.isTreatment ? "#FF5252" : getCol(item.type) }]} />
      {!isLast && <View style={styles.timeLine} />}
    </View>
    <View style={styles.timeContent}>
      <View style={styles.timeHeader}>
        <View style={styles.actionNameRow}>
          {item.isTreatment && <MaterialCommunityIcons name="pill" color="#FF5252" size={14} style={{ marginRight: 6 }} />}
          <Text style={styles.actionName}>{item.action}</Text>
        </View>
        <Text style={styles.actionTime}>{item.time}</Text>
      </View>
      <Text style={styles.actionUser}>{item.user}</Text>
    </View>
  </View>
);

const getExamStatusColor = (s: string) => s === "Fait" ? colors.success : s === "En cours" ? colors.secondary : "rgba(255,255,255,0.4)";
const getExamStatusBg = (s: string) => s === "Fait" ? "rgba(105, 240, 174, 0.1)" : s === "En cours" ? "rgba(56, 182, 255, 0.1)" : "rgba(255,255,255,0.05)";
const getStatusColor = (s: string) => s === "Amélioration" ? colors.success : s === "Aggravation" ? "#FF5252" : colors.secondary;
const getCol = (type: string) => type === "action" ? colors.secondary : type === "test" ? "#E040FB" : type === "medication" ? colors.success : "rgba(255,255,255,0.2)";

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.mainBackground },
  pecBottomBar: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    paddingHorizontal: 20,
    paddingTop: 12,
    backgroundColor: colors.mainBackground,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255,255,255,0.05)',
  },
  pecNextBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    paddingVertical: 16,
    borderRadius: 28,
    backgroundColor: colors.secondary,
  },
  pecNextBtnText: { color: '#000', fontWeight: '900', fontSize: 15, textAlign: 'center', paddingHorizontal: 8 },
  header: { backgroundColor: "#000", paddingHorizontal: 20, paddingBottom: 16 },
  headerRow: { flexDirection: "row", alignItems: "center", marginBottom: 12 },
  closeBtn: { width: 32, height: 32, justifyContent: "center" },
  headerTitleBox: { flex: 1 },
  patientName: { color: "#FFF", fontSize: 16, fontWeight: "800" },
  caseMeta: { color: "rgba(255,255,255,0.4)", fontSize: 13, fontWeight: "600" },
  headerTimer: { flexDirection: "row", alignItems: "center", gap: 6, backgroundColor: "rgba(56, 182, 255, 0.1)", paddingHorizontal: 10, paddingVertical: 4, borderRadius: 8 },
  timerText: { color: colors.secondary, fontSize: 14, fontWeight: "900", fontVariant: ["tabular-nums"] },
  tabBar: { flexDirection: "row", backgroundColor: "#000", paddingHorizontal: 10 },
  tabItem: { flex: 1, height: 44, justifyContent: "center", alignItems: "center" },
  tabItemActive: { borderBottomWidth: 3, borderBottomColor: colors.secondary },
  tabLabel: { color: "rgba(255,255,255,0.3)", fontSize: 13, fontWeight: "800" },
  tabLabelActive: { color: colors.secondary, fontWeight: "900" },
  tabIndicator: {},
  scrollContent: { paddingBottom: 24 },
  tabContent: { padding: 20 },
  sectionHeaderRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 16 },
  sectionTitleGroup: { flexDirection: "row", alignItems: "center", gap: 8 },
  sectionTitle: { color: colors.secondary, fontSize: 12, fontWeight: "900", letterSpacing: 1 },
  careCard: { backgroundColor: "#1A1A1A", borderRadius: 24, padding: 8, borderWidth: 1, borderColor: "rgba(255,255,255,0.03)" },
  careRow: { flexDirection: "row", alignItems: "center", padding: 12, borderRadius: 16, marginBottom: 4 },
  careRowActive: { backgroundColor: "rgba(56, 182, 255, 0.08)" },
  careIconBox: { width: 36, height: 36, borderRadius: 12, backgroundColor: "rgba(255,255,255,0.03)", justifyContent: "center", alignItems: "center", marginRight: 12 },
  careLabel: { color: "rgba(255,255,255,0.4)", fontSize: 14, fontWeight: "600", flex: 1 },
  addTreatmentBtn: { flexDirection: "row", alignItems: "center", gap: 6, backgroundColor: "rgba(255, 82, 82, 0.15)", paddingHorizontal: 12, paddingVertical: 6, borderRadius: 10 },
  addTreatmentLabel: { color: "#FF5252", fontSize: 13, fontWeight: "900" },
  treatmentList: { gap: 10 },
  treatmentCard: { flexDirection: "row", alignItems: "center", backgroundColor: "#1A1A1A", padding: 16, borderRadius: 20, borderWidth: 1, borderColor: "rgba(255,255,255,0.05)" },
  treatmentIconBox: { width: 40, height: 40, borderRadius: 14, backgroundColor: "rgba(255, 82, 82, 0.1)", justifyContent: "center", alignItems: "center", marginRight: 16 },
  treatmentInfo: { flex: 1 },
  treatmentName: { color: "#FFF", fontSize: 15, fontWeight: "700" },
  treatmentMeta: { color: "rgba(255,255,255,0.3)", fontSize: 13, marginTop: 2 },
  groupLabel: { color: "rgba(255,255,255,0.3)", fontSize: 12, fontWeight: "900", letterSpacing: 1 },
  addSmallCircleBtn: { width: 30, height: 30, borderRadius: 10, backgroundColor: "rgba(255,255,255,0.05)", justifyContent: "center", alignItems: "center" },
  observationList: { gap: 12, marginTop: 16 },
  obsCard: { backgroundColor: "#1A1A1A", borderRadius: 20, padding: 16, borderWidth: 1, borderColor: "rgba(255,255,255,0.05)" },
  obsHeader: { flexDirection: "row", alignItems: "center", marginBottom: 8, gap: 8 },
  obsStatusDot: { width: 8, height: 8, borderRadius: 4 },
  obsStatusText: { fontSize: 13, fontWeight: "900", flex: 1 },
  obsTime: { color: "rgba(255,255,255,0.3)", fontSize: 13, fontWeight: "700" },
  obsText: { color: "#FFF", fontSize: 14, lineHeight: 20 },
  card: { backgroundColor: "#1A1A1A", borderRadius: 24, padding: 8, borderWidth: 1, borderColor: "rgba(255,255,255,0.03)" },
  examRow: { flexDirection: "row", alignItems: "center", padding: 16, borderBottomWidth: 1, borderBottomColor: "rgba(255,255,255,0.02)" },
  examLabel: { color: "#FFF", fontSize: 14, fontWeight: "700" },
  examResult: { color: colors.secondary, fontSize: 12, marginTop: 2 },
  statusTag: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 8 },
  examStatus: { fontSize: 13, fontWeight: "900" },
  timelineBox: { paddingLeft: 10, marginTop: 20 },
  timeItem: { flexDirection: "row", minHeight: 60 },
  timeLineCol: { width: 24, alignItems: "center" },
  timeDot: { width: 8, height: 8, borderRadius: 4, marginTop: 6, zIndex: 1 },
  timeLine: { position: "absolute", top: 14, bottom: -6, width: 1.5, backgroundColor: "rgba(255,255,255,0.05)" },
  timeContent: { flex: 1, paddingBottom: 20, paddingLeft: 10 },
  timeHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  actionNameRow: { flexDirection: "row", alignItems: "center" },
  actionName: { color: "#FFF", fontSize: 14, fontWeight: "700" },
  actionTime: { color: "rgba(255,255,255,0.3)", fontSize: 13, fontWeight: "700" },
  actionUser: { color: "rgba(255,255,255,0.2)", fontSize: 13, marginTop: 2 },
  modalOverlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.8)", justifyContent: "flex-end" },
  modalContent: { backgroundColor: "#121212", borderTopLeftRadius: 32, borderTopRightRadius: 32, padding: 24, paddingBottom: 40, borderTopWidth: 1, borderTopColor: "rgba(255,255,255,0.05)" },
  modalHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 24 },
  modalTitleBox: { flexDirection: "row", alignItems: "center", gap: 10 },
  modalTitle: { color: "#FFF", fontSize: 18, fontWeight: "800" },
  modalInput: { backgroundColor: "#000", borderRadius: 20, padding: 20, color: "#FFF", fontSize: 16, minHeight: 120, textAlignVertical: "top", marginBottom: 24, borderWidth: 1, borderColor: "rgba(255,255,255,0.05)" },
  modalStatusRow: { flexDirection: "row", gap: 10, marginBottom: 32 },
  modalStatusBtn: { flex: 1, height: 48, borderRadius: 14, backgroundColor: "#1A1A1A", justifyContent: "center", alignItems: "center", borderWidth: 1, borderColor: "rgba(255,255,255,0.05)" },
  modalStatusText: { color: "#FFF", fontSize: 12, fontWeight: "800" },
  saveBtn: { backgroundColor: colors.secondary, height: 56, borderRadius: 16, justifyContent: "center", alignItems: "center", shadowColor: "#000", shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.3, shadowRadius: 8 },
  saveBtnText: { color: "#000", fontSize: 15, fontWeight: "900" },
});
