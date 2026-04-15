import React from 'react';
import { View, Text, StyleSheet, ActivityIndicator } from 'react-native';
import { AppTouchableOpacity } from '../../../components/ui/AppTouchableOpacity';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { colors } from '../../../theme/colors';
import { useHospital, HospitalCapacityStatus } from '../../../contexts/HospitalContext';

interface StatusOption {
  id: HospitalCapacityStatus;
  label: string;
  icon: keyof typeof MaterialCommunityIcons.glyphMap;
  color: string;
  bgColor: string;
}

const STATUS_OPTIONS: StatusOption[] = [
  {
    id: 'fluid',
    label: 'FLUIDE',
    icon: 'check-circle-outline',
    color: '#00E676',
    bgColor: 'rgba(0, 230, 118, 0.12)',
  },
  {
    id: 'saturated',
    label: 'SATURÉ',
    icon: 'clock-alert-outline',
    color: '#FFB74D',
    bgColor: 'rgba(255, 183, 77, 0.12)',
  },
  {
    id: 'diversion',
    label: 'DÉROUTAGE',
    icon: 'alert-octagon-outline',
    color: '#FF5252',
    bgColor: 'rgba(255, 82, 82, 0.12)',
  },
];

export function CapacitySelector() {
  const { hospitalCapacity, updateHospitalCapacity, isUpdatingCapacity } = useHospital();

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>STATUT CAPACITÉ HÔPITAL</Text>
        {isUpdatingCapacity && <ActivityIndicator size="small" color={colors.secondary} />}
      </View>
      <View style={styles.optionsGrid}>
        {STATUS_OPTIONS.map((option) => {
          const isActive = hospitalCapacity === option.id;
          return (
            <AppTouchableOpacity
              key={option.id}
              style={[
                styles.optionBtn,
                isActive && { borderColor: option.color, backgroundColor: option.bgColor }
              ]}
              onPress={() => updateHospitalCapacity(option.id)}
              disabled={isUpdatingCapacity}
            >
              <MaterialCommunityIcons
                name={option.icon}
                size={20}
                color={isActive ? option.color : 'rgba(255,255,255,0.2)'}
              />
              <Text style={[
                styles.optionLabel,
                isActive ? { color: option.color } : { color: 'rgba(255,255,255,0.2)' }
              ]}>
                {option.label}
              </Text>
            </AppTouchableOpacity>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    marginTop: 20,
    paddingHorizontal: 4,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  headerTitle: {
    color: 'rgba(255,255,255,0.4)',
    fontSize: 11,
    fontWeight: '900',
    letterSpacing: 1.5,
  },
  optionsGrid: {
    flexDirection: 'row',
    gap: 10,
  },
  optionBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    height: 48,
    borderRadius: 16,
    backgroundColor: 'rgba(255,255,255,0.03)',
    borderWidth: 1,
    borderColor: 'transparent',
  },
  optionLabel: {
    fontSize: 11,
    fontWeight: '900',
    letterSpacing: 0.5,
  },
});
