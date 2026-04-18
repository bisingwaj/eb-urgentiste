import React, { useState, useRef, useEffect, useMemo, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Platform,
  Alert,
  Linking,
  Animated,
  Dimensions,
  Modal,
  TextInput,
  KeyboardAvoidingView,
  ActivityIndicator,
  DeviceEventEmitter,
} from 'react-native';
import { AppTouchableOpacity } from '../../components/ui/AppTouchableOpacity';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import Mapbox from '@rnmapbox/maps';
import { MapboxMapView } from '../../components/map/MapboxMapView';
import { FullscreenMapModal } from '../../components/map/FullscreenMapModal';
import { HospitalMarker, UnitMarker } from '../../components/map/mapMarkers';
import { useResolveHeadingFromRemotePosition } from '../../hooks/useResolveHeadingFromLocation';
import { MaterialIcons, MaterialCommunityIcons } from '@expo/vector-icons';
import { colors } from '../../theme/colors';
import { ALARM_STOP_EVENT } from '../../services/AlarmService';
import { supabase } from '../../lib/supabase';
import { useHospital } from '../../contexts/HospitalContext';
import { HospitalHeader } from './components/HospitalHeader';
import {
  getRoute,
  buildRouteFeature,
  geometryToCameraBounds,
  formatDurationSeconds,
} from '../../lib/mapbox';
import type { EmergencyCase, UrgencyLevel } from './HospitalDashboardTab';
import { POST_AMBULANCE_TRACKING_STATUSES } from '../../lib/hospitalNavigation';
import { formatDetailedDateTime } from '../../utils/timeFormat';

const { width } = Dimensions.get('window');

const getLevelConfig = (level: UrgencyLevel) => {
  switch (level) {
    case 'critique':
      return { color: '#FF5252', bg: 'rgba(255, 82, 82, 0.12)', label: 'CRITIQUE' };
    case 'urgent':
      return { color: '#FF9800', bg: 'rgba(255, 152, 0, 0.12)', label: 'URGENT' };
    case 'stable':
      return { color: '#69F0AE', bg: 'rgba(105, 240, 174, 0.12)', label: 'STABLE' };
  }
};

const REFUSAL_REASONS = [
  "Indisponibilité de lits",
  "Manque de spécialiste de garde",
  "Plateau technique insuffisant",
  "Indisponibilité de bloc opératoire",
  "Maintenance en cours",
  "Autre raison"
];

const ASSESSMENT_LABELS: Record<string, string> = {
  conscious: "Conscience",
  breathing: "Respiration",
  circulation: "Pouls / Circulation",
  severity: "Gravité estimée",
  hemorrhage: "Hémorragie",
  fracture: "Traumatisme / Fracture",
  pain_level: "Niveau de Douleur",
  appearance: "Apparence / Interaction",
  work_of_breathing: "Lutte respiratoire",
};

const ASSESSMENT_VALUES: Record<string, string> = {
  true: "OUI",
  false: "NON",
  stable: "Stable",
  urgent: "Urgent",
  critique: "Critique",
  none: "Aucun(e)",
  controlled: "Contrôlée",
  pulsatile: "Massive / Pulsatile",
  strong: "Bien frappé",
  weak: "Filant / Faible",
};

export function HospitalCaseDetailScreen({ route, navigation }: any) {
  const { caseData: initialCaseData } = route.params as { caseData: EmergencyCase };
  const [caseData, setCaseData] = useState(initialCaseData);
  const { updateCaseStatus, activeCases } = useHospital();
  const levelCfg = getLevelConfig(caseData.level);
  const insets = useSafeAreaInsets();

  useEffect(() => {
    DeviceEventEmitter.emit(ALARM_STOP_EVENT);
  }, []);

  const isEnRoute = caseData.dispatchStatus === 'en_route_hospital' || caseData.status === 'en_cours';
  const hasHospitalAccepted = caseData.hospitalStatus === 'accepted';
  const isPendingHospitalResponse = !caseData.hospitalStatus || caseData.hospitalStatus === 'pending';
  const needsHospitalInteraction = isPendingHospitalResponse && !isEnRoute;

  const showAmbulanceTracking = hasHospitalAccepted && !!caseData.unitId && !POST_AMBULANCE_TRACKING_STATUSES.includes(caseData.status);

  const hospitalCoord = useMemo((): [number, number] | null => {
    const lat = caseData.assignedStructureLat;
    const lng = caseData.assignedStructureLng;
    if (lat == null || lng == null || !Number.isFinite(lat) || !Number.isFinite(lng)) return null;
    return [lng, lat];
  }, [caseData.assignedStructureLat, caseData.assignedStructureLng]);

  useEffect(() => {
    const updated = activeCases.find((c) => c.id === caseData.id);
    if (!updated) return;
    setCaseData((prev) => ({ ...prev, ...updated }));
  }, [activeCases, caseData.id]);

  const [showRefusalModal, setShowRefusalModal] = useState(route.params?.autoOpenRefuse === true);
  const [selectedReason, setSelectedReason] = useState("");
  const [otherReason, setOtherReason] = useState("");
  const [accepting, setAccepting] = useState(false);
  const [refusing, setRefusing] = useState(false);
  const [showHistoryExpanded, setShowHistoryExpanded] = useState(false);

  // Hold-to-Accept Animation
  const holdProgress = useRef(new Animated.Value(0)).current;

  const handleAcceptCase = useCallback(async () => {
    setAccepting(true);
    try {
      await updateCaseStatus(caseData.id, { hospitalStatus: 'accepted' });
      setCaseData(prev => ({ ...prev, hospitalStatus: 'accepted' }));
    } catch (err) {
      Alert.alert('Erreur', 'Impossible d\'accepter le cas actuellement.');
    } finally {
      setAccepting(false);
    }
  }, [caseData.id, updateCaseStatus]);

  const handleHoldIn = () => {
    Animated.timing(holdProgress, {
      toValue: 1,
      duration: 1000,
      useNativeDriver: false,
    }).start();
  };

  const handleHoldOut = () => {
    holdProgress.stopAnimation((val) => {
      if (val >= 0.95) {
        holdProgress.setValue(1);
        void handleAcceptCase();
      } else {
        Animated.timing(holdProgress, {
          toValue: 0,
          duration: 200,
          useNativeDriver: false,
        }).start();
      }
    });
  };

  const handleRefuseCase = useCallback(async () => {
    const finalReason = selectedReason === "Autre raison" ? otherReason : selectedReason;
    if (!finalReason) {
      Alert.alert("Action requise", "Veuillez sélectionner ou saisir une raison.");
      return;
    }
    setRefusing(true);
    try {
      await updateCaseStatus(caseData.id, { hospitalStatus: 'refused', hospitalNotes: finalReason });
      setShowRefusalModal(false);
      navigation.goBack();
    } catch (err) {
      Alert.alert('Erreur', 'Impossible de refuser ce cas.');
    } finally {
      setRefusing(false);
    }
  }, [selectedReason, otherReason, caseData.id, updateCaseStatus, navigation]);

  const unitDialNumber = caseData.urgentistePhone && caseData.urgentistePhone !== '-' ? caseData.urgentistePhone : '';

  const handleCall = () => {
    if (!unitDialNumber) return;
    Linking.openURL(`tel:${unitDialNumber}`);
  };

  const handleGoToAdmission = () => {
    // Route to the correct clinical step based on saved progress
    const hStatus = caseData.hospitalDetailStatus || caseData.status;
    if (hStatus === 'monitoring') {
      navigation.navigate('HospitalClosure', { caseData });
    } else if (hStatus === 'prise_en_charge') {
      navigation.navigate('HospitalMonitoring', { caseData });
    } else if (hStatus === 'triage') {
      navigation.navigate('HospitalPriseEnCharge', { caseData });
    } else {
      // Default: start from admission (which leads to triage)
      navigation.navigate('HospitalAdmission', { caseData });
    }
  };

  const getResumeLabel = () => {
    const hStatus = caseData.hospitalDetailStatus || caseData.status;
    switch (hStatus) {
      case 'triage': return 'CONTINUER · PRISE EN CHARGE';
      case 'prise_en_charge': return 'CONTINUER · MONITORING';
      case 'monitoring': return 'CONTINUER · CLÔTURE';
      default: return 'PROCÉDER AU BILAN CLINIQUE';
    }
  };

  const handleAdmitPatient = useCallback(async () => {
    setAccepting(true);
    try {
      await updateCaseStatus(caseData.id, { status: 'admis' });
      Alert.alert("Admission confirmée", "Le patient est désormais enregistré dans vos admissions.");
    } catch (err) {
      Alert.alert('Erreur', 'Impossible d\'admettre le patient actuellement.');
    } finally {
      setAccepting(false);
    }
  }, [caseData.id, updateCaseStatus]);

  const [ambulanceLat, setAmbulanceLat] = useState<number | null>(null);
  const [ambulanceLng, setAmbulanceLng] = useState<number | null>(null);
  const [ambulanceSpeed, setAmbulanceSpeed] = useState<number | null>(null);
  const [ambulanceHeadingRaw, setAmbulanceHeadingRaw] = useState<number | null>(null);
  const [lastUpdate, setLastUpdate] = useState<Date | null>(null);
  const [rescuerName, setRescuerName] = useState<string>('Unité');
  const [routeGeoJSON, setRouteGeoJSON] = useState<GeoJSON.FeatureCollection | null>(null);
  const [routeDurationSec, setRouteDurationSec] = useState<number | null>(null);
  const lastRouteFetch = useRef(0);

  const hasAmbulancePosition = ambulanceLat != null && ambulanceLng != null;

  useEffect(() => {
    if (!showAmbulanceTracking || !hospitalCoord || ambulanceLat == null || ambulanceLng == null) return;
    const now = Date.now();
    if (now - lastRouteFetch.current < 15000 && routeGeoJSON) return;
    lastRouteFetch.current = now;
    const origin: [number, number] = [ambulanceLng, ambulanceLat];
    getRoute(origin, hospitalCoord, { profile: 'driving-traffic' }).then((result) => {
      if (result) {
        setRouteGeoJSON(buildRouteFeature(result.geometry));
        setRouteDurationSec(result.duration);
      }
    });
  }, [ambulanceLat, ambulanceLng, hospitalCoord, showAmbulanceTracking]);

  const mapCameraBounds = useMemo(() => {
    if (routeGeoJSON?.features[0]?.geometry) return geometryToCameraBounds(routeGeoJSON.features[0].geometry as GeoJSON.LineString, 80);
    return null;
  }, [routeGeoJSON]);

  useEffect(() => {
    if (!showAmbulanceTracking || !caseData.unitId) return;
    let channel: any = null;
    let isMounted = true;
    async function initTracking() {
      const { data: rescuers } = await supabase.from('users_directory').select('auth_user_id, first_name, last_name').eq('assigned_unit_id', caseData.unitId);
      if (!rescuers || rescuers.length === 0) return;
      const rescuerIds = rescuers.map((r: any) => r.auth_user_id).filter(Boolean);
      if (rescuers[0]?.first_name) setRescuerName(`${rescuers[0].first_name} ${rescuers[0].last_name || ''}`.trim());

      const { data: activeRescuers } = await supabase.from('active_rescuers').select('lat, lng, speed, battery, heading, updated_at').in('user_id', rescuerIds).order('updated_at', { ascending: false }).limit(1);
      const row = activeRescuers?.[0];
      if (row && isMounted) {
        setAmbulanceLat(Number(row.lat)); setAmbulanceLng(Number(row.lng));
        setAmbulanceSpeed(row.speed != null ? Number(row.speed) : null);
        if (row.heading != null) setAmbulanceHeadingRaw(Number(row.heading));
        if (row.updated_at) setLastUpdate(new Date(row.updated_at));
      }

      channel = supabase.channel(`hospital-track-${caseData.unitId}`).on('postgres_changes', { event: '*', schema: 'public', table: 'active_rescuers' }, (payload: any) => {
        const data = payload.new || payload.old;
        if (!data || !isMounted) return;
        if (data.lat != null) setAmbulanceLat(Number(data.lat));
        if (data.lng != null) setAmbulanceLng(Number(data.lng));
        if (data.updated_at) setLastUpdate(new Date(data.updated_at));
      }).subscribe();
    }
    void initTracking();
    return () => { isMounted = false; if (channel) supabase.removeChannel(channel); };
  }, [showAmbulanceTracking, caseData.unitId]);

  const ambulanceDirectionDeg = useResolveHeadingFromRemotePosition({ lat: ambulanceLat, lng: ambulanceLng, headingFromServer: ambulanceHeadingRaw, speedMps: ambulanceSpeed });
  const [mapFullscreenOpen, setMapFullscreenOpen] = useState(false);

  const etaMainDisplay = routeDurationSec != null ? formatDurationSeconds(routeDurationSec) : caseData.eta || '—';

  const formatAssessmentValue = (val: any) => {
    if (val === true || val === "true") return ASSESSMENT_VALUES.true;
    if (val === false || val === "false") return ASSESSMENT_VALUES.false;
    const str = String(val).toLowerCase();
    return ASSESSMENT_VALUES[str] || val;
  };

  const getAssessmentIcon = (key: string, val: any) => {
    const isBad = val === false || val === "false" || val === "none" || val === "critique" || val === "pulsatile";
    const isWarning = val === "urgent" || val === "weak" || val === "controlled";

    if (isBad) return <MaterialIcons name="error" size={18} color={colors.primary} />;
    if (isWarning) return <MaterialIcons name="warning" size={18} color="#FF9800" />;
    return <MaterialIcons name="check-circle" size={18} color={colors.success} />;
  };

  const PatientAvatar = () => {
    let iconName: any = "account";
    if (caseData.sex === 'M') iconName = "face-man";
    else if (caseData.sex === 'F') iconName = "face-woman";
    return (
      <View style={[styles.avatarBox, { backgroundColor: levelCfg.bg }]}>
        <MaterialCommunityIcons name={iconName} size={32} color={levelCfg.color} />
      </View>
    );
  };

  return (
    <View style={{ flex: 1, backgroundColor: colors.mainBackground }}>
      <HospitalHeader showBack={true} title="Détails Admission" />

      <ScrollView style={styles.mainScroll} showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 140 }}>

        {/* SECTION 1: PATIENT IDENTITY CARD */}
        <View style={styles.profileSection}>
          <View style={styles.profileMainRow}>
            <PatientAvatar />
            <View style={styles.profileIdInfo}>
              <View style={styles.nameRow}>
                <Text style={styles.profileName} numberOfLines={1}>{caseData.victimName || 'Patient inconnu'}</Text>
                <View style={[styles.levelPill, { backgroundColor: levelCfg.bg, borderColor: levelCfg.color + '40' }]}>
                  <Text style={[styles.levelPillText, { color: levelCfg.color }]}>{levelCfg.label}</Text>
                </View>
              </View>
              <View style={styles.profileMetaRow}>
                <Text style={styles.profileMetaValue}>{caseData.sex === 'M' ? 'Homme' : caseData.sex === 'F' ? 'Femme' : caseData.sex}</Text>
                {caseData.age ? (
                  <>
                    <View style={styles.metaDot} />
                    <Text style={styles.profileMetaValue}>{caseData.age} ans</Text>
                  </>
                ) : null}
                {caseData.patientProfile?.bloodType && (
                  <>
                    <View style={styles.metaDot} />
                    <View style={styles.bloodBadge}>
                      <Text style={styles.bloodBadgeText}>{caseData.patientProfile.bloodType}</Text>
                    </View>
                  </>
                )}
              </View>
              {caseData.callerPhone && (
                <AppTouchableOpacity style={styles.profileContactLine} onPress={() => Linking.openURL(`tel:${caseData.callerPhone}`)}>
                  <MaterialIcons name="phone" size={12} color={colors.secondary} />
                  <Text style={styles.profilePhone}>{caseData.callerPhone}</Text>
                </AppTouchableOpacity>
              )}
            </View>
          </View>

          {/* TIMELINE (compact) */}
          <View style={styles.timelineRow}>
            {caseData.dispatchCreatedAt && (
              <View style={styles.timelineChip}>
                <View style={[styles.timelineDot, { backgroundColor: '#FF9800' }]} />
                <Text style={styles.timelineLabel}>Signalé</Text>
                <Text style={styles.timelineValue}>{formatDetailedDateTime(caseData.dispatchCreatedAt)}</Text>
              </View>
            )}
            {caseData.hospitalRespondedAt && (
              <View style={styles.timelineChip}>
                <View style={[styles.timelineDot, { backgroundColor: colors.success }]} />
                <Text style={styles.timelineLabel}>Accepté</Text>
                <Text style={styles.timelineValue}>{formatDetailedDateTime(caseData.hospitalRespondedAt)}</Text>
              </View>
            )}
            {caseData.triageRecordedAt && (
              <View style={styles.timelineChip}>
                <View style={[styles.timelineDot, { backgroundColor: colors.secondary }]} />
                <Text style={styles.timelineLabel}>Admis</Text>
                <Text style={styles.timelineValue}>{formatDetailedDateTime(caseData.triageRecordedAt)}</Text>
              </View>
            )}
          </View>
        </View>

        {/* SECTION 2: BILAN INITIAL / SYMPTÔMES (CHECKLIST STYLE) */}
        <View style={styles.clinicalModule}>
          <View style={styles.moduleHeader}>
            <MaterialIcons name="fact-check" size={18} color={levelCfg.color} />
            <Text style={[styles.moduleTitle, { color: levelCfg.color }]}>BILAN INITIAL (URGENTISTE)</Text>
          </View>

          <View style={styles.symptomsCard}>
            {(!caseData.medicalAssessment || !caseData.description?.includes('[ÉVALUATION]')) && (
              <Text style={styles.primaryMotif}>{caseData.description || 'Action immédiate requise'}</Text>
            )}

            {caseData.medicalAssessment && Object.keys(caseData.medicalAssessment).some(k => !['careChecklist', 'assessment_completed_at'].includes(k)) ? (
              <View style={styles.checklistContainer}>
                {Object.entries(caseData.medicalAssessment)
                  .filter(([key]) => !['careChecklist', 'assessment_completed_at'].includes(key) && ASSESSMENT_LABELS[key])
                  .map(([key, val]) => (
                    <View key={key} style={styles.checklistItem}>
                      {getAssessmentIcon(key, val)}
                      <View style={styles.checklistLineRow}>
                        <Text style={styles.checklistLabel}>{ASSESSMENT_LABELS[key]} :</Text>
                        <Text style={[styles.checklistValue, { marginLeft: 8 }]}>{formatAssessmentValue(val)}</Text>
                      </View>
                    </View>
                  ))}
              </View>
            ) : (caseData.description?.includes('[ÉVALUATION]') || caseData.sosResponses) ? (
              <View style={{ gap: 12 }}>
                {caseData.description?.includes('[ÉVALUATION]') && (
                  <Text style={styles.primaryMotif}>{caseData.description.split('[ÉVALUATION]')[1].trim()}</Text>
                )}
                {caseData.sosResponses && (
                  <View style={styles.responsesList}>
                    {caseData.sosResponses.map((r, i) => (
                      <View key={i} style={styles.responseRow}>
                        <View style={[styles.statusDot, { backgroundColor: r.gravityScore > 0 ? colors.primary : colors.success }]} />
                        <Text style={styles.responseText}>{r.questionText} : {r.answer}</Text>
                      </View>
                    ))}
                  </View>
                )}
              </View>
            ) : (
              <Text style={styles.noDataText}>Aucun bilan structuré disponible.</Text>
            )}

            {caseData.symptoms && (
              <View style={styles.tagsContainer}>
                {(Array.isArray(caseData.symptoms) ? caseData.symptoms : [caseData.symptoms]).map((s, i) => (
                  <View key={i} style={styles.symptomTag}>
                    <Text style={styles.symptomTagText}>{s}</Text>
                  </View>
                ))}
              </View>
            )}

            {/* COLLAPSIBLE: Allergies & Medical History */}
            {(caseData.patientProfile?.allergies?.length || caseData.patientProfile?.medicalHistory?.length) ? (
              <View style={styles.historyCollapsible}>
                <AppTouchableOpacity
                  style={styles.historyToggle}
                  onPress={() => setShowHistoryExpanded(!showHistoryExpanded)}
                >
                  <MaterialIcons name="medical-information" size={16} color="rgba(255,255,255,0.4)" />
                  <Text style={styles.historyToggleText}>Antécédents & Allergies</Text>
                  <MaterialIcons
                    name={showHistoryExpanded ? "expand-less" : "expand-more"}
                    size={20}
                    color="rgba(255,255,255,0.3)"
                  />
                </AppTouchableOpacity>
                {showHistoryExpanded && (
                  <View style={styles.historyContent}>
                    {caseData.patientProfile?.allergies?.length ? (
                      <View style={styles.historyItem}>
                        <Text style={styles.historyLabel}>ALLERGIES</Text>
                        <Text style={[styles.historyValue, { color: colors.primary }]}>
                          {caseData.patientProfile.allergies.join(', ')}
                        </Text>
                      </View>
                    ) : null}
                    {caseData.patientProfile?.medicalHistory?.length ? (
                      <View style={styles.historyItem}>
                        <Text style={styles.historyLabel}>ANTÉCÉDENTS MÉDICAUX</Text>
                        <Text style={styles.historyValue}>
                          {caseData.patientProfile.medicalHistory.join(', ')}
                        </Text>
                      </View>
                    ) : null}
                  </View>
                )}
              </View>
            ) : null}
          </View>
        </View>

        {/* SECTION 3: PREMIERS SOINS (FIRST AID) */}
        {caseData.careChecklist && caseData.careChecklist.length > 0 ? (
          <View style={styles.contentSection}>
            <Text style={styles.sectionLabel}>PREMIERS SOINS ADMINISTRÉS</Text>
            <View style={styles.careCard}>
              {caseData.careChecklist.map((item, idx) => (
                <View key={idx} style={styles.careItem}>
                  <MaterialIcons name="medical-services" size={16} color={colors.success} />
                  <Text style={styles.careText}>{item}</Text>
                </View>
              ))}
            </View>
          </View>
        ) : null}

        {/* SECTION 4: LOGISTIQUE & TRANSPORT */}
        <View style={styles.contentSection}>
          <Text style={styles.sectionLabel}>LOGISTIQUE & TRANSPORT</Text>

          <View style={styles.logisticsCard}>
            <View style={styles.addressHeader}>
              <View style={{ flex: 1 }}>
                <Text style={styles.addressTitle}>Localisation du patient</Text>
                <Text style={styles.addressBody} numberOfLines={2}>{caseData.address}</Text>
              </View>
              <AppTouchableOpacity
                style={styles.mapTriggerBtn}
                onPress={() => setMapFullscreenOpen(true)}
              >
                <MaterialIcons name="map" size={20} color={colors.secondary} />
              </AppTouchableOpacity>
            </View>

            <View style={styles.etaStats}>
              <View style={styles.etaStatItem}>
                <MaterialIcons name="timer" size={14} color="#FFF" style={{ opacity: 0.5 }} />
                <Text style={styles.etaStatVal}>{etaMainDisplay}</Text>
              </View>
              <View style={styles.etaStatSep} />
              <View style={styles.etaStatItem}>
                <MaterialIcons name="navigation" size={14} color="#FFF" style={{ opacity: 0.5 }} />
                <Text style={styles.etaStatVal}>{caseData.distance || '--'}</Text>
              </View>
            </View>

            <View style={styles.teamDivider} />

            <View style={styles.transportTeamBlock}>
              <View style={styles.teamHeader}>
                <Text style={styles.teamLabel}>ÉQUIPE D'INTERVENTION</Text>
                <AppTouchableOpacity style={styles.teamCallBtn} onPress={handleCall}>
                  <MaterialIcons name="phone" size={18} color={colors.success} />
                </AppTouchableOpacity>
              </View>

              <View style={styles.teamDetailsRow}>
                <View style={[styles.teamIconBox, { backgroundColor: colors.secondary + '15' }]}>
                  <MaterialIcons name="local-shipping" size={20} color={colors.secondary} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.unitCallsign}>{caseData.urgentisteName}</Text>
                  <Text style={styles.agentName}>{rescuerName || 'En attente...'}</Text>
                  {caseData.unitVehiclePlate && <Text style={styles.vehiclePlate}>{caseData.unitVehiclePlate}</Text>}
                </View>
              </View>
            </View>
          </View>
        </View>

        {/* MAP TRACKING (IF ACCEPTED) */}
        {showAmbulanceTracking && (
          <View style={styles.embeddedMapWrap}>
            <MapboxMapView style={styles.embeddedMap} styleURL={Mapbox.StyleURL.Dark} compassEnabled={false} zoomEnabled={true} rotateEnabled={false}>
              {mapCameraBounds && <Mapbox.Camera bounds={mapCameraBounds} animationDuration={1000} />}
              {hospitalCoord && (
                <Mapbox.MarkerView id="hosp-mark" coordinate={hospitalCoord}>
                  <HospitalMarker label="Hôpital" beds={0} />
                </Mapbox.MarkerView>
              )}
              {hasAmbulancePosition && (
                <Mapbox.MarkerView id="amb-mark" coordinate={[ambulanceLng!, ambulanceLat!]}>
                  <UnitMarker status="en_route" headingDeg={ambulanceDirectionDeg} />
                </Mapbox.MarkerView>
              )}
              {routeGeoJSON && (
                <Mapbox.ShapeSource id="rt-src" shape={routeGeoJSON}>
                  <Mapbox.LineLayer id="rt-layer" style={{ lineColor: colors.routePrimary, lineWidth: 4, lineOpacity: 0.8 }} />
                </Mapbox.ShapeSource>
              )}
            </MapboxMapView>
          </View>
        )}

      </ScrollView>

      {/* FOOTER ACTIONS */}
      <View style={[styles.footerActions, { paddingBottom: insets.bottom + 16 }]}>
        {needsHospitalInteraction ? (
          <View style={styles.actionRowPrimary}>
            <AppTouchableOpacity
              style={styles.btnSecondaryRefuse}
              onPress={() => setShowRefusalModal(true)}
              disabled={accepting}
            >
              <Text style={styles.btnRefuseText}>REFUSER</Text>
            </AppTouchableOpacity>

            <AppTouchableOpacity
              style={styles.holdAcceptContainer}
              activeOpacity={1}
              onPressIn={handleHoldIn}
              onPressOut={handleHoldOut}
              disabled={accepting}
            >
              <Animated.View style={[
                styles.holdProgressBar,
                {
                  transform: [
                    { translateX: -((width - 48) / 1.5) },
                    {
                      translateX: holdProgress.interpolate({
                        inputRange: [0, 1],
                        outputRange: [0, (width - 48) / 1.5]
                      })
                    }
                  ]
                }
              ]} />
              <View style={styles.holdContent}>
                <Text style={styles.btnAcceptText}>
                  {accepting ? "ENVOI..." : "MAINTENIR POUR ACCEPTER"}
                </Text>
                {accepting && <ActivityIndicator size="small" color="#FFF" />}
              </View>
            </AppTouchableOpacity>
          </View>
        ) : hasHospitalAccepted && !['admis', 'triage', 'prise_en_charge', 'monitoring'].includes(caseData.hospitalDetailStatus || '') ? (
          <View style={styles.postAcceptRow}>
            {caseData.dispatchStatus === 'arrived_hospital' || caseData.dispatchStatus === 'completed' || caseData.dispatchStatus === 'mission_end' ? (
              <AppTouchableOpacity
                style={styles.mainCtaBtn}
                onPress={handleAdmitPatient}
                loading={accepting}
              >
                <Text style={styles.mainCtaBtnText}>VALIDER L'ADMISSION</Text>
                <MaterialIcons name="check-circle" size={22} color="#000" />
              </AppTouchableOpacity>
            ) : (
              <View style={styles.blockingContainer}>
                 <View style={styles.blockingMessage}>
                    <MaterialCommunityIcons name="clock-alert-outline" size={18} color="#FFB74D" />
                    <Text style={styles.blockingText}>L'unité n'a pas encore validé son arrivée (Arrivé à l'hôpital)</Text>
                 </View>
                 <View style={[styles.mainCtaBtn, { opacity: 0.3, backgroundColor: 'rgba(255,255,255,0.1)' }]}>
                    <Text style={[styles.mainCtaBtnText, { color: 'rgba(255,255,255,0.4)' }]}>EN ATTENTE D'ARRIVÉE</Text>
                 </View>
              </View>
            )}
          </View>
        ) : hasHospitalAccepted ? (
          <View style={styles.postAcceptRow}>
            <AppTouchableOpacity
              style={[styles.mainCtaBtn, { backgroundColor: 'transparent', borderWidth: 1, borderColor: colors.secondary }]}
              onPress={handleGoToAdmission}
            >
              <Text style={[styles.mainCtaBtnText, { color: colors.secondary }]}>{getResumeLabel()}</Text>
              <MaterialIcons name="chevron-right" size={24} color={colors.secondary} />
            </AppTouchableOpacity>
          </View>
        ) : null}
      </View>

      <FullscreenMapModal
        visible={mapFullscreenOpen}
        onClose={() => setMapFullscreenOpen(false)}
      >
        <MapboxMapView style={styles.embeddedMap} styleURL={Mapbox.StyleURL.Dark} compassEnabled={true}>
          {mapCameraBounds && <Mapbox.Camera bounds={mapCameraBounds} animationDuration={1000} />}
          {hospitalCoord && (
            <Mapbox.MarkerView id="hosp-mark-fs" coordinate={hospitalCoord}>
              <HospitalMarker label="Hôpital" beds={0} />
            </Mapbox.MarkerView>
          )}
          {hasAmbulancePosition && (
            <Mapbox.MarkerView id="amb-mark-fs" coordinate={[ambulanceLng!, ambulanceLat!]}>
              <UnitMarker status="en_route" headingDeg={ambulanceDirectionDeg} />
            </Mapbox.MarkerView>
          )}
          {routeGeoJSON && (
            <Mapbox.ShapeSource id="rt-src-fs" shape={routeGeoJSON}>
              <Mapbox.LineLayer id="rt-layer-fs" style={{ lineColor: colors.routePrimary, lineWidth: 6, lineOpacity: 0.9 }} />
            </Mapbox.ShapeSource>
          )}
        </MapboxMapView>
      </FullscreenMapModal>

      {/* REFUSAL MODAL */}
      <Modal visible={showRefusalModal} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.modalContent}>
            <Text style={styles.modalTitle}>Raison du refus</Text>
            <ScrollView style={{ maxHeight: 300 }}>
              {REFUSAL_REASONS.map((r) => (
                <View key={r} style={styles.reasonOption}>
                  <AppTouchableOpacity style={styles.reasonBtn} onPress={() => setSelectedReason(r)}>
                    <View style={styles.radio}>
                      <View style={[styles.radioDot, selectedReason === r && { backgroundColor: colors.secondary }]} />
                    </View>
                    <Text style={styles.reasonText}>{r}</Text>
                  </AppTouchableOpacity>
                </View>
              ))}
            </ScrollView>
            {selectedReason === 'Autre raison' && (
              <TextInput style={styles.reasonInput} placeholder="Détaillez la raison..." placeholderTextColor="#666" value={otherReason} onChangeText={setOtherReason} multiline />
            )}
            <View style={styles.modalActions}>
              <AppTouchableOpacity style={styles.modalCancel} onPress={() => setShowRefusalModal(false)}><Text style={styles.cancelText}>ANNULER</Text></AppTouchableOpacity>
              <AppTouchableOpacity style={[styles.modalConfirm, { opacity: refusing ? 0.6 : 1 }]} onPress={handleRefuseCase} disabled={refusing}><Text style={styles.confirmText}>CONFIRMER REJET</Text></AppTouchableOpacity>
            </View>
          </KeyboardAvoidingView>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: colors.mainBackground },
  mainScroll: { flex: 1 },

  // HEADER
  detailHeader: {
    height: 64,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    backgroundColor: '#0A0A0A',
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.06)',
  },
  headerBackBtn: { padding: 8, marginLeft: -8 },
  headerTitleWrap: { flex: 1, alignItems: 'center' },
  headerMainTitle: { color: '#FFF', fontSize: 18, fontWeight: '800' },
  headerSubType: { color: colors.textMuted, fontSize: 10, fontWeight: '900', letterSpacing: 1.5 },

  // CLINICAL MODULE
  clinicalModule: { marginTop: 24, paddingHorizontal: 16 },
  moduleHeader: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 12 },
  moduleTitle: { fontSize: 12, fontWeight: '900', letterSpacing: 1.5 },
  symptomsCard: {
    backgroundColor: colors.surface,
    borderRadius: 20,
    padding: 20,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
  },
  primaryMotif: { color: '#FFF', fontSize: 20, fontWeight: '700', lineHeight: 28, marginBottom: 20 },

  // Checklist Style for assessment
  checklistContainer: { gap: 8, marginBottom: 8 },
  checklistItem: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 4 },
  checklistLineRow: { flex: 1, flexDirection: 'row', alignItems: 'center' },
  checklistLabel: { color: 'rgba(255,255,255,0.4)', fontSize: 13, fontWeight: '700' },
  checklistValue: { color: '#FFF', fontSize: 13, fontWeight: '800' },
  noDataText: { color: 'rgba(255,255,255,0.3)', fontSize: 14, fontStyle: 'italic', textAlign: 'center', marginVertical: 10 },

  responsesList: { gap: 10, marginBottom: 16 },
  responseRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  statusDot: { width: 6, height: 6, borderRadius: 3 },
  responseText: { color: '#FFF', fontSize: 13, fontWeight: '600', lineHeight: 20 },
  tagsContainer: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  symptomTag: {
    backgroundColor: 'rgba(255,255,255,0.05)',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
  },
  symptomTagText: { color: 'rgba(255,255,255,0.7)', fontSize: 11, fontWeight: '800' },

  // CONTENT SECTIONS
  contentSection: { marginTop: 24, paddingHorizontal: 16 },
  sectionLabel: { color: 'rgba(255,255,255,0.2)', fontSize: 11, fontWeight: '900', letterSpacing: 1.5, marginBottom: 16 },

  // PROFILE SECTION (BLENDED HERO)
  profileSection: { 
    backgroundColor: '#0A0A0A', 
    paddingHorizontal: 16, 
    paddingTop: 12,
    paddingBottom: 24,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.06)',
  },
  profileMainRow: { flexDirection: 'row', alignItems: 'center' },
  avatarBox: { width: 64, height: 64, borderRadius: 32, justifyContent: 'center', alignItems: 'center', marginRight: 16 },
  profileIdInfo: { flex: 1 },
  nameRow: { flexDirection: 'row', alignItems: 'center', gap: 10, flexWrap: 'wrap' },
  profileName: { color: '#FFF', fontSize: 22, fontWeight: '800', flexShrink: 1 },
  levelPill: { paddingHorizontal: 8, paddingVertical: 4, borderRadius: 8, borderWidth: 1 },
  levelPillText: { fontSize: 10, fontWeight: '900', letterSpacing: 0.5 },
  profileMetaRow: { flexDirection: 'row', alignItems: 'center', marginTop: 4 },
  profileMetaValue: { color: 'rgba(255,255,255,0.8)', fontSize: 13, fontWeight: '600' },
  metaDot: { width: 4, height: 4, borderRadius: 2, backgroundColor: 'rgba(255,255,255,0.2)', marginHorizontal: 8 },
  bloodBadge: { backgroundColor: 'rgba(255,82,82,0.1)', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4, borderWidth: 1, borderColor: 'rgba(255,82,82,0.2)' },
  bloodBadgeText: { color: colors.primary, fontSize: 12, fontWeight: '800' },
  profileContactLine: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 8 },
  profilePhone: { color: colors.secondary, fontSize: 13, fontWeight: '700' },
  
  // COMPACT TIMELINE
  timelineRow: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 20, backgroundColor: 'rgba(255,255,255,0.03)', padding: 12, borderRadius: 12, borderWidth: 1, borderColor: 'rgba(255,255,255,0.05)' },
  timelineChip: { flexDirection: 'column', alignItems: 'center', gap: 4, flex: 1 },
  timelineDot: { width: 8, height: 8, borderRadius: 4, marginBottom: 2 },
  timelineLabel: { color: 'rgba(255,255,255,0.4)', fontSize: 10, fontWeight: '800', textTransform: 'uppercase' },
  timelineValue: { color: '#FFF', fontSize: 11, fontWeight: '700' },

  // COLLAPSIBLE HISTORY (Inside Bilan Initial)
  historyCollapsible: { marginTop: 16, borderTopWidth: 1, borderTopColor: 'rgba(255,255,255,0.06)', paddingTop: 16 },
  historyToggle: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 4 },
  historyToggleText: { flex: 1, color: 'rgba(255,255,255,0.6)', fontSize: 12, fontWeight: '800', letterSpacing: 0.5, textTransform: 'uppercase' },
  historyContent: { marginTop: 12, backgroundColor: 'rgba(0,0,0,0.2)', padding: 12, borderRadius: 12, borderWidth: 1, borderColor: 'rgba(255,255,255,0.04)' },
  historyItem: { marginBottom: 12 },
  historyLabel: { color: 'rgba(255,255,255,0.3)', fontSize: 10, fontWeight: '900', letterSpacing: 1, marginBottom: 4 },
  historyValue: { color: '#FFF', fontSize: 13, fontWeight: '600', lineHeight: 20 },

  // CARE CARD (First Aid)
  careCard: {
    backgroundColor: 'rgba(105, 240, 174, 0.05)',
    borderRadius: 20,
    padding: 20,
    borderWidth: 1,
    borderColor: 'rgba(105, 240, 174, 0.15)',
    gap: 12,
  },
  careItem: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  careText: { color: '#FFF', fontSize: 15, fontWeight: '700' },

  // LOGISTICS CARD
  logisticsCard: {
    backgroundColor: colors.surface,
    borderRadius: 20,
    padding: 20,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
  },
  addressHeader: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 16 },
  addressTitle: { color: 'rgba(255,255,255,0.4)', fontSize: 11, fontWeight: '900', letterSpacing: 1, marginBottom: 6 },
  addressBody: { color: '#FFF', fontSize: 15, fontWeight: '700', lineHeight: 22 },
  mapTriggerBtn: {
    width: 44, height: 44, borderRadius: 22,
    backgroundColor: 'rgba(68,138,255,0.1)',
    justifyContent: 'center', alignItems: 'center',
    borderWidth: 1, borderColor: 'rgba(68,138,255,0.2)'
  },
  etaStats: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  etaStatItem: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  etaStatVal: { color: '#FFF', fontSize: 13, fontWeight: '900' },
  etaStatSep: { width: 1, height: 12, backgroundColor: 'rgba(255,255,255,0.15)' },
  teamDivider: { height: 1, backgroundColor: 'rgba(255,255,255,0.06)', marginVertical: 16 },
  transportTeamBlock: {},
  teamHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
  teamLabel: { color: 'rgba(255,255,255,0.3)', fontSize: 10, fontWeight: '900', letterSpacing: 1 },
  teamCallBtn: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  teamCallText: { color: colors.success, fontSize: 11, fontWeight: '900' },
  teamDetailsRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  teamIconBox: { width: 44, height: 44, borderRadius: 12, justifyContent: 'center', alignItems: 'center' },
  unitCallsign: { color: '#FFF', fontSize: 16, fontWeight: '800' },
  agentName: { color: 'rgba(255,255,255,0.4)', fontSize: 12, fontWeight: '600' },
  vehiclePlate: { color: colors.secondary, fontSize: 11, fontWeight: '900', marginTop: 2 },

  // EMBEDDED MAP
  embeddedMapWrap: { marginHorizontal: 16, marginTop: 24, borderRadius: 20, overflow: 'hidden', height: 200, borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)' },
  embeddedMap: { flex: 1 },

  // FOOTER
  footerActions: {
    position: 'absolute', bottom: 0, left: 0, right: 0,
    backgroundColor: 'rgba(5,5,5,0.95)',
    paddingTop: 16, borderTopWidth: 1, borderTopColor: 'rgba(255,255,255,0.1)',
  },
  actionRowPrimary: { flexDirection: 'row', gap: 12, paddingHorizontal: 16 },
  btnSecondaryRefuse: {
    flex: 1, height: 56, borderRadius: 12,
    borderWidth: 1, borderColor: 'rgba(255, 82, 82, 0.4)',
    justifyContent: 'center', alignItems: 'center'
  },
  btnRefuseText: { color: colors.error, fontSize: 12, fontWeight: '900', letterSpacing: 1 },
  holdAcceptContainer: {
    flex: 2, height: 56, borderRadius: 12,
    backgroundColor: colors.success,
    overflow: 'hidden',
    justifyContent: 'center', alignItems: 'center',
    ...Platform.select({ ios: { shadowColor: colors.success, shadowOpacity: 0.4, shadowRadius: 12, shadowOffset: { width: 0, height: 8 } } })
  },
  holdProgressBar: { position: 'absolute', top: 0, bottom: 0, width: '100%', backgroundColor: 'rgba(255,255,255,0.3)' },
  holdContent: { flexDirection: 'row', alignItems: 'center', gap: 10, zIndex: 1 },
  btnAcceptText: { color: '#000', fontSize: 14, fontWeight: '900', letterSpacing: 1 },

  postAcceptRow: { paddingHorizontal: 16 },
  mainCtaBtn: {
    height: 56, backgroundColor: colors.success, borderRadius: 12,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 12
  },
  mainCtaBtnText: { color: '#000', fontSize: 14, fontWeight: '900' },
  
  blockingContainer: { gap: 12 },
  blockingMessage: { 
    flexDirection: 'row', alignItems: 'center', gap: 10, 
    backgroundColor: 'rgba(255, 183, 77, 0.1)', 
    padding: 12, borderRadius: 12, borderWidth: 1, borderColor: 'rgba(255, 183, 77, 0.2)' 
  },
  blockingText: { flex: 1, color: '#FFB74D', fontSize: 12, fontWeight: '700', lineHeight: 16 },

  // MODAL STYLES
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.8)', justifyContent: 'center', padding: 24 },
  modalContent: { backgroundColor: '#1A1A1A', borderRadius: 28, padding: 28, borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)' },
  modalTitle: { color: '#FFF', fontSize: 20, fontWeight: '800', marginBottom: 24, textAlign: 'center' },
  reasonOption: {},
  reasonBtn: { flexDirection: 'row', alignItems: 'center', paddingVertical: 16, borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,0.05)' },
  radio: { width: 22, height: 22, borderRadius: 11, borderWidth: 2, borderColor: 'rgba(255,255,255,0.2)', marginRight: 12, justifyContent: 'center', alignItems: 'center' },
  radioDot: { width: 12, height: 12, borderRadius: 6 },
  reasonText: { color: '#FFF', fontSize: 14, fontWeight: '600' },
  reasonInput: { height: 100, backgroundColor: 'rgba(0,0,0,0.3)', borderRadius: 16, padding: 16, color: '#FFF', textAlignVertical: 'top', marginTop: 16 },
  modalActions: { flexDirection: 'row', gap: 12, marginTop: 32 },
  modalCancel: { flex: 1, height: 50, justifyContent: 'center', alignItems: 'center' },
  modalConfirm: { flex: 2, height: 50, backgroundColor: colors.error, borderRadius: 14, justifyContent: 'center', alignItems: 'center' },
  cancelText: { color: 'rgba(255,255,255,0.4)', fontWeight: '800' },
  confirmText: { color: '#FFF', fontWeight: '900' },
});
