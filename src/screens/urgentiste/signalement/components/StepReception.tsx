import React, { useMemo } from 'react';
import { View, Text, ScrollView, Animated } from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { HeartPulse } from "lucide-react-native";
import { colors } from '../../../../theme/colors';
import { styles } from '../styles';
import { AppTouchableOpacity } from '../../../../components/ui/AppTouchableOpacity';
import { EBMap, EBMapMarker } from '../../../../components/map/EBMap';
import { formatIncidentType, formatDescriptionLines } from '../../../../utils/missionAddress';
import { canOfferVictimContactCalls } from '../../../../lib/missionVictimCall';

interface StepReceptionProps {
   selectedMission: any;
   urgentisteLoc: any;
   urgentisteHeadingDeg: number;
   routeGeoJSON: any;
   routeInfoText: string;
   receptionCameraBounds: any;
   displayAddress: string;
   pan: Animated.Value;
   panResponder: any;
   insets: any;
   onBack: () => void;
   onOpenFullscreenMap: () => void;
   renderVictimContactStrip: () => React.ReactNode;
}

export const StepReception: React.FC<StepReceptionProps> = ({
   selectedMission,
   urgentisteLoc,
   urgentisteHeadingDeg,
   routeGeoJSON,
   routeInfoText,
   receptionCameraBounds,
   displayAddress,
   pan,
   panResponder,
   insets,
   onBack,
   onOpenFullscreenMap,
   renderVictimContactStrip
}) => {
   const mapMarkers = useMemo(() => {
      const m: EBMapMarker[] = [];
      m.push({
         id: 'victim-reception',
         type: 'incident',
         coordinate: [selectedMission.location?.lng || 15.307045, selectedMission.location?.lat || -4.322447],
         priority: selectedMission.priority,
      });
      if (urgentisteLoc) {
         m.push({
            id: 'my-unit-reception',
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
      <View style={[styles.receptionView, { padding: 0 }]}>
         <View style={styles.receptionMapWrapper}>
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
                   bounds: receptionCameraBounds || undefined,
                }}
                showControls={true}
                style={styles.receptionMap}
             />
            <View style={styles.mapDistOverlay}>
               <MaterialIcons name="navigation" size={14} color="#FFF" />
               <Text style={styles.mapDistText}>{routeInfoText}</Text>
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

         <View style={styles.receptionBottomPanel}>
            <ScrollView
               style={styles.receptionScroll}
               showsVerticalScrollIndicator={false}
               keyboardShouldPersistTaps="handled"
               contentContainerStyle={{
                  padding: 24,
                  paddingBottom: insets.bottom + 140,
               }}
            >
               <View style={styles.detailBox}>
                  <View style={styles.receptionHeaderStrip}>
                     <MaterialIcons
                        name={
                           selectedMission.priority === "CRITIQUE"
                              ? "priority-high"
                              : "info"
                        }
                        color={
                           selectedMission.priority === "CRITIQUE"
                              ? colors.primary
                              : colors.secondary
                        }
                        size={32}
                     />
                     <View style={{ flex: 1, minWidth: 0 }}>
                        <Text style={styles.detailMissionType} numberOfLines={2}>
                           {formatIncidentType(selectedMission.type)}
                        </Text>
                        <Text style={styles.priorityStatusText}>
                           {selectedMission.priority} • {selectedMission.time}{" "}
                           d'attente
                        </Text>
                     </View>
                  </View>
                  <View style={styles.divider} />
                  <Text style={styles.detailLabel}>Site d'affectation</Text>
                   <Text style={styles.detailVal}>
                     {displayAddress}
                   </Text>
                  <View style={styles.divider} />
                  <Text style={styles.detailLabel}>Descriptif central</Text>
                  {formatDescriptionLines(selectedMission.description).map((line, i) => (
                     <Text key={i} style={styles.detailDesc}>{"\u2022  "}{line}</Text>
                  ))}
               </View>
               {selectedMission &&
                  canOfferVictimContactCalls(selectedMission.dispatch_status) && (
                     <View style={styles.victimStripReceptionWrap}>
                        {renderVictimContactStrip()}
                     </View>
                  )}
            </ScrollView>

            <View style={styles.stickySwipeWrapper}>
               <View style={styles.swipeContainer}>
                  <View style={styles.swipeBackground}>
                     <Text style={styles.swipeText}>
                        Glisser pour débuter l'intervention
                     </Text>
                     <MaterialIcons
                        name="chevron-right"
                        color="rgba(255,255,255,0.3)"
                        size={24}
                     />
                  </View>
                  <Animated.View
                     style={[
                        styles.swipeThumb,
                        { transform: [{ translateX: pan }] },
                     ]}
                     {...panResponder.panHandlers}
                  >
                     <MaterialIcons
                        name="keyboard-double-arrow-right"
                        color="#000"
                        size={28}
                     />
                  </Animated.View>
               </View>
            </View>
         </View>
      </View>
   );
};
