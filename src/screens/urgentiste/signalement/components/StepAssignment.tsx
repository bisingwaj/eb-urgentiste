import React from 'react';
import { View, Text, ActivityIndicator, Linking } from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { Hospital as HospitalIcon } from "lucide-react-native";
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
   if (pendingStructureInfo?.refused) {
      return (
         <View style={styles.stepBase}>
            <View style={{ paddingHorizontal: 24 }}>{renderStepInlineHeader()}</View>
            <View style={{ flex: 1, justifyContent: "center", alignItems: "center", paddingHorizontal: 28 }}>
               <MaterialIcons name="cancel" size={48} color="#FF3B30" />
               <Text style={[styles.standbyText, { marginTop: 16, textAlign: "center" }]}>
                  {pendingStructureInfo.name}
               </Text>
               <Text style={[styles.standbySub, { marginTop: 12, textAlign: "center" }]}>
                  Cet établissement a refusé la prise en charge. En attente de réassignation par la centrale.
               </Text>
               {pendingStructureInfo.refusalNotes ? (
                  <Text style={[styles.standbySub, { marginTop: 16, textAlign: "center", color: "rgba(255,255,255,0.85)" }]}>
                     Motif : {pendingStructureInfo.refusalNotes}
                  </Text>
               ) : null}
               <ActivityIndicator size="small" color={colors.secondary} style={{ marginTop: 24 }} />
            </View>
         </View>
      );
   }

   if (!targetHospital && !pendingStructureInfo) {
      return (
         <View style={styles.stepBase}>
            <View style={{ paddingHorizontal: 24 }}>{renderStepInlineHeader()}</View>
            <View style={{ flex: 1, justifyContent: "center", alignItems: "center" }}>
               <ActivityIndicator size="large" color={colors.secondary} />
               <Text style={[styles.standbyText, { marginTop: 20 }]}>
                  Attente du régulateur...
               </Text>
               <Text style={styles.standbySub}>
                  La centrale recherche l'établissement le plus adapté.
               </Text>
            </View>
         </View>
      );
   }

   if (pendingStructureInfo && !targetHospital) {
      return (
         <View style={styles.stepBase}>
            <View style={{ paddingHorizontal: 24 }}>{renderStepInlineHeader()}</View>
            <View style={{ flex: 1, justifyContent: "center", alignItems: "center", paddingHorizontal: 28 }}>
               <MaterialIcons name="local-hospital" size={48} color={colors.secondary} />
               <Text style={[styles.standbyText, { marginTop: 16, textAlign: "center" }]}>
                  {pendingStructureInfo.name}
               </Text>
               <Text style={[styles.standbySub, { marginTop: 12, textAlign: "center" }]}>
                  En attente de réponse de l'établissement — les coordonnées GPS seront affichées après acceptation.
               </Text>
               
               {pendingStructureInfo.phone ? (
                  <AppTouchableOpacity
                     style={[styles.structureCallBtn, { marginTop: 24, paddingHorizontal: 20, paddingVertical: 12 }]}
                     onPress={() => Linking.openURL(`tel:${pendingStructureInfo.phone}`)}
                  >
                     <MaterialIcons name="phone" size={20} color="#30D158" />
                     <Text style={[styles.structureCallText, { fontSize: 15 }]}>Accélérer (Appeler le {pendingStructureInfo.phone})</Text>
                  </AppTouchableOpacity>
               ) : null}

               <ActivityIndicator size="small" color={colors.secondary} style={{ marginTop: 20 }} />
            </View>
         </View>
      );
   }

   return (
      <View style={[styles.stepBase, { paddingHorizontal: 0, paddingBottom: 0 }]}>
         <View style={{ paddingHorizontal: 24 }}>{renderStepInlineHeader()}</View>
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
                              paddingBottom: 200,
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
                  accessibilityRole="button"
                  accessibilityLabel="Carte plein écran"
               >
                  <MaterialIcons name="fullscreen" color="#FFF" size={22} />
               </AppTouchableOpacity>

               <AppTouchableOpacity
                  style={styles.assignmentEnRouteFab}
                  onPress={onDepartVersStructure}
                  disabled={departingEnRoute}
                  accessibilityRole="button"
                  accessibilityLabel="Nous sommes en route vers la structure"
               >
                  {departingEnRoute ? (
                     <ActivityIndicator color="#FFF" size="small" />
                  ) : (
                     <>
                        <MaterialIcons name="directions-run" color="#FFF" size={22} />
                        <Text style={styles.assignmentEnRouteFabText}>En route</Text>
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
                  accessibilityRole="button"
                  accessibilityLabel="Ouvrir la navigation"
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

            <View style={styles.assignmentBottomPanel}>
               <View style={styles.assignmentStructureCard}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                     <View style={styles.structureIconBox}>
                        <MaterialIcons
                           name={targetHospital.specialty === 'pharmacie' ? 'local-pharmacy' : targetHospital.specialty === 'maternite' ? 'pregnant-woman' : 'local-hospital'}
                           size={24}
                           color={colors.secondary}
                        />
                     </View>
                     <View style={{ flex: 1 }}>
                        <Text style={styles.structureName}>{targetHospital.name}</Text>
                        {targetHospital.address && (
                           <Text style={styles.structureAddress}>{targetHospital.address}</Text>
                        )}
                        <Text style={styles.structureCoords}>
                           {targetHospital.coords.latitude.toFixed(5)}, {targetHospital.coords.longitude.toFixed(5)}
                        </Text>
                     </View>
                  </View>
                  <View style={{ flexDirection: 'row', gap: 10, marginTop: 12 }}>
                     {targetHospital.phone && (
                        <AppTouchableOpacity
                           style={styles.structureCallBtn}
                           onPress={() => Linking.openURL(`tel:${targetHospital.phone}`)}
                        >
                           <MaterialIcons name="phone" size={16} color="#30D158" />
                           <Text style={styles.structureCallText}>Appeler</Text>
                        </AppTouchableOpacity>
                     )}
                  </View>
               </View>
            </View>
         </View>
      </View>
   );
};
