import React from 'react';
import { View, Text, Animated } from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { colors } from '../../../../theme/colors';
import { styles } from '../styles';
import { AppTouchableOpacity } from '../../../../components/ui/AppTouchableOpacity';

interface StepStandbyProps {
   selectedMission: any;
   isAssigned: boolean;
   radarAnim: Animated.Value;
   notifyAnim: Animated.Value;
   displayAddress: string;
   onConsultAlert: (mission: any) => void;
   onBack: () => void;
}

export const StepStandby: React.FC<StepStandbyProps> = ({
   selectedMission,
   isAssigned,
   radarAnim,
   notifyAnim,
   displayAddress,
   onConsultAlert,
   onBack
}) => {
   return (
      <View style={{ flex: 1 }}>
         <View style={styles.topHeader}>
            <View style={styles.headerRow}>
               <AppTouchableOpacity
                  onPress={onBack}
                  style={styles.backBtn}
               >
                  <MaterialIcons name="arrow-back" color="#FFF" size={24} />
               </AppTouchableOpacity>
               <View style={{ flex: 1, paddingHorizontal: 15 }}>
                  <Text style={styles.greetingText}>Centrale régulation</Text>
                  <Text style={styles.hospitalName} numberOfLines={1}>
                     Attente d'affectation...
                  </Text>
               </View>
            </View>
         </View>

         <View style={styles.standbyView}>
            <View style={styles.radarWrapper}>
               <Animated.View
                  style={[
                     styles.radarCircle,
                     {
                        transform: [{ scale: radarAnim }],
                        opacity: Animated.subtract(1, radarAnim),
                     },
                  ]}
               />
               <MaterialIcons
                  name="wifi-tethering"
                  size={60}
                  color={colors.secondary}
               />
            </View>
            <Text style={styles.standbyText}>
               En attente d'une mission...
            </Text>
            <Text style={styles.standbySub}>
               Votre unité est disponible pour affectation prioritaire par la
               centrale.
            </Text>
            {isAssigned && selectedMission && (
               <Animated.View
                  style={[
                     styles.assignmentPopup,
                     {
                        transform: [
                           {
                              translateY: notifyAnim.interpolate({
                                 inputRange: [0, 1],
                                 outputRange: [200, 0],
                              }),
                           },
                        ],
                     },
                  ]}
               >
                  <View style={styles.assignRow}>
                     <View style={styles.priorityDot} />
                     <Text style={styles.assignHeader}>
                        Nouvelle mission affectée
                     </Text>
                  </View>
                  <Text style={styles.assignType}>{selectedMission.type}</Text>
                  <Text style={styles.assignLoc}>
                     {displayAddress}
                  </Text>
                  <AppTouchableOpacity
                     style={styles.assignAction}
                     onPress={() => onConsultAlert(selectedMission)}
                  >
                     <Text style={styles.assignActionText}>
                        Consulter l'alerte
                     </Text>
                     <MaterialIcons
                        name="chevron-right"
                        size={24}
                        color="#FFF"
                     />
                  </AppTouchableOpacity>
               </Animated.View>
            )}
         </View>
      </View>
   );
};
