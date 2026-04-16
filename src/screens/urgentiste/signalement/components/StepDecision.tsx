import React from 'react';
import { View, Text } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { colors } from '../../../../theme/colors';
import { styles } from '../styles';
import { AppTouchableOpacity } from '../../../../components/ui/AppTouchableOpacity';

interface StepDecisionProps {
   onDecideTransport: (choice: string) => void;
   renderStepInlineHeader: () => React.ReactNode;
}

export const StepDecision: React.FC<StepDecisionProps> = ({
   onDecideTransport,
   renderStepInlineHeader
}) => {
   return (
      <View style={styles.stepBase}>
         {renderStepInlineHeader()}
         
         <View style={{ flex: 1, justifyContent: 'center' }}>
            <View style={styles.decisionGrid}>
               <AppTouchableOpacity
                  style={[styles.decisionCardGrid, { borderColor: colors.success + "30" }]}
                  onPress={() => onDecideTransport("Stable")}
               >
                  <View
                     style={[
                        styles.decisionIconBox,
                        { backgroundColor: colors.success + "15" },
                     ]}
                  >
                     <MaterialCommunityIcons
                        name="home-heart"
                        size={32}
                        color={colors.success}
                     />
                  </View>
                  <Text style={[styles.decisionLabel, { color: '#FFF' }]}>Traité sur place</Text>
                  <Text style={{ color: colors.success, fontSize: 11, fontWeight: '700', marginTop: 4 }}>CLÔTURE MISSION</Text>
               </AppTouchableOpacity>

               <AppTouchableOpacity
                  style={[styles.decisionCardGrid, { borderColor: colors.secondary + "30" }]}
                  onPress={() => onDecideTransport("Transport")}
               >
                  <View
                     style={[
                        styles.decisionIconBox,
                        { backgroundColor: colors.secondary + "15" },
                     ]}
                  >
                     <MaterialCommunityIcons
                        name="ambulance"
                        size={32}
                        color={colors.secondary}
                     />
                  </View>
                  <Text style={[styles.decisionLabel, { color: '#FFF' }]}>Transport vers Hôpital</Text>
                  <Text style={{ color: colors.secondary, fontSize: 11, fontWeight: '700', marginTop: 4 }}>ÉVACUATION MÉDICALE</Text>
               </AppTouchableOpacity>
            </View>
         </View>
      </View>
   );
};
