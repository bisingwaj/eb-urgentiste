import React from 'react';
import { View, Text, ActivityIndicator, StyleSheet } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { colors } from '../../../../theme/colors';
import { styles as baseStyles } from '../styles';
import { AppTouchableOpacity } from '../../../../components/ui/AppTouchableOpacity';

interface StepWaitingProps {
   selectedMission: any;
   onCancel?: () => void;
   renderStepInlineHeader: () => React.ReactNode;
}

export const StepWaiting: React.FC<StepWaitingProps> = ({
   selectedMission,
   onCancel,
   renderStepInlineHeader
}) => {
   return (
      <View style={baseStyles.stepBase}>
         {renderStepInlineHeader()}
         
         <View style={localStyles.content}>
            <View style={localStyles.iconContainer}>
               <View style={localStyles.pulseRing}>
                  <ActivityIndicator size="large" color={colors.secondary} />
               </View>
               <MaterialCommunityIcons 
                  name="hospital-building" 
                  size={48} 
                  color={colors.secondary} 
                  style={localStyles.hospitalIcon}
               />
            </View>

            <Text style={localStyles.title}>Remise du patient</Text>
            <Text style={localStyles.subtitle}>
               Vous êtes arrivé à l'établissement. Veuillez patienter pendant que l'équipe médicale valide l'admission du patient.
            </Text>

            <View style={localStyles.infoCard}>
               <MaterialCommunityIcons name="information-outline" size={20} color="rgba(255,255,255,0.6)" />
               <Text style={localStyles.infoText}>
                  Cette étape confirme que le patient a été pris en charge physiquement par l'hôpital.
               </Text>
            </View>

            <View style={{ flex: 1 }} />

            <View style={localStyles.footer}>
               <Text style={localStyles.waitingText}>En attente de confirmation hôpital...</Text>
               <ActivityIndicator size="small" color="rgba(255,255,255,0.3)" style={{ marginTop: 8 }} />
            </View>
         </View>
      </View>
   );
};

const localStyles = StyleSheet.create({
   content: {
      flex: 1,
      alignItems: 'center',
      paddingHorizontal: 24,
      paddingTop: 40,
   },
   iconContainer: {
      width: 120,
      height: 120,
      justifyContent: 'center',
      alignItems: 'center',
      marginBottom: 32,
   },
   pulseRing: {
      position: 'absolute',
      width: 100,
      height: 100,
      borderRadius: 50,
      borderWidth: 2,
      borderColor: 'rgba(48, 209, 88, 0.2)',
      justifyContent: 'center',
      alignItems: 'center',
   },
   hospitalIcon: {
      backgroundColor: '#1A1A1A',
      padding: 10,
      borderRadius: 20,
   },
   title: {
      color: '#FFF',
      fontSize: 24,
      fontWeight: '900',
      textAlign: 'center',
      marginBottom: 12,
   },
   subtitle: {
      color: 'rgba(255,255,255,0.6)',
      fontSize: 16,
      textAlign: 'center',
      lineHeight: 24,
      marginBottom: 40,
   },
   infoCard: {
      flexDirection: 'row',
      backgroundColor: 'rgba(255,255,255,0.05)',
      padding: 16,
      borderRadius: 16,
      alignItems: 'center',
      gap: 12,
   },
   infoText: {
      color: 'rgba(255,255,255,0.5)',
      fontSize: 13,
      flex: 1,
   },
   footer: {
      width: '100%',
      alignItems: 'center',
      paddingBottom: 40,
   },
   waitingText: {
      color: 'rgba(255,255,255,0.3)',
      fontSize: 14,
      fontWeight: '600',
      fontStyle: 'italic',
   }
});
