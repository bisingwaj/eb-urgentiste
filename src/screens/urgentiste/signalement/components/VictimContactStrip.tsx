import React from 'react';
import { View, Text, ActivityIndicator } from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { colors } from '../../../../theme/colors';
import { styles } from '../styles';
import { AppTouchableOpacity } from '../../../../components/ui/AppTouchableOpacity';
import { canOfferVictimContactCalls } from '../../../../lib/missionVictimCall';

interface VictimContactStripProps {
   selectedMission: any;
   voipLoading: boolean;
   onCallPstn: () => void;
   onCallVoip: () => void;
}

export const VictimContactStrip: React.FC<VictimContactStripProps> = ({
   selectedMission,
   voipLoading,
   onCallPstn,
   onCallVoip
}) => {
   if (!selectedMission || !canOfferVictimContactCalls(selectedMission.dispatch_status)) {
      return null;
   }
   const hasPhone = !!(selectedMission.caller?.phone && selectedMission.caller.phone !== "-");
   const hasCitizen = !!selectedMission.citizen_id;

   return (
      <View style={styles.victimContactStrip}>
         <Text style={styles.victimContactStripTitle}>Contacter la victime (avant arrivée sur place)</Text>
         <View style={styles.victimContactRow}>
            <AppTouchableOpacity
               style={[styles.victimContactChip, !hasPhone && styles.victimContactChipDisabled]}
               onPress={onCallPstn}
            >
               <MaterialIcons
                  name="phone"
                  size={20}
                  color={hasPhone ? "#30D158" : "rgba(255,255,255,0.25)"}
               />
               <Text
                  style={[
                     styles.victimContactChipText,
                     !hasPhone && styles.victimContactChipTextDisabled,
                  ]}
               >
                  Téléphone
               </Text>
            </AppTouchableOpacity>
            <AppTouchableOpacity
               style={[
                  styles.victimContactChip,
                  (!hasCitizen || voipLoading) && styles.victimContactChipDisabled,
               ]}
               onPress={onCallVoip}
               disabled={voipLoading || !hasCitizen}
            >
               {voipLoading ? (
                  <ActivityIndicator color={colors.secondary} size="small" />
               ) : (
                  <>
                     <MaterialIcons name="phone-in-talk" size={20} color={colors.secondary} />
                     <Text style={styles.victimContactChipText}>App audio</Text>
                  </>
               )}
            </AppTouchableOpacity>
         </View>
         {!hasCitizen && (
            <Text style={styles.victimContactHint}>
               App in-app : identifiant citoyen absent (vérifiez incidents.citizen_id en base).
            </Text>
         )}
         {!hasPhone && hasCitizen && (
            <Text style={styles.victimContactHint}>Pas de numéro de téléphone sur la fiche.</Text>
         )}
      </View>
   );
};
