import React, { useMemo } from 'react';
import { View, Text } from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { colors } from '../../../../theme/colors';
import { styles } from '../styles';
import { AppTouchableOpacity } from '../../../../components/ui/AppTouchableOpacity';
import { formatDurationSeconds, formatDistanceMeters } from '../../../../lib/mapbox';
import { EBMap } from '../../../../components/map/EBMap';

interface StepTransportProps {
   targetHospital: any;
   urgentisteLoc: any;
   urgentisteHeadingDeg: number;
   hospitalRouteGeoJSON: any;
   hospitalRouteDuration: number | null;
   hospitalRouteDistance: number | null;
   hospitalRouteCameraBounds: any;
   transportMode: string | null;
   insets: any;
   onBack: () => void;
   onOpenFullscreenMap: () => void;
   onArrivedAtHospital: () => void;
}

export const StepTransport: React.FC<StepTransportProps> = ({
   targetHospital,
   urgentisteLoc,
   urgentisteHeadingDeg,
   hospitalRouteGeoJSON,
   hospitalRouteDuration,
   hospitalRouteDistance,
   transportMode,
   insets,
   onBack,
   onOpenFullscreenMap,
   onArrivedAtHospital
}) => {
   const routeData = useMemo(() => {
      if (!hospitalRouteGeoJSON || hospitalRouteDuration == null || hospitalRouteDistance == null) return undefined;
      return {
         routes: [{
            geometry: hospitalRouteGeoJSON.features[0].geometry,
            duration: hospitalRouteDuration,
            distance: hospitalRouteDistance,
            steps: [], // Satisfy RouteResult interface
         }],
         selectedIndex: 0,
      };
   }, [hospitalRouteGeoJSON, hospitalRouteDuration, hospitalRouteDistance]);

   const markers = useMemo(() => {
      if (!targetHospital?.coords) return [];
      return [{
         id: 'target-hospital',
         type: 'hospital' as const,
         coordinate: [targetHospital.coords.longitude, targetHospital.coords.latitude] as [number, number],
         label: targetHospital.name,
      }];
   }, [targetHospital]);

   const myLocation = useMemo((): [number, number] | undefined => {
      if (!urgentisteLoc?.coords) return undefined;
      return [urgentisteLoc.coords.longitude, urgentisteLoc.coords.latitude];
   }, [urgentisteLoc]);

   return (
      <View style={[styles.stepBase, { paddingHorizontal: 0, paddingBottom: 0 }]}>
         <View style={{ flex: 1, borderRadius: 0, overflow: "hidden" }}>
            <AppTouchableOpacity
               onPress={onBack}
               style={[styles.floatingBackSignalement, { top: insets.top + 10 }]}
               accessibilityRole="button"
               accessibilityLabel="Retour"
            >
               <MaterialIcons name="arrow-back" color="#FFF" size={24} />
            </AppTouchableOpacity>
            
            <EBMap 
               mode="NAVIGATION"
               markers={markers}
               myLocation={myLocation}
               myHeading={urgentisteHeadingDeg}
               routeData={routeData}
               showControls={true}
            />

            {hospitalRouteDistance != null && hospitalRouteDuration != null && (
               <View style={styles.floatingInfoContainer}>
                  <View style={styles.tacticalCard}>
                     <View style={styles.cardHeader}>
                        <View style={[styles.statusDot, { backgroundColor: colors.secondary }]} />
                        <View style={{ flex: 1 }}>
                           <Text style={styles.unitName} numberOfLines={1}>{targetHospital.name}</Text>
                           <Text style={styles.caseRef} numberOfLines={1}>NAVIGATION ACTIVE</Text>
                        </View>
                        <MaterialIcons name="navigation" size={20} color="rgba(255,255,255,0.4)" />
                     </View>

                     <View style={styles.statsRow}>
                        <View style={styles.statItem}>
                           <MaterialIcons name="timer" size={20} color={colors.secondary} />
                           <View>
                              <Text style={styles.statLabel}>TEMPS ESTIMÉ</Text>
                              <Text style={styles.statValue}>{formatDurationSeconds(hospitalRouteDuration)}</Text>
                           </View>
                        </View>

                        <View style={styles.statDivider} />

                        <View style={styles.statItem}>
                           <MaterialIcons name="straighten" size={20} color="#34C759" />
                           <View>
                              <Text style={styles.statLabel}>DISTANCE</Text>
                              <Text style={styles.statValue}>{formatDistanceMeters(hospitalRouteDistance)}</Text>
                           </View>
                        </View>
                     </View>
                  </View>
               </View>
            )}

            <AppTouchableOpacity
               style={[styles.mapFullscreenEntryBtn, { top: insets.top + 10 }]}
               onPress={onOpenFullscreenMap}
               accessibilityRole="button"
               accessibilityLabel="Carte plein écran"
            >
               <MaterialIcons name="fullscreen" color="#FFF" size={22} />
            </AppTouchableOpacity>
         </View>

         <View style={styles.transportBottomPanel}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 20, paddingTop: 16 }}>
               <View style={styles.structureIconBox}>
                  <MaterialIcons name="local-hospital" size={22} color={colors.secondary} />
               </View>
               <View style={{ flex: 1 }}>
                  <Text style={styles.structureName}>{targetHospital.name}</Text>
                  {targetHospital.address && (
                     <Text style={styles.structureAddress} numberOfLines={1}>{targetHospital.address}</Text>
                  )}
               </View>
               {transportMode && (
                  <View style={{ backgroundColor: 'rgba(255,255,255,0.08)', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 8 }}>
                     <Text style={{ color: 'rgba(255,255,255,0.5)', fontSize: 12, fontWeight: '700' }}>{transportMode}</Text>
                  </View>
               )}
            </View>
            <View style={{ flexDirection: 'row', gap: 10, paddingHorizontal: 20, paddingTop: 12, paddingBottom: 16 }}>
               <AppTouchableOpacity
                  style={[styles.bigActionBtn, { flex: 1, backgroundColor: colors.success }]}
                  onPress={onArrivedAtHospital}
               >
                  <MaterialIcons name="check-circle" size={24} color="#FFF" />
                  <Text style={styles.bigActionText}>Arrivée à l'hôpital</Text>
               </AppTouchableOpacity>
            </View>
         </View>
      </View>
   );
};
