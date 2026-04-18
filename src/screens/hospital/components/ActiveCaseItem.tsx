import React from 'react';
import { View, Text, StyleSheet, Platform } from 'react-native';
import { MaterialIcons, MaterialCommunityIcons } from '@expo/vector-icons';
import { AppTouchableOpacity } from '../../../components/ui/AppTouchableOpacity';
import { colors } from '../../../theme/colors';
import type { EmergencyCase } from '../HospitalDashboardTab';
import { getLevelConfig, getStatusConfig } from '../HospitalDashboardTab';

interface ActiveCaseItemProps {
  caseItem: EmergencyCase;
  onPress: (id: string) => void;
  mode: 'en_route' | 'admissions';
  displayTime?: string;
}

export const ActiveCaseItem: React.FC<ActiveCaseItemProps> = ({
  caseItem,
  onPress,
  mode,
  displayTime,
}) => {
  const lCfg = getLevelConfig(caseItem.level);
  const sCfg = getStatusConfig(caseItem.status);

  return (
    <AppTouchableOpacity
      style={styles.container}
      onPress={() => onPress(caseItem.id)}
      activeOpacity={0.8}
    >
      <View style={[styles.urgencyBar, { backgroundColor: lCfg?.color }]} />

      <View style={styles.mainContent}>
        <View style={styles.topRow}>
          <Text style={styles.patientName} numberOfLines={1}>
            {caseItem.victimName}
          </Text>
          <View style={[styles.statusBadge, { backgroundColor: sCfg?.bg }]}>
             <MaterialIcons name={sCfg?.icon} size={12} color={sCfg?.color} />
             <Text style={[styles.statusLabel, { color: sCfg?.color }]}>
                {sCfg?.label?.toUpperCase()}
             </Text>
          </View>
        </View>

        <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 4 }}>
          <MaterialIcons name="schedule" size={12} color="rgba(255,255,255,0.4)" />
          <Text style={{ color: 'rgba(255,255,255,0.4)', fontSize: 11, fontWeight: '600', marginLeft: 4 }}>
            {displayTime || caseItem.timestamp}
          </Text>
        </View>

        <View style={styles.bottomRow}>
          <View style={styles.infoCol}>
            <View style={styles.urgencyTag}>
               <Text style={[styles.urgencyText, { color: lCfg?.color }]}>
                  {lCfg?.emoji} {caseItem.typeUrgence}
               </Text>
            </View>
            <Text style={styles.subText} numberOfLines={1}>
              {caseItem.description}
            </Text>
          </View>

          <View style={styles.tacticalInfo}>
            {mode === 'en_route' ? (
              <View style={styles.metaBox}>
                <MaterialCommunityIcons name="clock-fast" size={16} color={colors.secondary} />
                <Text style={styles.metaValue}>{caseItem.eta || '—'}</Text>
              </View>
            ) : (
              <View style={styles.serviceBox}>
                <MaterialIcons name="local-hospital" size={14} color="rgba(255,255,255,0.4)" />
                <Text style={styles.serviceText}>
                  {caseItem.admissionService?.toUpperCase() || 'URGENCES'}
                </Text>
              </View>
            )}
          </View>
        </View>
      </View>
      
      <View style={styles.chevronWrap}>
        <MaterialIcons name="chevron-right" size={20} color="rgba(255,255,255,0.2)" />
      </View>
    </AppTouchableOpacity>
  );
};

const styles = StyleSheet.create({
  container: {
    backgroundColor: '#1A1A1A',
    marginHorizontal: 16,
    marginBottom: 12,
    borderRadius: 22,
    flexDirection: 'row',
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.05)',
  },
  urgencyBar: {
    width: 6,
    height: '100%',
  },
  mainContent: {
    flex: 1,
    padding: 20,
    paddingRight: 10,
  },
  topRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  patientName: {
    color: '#FFF',
    fontSize: 20,
    fontWeight: '800',
    flex: 1,
    marginRight: 10,
  },
  statusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
  },
  statusLabel: {
    fontSize: 9,
    fontWeight: '900',
    letterSpacing: 0.5,
  },
  bottomRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
  },
  infoCol: {
    flex: 1,
    marginRight: 12,
  },
  urgencyTag: {
    marginBottom: 4,
  },
  urgencyText: {
    fontSize: 12,
    fontWeight: '700',
  },
  subText: {
    color: 'rgba(255,255,255,0.3)',
    fontSize: 12,
    fontWeight: '500',
  },
  tacticalInfo: {
    alignItems: 'flex-end',
  },
  metaBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: 'rgba(255,255,255,0.03)',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.05)',
  },
  metaValue: {
    color: colors.secondary,
    fontSize: 15,
    fontWeight: '900',
  },
  serviceBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: 'rgba(255,255,255,0.05)',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
  },
  serviceText: {
    color: 'rgba(255,255,255,0.5)',
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  chevronWrap: {
    width: 32,
    justifyContent: 'center',
    alignItems: 'center',
  },
});
