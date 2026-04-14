import React from 'react';
import { View, Text, ScrollView } from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { colors } from '../../../../theme/colors';
import { styles } from '../styles';
import { AppTouchableOpacity } from '../../../../components/ui/AppTouchableOpacity';

interface StepAssessmentProps {
   assessment: any;
   setAssessment: (a: any) => void;
   renderStepInlineHeader: () => React.ReactNode;
   onConfirmAssessment: () => void;
}

export const StepAssessment: React.FC<StepAssessmentProps> = ({
   assessment,
   setAssessment,
   renderStepInlineHeader,
   onConfirmAssessment
}) => {
   return (
      <View style={styles.stepBase}>
         {renderStepInlineHeader()}
         <Text style={styles.stepSectionHeading}>Évaluation initiale</Text>
         <ScrollView
            style={{ flex: 1 }}
            showsVerticalScrollIndicator={false}
         >
            <View style={styles.assessmentMainCard}>
               <View style={styles.assessmentRow}>
                  <View style={styles.assessmentIconBox}>
                     <MaterialIcons
                        name="psychology"
                        size={24}
                        color={colors.secondary}
                     />
                  </View>
                  <View style={{ flex: 1 }}>
                     <Text style={styles.assessmentRowTitle}>Conscience</Text>
                     <Text style={styles.assessmentRowSub}>
                        {assessment.conscious === false
                           ? "Inconscient"
                           : assessment.conscious === true
                              ? "Conscient"
                              : "À évaluer"}
                     </Text>
                  </View>
                  <View style={styles.miniToggleGroup}>
                     <AppTouchableOpacity
                        style={[
                           styles.miniToggle,
                           assessment.conscious === true &&
                           styles.miniToggleActive,
                        ]}
                        onPress={() =>
                           setAssessment({ ...assessment, conscious: true })
                        }
                     >
                        <Text
                           style={[
                              styles.miniToggleText,
                              assessment.conscious === true &&
                              styles.miniToggleTextActive,
                           ]}
                        >
                           Oui
                        </Text>
                     </AppTouchableOpacity>
                     <AppTouchableOpacity
                        style={[
                           styles.miniToggle,
                           assessment.conscious === false &&
                           styles.miniToggleCrit,
                        ]}
                        onPress={() =>
                           setAssessment({ ...assessment, conscious: false })
                        }
                     >
                        <Text
                           style={[
                              styles.miniToggleText,
                              assessment.conscious === false &&
                              styles.miniToggleTextCrit,
                           ]}
                        >
                           Non
                        </Text>
                     </AppTouchableOpacity>
                  </View>
               </View>
               <View style={styles.divider} />
               <View style={styles.assessmentRow}>
                  <View style={styles.assessmentIconBox}>
                     <MaterialIcons
                        name="air"
                        size={24}
                        color={colors.secondary}
                     />
                  </View>
                  <View style={{ flex: 1 }}>
                     <Text style={styles.assessmentRowTitle}>Respiration</Text>
                     <Text style={styles.assessmentRowSub}>
                        {assessment.breathing === false
                           ? "Absente"
                           : assessment.breathing === true
                              ? "Présente"
                              : "À évaluer"}
                     </Text>
                  </View>
                  <View style={styles.miniToggleGroup}>
                     <AppTouchableOpacity
                        style={[
                           styles.miniToggle,
                           assessment.breathing === true &&
                           styles.miniToggleActive,
                        ]}
                        onPress={() =>
                           setAssessment({ ...assessment, breathing: true })
                        }
                     >
                        <Text
                           style={[
                              styles.miniToggleText,
                              assessment.breathing === true &&
                              styles.miniToggleTextActive,
                           ]}
                        >
                           Oui
                        </Text>
                     </AppTouchableOpacity>
                     <AppTouchableOpacity
                        style={[
                           styles.miniToggle,
                           assessment.breathing === false &&
                           styles.miniToggleCrit,
                        ]}
                        onPress={() =>
                           setAssessment({ ...assessment, breathing: false })
                        }
                     >
                        <Text
                           style={[
                              styles.miniToggleText,
                              assessment.breathing === false &&
                              styles.miniToggleTextCrit,
                           ]}
                        >
                           Non
                        </Text>
                     </AppTouchableOpacity>
                  </View>
               </View>
            </View>
            <Text style={styles.sectionHeader}>Niveau de gravité</Text>
            <View style={styles.severityGrid}>
               {[
                  { id: "Critique", color: colors.primary, icon: "warning" },
                  { id: "Urgent", color: "#FF9800", icon: "error-outline" },
                  {
                     id: "Stable",
                     color: colors.success,
                     icon: "check-circle-outline",
                  },
               ].map((s) => (
                  <AppTouchableOpacity
                     key={s.id}
                     style={[
                        styles.severityItem,
                        assessment.severity === s.id && {
                           backgroundColor: s.color + "15",
                           borderColor: s.color,
                        },
                     ]}
                     onPress={() =>
                        setAssessment({ ...assessment, severity: s.id })
                     }
                  >
                     <MaterialIcons
                        name={s.icon as any}
                        size={28}
                        color={
                           assessment.severity === s.id
                              ? s.color
                              : "rgba(255,255,255,0.2)"
                        }
                     />
                     <Text
                        style={[
                           styles.severityItemText,
                           assessment.severity === s.id && { color: s.color },
                        ]}
                     >
                        {s.id}
                     </Text>
                  </AppTouchableOpacity>
               ))}
            </View>
            {assessment.conscious === false && (
               <View style={styles.smartAlertBox}>
                  <MaterialIcons name="info" size={20} color="#FFF" />
                  <Text style={styles.smartAlertBoxText}>
                     Conseil : Commencer RCR & appel renfort
                  </Text>
               </View>
            )}
         </ScrollView>
         <AppTouchableOpacity
            style={[
               styles.bigActionBtn,
               (assessment.conscious === null || !assessment.severity) && {
                  opacity: 0.5,
               },
            ]}
            disabled={assessment.conscious === null || !assessment.severity}
            onPress={onConfirmAssessment}
         >
            <MaterialIcons name="done-all" size={24} color="#FFF" />
            <Text style={styles.bigActionText}>Valider l'évaluation</Text>
         </AppTouchableOpacity>
      </View>
   );
};
