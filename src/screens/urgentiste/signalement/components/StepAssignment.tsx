import React, { useState } from 'react';
import { View, Text, ActivityIndicator, Linking, Modal, TouchableWithoutFeedback, Platform, ScrollView, TextInput } from 'react-native';
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
   loadingMore?: boolean;
   onLoadMore?: () => void;
   searchQuery?: string;
   onSearch?: (query: string) => void;
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
    onCancelAssignment,
    loadingMore,
    onLoadMore,
    searchQuery,
    onSearch
 }) => {
   const [callModalVisible, setCallModalVisible] = useState(false);

   const currentHospital = targetHospital || pendingStructureInfo;
   const isRefused = pendingStructureInfo?.refused;
   const isPending = !!pendingStructureInfo && !targetHospital;
   
   // We show the list unless a request is explicitly pending
   const showHospitalList = !isPending || isRefused;

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
      content = (
         <ScrollView style={styles.hospitalList} showsVerticalScrollIndicator={false} contentContainerStyle={{ flexGrow: 1 }}>
            {/* EN-TÊTE ET BARRE DE RECHERCHE - TOUJOURS VISIBLES */}
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

               <View style={{ 
                  marginTop: 16, 
                  flexDirection: 'row', 
                  alignItems: 'center', 
                  backgroundColor: 'rgba(255,255,255,0.05)', 
                  borderRadius: 12, 
                  paddingHorizontal: 12,
                  height: 44,
                  borderWidth: 1,
                  borderColor: 'rgba(255,255,255,0.1)'
               }}>
                  <MaterialIcons name="search" size={20} color="rgba(255,255,255,0.3)" />
                  <TextInput 
                     placeholder="Rechercher un hôpital..."
                     placeholderTextColor="rgba(255,255,255,0.3)"
                     style={{ 
                        flex: 1, 
                        color: '#FFF', 
                        fontSize: 14, 
                        marginLeft: 8,
                        paddingVertical: 8
                     }}
                     value={searchQuery}
                     onChangeText={onSearch}
                     autoCorrect={false}
                  />
                  {!!searchQuery && (
                     <AppTouchableOpacity onPress={() => onSearch?.("")}>
                        <MaterialIcons name="close" size={18} color="rgba(255,255,255,0.4)" />
                     </AppTouchableOpacity>
                  )}
               </View>
            </View>

            {/* CONTENU VARIABLE (Loading / Empty / List) */}
            {hospitalsLoading ? (
               <View style={[styles.hospitalsLoadingContainer, { flex: 1, justifyContent: 'center', paddingVertical: 40 }]}>
                  <ActivityIndicator size="large" color={colors.secondary} />
                  <Text style={[styles.standbySub, { marginTop: 16 }]}>Recherche en cours...</Text>
               </View>
            ) : nearbyHospitals.length === 0 ? (
               <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', padding: 40 }}>
                  <MaterialIcons name="access-time" size={48} color="rgba(255,255,255,0.2)" />
                  <Text style={{ color: 'rgba(255,255,255,0.6)', textAlign: 'center', marginTop: 16, fontSize: 16, lineHeight: 24 }}>
                     🕒 Aucune structure trouvée. Essayez une recherche manuelle.
                  </Text>
               </View>
            ) : (
               <View>
                  {nearbyHospitals.map((h) => {
                     const isRecommended = h.rank === 1;
                     const isCentralePick = h.isSelected;

                     return (
                        <View 
                           key={h.id} 
                           style={[
                              styles.hospitalCard, 
                              isRecommended && styles.hospitalCardRecommended,
                              isCentralePick && styles.hospitalCardActive, 
                              { paddingVertical: 12 }
                           ]}
                        >
                           <View style={[styles.hospitalCardInfo, { marginRight: 12 }]}>
                              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, width: '100%' }}>
                                 <Text style={[styles.hospitalCardName, { marginBottom: 0, flex: 1 }]} numberOfLines={1}>
                                    {h.name}
                                 </Text>
                                 <View style={{ flexDirection: 'row', gap: 4, flexShrink: 0 }}>
                                    {isCentralePick && (
                                       <View style={[styles.hospitalTypeBadge, styles.badgeCentrale, { marginLeft: 0 }]}>
                                          <Text style={styles.badgeTextCentrale}>CENTRALE</Text>
                                       </View>
                                    )}
                                    {isRecommended && !isCentralePick && (
                                       <View style={[styles.hospitalTypeBadge, styles.badgeRecommended, { marginLeft: 0 }]}>
                                          <Text style={styles.badgeTextRecommended}>PROCHE</Text>
                                       </View>
                                    )}
                                 </View>
                              </View>
                              
                              {h.address && (
                                 <Text style={{ color: 'rgba(255,255,255,0.4)', fontSize: 11, marginTop: 1 }} numberOfLines={1}>
                                    {h.address}
                                 </Text>
                              )}

                              <View style={[styles.hospitalCardStats, { marginTop: 6 }]}>
                                 <View style={styles.hospitalStatItem}>
                                    <Navigation size={12} color={colors.secondary} />
                                    <Text style={[styles.hospitalStatText, { color: '#FFF' }]}>{h.distanceKm} km</Text>
                                 </View>
                                 <View style={{ width: 1, height: 10, backgroundColor: 'rgba(255,255,255,0.1)', marginHorizontal: 4 }} />
                                 <View style={styles.hospitalStatItem}>
                                    <MaterialIcons name="access-time" size={14} color={colors.secondary} />
                                    <Text style={[styles.hospitalStatText, { color: '#FFF' }]}>{h.etaMin} min</Text>
                                 </View>
                              </View>
                           </View>
                           
                           <View style={{ flexShrink: 0 }}>
                              <AppTouchableOpacity 
                                 style={[styles.selectHospBtn, { paddingVertical: 10, paddingHorizontal: 14 }]}
                                 onPress={() => onSelectHospital(h)}
                              >
                                 <Text style={[styles.selectHospBtnText, { fontSize: 13 }]}>DEMANDER</Text>
                              </AppTouchableOpacity>
                           </View>
                        </View>
                     );
                  })}

                  {/* BOUTON CHARGER PLUS (Visible si non recherche et résultats présents) */}
                  {!searchQuery && nearbyHospitals.length > 0 && (
                     <AppTouchableOpacity 
                        onPress={onLoadMore}
                        disabled={loadingMore}
                        style={{
                           paddingVertical: 16,
                           alignItems: 'center',
                           justifyContent: 'center',
                           borderWidth: 1,
                           borderStyle: 'dashed',
                           borderColor: loadingMore ? 'rgba(255,255,255,0.1)' : 'rgba(255,255,255,0.15)',
                           borderRadius: 12,
                           marginTop: 8,
                           marginBottom: 32,
                           flexDirection: 'row',
                           backgroundColor: loadingMore ? 'rgba(255,255,255,0.02)' : 'transparent',
                           gap: 8
                        }}
                     >
                        {loadingMore ? (
                           <ActivityIndicator size="small" color="rgba(255,255,255,0.4)" />
                        ) : (
                           <>
                              <MaterialIcons name="add" size={20} color="rgba(255,255,255,0.4)" />
                              <Text style={{ color: 'rgba(255,255,255,0.4)', fontWeight: '700', fontSize: 13 }}>PLUS D'ÉTABLISSEMENTS</Text>
                           </>
                        )}
                     </AppTouchableOpacity>
                  )}
               </View>
            )}
         </ScrollView>
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

            <View style={{ width: '100%', gap: 12, marginTop: 40 }}>
               <AppTouchableOpacity 
                  onPress={() => setCallModalVisible(true)}
                  style={{ 
                     width: '100%',
                     paddingVertical: 14, 
                     borderRadius: 14,
                     backgroundColor: 'rgba(48,209,88,0.1)',
                     borderWidth: 1,
                     borderColor: 'rgba(48,209,88,0.2)',
                     flexDirection: 'row',
                     alignItems: 'center',
                     justifyContent: 'center',
                     gap: 8
                  }}
               >
                  <Phone size={18} color="#30D158" />
                  <Text style={{ color: '#30D158', fontWeight: '800', fontSize: 15 }}>Appeler l'établissement</Text>
               </AppTouchableOpacity>

               <AppTouchableOpacity 
                  onPress={onCancelAssignment}
                  style={{ 
                     width: '100%',
                     paddingVertical: 14, 
                     borderRadius: 14,
                     borderWidth: 1,
                     borderColor: 'rgba(255,59,48,0.3)',
                     backgroundColor: 'rgba(255,59,48,0.05)',
                     alignItems: 'center',
                     justifyContent: 'center'
                  }}
               >
                  <Text style={{ color: '#FF3B30', fontWeight: '700', fontSize: 14 }}>Annuler la demande</Text>
               </AppTouchableOpacity>
            </View>
            
            <Text style={{ color: 'rgba(255,255,255,0.3)', marginTop: 16, fontSize: 12, textAlign: 'center' }}>
               Choisissez un autre établissement si celui-ci tarde à répondre
            </Text>
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
