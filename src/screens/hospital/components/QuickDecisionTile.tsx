import React, { useRef, useEffect } from 'react';
import { View, Text, StyleSheet, Animated, Dimensions } from 'react-native';
import { AppTouchableOpacity } from '../../../components/ui/AppTouchableOpacity';
import { MaterialCommunityIcons, MaterialIcons } from '@expo/vector-icons';
import { colors } from '../../../theme/colors';
import type { EmergencyCase } from '../HospitalDashboardTab';
import { getLevelConfig } from '../HospitalDashboardTab';

const { width } = Dimensions.get('window');
const TILE_WIDTH = width * 0.85;

interface QuickDecisionTileProps {
  caseItem: EmergencyCase;
  onAccept: (id: string) => void;
  onRefuse: (id: string) => void;
}

export function QuickDecisionTile({ caseItem, onAccept, onRefuse }: QuickDecisionTileProps) {
  const lCfg = getLevelConfig(caseItem.level);
  const pulseAnim = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    if (caseItem.level === 'critique') {
      Animated.loop(
        Animated.sequence([
          Animated.timing(pulseAnim, {
            toValue: 1.05,
            duration: 1000,
            useNativeDriver: true,
          }),
          Animated.timing(pulseAnim, {
            toValue: 1,
            duration: 1000,
            useNativeDriver: true,
          }),
        ])
      ).start();
    } else {
      pulseAnim.setValue(1);
    }
  }, [caseItem.level]);

  return (
    <Animated.View 
      style={[
        styles.tile, 
        { transform: [{ scale: pulseAnim }] },
        caseItem.level === 'critique' && styles.criticalBorder
      ]}
    >
      <View style={styles.header}>
        <View style={[styles.levelBadge, { backgroundColor: lCfg?.bg }]}>
          <Text style={[styles.levelText, { color: lCfg?.color }]}>{lCfg?.label}</Text>
        </View>
        <View style={styles.timeInfo}>
          <MaterialCommunityIcons name="clock-outline" size={14} color="rgba(255,255,255,0.4)" />
          <Text style={styles.timeText}>{caseItem.timestamp}</Text>
        </View>
      </View>

      <View style={styles.mainContent}>
        <View style={styles.victimInfo}>
          <Text style={styles.victimName} numberOfLines={1}>{caseItem.victimName}</Text>
          <Text style={styles.urgencyType}>{caseItem.typeUrgence.toUpperCase()}</Text>
        </View>
        
        <View style={styles.etaBox}>
          <Text style={styles.etaLabel}>ARRIVÉE</Text>
          <Text style={styles.etaValue}>{caseItem.eta}</Text>
        </View>
      </View>

      <View style={styles.divider} />

      <View style={styles.actionRow}>
        <AppTouchableOpacity 
          style={styles.refuseBtn} 
          onPress={() => onRefuse(caseItem.id)}
          activeOpacity={0.7}
        >
          <Text style={styles.refuseBtnText}>REFUSER</Text>
        </AppTouchableOpacity>
        
        <AppTouchableOpacity 
          style={styles.acceptBtn} 
          onPress={() => onAccept(caseItem.id)}
          activeOpacity={0.7}
        >
          <MaterialIcons name="check-circle" size={18} color="#FFF" />
          <Text style={styles.acceptBtnText}>ACCEPTER</Text>
        </AppTouchableOpacity>
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  tile: {
    width: TILE_WIDTH,
    backgroundColor: '#1E1E1E',
    borderRadius: 28,
    padding: 20,
    marginRight: 16,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.3,
    shadowRadius: 15,
    elevation: 8,
  },
  criticalBorder: {
    borderColor: 'rgba(255, 82, 82, 0.4)',
    backgroundColor: '#251515',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  levelBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 10,
  },
  levelText: {
    fontSize: 10,
    fontWeight: '900',
    letterSpacing: 1,
  },
  timeInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  timeText: {
    color: 'rgba(255,255,255,0.4)',
    fontSize: 12,
    fontWeight: '700',
  },
  mainContent: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 20,
  },
  victimInfo: {
    flex: 1,
    paddingRight: 10,
  },
  victimName: {
    color: '#FFF',
    fontSize: 20,
    fontWeight: '900',
    marginBottom: 2,
  },
  urgencyType: {
    color: colors.secondary,
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  etaBox: {
    alignItems: 'flex-end',
    backgroundColor: 'rgba(255,255,255,0.04)',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.05)',
  },
  etaLabel: {
    color: 'rgba(255,255,255,0.3)',
    fontSize: 9,
    fontWeight: '900',
    letterSpacing: 1,
    marginBottom: 2,
  },
  etaValue: {
    color: colors.success,
    fontSize: 18,
    fontWeight: '900',
  },
  divider: {
    height: 1,
    backgroundColor: 'rgba(255,255,255,0.06)',
    marginBottom: 16,
  },
  actionRow: {
    flexDirection: 'row',
    gap: 12,
  },
  refuseBtn: {
    flex: 1,
    height: 48,
    borderRadius: 16,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
  },
  refuseBtnText: {
    color: 'rgba(255,255,255,0.5)',
    fontSize: 12,
    fontWeight: '900',
    letterSpacing: 1,
  },
  acceptBtn: {
    flex: 1.5,
    height: 48,
    borderRadius: 16,
    backgroundColor: colors.success,
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 8,
    shadowColor: colors.success,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 4,
  },
  acceptBtnText: {
    color: '#FFF',
    fontSize: 13,
    fontWeight: '900',
    letterSpacing: 1,
  },
});
