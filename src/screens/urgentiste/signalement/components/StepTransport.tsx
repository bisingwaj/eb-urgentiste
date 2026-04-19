import React from 'react';
import { View, Text } from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { Hospital as HospitalIcon } from "lucide-react-native";
import Mapbox from "@rnmapbox/maps";
import { colors } from '../../../../theme/colors';
import { styles } from '../styles';
import { AppTouchableOpacity } from '../../../../components/ui/AppTouchableOpacity';
import { MapboxMapView } from '../../../../components/map/MapboxMapView';
import { MePuck } from '../../../../components/map/mapMarkers';

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
   hospitalRouteCameraBounds,
   transportMode,
   insets,
   onBack,
   onOpenFullscreenMap,
   onArrivedAtHospital
}) => {
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
            <MapboxMapView style={{ flex: 1 }} styleURL={Mapbox.StyleURL.Dark} compassEnabled={false} scaleBarEnabled={false}>
               {urgentisteLoc ? (
                  <Mapbox.Camera
                     bounds={
                        hospitalRouteCameraBounds ?? {
                           ne: [
                              Math.max(targetHospital.coords.longitude, urgentisteLoc.coords.longitude),
                              Math.max(targetHospital.coords.latitude, urgentisteLoc.coords.latitude),
                           ],
                           sw: [
                              Math.min(targetHospital.coords.longitude, urgentisteLoc.coords.longitude),
                              Math.min(targetHospital.coords.latitude, urgentisteLoc.coords.latitude),
                           ],
                           paddingTop: 80,
                           paddingBottom: 180,
                           paddingLeft: 60,
                           paddingRight: 60,
                        }
                     }
                     animationMode="flyTo"
                     animationDuration={1000}
                  />
               ) : (
                  <Mapbox.Camera
                     centerCoordinate={[targetHospital.coords.longitude, targetHospital.coords.latitude]}
                     zoomLevel={13}
                  />
               )}

               <Mapbox.PointAnnotation id="hospital-dest" coordinate={[targetHospital.coords.longitude, targetHospital.coords.latitude]}>
                  <View style={styles.hospitalMarker}>
                     <HospitalIcon size={16} color="#FFF" strokeWidth={2.5} />
                  </View>
               </Mapbox.PointAnnotation>

               {urgentisteLoc && (
                  <Mapbox.PointAnnotation id="my-unit-transport" coordinate={[urgentisteLoc.coords.longitude, urgentisteLoc.coords.latitude]}>
                     <MePuck headingDeg={urgentisteHeadingDeg} size={32} />
                  </Mapbox.PointAnnotation>
               )}

               {hospitalRouteGeoJSON && (
                  <Mapbox.ShapeSource id="route-hospital-transport" shape={hospitalRouteGeoJSON}>
                     <Mapbox.LineLayer id="route-hospital-transport-line" style={{ lineColor: '#34C759', lineWidth: 4, lineOpacity: 0.85 }} />
                  </Mapbox.ShapeSource>
               )}
            </MapboxMapView>

            {hospitalRouteDistance != null && hospitalRouteDuration != null && (
               <View style={styles.mapDistOverlay}>
                  <MaterialIcons name="navigation" size={14} color="#FFF" />
                  <Text style={styles.mapDistText}>
                     {hospitalRouteDistance < 1000 ? `${Math.round(hospitalRouteDistance)} m` : `${(hospitalRouteDistance / 1000).toFixed(1)} km`} • {Math.ceil(hospitalRouteDuration / 60)} min
                  </Text>
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
