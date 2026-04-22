import React, { useState } from 'react';
import { View, Text, ActivityIndicator, Linking, Modal, TouchableWithoutFeedback, Platform, ScrollView } from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { Hospital as HospitalIcon, Phone, PhoneForwarded, Navigation } from "lucide-react-native";
import { colors } from '../../../../theme/colors';
import { styles } from '../styles';
import { AppTouchableOpacity } from '../../../../components/ui/AppTouchableOpacity';
import { HospitalSuggestion, Mission } from '../../../../types/mission';

interface StepAssignmentProps {
   pendingStructureInfo: any;
   targetHospital: any;
   nearbyHospitals: HospitalSuggestion[];
   hospitalsLoading: boolean;
   urgentisteLoc: any;
   urgentisteHeadingDeg: number;
   hospitalRouteGeoJSON: any;
   hospitalRouteDuration: number | null;
   hospitalRouteDistance: number | null;
   hospitalRouteCameraBounds: any;
   departingEnRoute: boolean;
   selectedMission: Mission | null;
   recalculating?: boolean;
   onRecalculate?: () => void;
   onDepartVersStructure: () => void;
   onSelectHospital: (hospital: HospitalSuggestion) => void;
   urgencyCategory?: string;
   onOpenFullscreenMap: () => void;
   renderStepInlineHeader: () => React.ReactNode;
   onCancelAssignment?: () => void;
}

export const StepAssignment: React.FC<StepAssignmentProps> = ({
   pendingStructureInfo,
   targetHospital,
   nearbyHospitals,
   hospitalsLoading,
   urgentisteLoc,
   urgentisteHeadingDeg,
   hospitalRouteGeoJSON,
   hospitalRouteDuration,
   hospitalRouteDistance,
   hospitalRouteCameraBounds,
   departingEnRoute,
   selectedMission,
   recalculating,
   onRecalculate,
   onDepartVersStructure,
    onSelectHospital,
    urgencyCategory,
    onOpenFullscreenMap,
    renderStepInlineHeader,
    onCancelAssignment
 }) => {
   const [callModalVisible, setCallModalVisible] = useState(false);

   const currentHospital = targetHospital || pendingStructureInfo;
   const isRefused = pendingStructureInfo?.refused;
   const isPending = !!pendingStructureInfo && !targetHospital;
   
   // If no hospital is assigned OR if the current one refused, we show the list
   const showHospitalList = !currentHospital || isRefused;

   const handleCall = (mode: 'pstn' | 'voip') => {
      setCallModalVisible(false);
      if (mode === 'pstn' && currentHospital?.phone) {
         Linking.openURL(`tel:${currentHospital.phone}`);
      } else {
         console.log("App call to hospital not yet implemented");
      }
   };

   // Map status/type icon
   const getHospitalIcon = (type?: string) => {
      if (type?.toLowerCase().includes('pharmacie')) return 'medical-services';
      if (type?.toLowerCase().includes('clinique')) return 'local-hospital';
      return 'hospital';
   };

   // Render Logic
   let content;

   if (showHospitalList) {
      if (hospitalsLoading) {
         content = (
            <View style={styles.hospitalsLoadingContainer}>
               <ActivityIndicator size="large" color={colors.secondary} />
               <Text style={[styles.standbySub, { marginTop: 16 }]}>Recherche des établissements à proximité...</Text>
            </View>
         );
      } else if (nearbyHospitals.length === 0) {
         content = (
            <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', padding: 40 }}>
               <MaterialIcons name="access-time" size={48} color="rgba(255,255,255,0.2)" />
               <Text style={{ color: 'rgba(255,255,255,0.6)', textAlign: 'center', marginTop: 16, fontSize: 16, lineHeight: 24 }}>
                  🕒 Les structures recommandées s'afficheront dès votre arrivée sur zone.
               </Text>
               <Text style={{ color: 'rgba(255,255,255,0.3)', textAlign: 'center', marginTop: 8, fontSize: 12 }}>
                  (Statut : {selectedMission?.dispatch_status || 'en attente'})
               </Text>
               
               <AppTouchableOpacity 
                  onPress={onRecalculate}
                  disabled={recalculating}
                  style={{ 
                     marginTop: 24, 
                     flexDirection: 'row', 
                     alignItems: 'center', 
                     backgroundColor: 'rgba(255,255,255,0.1)', 
                     paddingHorizontal: 20, 
                     paddingVertical: 12, 
                     borderRadius: 12 
                  }}
               >
                  {recalculating ? (
                     <ActivityIndicator size="small" color="#FFF" />
                  ) : (
                     <>
                        <MaterialIcons name="refresh" size={20} color="#FFF" style={{ marginRight: 8 }} />
                        <Text style={{ color: '#FFF', fontWeight: '600' }}>Forcer le calcul</Text>
                     </>
                  )}
               </AppTouchableOpacity>
            </View>
         );
      } else {
         const recommended = nearbyHospitals.find(h => h.rank === 1);

         content = (
            <ScrollView style={styles.hospitalList} showsVerticalScrollIndicator={false}>
               <View style={{ marginBottom: 16 }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                     <View>
                        <Text style={styles.stepSectionHeading}>Structures suggérées</Text>
                        <Text style={{ color: 'rgba(255,255,255,0.4)', fontSize: 11, marginTop: 2 }}>
                           Calculé à {selectedMission?.suggested_hospitals_computed_at ? new Date(selectedMission.suggested_hospitals_computed_at).toLocaleTimeString() : '--:--'}
                        </Text>
                     </View>
                     <View style={{ flexDirection: 'row', gap: 8 }}>
                        <AppTouchableOpacity 
                           onPress={onRecalculate}
                           disabled={recalculating}
                           style={{ backgroundColor: 'rgba(255,255,255,0.05)', padding: 8, borderRadius: 8 }}
                        >
                           {recalculating ? (
                              <ActivityIndicator size="small" color="#FFF" />
                           ) : (
                              <MaterialIcons name="refresh" size={18} color="rgba(255,255,255,0.5)" />
                           )}
                        </AppTouchableOpacity>
                        <View style={{ backgroundColor: 'rgba(48,209,88,0.1)', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 6, justifyContent: 'center' }}>
                           <Text style={{ color: '#30D158', fontSize: 10, fontWeight: '900' }}>SNAPSHOT SERVEUR</Text>
                        </View>
                     </View>
                  </View>
               </View>

               {nearbyHospitals.map((h) => {
                  const bedsInfo = (() => {
                     const beds = h.availableBeds ?? 0;
                     if (beds > 5) return { color: '#30D158', text: `${beds} lits` };
                     if (beds > 0) return { color: '#FF9F0A', text: `${beds} lits` };
                     return { color: '#FF3B30', text: 'PLEIN' };
                  })();

                  const isRecommended = h.rank === 1;
                  const isCentralePick = h.isSelected; // spec §2: isSelected = confirmed by operator

                  return (
                     <AppTouchableOpacity 
                        key={h.id} 
                        style={[styles.hospitalCard, isCentralePick && { borderColor: 'rgba(175, 82, 222, 0.4)', borderWidth: 1.5 }]}
                        onPress={() => onSelectHospital(h)}
                     >
                        <View style={{ flex: 1 }}>
                           <View style={styles.hospitalCardHeader}>
                              <View style={{ flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 4 }}>
                                 <Text style={styles.hospitalCardName}>{h.name}</Text>
                                 <View style={styles.hospitalTypeBadge}>
                                    <Text style={styles.hospitalTypeText}>{h.type || 'Hopital'}</Text>
                                 </View>
                                 
                                 {isCentralePick && (
                                    <View style={[styles.hospitalTypeBadge, styles.badgeCentrale]}>
                                       <Text style={styles.badgeTextCentrale}>CHOISIE PAR CENTRALE</Text>
                                    </View>
                                 )}
                                 {isRecommended && !isCentralePick && (
                                    <View style={[styles.hospitalTypeBadge, styles.badgeRecommended]}>
                                       <Text style={styles.badgeTextRecommended}>RECOMMANDÉE</Text>
                                    </View>
                                 )}
                              </View>
                              <View style={[styles.bedIndicator, { backgroundColor: bedsInfo.color + '15' }]}>
                                 <MaterialIcons name="airline-seat-flat" size={12} color={bedsInfo.color} />
                                 <Text style={[styles.bedIndicatorText, { color: bedsInfo.color }]}>{bedsInfo.text}</Text>
                              </View>
                           </View>

                           <View style={styles.hospitalCardStats}>
                              <View style={styles.hospitalStatItem}>
                                 <Navigation size={12} color="rgba(255,255,255,0.4)" />
                                 <Text style={styles.hospitalStatText}>{h.distanceKm} km</Text>
                              </View>
                              <View style={styles.hospitalStatItem}>
                                 <MaterialIcons name="access-time" size={14} color="rgba(255,255,255,0.4)" />
                                 <Text style={styles.hospitalStatText}>{h.etaMin} min</Text>
                              </View>
                              <View style={styles.hospitalStatItem}>
                                 <MaterialIcons name="score" size={12} color="rgba(255,255,255,0.2)" />
                                 <Text style={[styles.hospitalStatText, { color: 'rgba(255,255,255,0.2)' }]}>{h.score}</Text>
                              </View>
                           </View>

                           {h.specialties && h.specialties.length > 0 && (
                              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.specialtyScroll}>
                                 {h.specialties.map((s, idx) => {
                                    const normS = (s || "").toLowerCase().trim();
                                    const normCat = (urgencyCategory || "").toLowerCase().trim();
                                    const isMatch = normS === normCat || normS === 'general' || normS.includes(normCat) || normCat.includes(normS);
                                    
                                    return (
                                       <View key={idx} style={[styles.specialtyChip, isMatch && styles.specialtyChipActive]}>
                                          <Text style={[styles.specialtyText, isMatch && styles.specialtyTextActive]}>{s}</Text>
                                       </View>
                                    );
                                 })}
                              </ScrollView>
                           )}
                        </View>
                        
                        <View style={styles.selectHospBtn}>
                           <MaterialIcons name="chevron-right" size={24} color="#FFF" />
                        </View>
                     </AppTouchableOpacity>
                  );
               })}
            </ScrollView>
         );
      }
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

            <AppTouchableOpacity 
               onPress={onCancelAssignment}
               style={{ 
                  marginTop: 48, 
                  paddingVertical: 12, 
                  paddingHorizontal: 24, 
                  borderRadius: 12,
                  borderWidth: 1,
                  borderColor: 'rgba(255,255,255,0.2)',
                  backgroundColor: 'rgba(255,59,48,0.1)' 
               }}
            >
               <Text style={{ color: '#FF3B30', fontWeight: '700', fontSize: 15 }}>Annuler la demande</Text>
            </AppTouchableOpacity>
            
            <Text style={{ color: 'rgba(255,255,255,0.3)', marginTop: 12, fontSize: 12 }}>
               Choisissez un autre établissement si celui-ci tarde à répondre
            </Text>
         </View>
      );
   } else if (targetHospital) {
      content = (
         <View style={{ flex: 1, paddingVertical: 10 }}>
            <View style={{ 
               backgroundColor: 'rgba(48,209,88,0.1)', 
               padding: 20, 
               borderRadius: 20, 
               borderWidth: 1, 
               borderColor: 'rgba(48,209,88,0.2)',
               alignItems: 'center',
               marginBottom: 24
            }}>
               <View style={{ width: 64, height: 64, borderRadius: 32, backgroundColor: 'rgba(48,209,88,0.2)', justifyContent: 'center', alignItems: 'center', marginBottom: 16 }}>
                  <MaterialIcons name="check-circle" size={40} color="#30D158" />
               </View>
               <Text style={{ color: '#FFF', fontSize: 22, fontWeight: '900', textAlign: 'center' }}>Hôpital Confirmé</Text>
               <Text style={{ color: 'rgba(255,255,255,0.6)', fontSize: 14, textAlign: 'center', marginTop: 4 }}>
                  La structure a accepté votre demande de prise en charge.
               </Text>
            </View>

            <View style={[styles.hospitalCard, { borderColor: '#30D158', borderWidth: 1, backgroundColor: 'rgba(255,255,255,0.03)' }]}>
               <View style={styles.hospitalCardHeader}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                     <HospitalIcon size={20} color="#30D158" />
                     <Text style={styles.hospitalCardName}>{targetHospital.name}</Text>
                  </View>
                  <View style={[styles.hospitalTypeBadge, { backgroundColor: 'rgba(255,255,255,0.1)' }]}>
                     <Text style={styles.hospitalTypeText}>{targetHospital.specialty || 'Hôpital'}</Text>
                  </View>
               </View>

               <View style={[styles.hospitalCardStats, { marginTop: 12 }]}>
                  <View style={styles.hospitalStatItem}>
                     <Navigation size={14} color="rgba(255,255,255,0.4)" />
                     <Text style={styles.hospitalStatText}>{hospitalRouteDistance ? (hospitalRouteDistance / 1000).toFixed(1) : '--'} km</Text>
                  </View>
                  <View style={styles.hospitalStatItem}>
                     <MaterialIcons name="access-time" size={16} color="rgba(255,255,255,0.4)" />
                     <Text style={styles.hospitalStatText}>{hospitalRouteDuration ? Math.ceil(hospitalRouteDuration / 60) : '--'} min</Text>
                  </View>
               </View>

               {targetHospital.address && (
                  <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 12, gap: 6 }}>
                     <MaterialIcons name="place" size={14} color="rgba(255,255,255,0.3)" />
                     <Text style={{ color: 'rgba(255,255,255,0.4)', fontSize: 12, flex: 1 }} numberOfLines={1}>
                        {targetHospital.address}
                     </Text>
                  </View>
               )}
            </View>

            <View style={{ marginTop: 'auto', gap: 12 }}>
               <AppTouchableOpacity 
                  onPress={onDepartVersStructure}
                  disabled={departingEnRoute}
                  style={{ 
                     backgroundColor: '#30D158', 
                     paddingVertical: 18, 
                     borderRadius: 16, 
                     flexDirection: 'row', 
                     justifyContent: 'center', 
                     alignItems: 'center',
                     shadowColor: '#30D158',
                     shadowOffset: { width: 0, height: 4 },
                     shadowOpacity: 0.3,
                     shadowRadius: 8,
                     elevation: 5
                  }}
               >
                  {departingEnRoute ? (
                     <ActivityIndicator size="small" color="#FFF" />
                  ) : (
                     <>
                        <Navigation size={20} color="#FFF" style={{ marginRight: 10 }} />
                        <Text style={{ color: '#FFF', fontSize: 18, fontWeight: '900' }}>DÉMARRER L'ITINÉRAIRE</Text>
                     </>
                  )}
               </AppTouchableOpacity>

               <AppTouchableOpacity 
                  onPress={onCancelAssignment}
                  style={{ 
                     paddingVertical: 14, 
                     borderRadius: 16, 
                     borderWidth: 1,
                     borderColor: 'rgba(255,255,255,0.1)',
                     justifyContent: 'center', 
                     alignItems: 'center'
                  }}
               >
                  <Text style={{ color: 'rgba(255,255,255,0.4)', fontSize: 14, fontWeight: '600' }}>Changer de structure</Text>
               </AppTouchableOpacity>
            </View>
         </View>
      );
   } else {
      content = (
         <View style={{ flex: 1, justifyContent: "center", alignItems: "center", paddingBottom: 100 }}>
            <ActivityIndicator size="small" color={colors.secondary} />
            <Text style={[styles.standbySub, { marginTop: 16, color: 'rgba(255,255,255,0.4)' }]}>Préparation de l'itinéraire...</Text>
         </View>
      );
   }

   return (
      <View style={[styles.stepBase, { paddingHorizontal: 0, paddingBottom: 0 }]}>
         <View style={{ paddingHorizontal: 24 }}>{renderStepInlineHeader()}</View>
         
         <View style={{ flex: 1, paddingHorizontal: 24 }}>
            {content}
         </View>

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
