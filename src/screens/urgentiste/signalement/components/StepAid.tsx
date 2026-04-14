import React from 'react';
import { View, Text, ScrollView } from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { colors } from '../../../../theme/colors';
import { styles } from '../styles';
import { AppTouchableOpacity } from '../../../../components/ui/AppTouchableOpacity';

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
   const CARES = [
      { id: "Hémorragie", label: "Contrôler hémorragie", icon: "opacity" },
      { id: "Oxygène", label: "Soutien Oxygène", icon: "air" },
      { id: "Immobilisation", label: "Immobilisation", icon: "accessibility" },
      { id: "RCR", label: "RCR / Défib", icon: "bolt" },
      { id: "Perfusion", label: "IV Access", icon: "colorize" },
      { id: "Monitor", label: "Monitoring ECG", icon: "favorite" },
   ];

   return (
      <View style={styles.stepBase}>
         {renderStepInlineHeader()}
         <Text style={styles.stepSectionHeading}>Premiers soins</Text>
         <ScrollView
            style={{ flex: 1 }}
            showsVerticalScrollIndicator={false}
         >
            <View style={styles.aidGrid}>
               {CARES.map((care) => {
                  const isActive = careChecklist.includes(care.id);
                  return (
                     <AppTouchableOpacity
                        key={care.id}
                        style={[
                           styles.aidCardGrid,
                           isActive && {
                              borderColor: colors.secondary,
                              backgroundColor: colors.secondary + "15",
                           },
                        ]}
                        onPress={() => onToggleCare(care.id)}
                     >
                        <View
                           style={[
                              styles.aidIconWrapper,
                              isActive && { backgroundColor: colors.secondary },
                           ]}
                        >
                           <MaterialIcons
                              name={care.icon as any}
                              size={22}
                              color={isActive ? "#000" : "rgba(255,255,255,0.4)"}
                           />
                        </View>
                        <Text
                           style={[
                              styles.aidLabelGrid,
                              isActive && { color: "#FFF" },
                           ]}
                        >
                           {care.label}
                        </Text>
                        {isActive && (
                           <View style={styles.aidCheckBadge}>
                              <MaterialIcons
                                 name="check"
                                 size={12}
                                 color="#000"
                              />
                           </View>
                        )}
                     </AppTouchableOpacity>
                  );
               })}
            </View>
         </ScrollView>
         <AppTouchableOpacity
            style={styles.bigActionBtn}
            onPress={onConfirmAid}
         >
            <Text style={styles.bigActionText}>Valider les soins</Text>
         </AppTouchableOpacity>
      </View>
   );
};
