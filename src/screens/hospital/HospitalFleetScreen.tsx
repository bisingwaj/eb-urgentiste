import React, { useMemo, useEffect, useRef } from 'react';
import { View, StyleSheet, Text } from 'react-native';
import { HospitalHeader } from './components/HospitalHeader';
import Mapbox from '@rnmapbox/maps';
import { EBMap, EBMapMarker } from '../../components/map/EBMap';
import { useHospital } from '../../contexts/HospitalContext';
import { supabase } from '../../lib/supabase';
import { colors } from '../../theme/colors';

export function HospitalFleetScreen() {
  const { activeCases } = useHospital();
  const [unitPositions, setUnitPositions] = React.useState<Record<string, { lat: number; lng: number; heading?: number; status: string }>>({});

  const incomingCases = useMemo(() => {
    return activeCases.filter(c =>
      c.unitId &&
      (c.hospitalStatus === 'accepted' || c.hospitalStatus === 'pending') &&
      c.status !== 'termine'
    );
  }, [activeCases]);

  const hospitalCoord = useMemo((): [number, number] | undefined => {
    if (incomingCases.length > 0 && incomingCases[0].assignedStructureLng && incomingCases[0].assignedStructureLat) {
      return [incomingCases[0].assignedStructureLng, incomingCases[0].assignedStructureLat];
    }
    return undefined;
  }, [incomingCases]);

  useEffect(() => {
    if (incomingCases.length === 0) return;

    let isMounted = true;
    let channel: any = null;

    async function syncFleet() {
      const unitIds = incomingCases.map(c => c.unitId).filter(Boolean) as string[];

      // Get auth_user_ids for these units
      const { data: rescuers } = await supabase
        .from('users_directory')
        .select('auth_user_id, assigned_unit_id')
        .in('assigned_unit_id', unitIds);

      if (!rescuers || rescuers.length === 0) return;
      const userToUnit: Record<string, string> = {};
      rescuers.forEach(r => { if (r.auth_user_id) userToUnit[r.auth_user_id] = r.assigned_unit_id!; });
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

  const mapMarkers = useMemo((): EBMapMarker[] => {
    const list: EBMapMarker[] = [];

    // Hospital marker
    if (hospitalCoord) {
      list.push({ id: 'hospital-main', type: 'hospital', coordinate: hospitalCoord, label: 'Hôpital' });
    }

    // Units
    Object.entries(unitPositions).forEach(([uid, pos]) => {
      list.push({
        id: `unit-${uid}`,
        type: 'unit',
        coordinate: [pos.lng, pos.lat],
        status: pos.status,
        headingDeg: pos.heading,
        label: `AMB-${uid.slice(0, 3).toUpperCase()}`, // Simulated callsign
        speed: pos.status === 'en_route' ? 42 : 0, // Simulated speed
        etaMinutes: pos.status === 'en_route' ? 12 : undefined, // Simulated ETA
      });
    });

    return list;
  }, [unitPositions, hospitalCoord]);

  const cameraConfig = useMemo(() => {
    if (hospitalCoord) return { center: hospitalCoord, zoom: 11 };
    return { center: [15.3139, -4.3224] as [number, number], zoom: 11 };
  }, [hospitalCoord]);

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
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#000' },
  mapWrap: { flex: 1 },
  map: { flex: 1 },
});
