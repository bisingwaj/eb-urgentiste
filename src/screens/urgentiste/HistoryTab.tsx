import React, { useMemo, useState, useCallback, useEffect } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  StatusBar,
  Modal,
  TextInput,
  Platform,
  ActivityIndicator,
  Keyboard,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import DateTimePicker, {
  type DateTimePickerEvent,
} from "@react-native-community/datetimepicker";
import { TabScreenSafeArea } from "../../components/layout/TabScreenSafeArea";
import { colors } from "../../theme/colors";
import { MaterialIcons, MaterialCommunityIcons } from "@expo/vector-icons";
import { useMissionHistory } from "../../hooks/useMissionHistory";
import { formatIncidentType } from "../../utils/missionAddress";
import {
  filterMissionHistory,
  getMissionSortTime,
  startOfWeekMondayLocal,
  endOfWeekSundayLocal,
} from "../../utils/missionHistoryTime";

type PickerKind =
  | "none"
  | "anchor"
  | "rangeStart"
  | "rangeEnd"
  | "hourMin"
  | "hourMax";

const defaultRangeStart = () => {
  const d = new Date();
  d.setDate(d.getDate() - 7);
  d.setHours(12, 0, 0, 0);
  return d;
};

export function HistoryTab({ navigation }: any) {
  const insets = useSafeAreaInsets();
  const { history, isLoading } = useMissionHistory();

  const [filterModalVisible, setFilterModalVisible] = useState(false);
  const [nameQuery, setNameQuery] = useState("");
  const [periodMode, setPeriodMode] = useState<
    "all" | "day" | "week" | "range"
  >("all");
  const [anchorDate, setAnchorDate] = useState(() => new Date());
  const [rangeStart, setRangeStart] = useState(() => defaultRangeStart());
  const [rangeEnd, setRangeEnd] = useState(() => new Date());
  const [useHourFilter, setUseHourFilter] = useState(false);
  const [hourMin, setHourMin] = useState(8);
  const [hourMax, setHourMax] = useState(18);
  const [pickerKind, setPickerKind] = useState<PickerKind>("none");
  const [keyboardHeight, setKeyboardHeight] = useState(0);

  useEffect(() => {
    const showEv =
      Platform.OS === "ios" ? "keyboardWillShow" : "keyboardDidShow";
    const hideEv =
      Platform.OS === "ios" ? "keyboardWillHide" : "keyboardDidHide";

    const subShow = Keyboard.addListener(showEv, (e) => {
      setKeyboardHeight(e.endCoordinates.height);
    });
    const subHide = Keyboard.addListener(hideEv, () => {
      setKeyboardHeight(0);
    });

    return () => {
      subShow.remove();
      subHide.remove();
    };
  }, []);

  useEffect(() => {
    if (!filterModalVisible) {
      setKeyboardHeight(0);
      Keyboard.dismiss();
    }
  }, [filterModalVisible]);

  const filterOpts = useMemo(
    () => ({
      nameQuery,
      periodMode,
      anchorDate,
      rangeStart,
      rangeEnd,
      useHourFilter,
      hourMin,
      hourMax,
    }),
    [
      nameQuery,
      periodMode,
      anchorDate,
      rangeStart,
      rangeEnd,
      useHourFilter,
      hourMin,
      hourMax,
    ]
  );

  const filteredHistory = useMemo(
    () => filterMissionHistory(history, filterOpts),
    [history, filterOpts]
  );

  const successCount = useMemo(
    () =>
      filteredHistory.filter((m) => m.dispatch_status === "completed").length,
    [filteredHistory]
  );

  const hasActiveFilters = useMemo(() => {
    return (
      nameQuery.trim().length > 0 ||
      periodMode !== "all" ||
      useHourFilter
    );
  }, [nameQuery, periodMode, useHourFilter]);

  const resetFilters = useCallback(() => {
    setNameQuery("");
    setPeriodMode("all");
    setAnchorDate(new Date());
    setRangeStart(defaultRangeStart());
    setRangeEnd(new Date());
    setUseHourFilter(false);
    setHourMin(8);
    setHourMax(18);
  }, []);

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

  const pickerValue = useMemo(() => {
    const d = new Date();
    switch (pickerKind) {
      case "anchor":
      case "rangeStart":
        return pickerKind === "anchor" ? anchorDate : rangeStart;
      case "rangeEnd":
        return rangeEnd;
      case "hourMin":
        d.setHours(hourMin, 0, 0, 0);
        return d;
      case "hourMax":
        d.setHours(hourMax, 0, 0, 0);
        return d;
      default:
        return new Date();
    }
  }, [
    pickerKind,
    anchorDate,
    rangeStart,
    rangeEnd,
    hourMin,
    hourMax,
  ]);

  const onPickerChange = (event: DateTimePickerEvent, selectedDate?: Date) => {
    if (Platform.OS === "android") {
      setPickerKind("none");
      if (event.type !== "set" || !selectedDate) return;
    } else {
      if (event.type === "dismissed") {
        setPickerKind("none");
        return;
      }
      if (!selectedDate) return;
    }
    switch (pickerKind) {
      case "anchor":
        setAnchorDate(selectedDate);
        break;
      case "rangeStart":
        setRangeStart(selectedDate);
        break;
      case "rangeEnd":
        setRangeEnd(selectedDate);
        break;
      case "hourMin":
        setHourMin(selectedDate.getHours());
        break;
      case "hourMax":
        setHourMax(selectedDate.getHours());
        break;
      default:
        break;
    }
  };

  const weekLabel = useMemo(() => {
    const s = startOfWeekMondayLocal(anchorDate);
    const e = endOfWeekSundayLocal(anchorDate);
    return `${s.toLocaleDateString()} — ${e.toLocaleDateString()}`;
  }, [anchorDate]);

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
            <TouchableOpacity
              style={styles.headerAvatarBtn}
              onPress={() => setFilterModalVisible(true)}
              accessibilityLabel="Filtres"
            >
              <MaterialIcons
                name="filter-list"
                color={colors.secondary}
                size={26}
              />
              {hasActiveFilters ? <View style={styles.filterBadgeDot} /> : null}
            </TouchableOpacity>
          </View>
        </View>

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
            <Text style={styles.summaryNumber}>
              {isLoading ? "—" : filteredHistory.length}
            </Text>
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
            <Text style={styles.summaryNumber}>
              {isLoading ? "—" : successCount}
            </Text>
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
        ) : filteredHistory.length === 0 ? (
          <View style={{ marginTop: 40, alignItems: "center", paddingHorizontal: 24 }}>
            <MaterialCommunityIcons
              name="filter-remove-outline"
              size={60}
              color="rgba(255,255,255,0.1)"
            />
            <Text
              style={{
                color: "rgba(255,255,255,0.45)",
                marginTop: 15,
                fontSize: 16,
                textAlign: "center",
              }}
            >
              Aucun résultat pour ces filtres
            </Text>
            <TouchableOpacity
              style={styles.clearFiltersLink}
              onPress={resetFilters}
            >
              <Text style={styles.clearFiltersLinkText}>Réinitialiser les filtres</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <View style={styles.listContainer}>
            {filteredHistory.map((mission) => {
              const specs = getOutcomeSpecs(mission.dispatch_status);
              const sortTime = getMissionSortTime(mission);

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
                          {sortTime.toLocaleDateString()}{" "}
                          {sortTime.toLocaleTimeString().slice(0, 5)}
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
                            .join(" · ") ||
                          "—"}
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
                        <Text style={styles.etaValue}>
                          {formatIncidentType(mission.type)}
                        </Text>
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

      <Modal
        visible={filterModalVisible}
        animationType="slide"
        transparent
        onRequestClose={() => setFilterModalVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <TouchableOpacity
            style={StyleSheet.absoluteFill}
            activeOpacity={1}
            onPress={() => setFilterModalVisible(false)}
          />
          <View style={styles.modalSheetWrap}>
            <View
              style={[
                styles.modalSheet,
                {
                  marginBottom: keyboardHeight,
                  paddingBottom: Math.max(insets.bottom, 28),
                },
              ]}
            >
            <View style={styles.modalHandle} />
            <Text style={styles.modalTitle}>Filtrer les missions</Text>

            <ScrollView
              showsVerticalScrollIndicator={false}
              keyboardShouldPersistTaps="handled"
              keyboardDismissMode="on-drag"
              contentContainerStyle={[
                styles.modalScroll,
                keyboardHeight > 0 && { paddingBottom: 16 },
              ]}
            >
              <Text style={styles.fieldLabel}>Recherche</Text>
              <TextInput
                style={styles.textInput}
                placeholder="Nom appelant, référence, type…"
                placeholderTextColor="rgba(255,255,255,0.35)"
                value={nameQuery}
                onChangeText={setNameQuery}
                autoCapitalize="none"
                autoCorrect={false}
              />

              <Text style={[styles.fieldLabel, { marginTop: 18 }]}>
                Période
              </Text>
              <View style={styles.chipRow}>
                {(
                  [
                    ["all", "Tout"],
                    ["day", "Jour"],
                    ["week", "Semaine"],
                    ["range", "Plage"],
                  ] as const
                ).map(([key, label]) => {
                  const on = periodMode === key;
                  return (
                    <TouchableOpacity
                      key={key}
                      style={[styles.chip, on && styles.chipOn]}
                      onPress={() => setPeriodMode(key)}
                    >
                      <Text style={[styles.chipText, on && styles.chipTextOn]}>
                        {label}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>

              {periodMode === "day" || periodMode === "week" ? (
                <View style={styles.dateBlock}>
                  <Text style={styles.dateHint}>
                    {periodMode === "day"
                      ? anchorDate.toLocaleDateString()
                      : weekLabel}
                  </Text>
                  <TouchableOpacity
                    style={styles.dateBtn}
                    onPress={() => setPickerKind("anchor")}
                  >
                    <MaterialIcons
                      name="event"
                      size={18}
                      color={colors.secondary}
                    />
                    <Text style={styles.dateBtnText}>
                      {periodMode === "day"
                        ? "Choisir le jour"
                        : "Choisir une date dans la semaine"}
                    </Text>
                  </TouchableOpacity>
                </View>
              ) : null}

              {periodMode === "range" ? (
                <View style={styles.dateBlock}>
                  <TouchableOpacity
                    style={styles.dateBtn}
                    onPress={() => setPickerKind("rangeStart")}
                  >
                    <Text style={styles.dateBtnText}>
                      Du {rangeStart.toLocaleDateString()}
                    </Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={styles.dateBtn}
                    onPress={() => setPickerKind("rangeEnd")}
                  >
                    <Text style={styles.dateBtnText}>
                      Au {rangeEnd.toLocaleDateString()}
                    </Text>
                  </TouchableOpacity>
                </View>
              ) : null}

              <View style={styles.hourRow}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.fieldLabel}>Tranche horaire</Text>
                  <Text style={styles.subHint}>
                    Optionnel, sur l’heure de fin de mission
                  </Text>
                </View>
                <TouchableOpacity
                  style={[
                    styles.toggle,
                    useHourFilter && styles.toggleOn,
                  ]}
                  onPress={() => setUseHourFilter((v) => !v)}
                >
                  <View
                    style={[
                      styles.toggleKnob,
                      useHourFilter && styles.toggleKnobOn,
                    ]}
                  />
                </TouchableOpacity>
              </View>

              {useHourFilter ? (
                <View style={styles.hourPickers}>
                  <TouchableOpacity
                    style={styles.dateBtn}
                    onPress={() => setPickerKind("hourMin")}
                  >
                    <Text style={styles.dateBtnText}>
                      De {String(hourMin).padStart(2, "0")} h
                    </Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={styles.dateBtn}
                    onPress={() => setPickerKind("hourMax")}
                  >
                    <Text style={styles.dateBtnText}>
                      À {String(hourMax).padStart(2, "0")} h
                    </Text>
                  </TouchableOpacity>
                </View>
              ) : null}

              <View style={styles.modalActions}>
                <TouchableOpacity
                  style={styles.btnSecondary}
                  onPress={resetFilters}
                >
                  <Text style={styles.btnSecondaryText}>Réinitialiser</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.btnPrimary}
                  onPress={() => setFilterModalVisible(false)}
                >
                  <Text style={styles.btnPrimaryText}>Fermer</Text>
                </TouchableOpacity>
              </View>
            </ScrollView>

            {pickerKind !== "none" ? (
              <View style={styles.pickerWrap}>
                {Platform.OS === "ios" ? (
                  <TouchableOpacity
                    style={styles.iosPickerDone}
                    onPress={() => setPickerKind("none")}
                  >
                    <Text style={styles.iosPickerDoneText}>OK</Text>
                  </TouchableOpacity>
                ) : null}
                <DateTimePicker
                  value={pickerValue}
                  mode={
                    pickerKind === "hourMin" || pickerKind === "hourMax"
                      ? "time"
                      : "date"
                  }
                  display={Platform.OS === "ios" ? "spinner" : "default"}
                  is24Hour
                  onChange={onPickerChange}
                />
              </View>
            ) : null}
            </View>
          </View>
        </View>
      </Modal>
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
  filterBadgeDot: {
    position: "absolute",
    top: 8,
    right: 8,
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: colors.primary,
    borderWidth: 1,
    borderColor: "#0A0A0A",
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
    fontSize: 12,
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
  statusBadgeText: { fontSize: 13, fontWeight: "800", letterSpacing: 0.5 },
  etaContainer: { flexDirection: "row", alignItems: "center" },
  etaValue: { color: "rgba(255,255,255,0.3)", fontSize: 13, fontWeight: "800" },
  arrowContainer: { marginLeft: 16 },

  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.65)",
    justifyContent: "flex-end",
  },
  modalSheetWrap: {
    width: "100%",
    flex: 1,
    justifyContent: "flex-end",
    maxHeight: "100%",
  },
  modalSheet: {
    backgroundColor: "#121212",
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    paddingHorizontal: 22,
    maxHeight: "88%",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
  },
  modalHandle: {
    alignSelf: "center",
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: "rgba(255,255,255,0.15)",
    marginTop: 10,
    marginBottom: 8,
  },
  modalTitle: {
    color: "#FFF",
    fontSize: 20,
    fontWeight: "800",
    marginBottom: 16,
  },
  modalScroll: { paddingBottom: 12 },
  fieldLabel: {
    color: "rgba(255,255,255,0.5)",
    fontSize: 12,
    fontWeight: "800",
    letterSpacing: 0.8,
    textTransform: "uppercase",
    marginBottom: 8,
  },
  subHint: {
    color: "rgba(255,255,255,0.35)",
    fontSize: 12,
    marginTop: 4,
    fontWeight: "600",
  },
  textInput: {
    backgroundColor: "#1A1A1A",
    borderRadius: 16,
    paddingHorizontal: 16,
    paddingVertical: 14,
    color: "#FFF",
    fontSize: 16,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
  },
  chipRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  chip: {
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 14,
    backgroundColor: "#1A1A1A",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
  },
  chipOn: {
    borderColor: colors.secondary,
    backgroundColor: colors.secondary + "18",
  },
  chipText: {
    color: "rgba(255,255,255,0.65)",
    fontSize: 13,
    fontWeight: "700",
  },
  chipTextOn: { color: colors.secondary },
  dateBlock: { marginTop: 12, gap: 8 },
  dateHint: {
    color: "rgba(255,255,255,0.45)",
    fontSize: 13,
    fontWeight: "600",
  },
  dateBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    backgroundColor: "#1A1A1A",
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
  },
  dateBtnText: {
    color: "#FFF",
    fontSize: 15,
    fontWeight: "700",
  },
  hourRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginTop: 20,
    gap: 12,
  },
  hourPickers: { marginTop: 10, gap: 8 },
  toggle: {
    width: 48,
    height: 28,
    borderRadius: 14,
    backgroundColor: "rgba(255,255,255,0.12)",
    padding: 2,
    justifyContent: "center",
  },
  toggleOn: { backgroundColor: colors.secondary + "99" },
  toggleKnob: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: "#FFF",
    alignSelf: "flex-start",
  },
  toggleKnobOn: { alignSelf: "flex-end" },
  modalActions: {
    flexDirection: "row",
    gap: 12,
    marginTop: 24,
  },
  btnSecondary: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 16,
    backgroundColor: "#1A1A1A",
    alignItems: "center",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.1)",
  },
  btnSecondaryText: {
    color: "rgba(255,255,255,0.85)",
    fontSize: 16,
    fontWeight: "800",
  },
  btnPrimary: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 16,
    backgroundColor: colors.secondary,
    alignItems: "center",
  },
  btnPrimaryText: { color: "#FFF", fontSize: 16, fontWeight: "800" },
  clearFiltersLink: { marginTop: 16, padding: 8 },
  clearFiltersLinkText: {
    color: colors.secondary,
    fontSize: 15,
    fontWeight: "800",
  },
  pickerWrap: {
    borderTopWidth: 1,
    borderTopColor: "rgba(255,255,255,0.08)",
    paddingTop: 8,
    paddingBottom: 4,
    backgroundColor: "#121212",
  },
  iosPickerDone: {
    alignSelf: "flex-end",
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  iosPickerDoneText: {
    color: colors.secondary,
    fontSize: 17,
    fontWeight: "800",
  },
});
