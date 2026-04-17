import React from 'react';
import { View, Text } from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { colors } from '../../../../theme/colors';
import { styles } from '../styles';
import { AppTouchableOpacity } from '../../../../components/ui/AppTouchableOpacity';

interface StepClosureProps {
   onReturnToDashboard: () => void;
   renderStepInlineHeader: () => React.ReactNode;
}

export const StepClosure: React.FC<StepClosureProps> = ({
   onReturnToDashboard,
   renderStepInlineHeader
}) => {
   const [isFinishing, setIsFinishing] = React.useState(false);

   const handleFinish = async () => {
      setIsFinishing(true);
      await onReturnToDashboard();
      // Navigation happens inside onReturnToDashboard, but reset if it fails
      setIsFinishing(false);
   };

   return (
      <View style={styles.stepBase}>
         {renderStepInlineHeader()}
         <View style={styles.closureView}>
            <View style={styles.successHalo}>
               <MaterialIcons
                  name="check"
                  size={50}
                  color={colors.secondary}
               />
            </View>
            <Text style={styles.closureTitle}>Mission terminée</Text>
            <Text style={styles.closureSubtitle}>
               Toutes les étapes ont été enregistrées avec succès dans le
               journal de bord.
            </Text>
            <AppTouchableOpacity
               style={styles.largeReturnBtn}
               onPress={handleFinish}
               loading={isFinishing}
            >
               <Text style={styles.largeReturnBtnText}>
                  Retour au tableau
               </Text>
            </AppTouchableOpacity>
         </View>
      </View>
   );
};
