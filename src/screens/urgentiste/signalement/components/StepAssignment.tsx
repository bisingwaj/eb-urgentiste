import React, { useState } from 'react';
import { View, Text, ActivityIndicator, Linking, Modal, TouchableWithoutFeedback, Platform } from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { Hospital as HospitalIcon, Phone, PhoneForwarded } from "lucide-react-native";
import Mapbox from "@rnmapbox/maps";
import { colors } from '../../../../theme/colors';
import { styles } from '../styles';
import { AppTouchableOpacity } from '../../../../components/ui/AppTouchableOpacity';
import { MapboxMapView } from '../../../../components/map/MapboxMapView';
import { MePuck } from '../../../../components/map/mapMarkers';
import { openExternalDirections } from '../../../../utils/navigation';

interface StepAssignmentProps {
   pendingStructureInfo: any;
   targetHospital: any;
   urgentisteLoc: any;
   urgentisteHeadingDeg: number;
   hospitalRouteGeoJSON: any;
   hospitalRouteDuration: number | null;
   hospitalRouteDistance: number | null;
   hospitalRouteCameraBounds: any;
   departingEnRoute: boolean;
   onDepartVersStructure: () => void;
   onOpenFullscreenMap: () => void;
   renderStepInlineHeader: () => React.ReactNode;
}

export const StepAssignment: React.FC<StepAssignmentProps> = ({
   pendingStructureInfo,
   targetHospital,
   urgentisteLoc,
   urgentisteHeadingDeg,
   hospitalRouteGeoJSON,
   hospitalRouteDuration,
   hospitalRouteDistance,
   hospitalRouteCameraBounds,
   departingEnRoute,
   onDepartVersStructure,
   onOpenFullscreenMap,
   renderStepInlineHeader
}) => {
   const [callModalVisible, setCallModalVisible] = useState(false);

   const currentHospital = targetHospital || pendingStructureInfo;
   const isRefused = pendingStructureInfo?.refused;
   const isPending = !!pendingStructureInfo && !targetHospital;
   const isAssigned = !!targetHospital;

   const handleCall = (mode: 'pstn' | 'voip') => {
      setCallModalVisible(false);
      if (mode === 'pstn' && currentHospital?.phone) {
         Linking.openURL(`tel:${currentHospital.phone}`);
      } else {
         // App call placeholder/logic
         console.log("App call to hospital not yet implemented");
      }
   };

   // Render Logic
   let content;

   if (isRefused) {
      content = (
         <View style={{ flex: 1, justifyContent: "center", alignItems: "center", paddingHorizontal: 40, paddingBottom: 100 }}>
            <View style={{ width: 80, height: 80, borderRadius: 40, backgroundColor: 'rgba(255,59,48,0.1)', justifyContent: 'center', alignItems: 'center' }}>
               <MaterialIcons name="error-outline" size={40} color="#FF3B30" />
            </View>
            <Text style={[styles.standbyText, { marginTop: 24, fontSize: 22 }]}>Désolé pour ce contretemps</Text>
            <Text style={[styles.standbySub, { marginTop: 12, textAlign: 'center' }]}>
               L'établissement <Text style={{ color: '#FFF', fontWeight: '800' }}>{pendingStructureInfo.name}</Text> ne peut pas recevoir le patient pour le moment.
            </Text>
            <Text style={[styles.standbySub, { marginTop: 24, textAlign: 'center', color: 'rgba(255,255,255,0.6)' }]}>
               Nous cherchons immédiatement une alternative plus adaptée...
            </Text>
            <ActivityIndicator size="small" color={colors.secondary} style={{ marginTop: 32 }} />
         </View>
      );
   } else if (!currentHospital) {
      content = (
         <View style={{ flex: 1, justifyContent: "center", alignItems: "center", paddingHorizontal: 40, paddingBottom: 100 }}>
            <View style={{ width: 80, height: 80, borderRadius: 40, backgroundColor: 'rgba(0,122,255,0.1)', justifyContent: 'center', alignItems: 'center' }}>
               <HospitalIcon size={40} color={colors.secondary} />
            </View>
            <Text style={[styles.standbyText, { marginTop: 24, fontSize: 22 }]}>Recherche en cours...</Text>
            <Text style={[styles.standbySub, { marginTop: 12, textAlign: 'center' }]}>
               Nous recherchons l'établissement le plus adapté pour la prise en charge de votre patient.
            </Text>
            <Text style={[styles.standbySub, { marginTop: 24, textAlign: 'center', color: 'rgba(255,255,255,0.6)' }]}>
                Cela ne prendra que quelques instants. Merci de votre patience.
            </Text>
            <ActivityIndicator size="small" color={colors.secondary} style={{ marginTop: 32 }} />
         </View>
      );
   } else if (isPending) {
      content = (
         <View style={{ flex: 1, justifyContent: "center", alignItems: "center", paddingHorizontal: 40, paddingBottom: 100 }}>
            <View style={{ width: 80, height: 80, borderRadius: 40, backgroundColor: 'rgba(0,122,255,0.1)', justifyContent: 'center', alignItems: 'center' }}>
               <MaterialIcons name="send" size={32} color={colors.secondary} />
            </View>
            <Text style={[styles.standbyText, { marginTop: 24, fontSize: 22 }]}>Demande envoyée</Text>
            <Text style={[styles.standbySub, { marginTop: 12, textAlign: 'center' }]}>
               Nous avons contacté <Text style={{ color: '#FFF', fontWeight: '800' }}>{currentHospital.name}</Text>.
            </Text>
            <Text style={[styles.standbySub, { marginTop: 24, textAlign: 'center', color: 'rgba(255,255,255,0.6)' }]}>
               Nous attendons leur confirmation pour vous transmettre les coordonnées GPS.
            </Text>
            <ActivityIndicator size="small" color={colors.secondary} style={{ marginTop: 32 }} />
         </View>
      );
   } else {
      content = (
         <View style={{ flex: 1 }}>
            <View style={{ flex: 1, borderRadius: 0, overflow: "hidden" }}>
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
                              paddingBottom: 280,
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

                  <Mapbox.PointAnnotation id="hospital-assign" coordinate={[targetHospital.coords.longitude, targetHospital.coords.latitude]}>
                     <View style={styles.hospitalMarker}>
                        <HospitalIcon size={16} color="#FFF" strokeWidth={2.5} />
                     </View>
                  </Mapbox.PointAnnotation>

                  {urgentisteLoc && (
                     <Mapbox.PointAnnotation id="my-unit-assign" coordinate={[urgentisteLoc.coords.longitude, urgentisteLoc.coords.latitude]}>
                        <MePuck headingDeg={urgentisteHeadingDeg} size={32} />
                     </Mapbox.PointAnnotation>
                  )}

                  {hospitalRouteGeoJSON && (
                     <Mapbox.ShapeSource id="route-hospital-assign" shape={hospitalRouteGeoJSON}>
                        <Mapbox.LineLayer id="route-hospital-assign-line" style={{ lineColor: '#34C759', lineWidth: 4, lineOpacity: 0.85 }} />
                     </Mapbox.ShapeSource>
                  )}
               </MapboxMapView>

               <AppTouchableOpacity
                  style={styles.mapFullscreenEntryBtnAssignment}
                  onPress={onOpenFullscreenMap}
               >
                  <MaterialIcons name="fullscreen" color="#FFF" size={22} />
               </AppTouchableOpacity>

               <AppTouchableOpacity
                  style={styles.assignmentEnRouteFab}
                  onPress={onDepartVersStructure}
                  disabled={departingEnRoute}
               >
                  {departingEnRoute ? (
                     <ActivityIndicator color="#FFF" size="small" />
                  ) : (
                     <>
                        <MaterialIcons name="directions-run" color="#FFF" size={22} />
                        <Text style={styles.assignmentEnRouteFabText}>Lancer le Transport</Text>
                     </>
                  )}
               </AppTouchableOpacity>

               <AppTouchableOpacity
                  style={styles.assignmentNavFab}
                  onPress={() =>
                     openExternalDirections(
                        targetHospital.coords.latitude,
                        targetHospital.coords.longitude,
                        targetHospital.name,
                     )
                  }
               >
                  <MaterialIcons name="navigation" color="#FFF" size={22} />
               </AppTouchableOpacity>

               {hospitalRouteDistance != null && hospitalRouteDuration != null && (
                  <View style={styles.mapDistOverlay}>
                     <MaterialIcons name="navigation" size={14} color="#FFF" />
                     <Text style={styles.mapDistText}>
                        {hospitalRouteDistance < 1000 ? `${Math.round(hospitalRouteDistance)} m` : `${(hospitalRouteDistance / 1000).toFixed(1)} km`} • {Math.ceil(hospitalRouteDuration / 60)} min
                     </Text>
                  </View>
               )}
            </View>

            <View style={[styles.assignmentBottomPanel, { paddingBottom: 110 }]}>
               <View style={styles.assignmentStructureCard}>
                  <Text style={{ color: 'rgba(255,255,255,0.4)', fontSize: 11, fontWeight: '900', letterSpacing: 1, marginBottom: 12, textTransform: 'uppercase' }}>Établissement de Destination</Text>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                     <View style={[styles.structureIconBox, { backgroundColor: 'rgba(48,209,88,0.1)' }]}>
                        <MaterialIcons
                           name={targetHospital.specialty === 'pharmacie' ? 'local-pharmacy' : targetHospital.specialty === 'maternite' ? 'pregnant-woman' : 'local-hospital'}
                           size={24}
                           color="#30D158"
                        />
                     </View>
                     <View style={{ flex: 1 }}>
                        <Text style={styles.structureName}>{targetHospital.name}</Text>
                        <Text style={styles.structureAddress}>{targetHospital.address || "Adresse en cours de chargement..."}</Text>
                     </View>
                  </View>
                  <View style={{ marginTop: 16, paddingTop: 16, borderTopWidth: 1, borderColor: 'rgba(255,255,255,0.05)' }}>
                     <Text style={{ color: 'rgba(255,255,255,0.6)', fontSize: 13, lineHeight: 18 }}>
                        Cet établissement a confirmé pouvoir assurer la prise en charge immédiate de votre patient.
                     </Text>
                  </View>
               </View>
            </View>
         </View>
      );
   }

   return (
      <View style={[styles.stepBase, { paddingHorizontal: 0, paddingBottom: 0 }]}>
         <View style={{ paddingHorizontal: 24 }}>{renderStepInlineHeader()}</ View>
         
         {content}

         {currentHospital?.phone && (
            <View style={styles.bottomActionFixed}>
               <AppTouchableOpacity 
                  style={styles.bottomCallBtn}
                  onPress={() => setCallModalVisible(true)}
               >
                  <MaterialIcons name="phone" size={24} color="#FFF" />
                  <View>
                     <Text style={styles.bottomCallText}>Appeler l'hôpital</Text>
                     <Text style={styles.bottomCallSub}>{currentHospital.phone}</Text>
                  </View>
               </AppTouchableOpacity>
            </View>
         )}

         <Modal visible={callModalVisible} transparent animationType="slide">
            <TouchableWithoutFeedback onPress={() => setCallModalVisible(false)}>
               <View style={styles.choiceModalOverlay}>
                  <TouchableWithoutFeedback>
                     <View style={styles.choiceModalContent}>
                        <Text style={styles.choiceModalHeader}>Contacter l'établissement</Text>
                        
                        <AppTouchableOpacity style={styles.choiceBtn} onPress={() => handleCall('pstn')}>
                           <Phone color="#30D158" size={24} />
                           <Text style={styles.choiceBtnText}>Appel Classique</Text>
                           <MaterialIcons name="chevron-right" size={24} color="rgba(255,255,255,0.2)" />
                        </AppTouchableOpacity>

                        <AppTouchableOpacity style={styles.choiceBtn} onPress={() => handleCall('voip')}>
                           <PhoneForwarded color={colors.secondary} size={24} />
                           <Text style={styles.choiceBtnText}>Appel Audio (In-App)</Text>
                           <MaterialIcons name="chevron-right" size={24} color="rgba(255,255,255,0.2)" />
                        </AppTouchableOpacity>

                        <AppTouchableOpacity style={styles.choiceCancelBtn} onPress={() => setCallModalVisible(false)}>
                           <Text style={styles.choiceCancelText}>Annuler</Text>
                        </AppTouchableOpacity>
                     </View>
                  </TouchableWithoutFeedback>
               </View>
            </TouchableWithoutFeedback>
         </Modal>
      </View>
   );
};
