import React, { useMemo } from 'react';
import { View, Text } from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { colors } from '../../../../theme/colors';
import { styles } from '../styles';
import { AppTouchableOpacity } from '../../../../components/ui/AppTouchableOpacity';
import { EBMap, EBMapMarker } from '../../../../components/map/EBMap';

interface StepArrivalProps {
   selectedMission: any;
   urgentisteLoc: any;
   urgentisteHeadingDeg: number;
   routeGeoJSON: any;
   arrivalCameraBounds: any;
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
   arrivalCameraBounds,
   displayAddress,
   elapsedSeconds,
   formatTime,
   insets,
   onBack,
   onOpenFullscreenMap,
   onArrivalOnScene
}) => {
   const mapMarkers = useMemo(() => {
      const m: EBMapMarker[] = [];
      m.push({
         id: 'victim-arrival',
         type: 'incident',
         coordinate: [selectedMission.location?.lng || 15.307045, selectedMission.location?.lat || -4.322447],
         priority: selectedMission.priority,
      });
      if (urgentisteLoc) {
         m.push({
            id: 'my-unit-arrival',
            type: 'me',
            coordinate: [urgentisteLoc.coords.longitude, urgentisteLoc.coords.latitude],
            headingDeg: urgentisteHeadingDeg,
         });
      }
      return m;
   }, [selectedMission.location?.lat, selectedMission.location?.lng, urgentisteLoc, urgentisteHeadingDeg]);

   const mapRouteData = useMemo(() => {
      if (!routeGeoJSON) return undefined;
      return {
         routes: [{
            geometry: routeGeoJSON.features[0].geometry,
            duration: 0,
            distance: 0,
            steps: [],
         }],
         selectedIndex: 0,
      };
   }, [routeGeoJSON]);

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
             <EBMap
                mode="NAVIGATION"
                markers={mapMarkers}
                routeData={mapRouteData}
                cameraConfig={{
                   bounds: arrivalCameraBounds || undefined,
                }}
                showControls={true}
                style={styles.trackingMap}
             />
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
