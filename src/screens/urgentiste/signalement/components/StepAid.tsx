import React from 'react';
import { View, Text } from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { colors } from '../../../../theme/colors';
import { styles } from '../styles';
import { AppTouchableOpacity } from '../../../../components/ui/AppTouchableOpacity';
import { FIRST_AID_ACTIONS } from '../../../../types/firstAid';

interface StepAidProps {
   careChecklist: string[];
   onToggleCare: (careId: string) => void;
   onConfirmAid: () => void;
   renderStepInlineHeader: () => React.ReactNode;
}
export const StepAid: React.FC<StepAidProps> = ({
   careChecklist,
   onToggleCare,
   onConfirmAid,
   renderStepInlineHeader
}) => {
   const CARES = FIRST_AID_ACTIONS;

   return (
      <View style={styles.stepBase}>
         {renderStepInlineHeader()}
         
         <View style={{ flex: 1, justifyContent: 'center', paddingVertical: 10 }}>
            <View style={styles.aidGrid}>
               {CARES.map((care) => {
                  const isActive = careChecklist.includes(care.id);
                  const activeColor = care.color || colors.secondary;
                  
                  return (
                     <AppTouchableOpacity
                        key={care.id}
                        style={[
                           styles.aidCardGrid,
                           isActive && {
                              borderColor: activeColor,
                              backgroundColor: activeColor + "15",
                           },
                        ]}
                        onPress={() => onToggleCare(care.id)}
                     >
                        <View
                           style={[
                              styles.aidIconWrapper,
                              isActive && { backgroundColor: activeColor },
                           ]}
                        >
                           <MaterialIcons
                              name={care.icon as any}
                              size={28}
                              color={isActive ? "#FFF" : "rgba(255,255,255,0.25)"}
                           />
                        </View>
                        <Text
                           style={[
                              styles.aidLabelGrid,
                              isActive && { color: "#FFF", fontWeight: '900' },
                           ]}
                        >
                           {care.label}
                        </Text>
                        
                        {isActive && (
                           <View style={{ ...styles.aidCheckBadge, backgroundColor: activeColor, borderColor: '#000' }}>
                              <MaterialIcons
                                 name="check"
                                 size={12}
                                 color="#FFF"
                              />
                           </View>
                        )}
                     </AppTouchableOpacity>
                  );
               })}
            </View>
         </View>

         <AppTouchableOpacity
            style={styles.bigActionBtn}
            onPress={onConfirmAid}
         >
            <Text style={styles.bigActionText}>Valider les soins</Text>
            <MaterialIcons name="arrow-forward" size={20} color="#FFF" />
         </AppTouchableOpacity>
      </View>
   );
};
