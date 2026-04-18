import React, { useMemo, useEffect, useRef } from 'react';
import { View, StyleSheet, Text } from 'react-native';
import { HospitalHeader } from './components/HospitalHeader';
import Mapbox from '@rnmapbox/maps';
import { EBMap, EBMapMarker } from '../../components/map/EBMap';
import { useHospital } from '../../contexts/HospitalContext';
import { useAuth } from '../../contexts/AuthContext';
import { supabase } from '../../lib/supabase';
import { colors } from '../../theme/colors';
import { useNavigation } from '@react-navigation/native';
import { MaterialIcons } from '@expo/vector-icons';
import { AppTouchableOpacity } from '../../components/ui/AppTouchableOpacity';
import { getRoute, type RouteResult, formatDurationSeconds, formatDistanceMeters } from '../../lib/mapbox';
import { Platform } from 'react-native';

export function HospitalFleetScreen() {
  const navigation = useNavigation();
  const { activeCases } = useHospital();
  const [unitPositions, setUnitPositions] = React.useState<Record<string, { lat: number; lng: number; heading?: number; status: string }>>({});
  const [unitAgentNames, setUnitAgentNames] = React.useState<Record<string, string>>({});
  const [selectedCaseId, setSelectedCaseId] = React.useState<string | null>(null);
  const [fleetRoutes, setFleetRoutes] = React.useState<Record<string, RouteResult>>({});
  const [isFetchingRoute, setIsFetchingRoute] = React.useState(false);
  const [hospitalData, setHospitalData] = React.useState<{ lat: number; lng: number; name: string } | null>(null);

  const { profile } = useAuth();

  const incomingCases = useMemo(() => {
    return activeCases.filter(c => 
      c.unitId &&
      c.hospitalStatus === 'accepted' && 
      (c.dispatchStatus === 'en_route_hospital' || c.dispatchStatus === 'arrived_hospital' || c.dispatchStatus === 'completed' || c.dispatchStatus === 'mission_end' || c.dispatchStatus === 'en_cours' || c.dispatchStatus === 'transporting') &&
      !['admis', 'triage', 'prise_en_charge', 'monitoring', 'termine'].includes(c.hospitalDetailStatus || '')
    );
  }, [activeCases]);

  const hospitalCoord = useMemo((): [number, number] | undefined => {
    if (hospitalData) return [hospitalData.lng, hospitalData.lat];
    
    // Fallback if structure not loaded yet but we have cases
    if (incomingCases.length > 0 && incomingCases[0].assignedStructureLng && incomingCases[0].assignedStructureLat) {
      return [incomingCases[0].assignedStructureLng, incomingCases[0].assignedStructureLat];
    }
    return undefined;
  }, [incomingCases, hospitalData]);

  // Fetch Hospital Details
  useEffect(() => {
    const structureId = profile?.health_structure_id;
    if (!structureId || !profile) return;
    const profileId = profile.id;

    async function fetchStructure() {
      const { data, error } = await supabase
        .from('health_structures')
        .select('lat, lng, name')
        .eq('linked_user_id', profileId)
        .single();

      if (data) {
        setHospitalData({ 
          lat: data.lat, 
          lng: data.lng,
          name: data.name
        });
      } else if (error) {
        console.warn('[HospitalFleet] Error fetching structure:', error);
      }
    }
    void fetchStructure();
  }, [profile?.health_structure_id]);

  useEffect(() => {
    if (incomingCases.length === 0) return;

    let isMounted = true;
    let channel: any = null;

    async function syncFleet() {
      const unitIds = incomingCases.map(c => c.unitId).filter(Boolean) as string[];

      // Get auth_user_ids and names for these units
      const { data: rescuers } = await supabase
        .from('users_directory')
        .select('auth_user_id, assigned_unit_id, first_name, last_name')
        .in('assigned_unit_id', unitIds);

      if (!rescuers || rescuers.length === 0) return;
      const userToUnit: Record<string, string> = {};
      const agentNames: Record<string, string> = {};
      
      rescuers.forEach(r => { 
        if (r.auth_user_id) {
          userToUnit[r.auth_user_id] = r.assigned_unit_id!;
          const fullName = `${r.first_name || ''} ${r.last_name || ''}`.trim();
          if (fullName) agentNames[r.assigned_unit_id!] = fullName;
        }
      });
      
      if (isMounted) setUnitAgentNames(agentNames);
      const userIds = Object.keys(userToUnit);

      // Initial fetch
      const { data: active } = await supabase
        .from('active_rescuers')
        .select('user_id, lat, lng, heading, status')
        .in('user_id', userIds);

      if (active && isMounted) {
        const next: typeof unitPositions = {};
        active.forEach(a => {
          const uid = userToUnit[a.user_id];
          if (uid) next[uid] = { lat: a.lat, lng: a.lng, heading: a.heading, status: a.status };
        });
        setUnitPositions(next);
      }

      // Realtime subscription
      channel = supabase.channel('hospital-fleet-sync')
        .on('postgres_changes', { event: '*', schema: 'public', table: 'active_rescuers' }, (payload: any) => {
          const row = payload.new || payload.old;
          if (!row || !isMounted) return;
          const uid = userToUnit[row.user_id];
          if (uid) {
            setUnitPositions(prev => ({
              ...prev,
              [uid]: { lat: row.lat, lng: row.lng, heading: row.heading, status: row.status }
            }));
          }
        })
        .subscribe();
    }

    void syncFleet();
    return () => { isMounted = false; if (channel) supabase.removeChannel(channel); };
  }, [incomingCases]);

  // Seed Unit Positions from case data (fallback if no realtime movement yet)
  useEffect(() => {
    setUnitPositions(prev => {
      const next = { ...prev };
      let changed = false;
      incomingCases.forEach(c => {
        if (c.unitId && c.unitLat != null && c.unitLng != null) {
          if (!next[c.unitId]) {
            next[c.unitId] = { lat: c.unitLat, lng: c.unitLng, status: c.dispatchStatus || 'en_route' };
            changed = true;
          }
        }
      });
      return changed ? next : prev;
    });
  }, [incomingCases]);

  // Bulk route fetching for all units
  useEffect(() => {
    if (!hospitalCoord || incomingCases.length === 0) return;

    let isMounted = true;
    async function updateFleetRoutes() {
      const newRoutes = { ...fleetRoutes };
      let changed = false;

      for (const kase of incomingCases) {
        if (!kase.unitId) continue;
        const pos = unitPositions[kase.unitId];
        if (!pos) continue;

        // Fetch if not already present or if we want to refresh (simple check)
        if (!newRoutes[kase.unitId] && hospitalCoord) {
          try {
            const result = await getRoute([pos.lng, pos.lat], hospitalCoord, { profile: 'driving-traffic' });
            if (isMounted && result) {
              newRoutes[kase.unitId] = result;
              changed = true;
            }
          } catch (err) {
            console.warn(`[Fleet] Failed route for ${kase.unitId}`, err);
          }
        }
      }

      if (changed && isMounted) {
        setFleetRoutes(newRoutes);
      }
    }
    
    void updateFleetRoutes();
    return () => { isMounted = false; };
  }, [incomingCases, unitPositions, hospitalCoord]);

  const mapRouteData = useMemo(() => {
    const routes = Object.values(fleetRoutes);
    if (routes.length === 0) return undefined;
    
    // Determine selected index if any
    const selectedIndex = routes.findIndex(r => {
      const selected = incomingCases.find(c => c.id === selectedCaseId);
      return selected && fleetRoutes[selected.unitId!] === r;
    });

    return {
      routes,
      selectedIndex: selectedIndex >= 0 ? selectedIndex : 0,
      showAlternatives: false,
    };
  }, [fleetRoutes, selectedCaseId, incomingCases]);

  const selectedCase = useMemo(() => 
    incomingCases.find(c => c.id === selectedCaseId),
    [incomingCases, selectedCaseId]
  );

  const handleMarkerPress = (marker: EBMapMarker) => {
    if (marker.type === 'unit' && marker.id.startsWith('unit-')) {
      const caseItem = marker.data;
      if (caseItem) {
        setSelectedCaseId(caseItem.id);
        // Direct navigation as requested
        (navigation as any).navigate("HospitalCaseDetail", { caseData: caseItem });
      }
    }
  };

  const handleMapPress = () => {
    setSelectedCaseId(null);
  };

  const mapMarkers = useMemo((): EBMapMarker[] => {
    const list: EBMapMarker[] = [];

    // Hospital marker
    if (hospitalCoord) {
      list.push({ id: 'hospital-main', type: 'hospital', coordinate: hospitalCoord, label: 'Hôpital' });
    }

    // Units - grouped by unitId to avoid duplicates on map
    const uniqueUnits = new Map<string, typeof incomingCases[0]>();
    incomingCases.forEach(c => {
      // If we have multiple cases for one unit, favor the one that is en-route or more active
      if (!uniqueUnits.has(c.unitId!) || c.dispatchStatus === 'transporting' || c.dispatchStatus === 'en_route_hospital') {
        uniqueUnits.set(c.unitId!, c);
      }
    });

    uniqueUnits.forEach((c) => {
      const uid = c.unitId!;
      const realtimePos = unitPositions[uid];
      
      // Resilient coordinate engine: use realtime if available, fallback to case-level coordinates
      const lat = realtimePos?.lat ?? c.unitLat;
      const lng = realtimePos?.lng ?? c.unitLng;
      const heading = realtimePos?.heading ?? 0;

      if (lat == null || lng == null) return;

      list.push({
        id: `unit-${uid}`,
        type: 'unit',
        coordinate: [lng, lat],
        headingDeg: heading,
        status: realtimePos?.status || c.dispatchStatus || 'en_route',
        label: unitAgentNames[uid] || c.urgentisteName || `UNITÉ ${uid.slice(0, 3).toUpperCase()}`,
        priority: c.level === 'critique' ? 'high' : 'medium',
        data: c
      });
    });

    return list;
  }, [unitPositions, hospitalCoord, incomingCases]);

  const cameraConfig = useMemo(() => {
    // 1. Collect all active mission coordinates (Hospital + Incoming Units)
    const coords: [number, number][] = [];
    if (hospitalCoord) coords.push(hospitalCoord);
    
    incomingCases.forEach(c => {
      const pos = unitPositions[c.unitId!];
      if (pos) coords.push([pos.lng, pos.lat]);
    });

    // 2. Default center if no data
    if (coords.length === 0) {
      return { center: [15.3139, -4.3224] as [number, number], zoom: 11 };
    }

    // 3. Single point focus (Hospital only)
    if (coords.length === 1) {
      return { center: coords[0], zoom: 14 };
    }

    // 4. Multi-point Bounding Box (Fit All)
    let minLng = Infinity, maxLng = -Infinity, minLat = Infinity, maxLat = -Infinity;
    coords.forEach(([lng, lat]) => {
      minLng = Math.min(minLng, lng);
      maxLng = Math.max(maxLng, lng);
      minLat = Math.min(minLat, lat);
      maxLat = Math.max(maxLat, lat);
    });

    return {
      bounds: {
        ne: [maxLng, maxLat] as [number, number],
        sw: [minLng, minLat] as [number, number],
        paddingTop: 80,
        paddingBottom: selectedCaseId ? 350 : 120, // Leave room for tactical card
        paddingLeft: 60,
        paddingRight: 60,
      }
    };
  }, [hospitalCoord, incomingCases, unitPositions, selectedCaseId]);

  return (
    <View style={styles.container}>
      <HospitalHeader title="Flotte Assignée" />
      <View style={styles.mapWrap}>
        <EBMap
          mode="FLEET"
          style={styles.map}
          markers={mapMarkers}
          cameraConfig={cameraConfig}
          useClustering={true}
          onMarkerPress={handleMarkerPress}
          onMapPress={handleMapPress}
          routeData={mapRouteData}
        />

        {/* FLOATING TACTICAL INFO CARD */}
        {selectedCase && (
          <View style={styles.floatingInfoContainer}>
            <View style={styles.tacticalCard}>
              <View style={styles.cardHeader}>
                <View style={[styles.statusDot, { backgroundColor: selectedCase.level === 'critique' ? '#FF5252' : '#FF9800' }]} />
                <Text style={styles.unitName}>{selectedCase.unitAgentName || 'Unité de secours'}</Text>
                <Text style={styles.caseRef}>#{selectedCase.id.split('-').pop()}</Text>
              </View>

              <View style={styles.statsRow}>
                <View style={styles.statItem}>
                  <MaterialIcons name="timer" size={20} color="#4285F4" />
                  <View>
                    <Text style={styles.statLabel}>ARRIVÉE ESTIMÉE</Text>
                    <Text style={styles.statValue}>
                      {isFetchingRoute ? '...' : (selectedCase.unitId && fleetRoutes[selectedCase.unitId]) ? formatDurationSeconds(fleetRoutes[selectedCase.unitId].duration) : selectedCase.eta || '—'}
                    </Text>
                  </View>
                </View>

                <View style={styles.statDivider} />

                <View style={styles.statItem}>
                  <MaterialIcons name="straighten" size={20} color="#34A853" />
                  <View>
                    <Text style={styles.statLabel}>DISTANCE</Text>
                    <Text style={styles.statValue}>
                      {isFetchingRoute ? '...' : (selectedCase.unitId && fleetRoutes[selectedCase.unitId]) ? formatDistanceMeters(fleetRoutes[selectedCase.unitId].distance) : selectedCase.distance || '—'}
                    </Text>
                  </View>
                </View>
              </View>

              <AppTouchableOpacity 
                style={styles.detailBtn}
                onPress={() => (navigation as any).navigate('HospitalCaseDetail', { caseData: selectedCase })}
              >
                <Text style={styles.detailBtnText}>VOIR LE DOSSIER COMPLET</Text>
                <MaterialIcons name="chevron-right" size={20} color="#FFF" />
              </AppTouchableOpacity>
            </View>
          </View>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#000' },
  mapWrap: { flex: 1 },
  map: { flex: 1 },
  floatingInfoContainer: {
    position: 'absolute',
    bottom: 40,
    left: 20,
    right: 20,
    alignItems: 'center',
  },
  tacticalCard: {
    width: '100%',
    maxWidth: 500,
    backgroundColor: 'rgba(20, 20, 20, 0.9)',
    borderRadius: 24,
    padding: 20,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.1)',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.5,
    shadowRadius: 20,
    elevation: 10,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 20,
  },
  statusDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginRight: 10,
  },
  unitName: {
    color: '#FFF',
    fontSize: 18,
    fontWeight: '700',
    flex: 1,
  },
  caseRef: {
    color: 'rgba(255, 255, 255, 0.4)',
    fontSize: 12,
    fontWeight: '800',
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
  },
  statsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.03)',
    borderRadius: 16,
    padding: 16,
    marginBottom: 20,
  },
  statItem: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  statDivider: {
    width: 1,
    height: 30,
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    marginHorizontal: 15,
  },
  statLabel: {
    color: 'rgba(255, 255, 255, 0.4)',
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  statValue: {
    color: '#FFF',
    fontSize: 16,
    fontWeight: '700',
    marginTop: 2,
  },
  detailBtn: {
    backgroundColor: colors.secondary,
    height: 54,
    borderRadius: 16,
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 10,
  },
  detailBtnText: {
    color: '#FFF',
    fontSize: 14,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
});
