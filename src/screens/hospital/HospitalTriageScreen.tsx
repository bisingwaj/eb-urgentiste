import React, { useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  Platform,
  Alert,
  KeyboardAvoidingView,
  ScrollView,
  ActivityIndicator,
} from "react-native";
import { AppTouchableOpacity } from '../../components/ui/AppTouchableOpacity';
import {
  SafeAreaView,
  useSafeAreaInsets,
} from "react-native-safe-area-context";
import { MaterialIcons } from "@expo/vector-icons";
import { colors } from "../../theme/colors";
import type { EmergencyCase } from "./hospitalTypes";
import { normalizeBloodPressureInput } from "../../lib/bloodPressureInput";
import { useHospital } from "../../contexts/HospitalContext";
import { HospitalHeader } from './components/HospitalHeader';

const TRIAGE_LEVELS = [
  {
    key: "rouge",
    label: "Rouge",
    sublabel: "Immédiat",
    color: "#FF5252",
    icon: "emergency" as const,
  },
  {
    key: "orange",
    label: "Orange",
    sublabel: "Très urgent",
    color: "#FF9800",
    icon: "warning" as const,
  },
  {
    key: "jaune",
    label: "Jaune",
    sublabel: "Urgent",
    color: "#FFD600",
    icon: "schedule" as const,
  },
  {
    key: "vert",
    label: "Vert",
    sublabel: "Non urgent",
    color: "#69F0AE",
    icon: "check-circle" as const,
  },
];

const ANDROID_TEXT_INPUT_IME_MIN =
  Platform.OS === "android"
    ? {
        autoComplete: "off" as const,
        autoCorrect: false,
        disableFullscreenUI: true,
        importantForAutofill: "no" as const,
      }
    : {};

export function HospitalTriageScreen({ route, navigation }: any) {
  const { caseData } = route.params as { caseData: EmergencyCase };
  const { updateCaseStatus, activeCases } = useHospital();
  const insets = useSafeAreaInsets();

  const [step, setStep] = useState(1);
  const [triageLevel, setTriageLevel] = useState(caseData.triageLevel || "");
  const [vitals, setVitals] = useState({
    tension: normalizeBloodPressureInput(
      String(caseData.vitals?.tension || caseData.vitals?.bloodPressure || ""),
    ),
    heartRate: caseData.vitals?.heartRate || "",
    temperature: caseData.vitals?.temperature || "",
    satO2: caseData.vitals?.satO2 || caseData.vitals?.spO2 || "",
    respiratoryRate: caseData.vitals?.respiratoryRate || "",
    glasgowScore: caseData.vitals?.glasgowScore || "",
    painScore: caseData.vitals?.painScore || "",
    weight: caseData.vitals?.weight || "",
  });
  const [symptoms, setSymptoms] = useState(
    Array.isArray(caseData.symptoms)
      ? caseData.symptoms.join("\n")
      : caseData.symptoms || "",
  );
  const [diagnosis, setDiagnosis] = useState(
    caseData.provisionalDiagnosis || "",
  );
  const [triageNotes, setTriageNotes] = useState(caseData.triageNotes || "");
  const [submitting, setSubmitting] = useState(false);

  const totalSteps = 3;

  const handleNext = () => {
    if (submitting) return;
    if (step < totalSteps) {
      setStep(step + 1);
    } else {
      handleConfirm();
    }
  };

  const handlePrev = () => {
    if (step > 1) {
      setStep(step - 1);
    } else {
      navigation.goBack();
    }
  };

  const handleOpenCaseDetail = () => {
    const fresh = activeCases.find((c) => c.id === caseData.id);
    navigation.navigate("HospitalCaseDetail", { caseData: fresh ?? caseData });
  };

  const updateVital = (key: string, val: string) => {
    setVitals((prev) => ({ ...prev, [key]: val }));
  };

  const onTensionChange = (text: string) => {
    updateVital("tension", normalizeBloodPressureInput(text));
  };

  const handleConfirm = () => {
    Alert.alert(
      "Confirmer le triage",
      "Valider les données et passer à la prise en charge médicale ?",
      [
        { text: "Annuler", style: "cancel" },
        {
          text: "Valider",
          onPress: async () => {
            setSubmitting(true);
            try {
              const triageRecordedAt = new Date().toISOString();
              const vitalsForDb = {
                ...vitals,
                bloodPressure: vitals.tension,
                spO2: vitals.satO2,
              };
              const symptomLines = symptoms
                .split("\n")
                .map((s) => s.trim())
                .filter(Boolean);
              const symptomsPayload: string | string[] =
                symptomLines.length === 0
                  ? ""
                  : symptomLines.length === 1
                    ? symptomLines[0]!
                    : symptomLines;

              await updateCaseStatus(caseData.id, {
                status: "triage",
                data: {
                  triageLevel,
                  vitals: vitalsForDb,
                  symptoms: symptomsPayload,
                  provisionalDiagnosis: diagnosis,
                  triageNotes: triageNotes.trim() || undefined,
                  triageRecordedAt,
                },
              });

              navigation.navigate("HospitalPriseEnCharge", {
                caseData: {
                  ...caseData,
                  status: "triage" as const,
                  triageLevel,
                  vitals: vitalsForDb,
                  symptoms: symptomsPayload,
                  provisionalDiagnosis: diagnosis,
                  triageNotes: triageNotes.trim() || undefined,
                  triageRecordedAt,
                },
              });
            } catch (err) {
              Alert.alert("Erreur", "Impossible de sauvegarder le triage.");
            } finally {
              setSubmitting(false);
            }
          },
        },
      ],
    );
  };

  const renderStepContent = () => {
    switch (step) {
      case 1:
        return (
          <View style={styles.stepContentFill}>
            <Text style={styles.stepTitle}>Niveau de gravité</Text>
            <Text style={styles.stepSubtitle}>
              Évaluation initiale de l'urgence (Protocole START)
            </Text>
            <View style={styles.triageGrid}>
              {TRIAGE_LEVELS.map((level) => {
                const isSelected = triageLevel === level.key;
                return (
                  <AppTouchableOpacity
                    key={level.key}
                    style={[
                      styles.triageCard,
                      isSelected && {
                        borderColor: level.color,
                        backgroundColor: level.color + "15",
                      },
                    ]}
                    onPress={() => {
                      setTriageLevel(level.key);
                      setTimeout(() => setStep(2), 300);
                    }}
                    activeOpacity={0.7}
                  >
                    <View
                      style={[
                        styles.triageDot,
                        { backgroundColor: level.color },
                      ]}
                    />
                    <MaterialIcons
                      name={level.icon}
                      color={isSelected ? level.color : colors.textMuted}
                      size={40}
                    />
                    <Text
                      style={[
                        styles.triageLabel,
                        isSelected && { color: level.color },
                      ]}
                    >
                      {level.label}
                    </Text>
                    <Text style={styles.triageSublabel}>{level.sublabel}</Text>
                    {isSelected && (
                      <View
                        style={[
                          styles.checkMark,
                          { backgroundColor: level.color },
                        ]}
                      >
                        <MaterialIcons name="check" color="#FFF" size={14} />
                      </View>
                    )}
                  </AppTouchableOpacity>
                );
              })}
            </View>
          </View>
        );
      case 2:
        return (
          <View style={styles.stepContentFill}>
            <ScrollView
              style={styles.stepScroll}
              showsVerticalScrollIndicator={false}
              keyboardShouldPersistTaps="handled"
              contentContainerStyle={styles.scrollInner}
            >
              <View>
                <Text style={styles.stepTitle}>Signes vitaux</Text>
                <Text style={styles.stepSubtitle}>
                  Constantes physiologiques du patient
                </Text>
                <View style={styles.vitalsGrid}>
                  <View style={styles.vitalCard}>
                    <View style={styles.vitalHeader}>
                      <MaterialIcons name="speed" color="#FF5252" size={20} />
                      <Text style={styles.vitalLabel}>Tension</Text>
                    </View>
                    <TextInput
                      {...ANDROID_TEXT_INPUT_IME_MIN}
                      style={styles.vitalInput}
                      value={vitals.tension}
                      onChangeText={onTensionChange}
                      placeholder="120/80"
                      placeholderTextColor="rgba(255,255,255,0.2)"
                      keyboardType="number-pad"
                    />
                    <Text style={styles.vitalUnit}>mmHg</Text>
                  </View>
                  <View style={styles.vitalCard}>
                    <View style={styles.vitalHeader}>
                      <MaterialIcons
                        name="favorite"
                        color="#FF5252"
                        size={20}
                      />
                      <Text style={styles.vitalLabel}>Fréq. card.</Text>
                    </View>
                    <TextInput
                      {...ANDROID_TEXT_INPUT_IME_MIN}
                      style={styles.vitalInput}
                      value={vitals.heartRate}
                      onChangeText={(v) => updateVital("heartRate", v)}
                      placeholder="75"
                      placeholderTextColor="rgba(255,255,255,0.2)"
                      keyboardType="number-pad"
                    />
                    <Text style={styles.vitalUnit}>bpm</Text>
                  </View>
                  <View style={styles.vitalCard}>
                    <View style={styles.vitalHeader}>
                      <MaterialIcons
                        name="air"
                        color={colors.secondary}
                        size={20}
                      />
                      <Text style={styles.vitalLabel}>Sat. o₂</Text>
                    </View>
                    <TextInput
                      {...ANDROID_TEXT_INPUT_IME_MIN}
                      style={styles.vitalInput}
                      value={vitals.satO2}
                      onChangeText={(v) => updateVital("satO2", v)}
                      placeholder="98"
                      placeholderTextColor="rgba(255,255,255,0.2)"
                      keyboardType="number-pad"
                    />
                    <Text style={styles.vitalUnit}>%</Text>
                  </View>
                  <View style={styles.vitalCard}>
                    <View style={styles.vitalHeader}>
                      <MaterialIcons
                        name="thermostat"
                        color="#FF9800"
                        size={20}
                      />
                      <Text style={styles.vitalLabel}>Temp.</Text>
                    </View>
                    <TextInput
                      {...ANDROID_TEXT_INPUT_IME_MIN}
                      style={styles.vitalInput}
                      value={vitals.temperature}
                      onChangeText={(v) => updateVital("temperature", v)}
                      placeholder="37.0"
                      placeholderTextColor="rgba(255,255,255,0.2)"
                      keyboardType="decimal-pad"
                    />
                    <Text style={styles.vitalUnit}>°C</Text>
                  </View>
                  <View style={styles.vitalCard}>
                    <View style={styles.vitalHeader}>
                      <MaterialIcons name="waves" color="#69F0AE" size={20} />
                      <Text style={styles.vitalLabel}>Fréq. resp.</Text>
                    </View>
                    <TextInput
                      {...ANDROID_TEXT_INPUT_IME_MIN}
                      style={styles.vitalInput}
                      value={vitals.respiratoryRate}
                      onChangeText={(v) => updateVital("respiratoryRate", v)}
                      placeholder="16"
                      placeholderTextColor="rgba(255,255,255,0.2)"
                      keyboardType="number-pad"
                    />
                    <Text style={styles.vitalUnit}>cycles/min</Text>
                  </View>
                  <View style={styles.vitalCard}>
                    <View style={styles.vitalHeader}>
                      <MaterialIcons
                        name="psychology"
                        color="#E1BEE7"
                        size={20}
                      />
                      <Text style={styles.vitalLabel}>Glasgow</Text>
                    </View>
                    <TextInput
                      {...ANDROID_TEXT_INPUT_IME_MIN}
                      style={styles.vitalInput}
                      value={vitals.glasgowScore}
                      onChangeText={(v) => updateVital("glasgowScore", v)}
                      placeholder="15"
                      placeholderTextColor="rgba(255,255,255,0.2)"
                      keyboardType="number-pad"
                    />
                    <Text style={styles.vitalUnit}>/15</Text>
                  </View>
                  <View style={styles.vitalCard}>
                    <View style={styles.vitalHeader}>
                      <MaterialIcons
                        name="sentiment-dissatisfied"
                        color="#FF9800"
                        size={20}
                      />
                      <Text style={styles.vitalLabel}>Douleur</Text>
                    </View>
                    <TextInput
                      {...ANDROID_TEXT_INPUT_IME_MIN}
                      style={styles.vitalInput}
                      value={vitals.painScore}
                      onChangeText={(v) => updateVital("painScore", v)}
                      placeholder="0–10"
                      placeholderTextColor="rgba(255,255,255,0.2)"
                      keyboardType="number-pad"
                    />
                    <Text style={styles.vitalUnit}>/10</Text>
                  </View>
                  <View style={styles.vitalCard}>
                    <View style={styles.vitalHeader}>
                      <MaterialIcons
                        name="monitor-weight"
                        color="#90CAF9"
                        size={20}
                      />
                      <Text style={styles.vitalLabel}>Poids</Text>
                    </View>
                    <TextInput
                      {...ANDROID_TEXT_INPUT_IME_MIN}
                      style={styles.vitalInput}
                      value={vitals.weight}
                      onChangeText={(v) => updateVital("weight", v)}
                      placeholder="70"
                      placeholderTextColor="rgba(255,255,255,0.2)"
                      keyboardType="decimal-pad"
                    />
                    <Text style={styles.vitalUnit}>kg</Text>
                  </View>
                </View>
              </View>
            </ScrollView>
          </View>
        );
      case 3:
        return (
          <View style={styles.stepContentFill}>
            <ScrollView
              style={styles.stepScroll}
              showsVerticalScrollIndicator={false}
              keyboardShouldPersistTaps="handled"
              contentContainerStyle={styles.scrollInner}
            >
              <Text style={styles.stepTitle}>Observations</Text>
              <Text style={styles.stepSubtitle}>
                Symptômes et diagnostic provisoire
              </Text>
              <View style={styles.formGroup}>
                <Text style={styles.inputLabel}>Symptômes principaux</Text>
                <TextInput
                  {...ANDROID_TEXT_INPUT_IME_MIN}
                  style={[styles.input, styles.textArea]}
                  value={symptoms}
                  onChangeText={setSymptoms}
                  placeholder="Description des symptômes observés..."
                  placeholderTextColor="rgba(255,255,255,0.2)"
                  multiline
                  numberOfLines={4}
                />
              </View>
              <View style={styles.formGroup}>
                <Text style={styles.inputLabel}>Diagnostic provisoire</Text>
                <TextInput
                  {...ANDROID_TEXT_INPUT_IME_MIN}
                  style={[styles.input, styles.textArea]}
                  value={diagnosis}
                  onChangeText={setDiagnosis}
                  placeholder="Entrez le diagnostic de triage..."
                  placeholderTextColor="rgba(255,255,255,0.2)"
                  multiline
                  numberOfLines={3}
                />
              </View>
              <View style={styles.formGroup}>
                <Text style={styles.inputLabel}>Notes de triage</Text>
                <TextInput
                  {...ANDROID_TEXT_INPUT_IME_MIN}
                  style={[styles.input, styles.textArea]}
                  value={triageNotes}
                  onChangeText={setTriageNotes}
                  placeholder="Contexte, allergies relevées, particularités…"
                  placeholderTextColor="rgba(255,255,255,0.2)"
                  multiline
                  numberOfLines={3}
                />
              </View>
            </ScrollView>
          </View>
        );
      default:
        return null;
    }
  };

  return (
    <View style={styles.safeArea}>
      <HospitalHeader showBack title="Triage" />

      <View style={styles.progressRow}>
        <View style={styles.progressBarBg}>
          <View style={[styles.progressBarFill, { width: `${(step / totalSteps) * 100}%` }]} />
        </View>
        <Text style={styles.progressText}>
          Évaluation de triage · {step}/{totalSteps}
        </Text>
      </View>

      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior="padding"
        enabled={true}
        keyboardVerticalOffset={Platform.OS === "ios" ? 56 : 0}
      >
        <View style={styles.content}>{renderStepContent()}</View>

        <View
          style={[
            styles.footerBar,
            { paddingBottom: Math.max(insets.bottom, 14) },
          ]}
        >
          <AppTouchableOpacity style={styles.backStepBtn} onPress={handlePrev}>
            <Text style={styles.backStepText}>
              {step === 1 ? "Retour" : "Précédent"}
            </Text>
          </AppTouchableOpacity>
          <AppTouchableOpacity
            style={[
              styles.nextBtn,
              step === 1 && !triageLevel && styles.btnDisabled,
              step === 2 &&
                (!vitals.tension || !vitals.heartRate) &&
                styles.btnDisabled,
              submitting && styles.btnDisabled,
            ]}
            onPress={handleNext}
            disabled={
              submitting ||
              (step === 1 && !triageLevel) ||
              (step === 2 && (!vitals.tension || !vitals.heartRate))
            }
          >
            {submitting && step === totalSteps ? (
              <ActivityIndicator color="#FFF" />
            ) : (
              <>
                <Text style={styles.nextBtnText}>
                  {step === totalSteps ? "Confirmer le triage" : "Suivant"}
                </Text>
                <MaterialIcons
                  name={
                    step === totalSteps ? "assignment-turned-in" : "chevron-right"
                  }
                  color="#FFF"
                  size={22}
                />
              </>
            )}
          </AppTouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: colors.mainBackground },
  progressRow: {
    paddingHorizontal: 24,
    paddingVertical: 12,
    alignItems: 'center',
    backgroundColor: '#0A0A0A',
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.06)',
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    height: 60,
  },
  iconBtn: {
    width: 44,
    height: 44,
    justifyContent: "center",
    alignItems: "center",
  },
  headerLinkBtn: {
    width: 44,
    height: 44,
    justifyContent: "center",
    alignItems: "center",
    borderRadius: 14,
    backgroundColor: "rgba(56, 182, 255, 0.12)",
  },
  progressContainer: { flex: 1, alignItems: "center" },
  progressBarBg: {
    width: "80%",
    height: 4,
    backgroundColor: "rgba(255,255,255,0.1)",
    borderRadius: 2,
    overflow: "hidden",
    marginBottom: 8,
  },
  progressBarFill: { height: "100%", backgroundColor: colors.secondary },
  progressText: {
    color: colors.textMuted,
    fontSize: 13,
    fontWeight: "700",
    letterSpacing: 1,
  },
  content: { flex: 1, minHeight: 0, paddingHorizontal: 24, paddingTop: 30 },
  stepContentFill: { flex: 1, minHeight: 0, justifyContent: "flex-start" },
  stepScroll: { flex: 1, alignSelf: "stretch", minHeight: 0 },
  scrollInner: { paddingBottom: 32, flexGrow: 0 },
  stepTitle: {
    color: "#FFF",
    fontSize: 24,
    fontWeight: "900",
    marginBottom: 10,
  },
  stepSubtitle: {
    color: "rgba(255,255,255,0.4)",
    fontSize: 16,
    marginBottom: 16,
  },
  triageGrid: { flexDirection: "row", flexWrap: "wrap", gap: 14 },
  triageCard: {
    width: "47%" as any,
    backgroundColor: "#1A1A1A",
    borderRadius: 24,
    padding: 20,
    alignItems: "center",
    borderWidth: 2,
    borderColor: "rgba(255,255,255,0.05)",
    gap: 10,
  },
  triageDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    position: "absolute",
    top: 16,
    left: 16,
  },
  triageLabel: { color: "#FFF", fontSize: 16, fontWeight: "800" },
  triageSublabel: {
    color: "rgba(255,255,255,0.4)",
    fontSize: 12,
    fontWeight: "600",
  },
  checkMark: {
    position: "absolute",
    top: 12,
    right: 12,
    width: 22,
    height: 22,
    borderRadius: 11,
    justifyContent: "center",
    alignItems: "center",
  },
  vitalsGrid: { flexDirection: "row", flexWrap: "wrap", gap: 12 },
  vitalCard: {
    width: "48%" as any,
    backgroundColor: "#1A1A1A",
    borderRadius: 20,
    padding: 20,
    borderWidth: 1.5,
    borderColor: "rgba(255,255,255,0.05)",
  },
  vitalHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    marginBottom: 12,
  },
  vitalLabel: {
    color: colors.textMuted,
    fontSize: 13,
    fontWeight: "800",
    letterSpacing: 0.5,
  },
  vitalInput: {
    color: "#FFF",
    fontSize: 26,
    fontWeight: "900",
    paddingVertical: 4,
  },
  vitalUnit: {
    color: "rgba(255,255,255,0.3)",
    fontSize: 12,
    fontWeight: "600",
    marginTop: 4,
  },
  formGroup: { marginBottom: 24 },
  inputLabel: {
    color: "rgba(255,255,255,0.5)",
    fontSize: 14,
    fontWeight: "700",
    marginBottom: 10,
    marginLeft: 4,
  },
  input: {
    backgroundColor: "#1A1A1A",
    borderRadius: 16,
    padding: 20,
    color: "#FFF",
    fontSize: 16,
    fontWeight: "600",
    borderWidth: 1.5,
    borderColor: "rgba(255,255,255,0.05)",
  },
  textArea: { minHeight: 120, textAlignVertical: "top" },
  footerBar: {
    flexDirection: "row",
    paddingHorizontal: 20,
    paddingTop: 16,
    gap: 12,
    backgroundColor: colors.mainBackground,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: "rgba(255,255,255,0.1)",
  },
  backStepBtn: {
    flex: 1,
    height: 60,
    borderRadius: 30,
    borderWidth: 1.5,
    borderColor: "rgba(255,255,255,0.1)",
    justifyContent: "center",
    alignItems: "center",
  },
  backStepText: { color: "#FFF", fontSize: 16, fontWeight: "700" },
  nextBtn: {
    flex: 2,
    height: 60,
    borderRadius: 30,
    backgroundColor: colors.secondary,
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    gap: 12,
  },
  nextBtnText: { color: "#FFF", fontSize: 16, fontWeight: "800" },
  btnDisabled: { opacity: 0.3 },
});
