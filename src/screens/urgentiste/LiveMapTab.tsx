import React, {
  useEffect,
  useRef,
  useState,
  useCallback,
  useMemo,
} from "react";
import { AppTouchableOpacity } from '../../components/ui/AppTouchableOpacity';
import {
  View,
  Text,
  StyleSheet,
  Animated,
  Easing,
  StatusBar,
  ActivityIndicator,
ScrollView,
  Switch} from "react-native";
import { useIsFocused } from "@react-navigation/native";
import { TabScreenSafeArea } from "../../components/layout/TabScreenSafeArea";
import { useTabScreenBottomPadding } from "../../navigation/tabBarLayout";
import Mapbox from "@rnmapbox/maps";
import { stopSpeech } from "../../lib/speechSafe";
import { colors } from "../../theme/colors";
import { spacing, radius } from "../../theme/spacing";
import { LiveMapTelemetryHUD } from './components/LiveMapTelemetryHUD';
import { LiveMapTacticalCard } from './components/LiveMapTacticalCard';
import { LiveMapLegendHUD } from './components/LiveMapLegendHUD';
import { typography } from "../../theme/typography";
import { MaterialIcons, MaterialCommunityIcons } from "@expo/vector-icons";
import { Ambulance, Hospital, TriangleAlert } from "lucide-react-native";
import * as Location from "expo-location";
import { supabase } from "../../lib/supabase";
import { useAuth } from "../../contexts/AuthContext";
import {
  getRouteWithAlternatives,
  buildRouteFeature,
  formatDistanceMeters,
  formatDurationSeconds,
  geometryToCameraBounds,
  pickBestRoute,
  haversineMeters,
  type RouteResult,
  type RouteCriterion,
} from "../../lib/mapbox";
import {
  openExternalDirections,
  openWazeDirections,
} from "../../utils/navigation";
import { spreadOverlappingMarkers } from "../../utils/mapMarkerLayout";
import { EBMap, EBMapMarker } from "../../components/map/EBMap";
import { 
  useLiveMapData, 
  PoiSelection, 
  HospitalData, 
  IncidentData, 
  RescuerData, 
  establishmentTypeLabel,
  ESTABLISHMENT_TYPE_KEYS,
  ESTABLISHMENT_TYPE_LABELS,
  normalizeEstablishmentType,
  incidentLngLat
} from "./liveMapHooks/useLiveMapData";

import { useLiveMapRouting } from "./liveMapHooks/useLiveMapRouting";
import { useLiveMapLocation } from "./liveMapHooks/useLiveMapLocation";

import { useLiveMapAudio } from "./liveMapHooks/useLiveMapAudio";
export function LiveMapTab() {
  const { session } = useAuth();
  const isFocused = useIsFocused();
  const mapRef = useRef<Mapbox.MapView | null>(null);
  const radarAnim = useRef(new Animated.Value(0)).current;
  const pulseAnim = useRef(new Animated.Value(0.6)).current;
  const cameraThrottle = useRef<number>(0);

  const { myLocation, gpsReady, speed, accuracy, battery, headingResolved, myCoords } = useLiveMapLocation(isFocused);



  /** Réserve bas (pill + nav) : appliquée sur un View autour de la carte pour qu’Android contraindre bien les overlays au-dessus du Mapbox. */
  const tabBottomPad = useTabScreenBottomPadding();


  const userLngLat = useMemo(
    (): [number, number] => [myCoords.longitude, myCoords.latitude],
    [myCoords.latitude, myCoords.longitude],
  );

  const {
    selection,
    setSelection,
    routeList,
    setRouteList,
    selectedRouteIndex,
    setSelectedRouteIndex,
    routeCriterion,
    setRouteCriterion,
    routeInfo,
    setRouteInfo,
    routeLoading,
    selectedRoute,
    destLngLat,
    ttsStepIndex,
    setTtsStepIndex,
    autoTts,
    setAutoTts,
    lastAnnouncedStepRef
  } = useLiveMapRouting(gpsReady, myCoords);

  const { speakTtsRepeat, speakTtsNext } = useLiveMapAudio(autoTts, myLocation, selectedRoute, ttsStepIndex, setTtsStepIndex, lastAnnouncedStepRef);

  const {
    rescuersForMap,
    hospitalsForMap,
    incidentsForMap,
    rescuersOthers,
    hospitalsFiltered,
    incidentsInView,
    rescuerNames,
    establishmentTypeFilter,
    toggleEstablishmentType,
    selectAllEstablishmentTypes,
    clearEstablishmentTypeFilter,
    fetchData
  } = useLiveMapData(isFocused, myCoords, selection, session?.user?.id);


  const rescuersForMapDisplay = useMemo(
    () =>
      spreadOverlappingMarkers(rescuersForMap, (r) =>
        r.lat != null && r.lng != null ? [r.lng, r.lat] : null,
      ),
    [rescuersForMap],
  );

  const hospitalsForMapDisplay = useMemo(
    () =>
      spreadOverlappingMarkers(hospitalsForMap, (h) =>
        h.lat != null && h.lng != null ? [h.lng, h.lat] : null,
      ),
    [hospitalsForMap],
  );

  const incidentsForMapDisplay = useMemo(
    () =>
      spreadOverlappingMarkers(incidentsForMap, (inc) => incidentLngLat(inc)),
    [incidentsForMap],
  );

  const rescuerTruncLegend = rescuersOthers.length > rescuersForMap.length;
  const hospTruncLegend = hospitalsFiltered.length > hospitalsForMap.length;
  const incTruncLegend = incidentsInView.length > incidentsForMap.length;

  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, {
          toValue: 1,
          duration: 1600,
          useNativeDriver: true,
        }),
        Animated.timing(pulseAnim, {
          toValue: 0.55,
          duration: 1600,
          useNativeDriver: true,
        }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [pulseAnim]);

  useEffect(() => {
    if (!isFocused) return;
    const loop = Animated.loop(
      Animated.timing(radarAnim, {
        toValue: 1,
        duration: 12000,
        easing: Easing.linear,
        useNativeDriver: true,
      }),
    );
    loop.start();
    return () => loop.stop();
  }, [isFocused, radarAnim]);

  const spin = radarAnim.interpolate({
    inputRange: [0, 1],
    outputRange: ["0deg", "360deg"],
  });




  const cameraBounds = useMemo(() => {
    if (!gpsReady || !selection || !destLngLat) return null;
    if (selectedRoute?.geometry?.coordinates?.length) {
      return geometryToCameraBounds(selectedRoute.geometry, 110);
    }
    const ne: [number, number] = [
      Math.max(myCoords.longitude, destLngLat[0]),
      Math.max(myCoords.latitude, destLngLat[1]),
    ];
    const sw: [number, number] = [
      Math.min(myCoords.longitude, destLngLat[0]),
      Math.min(myCoords.latitude, destLngLat[1]),
    ];
    return {
      ne,
      sw,
      paddingTop: 100,
      paddingBottom: 220,
      paddingLeft: 48,
      paddingRight: 48,
    };
  }, [
    gpsReady,
    selection,
    destLngLat,
    selectedRoute,
    myCoords.longitude,
    myCoords.latitude,
  ]);

  const cameraCenter = useMemo(() => {
    if (selection && destLngLat) {
      return [
        (myCoords.longitude + destLngLat[0]) / 2,
        (myCoords.latitude + destLngLat[1]) / 2,
      ] as [number, number];
    }
    return [myCoords.longitude, myCoords.latitude] as [number, number];
  }, [selection, destLngLat, myCoords.longitude, myCoords.latitude]);

  const cameraZoom = selection && destLngLat ? 12.2 : 13;

  useEffect(() => {
    const now = Date.now();
    if (now - cameraThrottle.current < 900) return;
    cameraThrottle.current = now;
  }, [cameraCenter, cameraZoom, cameraBounds]);


  const [cardVisible, setCardVisible] = useState(false);

  const clearSelection = useCallback(() => {
    setSelection(null);
    setRouteList([]);
    setSelectedRouteIndex(0);
    setRouteInfo(null);
    setTtsStepIndex(0);
    setCardVisible(false);
    stopSpeech();
  }, []);

  const hideCard = useCallback(() => setCardVisible(false), []);


  const onApplyCriterion = useCallback((c: RouteCriterion) => {
    setRouteCriterion(c);
    setRouteList((prev) => {
      if (prev.length === 0) return prev;
      const idx = pickBestRoute(prev, c);
      setSelectedRouteIndex(idx);
      return prev;
    });
  }, []);

  const onSelectRouteIndex = useCallback((idx: number) => {
    setSelectedRouteIndex(idx);
  }, []);

  const selectionTitle = selection
    ? selection.kind === "incident"
      ? selection.data.title || selection.data.reference
      : selection.kind === "hospital"
        ? selection.data.name
        : `Unité`
    : "";

  const selectionSubtitle = selection
    ? selection.kind === "incident"
      ? `${selection.data.type} · ${selection.data.reference}`
      : selection.kind === "hospital"
        ? `${establishmentTypeLabel(selection.data.type)} · ${selection.data.available_beds} lits`
        : `Statut : ${selection.data.status}`
    : "";

  const [filterOpen, setFilterOpen] = useState(false);
  const [telemetryExpanded, setTelemetryExpanded] = useState(false);
  const [legendExpanded, setLegendExpanded] = useState(false);

  const activeFilterCount = ESTABLISHMENT_TYPE_KEYS.filter(
    (k) => establishmentTypeFilter[k] === true,
  ).length;

  const mapRouteData = useMemo(() => {
    if (routeList.length === 0) return undefined;
    return {
      routes: routeList,
      selectedIndex: selectedRouteIndex,
      showAlternatives: true,
    };
  }, [routeList, selectedRouteIndex]);

  const allMarkers = useMemo((): EBMapMarker[] => {
    const list: EBMapMarker[] = [];

    // Units
    rescuersForMapDisplay.forEach(({ item: r, displayCoord }) => {
      list.push({
        id: `unit-${r.id}`,
        type: 'unit',
        coordinate: displayCoord,
        status: r.status,
        headingDeg: r.heading != null && r.heading >= 0 ? r.heading : undefined,
        label: rescuerNames[r.user_id],
        data: r
      });
    });

    // Hospitals
    hospitalsForMapDisplay.forEach(({ item: h, displayCoord }) => {
      list.push({
        id: `hosp-${h.id}`,
        type: 'hospital',
        coordinate: displayCoord,
        label: h.short_name || h.name,
        beds: h.available_beds,
        data: h
      });
    });

    // Incidents
    incidentsForMapDisplay.forEach(({ item: inc, displayCoord }) => {
      list.push({
        id: `inc-${inc.id}`,
        type: 'incident',
        coordinate: displayCoord,
        priority: inc.priority,
        label: inc.reference?.slice(-6).toUpperCase(),
        data: inc
      });
    });

    return list;
  }, [rescuersForMapDisplay, hospitalsForMapDisplay, incidentsForMapDisplay, rescuerNames]);

  return (
    <TabScreenSafeArea style={[styles.container, styles.tabScreenNoBottomPad]}>
      <StatusBar barStyle="light-content" />

      <View style={[styles.mapAreaShell, { paddingBottom: tabBottomPad }]}>
      <View style={styles.mapWrapper}>
        {!gpsReady ? (
          <View style={styles.loadingOverlay}>
            <ActivityIndicator size="large" color={colors.secondary} />
            <Text style={styles.loadingText}>Acquisition du signal GPS…</Text>
          </View>
        ) : (
          <EBMap
            ref={mapRef as any}
            mode="TRACKING"
            style={StyleSheet.absoluteFillObject}
            markers={allMarkers}
            myLocation={[myCoords.longitude, myCoords.latitude]}
            myHeading={headingResolved}
            routeData={mapRouteData}
            cameraConfig={selection ? {
              bounds: cameraBounds || undefined,
            } : {
              center: cameraCenter,
              zoom: cameraZoom,
            }}
            onMarkerPress={(m) => {
              if (m.type === 'unit') setSelection({ kind: "rescuer", data: m.data });
              else if (m.type === 'hospital') setSelection({ kind: "hospital", data: m.data });
              else if (m.type === 'incident') setSelection({ kind: "incident", data: m.data });
            }}
            onRoutePress={(idx) => setSelectedRouteIndex(idx)}
            showControls={true}
          />
        )}

        {gpsReady && isFocused && (
          <View style={StyleSheet.absoluteFillObject} pointerEvents="none">
            <Animated.View
              style={[styles.radarLine, { transform: [{ rotate: spin }] }]}
            />
          </View>
        )}

        {/* ── Top overlay : Live + counts + filter dropdown ── */}
        {gpsReady && (
          <View style={styles.topOverlay}>
            <View style={styles.topOverlayRow}>
              <View style={styles.liveBadge}>
                <Animated.View style={[styles.liveDot, { opacity: pulseAnim }]} />
                <Text style={styles.liveText}>Live</Text>
              </View>
              <View style={styles.statusChip}>
                <Ambulance size={13} color={colors.success} strokeWidth={2.5} />
                <Text style={styles.statusChipText}>{rescuersForMap.length}{rescuerTruncLegend ? "+" : ""}</Text>
              </View>
              <View style={styles.statusChip}>
                <Hospital size={13} color={colors.success} strokeWidth={2.5} />
                <Text style={styles.statusChipText}>{hospitalsForMap.length}{hospTruncLegend ? "+" : ""}</Text>
              </View>
              <View style={styles.statusChip}>
                <TriangleAlert size={13} color="#FF453A" strokeWidth={2.5} />
                <Text style={styles.statusChipText}>{incidentsForMap.length}{incTruncLegend ? "+" : ""}</Text>
              </View>
              <AppTouchableOpacity
                style={[styles.filterBtn, filterOpen && styles.filterBtnOpen]}
                onPress={() => setFilterOpen((v) => !v)}
                activeOpacity={0.85}
              >
                <MaterialIcons name="filter-list" size={18} color={filterOpen ? "#FFF" : colors.secondary} />
                <Text style={[styles.filterBtnText, filterOpen && { color: "#FFF" }]}>
                  {activeFilterCount}/{ESTABLISHMENT_TYPE_KEYS.length}
                </Text>
              </AppTouchableOpacity>
            </View>

            {filterOpen && (
              <View style={styles.filterDropdown}>
                <AppTouchableOpacity
                  style={styles.filterDropdownChipAll}
                  onPress={() => { selectAllEstablishmentTypes(); }}
                  activeOpacity={0.85}
                >
                  <Text style={styles.filterDropdownChipAllText}>Tout cocher</Text>
                </AppTouchableOpacity>
                {ESTABLISHMENT_TYPE_KEYS.map((key) => {
                  const on = establishmentTypeFilter[key] === true;
                  return (
                    <AppTouchableOpacity
                      key={key}
                      style={[styles.filterDropdownItem, on && styles.filterDropdownItemOn]}
                      onPress={() => toggleEstablishmentType(key)}
                      activeOpacity={0.85}
                    >
                      <View style={[styles.filterDot, on && styles.filterDotOn]} />
                      <Text style={[styles.filterDropdownText, on && styles.filterDropdownTextOn]} numberOfLines={1}>
                        {ESTABLISHMENT_TYPE_LABELS[key]}
                      </Text>
                    </AppTouchableOpacity>
                  );
                })}
              </View>
            )}
          </View>
        )}

        {/* ── Bottom-left: Unified HUD ── */}
        <LiveMapTelemetryHUD
          telemetryExpanded={telemetryExpanded}
          setTelemetryExpanded={setTelemetryExpanded}
          setLegendExpanded={setLegendExpanded}
          speed={speed}
          headingResolved={headingResolved}
          accuracy={accuracy}
          battery={battery}
          selection={selection}
          destLngLat={destLngLat}
          selectionTitle={selectionTitle}
          selectionSubtitle={selectionSubtitle}
          clearSelection={clearSelection}
          hideCard={hideCard}
          cardVisible={cardVisible}
          setCardVisible={setCardVisible}
          routeLoading={routeLoading}
          selectedRoute={selectedRoute}
          routeList={routeList}
          selectedRouteIndex={selectedRouteIndex}
          onSelectRouteIndex={onSelectRouteIndex}
        />

        {/* ── Bottom-right: Legend HUD ── */}
        <LiveMapLegendHUD
          legendExpanded={legendExpanded}
          setLegendExpanded={setLegendExpanded}
          setTelemetryExpanded={setTelemetryExpanded}
          hideCard={hideCard}
          rescuersCount={rescuersForMap.length}
          rescuerTruncLegend={rescuerTruncLegend}
          hospitalsCount={hospitalsForMap.length}
          hospTruncLegend={hospTruncLegend}
          incidentsCount={incidentsForMap.length}
          incTruncLegend={incTruncLegend}
        />


      </View>
      </View>
    </TabScreenSafeArea>
  );
}

const styles = StyleSheet.create({

  container: { flex: 1, backgroundColor: colors.mainBackground },
  tabScreenNoBottomPad: { paddingBottom: 0 },
  mapAreaShell: { flex: 1, minHeight: 0 },

  mapWrapper: { flex: 1, minHeight: 0, position: "relative" },

  loadingOverlay: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: colors.tabBar,
  },
  loadingText: { ...typography.bodyMuted, marginTop: spacing.md },

  radarLine: {
    position: "absolute",
    top: "50%",
    left: "50%",
    width: 900,
    height: 1,
    backgroundColor: "rgba(68, 138, 255, 0.1)",
    transformOrigin: "0% 0%",
  },

  /* ── Top overlay (Live + counts + filter) ── */
  topOverlay: {
    position: "absolute",
    top: spacing.sm,
    left: spacing.sm,
    right: spacing.sm,
    zIndex: 25,
    elevation: 25,
  },
  topOverlayRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  liveBadge: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "rgba(18,18,18,0.92)",
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.borderHairline,
  },
  liveDot: {
    width: 7,
    height: 7,
    borderRadius: 4,
    backgroundColor: colors.success,
    marginRight: 6,
  },
  liveText: { color: colors.success, fontSize: 13, fontWeight: "800" },
  statusChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: "rgba(18,18,18,0.92)",
    paddingHorizontal: 8,
    paddingVertical: 7,
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.borderHairline,
  },
  statusChipText: { color: "#FFF", fontSize: 13, fontWeight: "700" },
  filterBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    backgroundColor: "rgba(18,18,18,0.92)",
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.borderHairline,
    marginLeft: "auto",
  },
  filterBtnOpen: {
    backgroundColor: colors.secondary,
    borderColor: colors.secondary,
  },
  filterBtnText: { color: colors.secondary, fontSize: 13, fontWeight: "800" },

  /* ── Filter dropdown ── */
  filterDropdown: {
    marginTop: 6,
    backgroundColor: "rgba(14,14,14,0.96)",
    borderRadius: radius.lg,
    padding: spacing.sm,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.borderHairline,
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 6,
  },
  filterDropdownChipAll: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.secondary + "55",
    backgroundColor: colors.secondary + "18",
  },
  filterDropdownChipAllText: { color: colors.secondary, fontSize: 13, fontWeight: "800" },
  filterDropdownItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.12)",
    backgroundColor: "rgba(255,255,255,0.04)",
  },
  filterDropdownItemOn: {
    borderColor: colors.secondary,
    backgroundColor: colors.secondary + "22",
  },
  filterDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: "rgba(255,255,255,0.2)" },
  filterDotOn: { backgroundColor: colors.secondary },
  filterDropdownText: { color: "rgba(255,255,255,0.45)", fontSize: 13, fontWeight: "700" },
  filterDropdownTextOn: { color: "#FFF" },

  /* ── Collapsible HUDs ── */
  destActions: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 12,
  },
  destBtnPrimary: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: colors.secondary,
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 16,
  },
  destBtnPrimaryText: {
    color: '#FFF',
    fontSize: 14,
    fontWeight: '700',
  },
  destBtnSecondary: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.1)',
  },
  destBtnSecondaryText: {
    color: colors.secondary,
    fontSize: 14,
    fontWeight: '700',
  },
  criterionRow: {
    flexDirection: "row",
    gap: spacing.sm,
    marginTop: spacing.sm,
  },
  criterionBtn: {
    flex: 1,
    paddingVertical: 8,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: colors.borderHairline,
    alignItems: "center",
  },
  criterionBtnOn: {
    borderColor: colors.secondary,
    backgroundColor: colors.secondary + "14",
  },
  criterionBtnText: {
    color: colors.textMuted,
    fontSize: 12,
    fontWeight: "600",
  },
  ttsSection: {
    marginBottom: spacing.md,
    paddingVertical: spacing.sm,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderColor: colors.borderHairline,
  },
  ttsHeader: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: spacing.sm,
    gap: 8,
  },
  ttsTitle: { color: colors.text, fontWeight: "700", fontSize: 13 },
  ttsAutoLabel: { ...typography.bodyMuted, fontSize: 12 },
  ttsButtons: { flexDirection: "row", gap: spacing.sm },
  ttsBtn: {
    flex: 1,
    backgroundColor: colors.secondary + "33",
    paddingVertical: 10,
    borderRadius: radius.md,
    alignItems: "center",
  },
  ttsBtnText: { color: "#fff", fontWeight: "700", fontSize: 13 },
  ttsBtnOutline: {
    flex: 1,
    borderWidth: 1,
    borderColor: colors.secondary + "55",
    paddingVertical: 10,
    borderRadius: radius.md,
    alignItems: "center",
  },
  ttsBtnTextOutline: {
    color: colors.secondary,
    fontWeight: "700",
    fontSize: 13,
  },
});
