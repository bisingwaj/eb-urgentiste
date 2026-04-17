import React, { useEffect, useRef } from 'react';
import { View, Text, StyleSheet, Animated, Platform } from 'react-native';
import { MaterialCommunityIcons, MaterialIcons } from '@expo/vector-icons';
import { useNavigation, useRoute } from '@react-navigation/native';
import { AppTouchableOpacity } from '../../../components/ui/AppTouchableOpacity';
import { colors } from '../../../theme/colors';
import { useHospital } from '../../../contexts/HospitalContext';
import { useAuth } from '../../../contexts/AuthContext';

import { useSafeAreaInsets } from 'react-native-safe-area-context';

interface HospitalHeaderProps {
  title?: string;
  showBack?: boolean;
  rightComponent?: React.ReactNode;
}

export const HospitalHeader: React.FC<HospitalHeaderProps> = ({
  title,
  showBack = false,
  rightComponent,
}) => {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<any>();
  const { pendingAlertCount, hospitalCapacity } = useHospital();
  const { profile } = useAuth();
  
  const pulseAnim = useRef(new Animated.Value(1)).current;

  // Pulsing animation for the Red Dot
  useEffect(() => {
    if (pendingAlertCount > 0) {
      Animated.loop(
        Animated.sequence([
          Animated.timing(pulseAnim, {
            toValue: 1.5,
            duration: 800,
            useNativeDriver: true,
          }),
          Animated.timing(pulseAnim, {
            toValue: 1,
            duration: 800,
            useNativeDriver: true,
          }),
        ])
      ).start();
    } else {
      pulseAnim.setValue(1);
    }
  }, [pendingAlertCount, pulseAnim]);

  const getCapacityColor = () => {
    switch (hospitalCapacity) {
      case 'fluid': return '#00E676';
      case 'saturated': return '#FFB74D';
      case 'diversion': return '#FF5252';
      default: return 'rgba(255,255,255,0.2)';
    }
  };

  const displayName = profile?.linkedStructure?.name || profile?.first_name || 'Hôpital';

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <View style={styles.leftSection}>
        {showBack ? (
          <AppTouchableOpacity 
            style={styles.backBtn} 
            onPress={() => navigation.navigate('HospitalTabs')}
          >
            <MaterialIcons name="arrow-back" size={24} color="#FFF" />
            {pendingAlertCount > 0 && (
              <Animated.View 
                style={[
                  styles.alertDot, 
                  { transform: [{ scale: pulseAnim }] }
                ]} 
              />
            )}
          </AppTouchableOpacity>
        ) : (
          <View style={styles.logoBox}>
             <MaterialCommunityIcons name="shield-cross" size={24} color={colors.secondary} />
          </View>
        )}
      </View>

      <View style={styles.centerSection}>
        <Text style={styles.titleText} numberOfLines={1}>
          {title || displayName}
        </Text>
      </View>

      <View style={styles.rightSection}>
        {rightComponent ? rightComponent : (
          <View style={styles.statusRadar}>
            <View style={[styles.radarOrb, { backgroundColor: getCapacityColor() }]} />
            <Text style={styles.radarText}>{hospitalCapacity.toUpperCase()}</Text>
          </View>
        )}
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    height: Platform.OS === 'ios' ? 100 : 80,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    backgroundColor: '#0A0A0A',
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.06)',
  },
  leftSection: {
    width: 60,
    justifyContent: 'center',
  },
  backBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(255,255,255,0.05)',
    justifyContent: 'center',
    alignItems: 'center',
    position: 'relative',
  },
  alertDot: {
    position: 'absolute',
    top: 8,
    right: 8,
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: '#FF5252',
    borderWidth: 2,
    borderColor: '#0A0A0A',
  },
  logoBox: {
    width: 44,
    height: 44,
    justifyContent: 'center',
    alignItems: 'center',
  },
  centerSection: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 8,
  },
  titleText: {
    color: '#FFF',
    fontSize: 18,
    fontWeight: '900',
    letterSpacing: 0.5,
    textAlign: 'center',
  },
  rightSection: {
    width: 60,
    alignItems: 'flex-end',
    justifyContent: 'center',
  },
  statusRadar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: 'rgba(255,255,255,0.03)',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
  },
  radarOrb: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  radarText: {
    color: 'rgba(255,255,255,0.4)',
    fontSize: 8,
    fontWeight: '900',
    letterSpacing: 0.5,
  },
});
