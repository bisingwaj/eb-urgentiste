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
         <Text style={styles.stepSectionHeading}>Plan d'évacuation</Text>
         <View style={styles.decisionGrid}>
            <AppTouchableOpacity
               style={styles.decisionCardGrid}
               onPress={() => onDecideTransport("Stable")}
            >
               <View
                  style={[
                     styles.decisionIconBox,
                     { backgroundColor: colors.success + "10" },
                  ]}
               >
                  <MaterialCommunityIcons
                     name="home-heart"
                     size={28}
                     color={colors.success}
                  />
               </View>
               <Text style={styles.decisionLabel}>Traité sur place</Text>
            </AppTouchableOpacity>
            <AppTouchableOpacity
               style={styles.decisionCardGrid}
               onPress={() => onDecideTransport("Transport")}
            >
               <View
                  style={[
                     styles.decisionIconBox,
                     { backgroundColor: colors.secondary + "10" },
                  ]}
               >
                  <MaterialCommunityIcons
                     name="ambulance"
                     size={28}
                     color={colors.secondary}
                  />
               </View>
               <Text style={styles.decisionLabel}>Évacuation base</Text>
            </AppTouchableOpacity>
            <AppTouchableOpacity
               style={[
                  styles.decisionCardGrid,
                  { borderColor: colors.primary + "40" },
               ]}
               onPress={() => onDecideTransport("Critique")}
            >
               <View
                  style={[
                     styles.decisionIconBox,
                     { backgroundColor: colors.primary + "10" },
                  ]}
               >
                  <MaterialCommunityIcons
                     name="alarm-light-outline"
                     size={28}
                     color={colors.primary}
                  />
               </View>
               <Text
                  style={[styles.decisionLabel, { color: colors.primary }]}
               >
                  Urgence vitale
               </Text>
            </AppTouchableOpacity>
         </View>
      </View>
   );
};
