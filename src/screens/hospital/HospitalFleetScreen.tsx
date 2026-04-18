import React, { useMemo } from 'react';
import { View, StyleSheet, Text } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { HospitalHeader } from './components/HospitalHeader';
import { MapboxMapView } from '../../components/map/MapboxMapView';
import Mapbox from '@rnmapbox/maps';
import { useHospital } from '../../contexts/HospitalContext';
import { UnitMarker, HospitalMarker } from '../../components/map/mapMarkers';
import { colors } from '../../theme/colors';

export function HospitalFleetScreen() {
  const { activeCases } = useHospital();
  
  // Only show incoming/active cases that have associated units
  const incomingUnits = useMemo(() => {
    return activeCases.filter(c => 
      c.unitId && 
      (c.hospitalStatus === 'accepted' || c.hospitalStatus === 'pending') &&
      c.status !== 'termine'
    );
  }, [activeCases]);

  return (
    <View style={styles.container}>
      <HospitalHeader title="Flotte Assignée" />
      <View style={styles.mapWrap}>
        <MapboxMapView style={styles.map} styleURL={Mapbox.StyleURL.Dark}>
          <Mapbox.Camera zoomLevel={12} centerCoordinate={[15.3139, -4.3224]} />
          {incomingUnits.map((u) => (
             <React.Fragment key={u.id}>
                {/* Simplified markers for now - real positions would come from active_rescuers sync */}
                <UnitMarker status="en_route" headingDeg={0} />
             </React.Fragment>
          ))}
        </MapboxMapView>
      </View>
      <View style={styles.infoOverlay}>
        <Text style={styles.infoText}>{incomingUnits.length} unité(s) en approche</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#000' },
  mapWrap: { flex: 1 },
  map: { flex: 1 },
  infoOverlay: {
    position: 'absolute',
    bottom: 24,
    left: 20,
    right: 20,
    backgroundColor: 'rgba(10,10,10,0.9)',
    padding: 16,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
  },
  infoText: {
    color: '#FFF',
    fontSize: 14,
    fontWeight: '800',
    textAlign: 'center',
  }
});
