import React from 'react';
import { View, Text } from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { HeartPulse } from "lucide-react-native";
import Mapbox from "@rnmapbox/maps";
import { colors } from '../../../../theme/colors';
import { styles } from '../styles';
import { AppTouchableOpacity } from '../../../../components/ui/AppTouchableOpacity';
import { MapboxMapView } from '../../../../components/map/MapboxMapView';
import { MePuck } from '../../../../components/map/mapMarkers';

interface StepArrivalProps {
   selectedMission: any;
   urgentisteLoc: any;
   urgentisteHeadingDeg: number;
   routeGeoJSON: any;
   receptionCameraBounds: any;
   displayAddress: string;
   elapsedSeconds: number;
   formatTime: (s: number) => string;
   insets: any;
   onBack: () => void;
   onOpenFullscreenMap: () => void;
   onArrivalOnScene: () => void;
}

export const StepArrival: React.FC<StepArrivalProps> = ({
   selectedMission,
   urgentisteLoc,
   urgentisteHeadingDeg,
   routeGeoJSON,
   receptionCameraBounds,
   displayAddress,
   elapsedSeconds,
   formatTime,
   insets,
   onBack,
   onOpenFullscreenMap,
   onArrivalOnScene
}) => {
   return (
      <View
         style={[
            styles.stepBase,
            { paddingHorizontal: 0, paddingBottom: 0 },
         ]}
      >
          <View
             style={[
                styles.trackingMapWrapper,
                { flex: 1, borderRadius: 0, borderWidth: 0 },
             ]}
          >
             <AppTouchableOpacity
                onPress={onBack}
                style={[styles.floatingBackSignalement, { top: insets.top + 10 }]}
                accessibilityRole="button"
                accessibilityLabel="Retour"
             >
                <MaterialIcons name="arrow-back" color="#FFF" size={24} />
             </AppTouchableOpacity>
             <MapboxMapView 
                style={styles.trackingMap} 
                styleURL={Mapbox.StyleURL.Dark} 
                compassEnabled={true} 
                scaleBarEnabled={true}
                scaleBarPosition={{ top: 120, left: 16 }}
             >
                {receptionCameraBounds ? (
                   <Mapbox.Camera
                      bounds={receptionCameraBounds}
                      animationMode="flyTo"
                      animationDuration={1000}
                   />
                ) : (
                   <Mapbox.Camera
                      centerCoordinate={[selectedMission.location?.lng || 15.307045, selectedMission.location?.lat || -4.322447]}
                      zoomLevel={15}
                   />
                )}

                <Mapbox.PointAnnotation id="victim-arrival" coordinate={[selectedMission.location?.lng || 15.307045, selectedMission.location?.lat || -4.322447]}>
                  <View style={styles.victimMarker}>
                     <HeartPulse size={16} color="#FFF" strokeWidth={2.5} />
                  </View>
                </Mapbox.PointAnnotation>

                {urgentisteLoc && (
                   <Mapbox.PointAnnotation id="my-unit-arrival" coordinate={[urgentisteLoc.coords.longitude, urgentisteLoc.coords.latitude]}>
                      <MePuck headingDeg={urgentisteHeadingDeg} size={32} />
                   </Mapbox.PointAnnotation>
                )}

                {routeGeoJSON && (
                   <Mapbox.ShapeSource id="route-arrival" shape={routeGeoJSON}>
                      <Mapbox.LineLayer id="route-arrival-line" style={{ lineColor: '#4A90D9', lineWidth: 4, lineOpacity: 0.85 }} />
                   </Mapbox.ShapeSource>
                )}
            </MapboxMapView>
            <View style={styles.mapAddressOverlay}>
               <MaterialIcons
                  name="place"
                  size={14}
                  color="rgba(255,255,255,0.6)"
               />
               <View style={{ flex: 1, minWidth: 0 }}>
                  <Text style={styles.mapAddressOverlayLabel}>Site d'affectation</Text>
                  <Text style={styles.smallAddressText} numberOfLines={4}>
                     {displayAddress}
                  </Text>
               </View>
            </View>
            <AppTouchableOpacity
               style={[styles.mapFullscreenEntryBtn, { top: insets.top + 10 }]}
               onPress={onOpenFullscreenMap}
               accessibilityRole="button"
               accessibilityLabel="Carte plein écran"
            >
               <MaterialIcons name="fullscreen" color="#FFF" size={22} />
            </AppTouchableOpacity>
         </View>
         <View style={styles.arrivalFooter}>
            <View style={styles.footerTimerBox}>
               <Text style={styles.footerTimerVal}>
                  {formatTime(elapsedSeconds)}
               </Text>
               <Text style={styles.footerTimerLab}>Temps écoulé</Text>
            </View>
            <AppTouchableOpacity
               style={[
                  styles.footerBtn,
                  { backgroundColor: colors.success },
               ]}
               onPress={onArrivalOnScene}
            >
               <MaterialIcons name="place" size={20} color="#FFF" />
               <Text style={styles.footerBtnText}>Arrivée sur site</Text>
            </AppTouchableOpacity>
         </View>
      </View>
   );
};
