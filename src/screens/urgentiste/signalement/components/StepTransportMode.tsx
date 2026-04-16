import React from 'react';
import { View, Text } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { styles } from '../styles';
import { AppTouchableOpacity } from '../../../../components/ui/AppTouchableOpacity';
import { TRANSPORT_MODE_OPTIONS, transportModeAccentColor } from '../../../../lib/transportMode';

interface StepTransportModeProps {
   transportMode: string | null;
   onSelectTransportMode: (mode: any) => void;
   renderStepInlineHeader: () => React.ReactNode;
}

export const StepTransportMode: React.FC<StepTransportModeProps> = ({
   transportMode,
   onSelectTransportMode,
   renderStepInlineHeader
}) => {
   return (
      <View style={styles.stepBase}>
         {renderStepInlineHeader()}
         <Text style={styles.stepSectionHeading}>Mode de transport</Text>
         <View style={styles.aidGrid}>
            {TRANSPORT_MODE_OPTIONS.map((opt) => {
               const accent = transportModeAccentColor(opt.accent);
               return (
                  <AppTouchableOpacity
                     key={opt.key}
                     style={[
                        styles.aidCardGrid,
                        opt.emphasizeBorder && { borderColor: "rgba(255,59,48,0.4)" }, // colors.primary hardcoded or import colors
                     ]}
                     onPress={() => onSelectTransportMode(opt.key)}
                  >
                     <View
                        style={[
                           styles.aidIconWrapper,
                           { backgroundColor: accent + "10" },
                        ]}
                     >
                        <MaterialCommunityIcons
                           name={opt.icon as any}
                           size={22}
                           color={accent}
                        />
                     </View>
                     <Text
                        style={[
                           styles.aidLabelGrid,
                           opt.accent === "primary" && { color: "#FF3B30" }, // colors.primary
                        ]}
                     >
                        {opt.label}
                     </Text>
                  </AppTouchableOpacity>
               );
            })}
         </View>
      </View>
   );
};
