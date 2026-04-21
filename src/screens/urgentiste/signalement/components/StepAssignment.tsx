import React, { useState } from 'react';
import { View, Text, ActivityIndicator, Linking, Modal, TouchableWithoutFeedback, Platform, ScrollView } from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { Hospital as HospitalIcon, Phone, PhoneForwarded, Navigation } from "lucide-react-native";
import { colors } from '../../../../theme/colors';
import { styles } from '../styles';
import { AppTouchableOpacity } from '../../../../components/ui/AppTouchableOpacity';
import type { Hospital } from '../../../../contexts/MissionContext';

interface StepAssignmentProps {
   pendingStructureInfo: any;
   targetHospital: any;
   nearbyHospitals: Hospital[];
   hospitalsLoading: boolean;
   urgentisteLoc: any;
   urgentisteHeadingDeg: number;
   hospitalRouteGeoJSON: any;
   hospitalRouteDuration: number | null;
   hospitalRouteDistance: number | null;
   hospitalRouteCameraBounds: any;
   departingEnRoute: boolean;
   onDepartVersStructure: () => void;
   onSelectHospital: (hospital: Hospital) => void;
   onOpenFullscreenMap: () => void;
   renderStepInlineHeader: () => React.ReactNode;
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
   onDepartVersStructure,
   onSelectHospital,
   onOpenFullscreenMap,
   renderStepInlineHeader
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
            <View style={styles.hospitalsEmptyContainer}>
               <MaterialIcons name="search-off" size={48} color="rgba(255,255,255,0.1)" />
               <Text style={styles.hospitalsEmptyText}>
                  Aucun établissement trouvé à proximité.{"\n"}Veuillez contacter la centrale.
               </Text>
            </View>
         );
      } else {
         content = (
            <ScrollView style={styles.hospitalList} showsVerticalScrollIndicator={false}>
               <View style={{ marginBottom: 12 }}>
                  <Text style={styles.stepSectionHeading}>Établissements proches</Text>
                  {isRefused && (
                     <View style={{ backgroundColor: 'rgba(255,59,48,0.1)', padding: 12, borderRadius: 12, marginBottom: 16, borderWidth: 1, borderColor: 'rgba(255,59,48,0.2)' }}>
                        <Text style={{ color: '#FF3B30', fontSize: 13, fontWeight: '800' }}>
                           Dernière demande refusée : {pendingStructureInfo.name}
                        </Text>
                        <Text style={{ color: 'rgba(255,59,48,0.7)', fontSize: 12, marginTop: 4 }}>
                           Veuillez choisir un autre établissement ci-dessous.
                        </Text>
                     </View>
                  )}
               </View>

               {nearbyHospitals.map((h) => (
                  <AppTouchableOpacity 
                     key={h.id} 
                     style={styles.hospitalCard}
                     onPress={() => onSelectHospital(h)}
                  >
                     <View style={styles.hospitalIconBox}>
                        <MaterialIcons name={getHospitalIcon(h.specialty) as any} size={22} color={colors.secondary} />
                     </View>
                     <View style={styles.hospitalCardInfo}>
                        <Text style={styles.hospitalCardName}>{h.name}</Text>
                        <View style={styles.hospitalCardStats}>
                           <View style={styles.hospitalStatItem}>
                              <Navigation size={12} color="rgba(255,255,255,0.4)" />
                              <Text style={styles.hospitalStatText}>{h.distance || "N/A"}</Text>
                           </View>
                           {h.capacity && (
                              <View style={styles.hospitalStatItem}>
                                 <MaterialIcons name="airline-seat-flat" size={14} color="rgba(255,255,255,0.4)" />
                                 <Text style={styles.hospitalStatText}>{h.capacity} lits dispos</Text>
                              </View>
                           )}
                        </View>
                     </View>
                     <View style={styles.selectHospBtn}>
                        <Text style={styles.selectHospBtnText}>CHOISIR</Text>
                     </View>
                  </AppTouchableOpacity>
               ))}
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
