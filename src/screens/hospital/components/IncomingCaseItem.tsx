import React from 'react';
import { View, Text, StyleSheet, Platform } from 'react-native';
import { MaterialIcons, MaterialCommunityIcons } from '@expo/vector-icons';
import { AppTouchableOpacity } from '../../../components/ui/AppTouchableOpacity';
import { colors } from '../../../theme/colors';
import { EmergencyCase } from '../hospitalTypes';
import { getLevelConfig } from '../hospitalUtils';
import { ALARM_STOP_EVENT } from '../../../services/AlarmService';
import { DeviceEventEmitter } from 'react-native';

interface IncomingCaseItemProps {
  caseItem: EmergencyCase;
  onAccept: (id: string) => void;
  onRefuse: (id: string) => void;
  onPress: (id: string) => void;
  displayTime?: string;
}

export const IncomingCaseItem: React.FC<IncomingCaseItemProps> = ({
  caseItem,
  onAccept,
  onRefuse,
  onPress,
  displayTime,
}) => {
  const lCfg = getLevelConfig(caseItem.level);

  const handlePress = () => {
    DeviceEventEmitter.emit(ALARM_STOP_EVENT);
    onPress(caseItem.id);
  };

  const handleAccept = () => {
    DeviceEventEmitter.emit(ALARM_STOP_EVENT);
    onAccept(caseItem.id);
  };

  const handleRefuse = () => {
    DeviceEventEmitter.emit(ALARM_STOP_EVENT);
    onRefuse(caseItem.id);
  };

  return (
    <AppTouchableOpacity
      style={styles.container}
      onPress={handlePress}
      activeOpacity={0.8}
    >
      <View style={[styles.urgencyBar, { backgroundColor: lCfg?.color }]} />

      <View style={styles.contentRow}>
        <View style={styles.infoSection}>
          <Text style={[styles.gravityLabel, { color: lCfg?.color }]}>
            {lCfg?.emoji} {lCfg?.label?.toUpperCase()}
          </Text>
          <Text style={styles.urgencyType} numberOfLines={1}>
            {caseItem.typeUrgence}
          </Text>
          <Text style={styles.victimName} numberOfLines={1}>
            {caseItem.victimName}
          </Text>
          <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 4 }}>
            <MaterialIcons name="schedule" size={10} color="rgba(255,255,255,0.3)" />
            <Text style={{ color: 'rgba(255,255,255,0.3)', fontSize: 10, fontWeight: '500', marginLeft: 4 }}>
              {displayTime || caseItem.timestamp}
            </Text>
          </View>
        </View>

        <View style={styles.tacticalSection}>
          <View style={styles.tacticalRow}>
             <View style={styles.metaBadge}>
                <MaterialCommunityIcons name="clock-fast" size={14} color={colors.secondary} />
                <Text style={styles.metaText}>{caseItem.eta || '—'}</Text>
             </View>
             {caseItem.distance && (
               <View style={styles.metaBadge}>
                  <MaterialIcons name="navigation" size={14} color="#90CAF9" />
                  <Text style={styles.metaText}>{caseItem.distance}</Text>
               </View>
             )}
          </View>

          <View style={styles.actionRow}>
            <AppTouchableOpacity
              style={styles.refuseBtn}
              onPress={handleRefuse}
            >
              <Text style={styles.refuseBtnText}>REFUSER</Text>
            </AppTouchableOpacity>
            <AppTouchableOpacity
              style={styles.acceptBtn}
              onPress={handleAccept}
            >
              <Text style={styles.acceptBtnText}>ACCEPTER</Text>
            </AppTouchableOpacity>
          </View>
        </View>
      </View>
    </AppTouchableOpacity>
  );
};

const styles = StyleSheet.create({
  container: {
    backgroundColor: '#1A1A1A',
    marginHorizontal: 16,
    marginBottom: 12,
    borderRadius: 20,
    flexDirection: 'row',
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.05)',
    height: 100,
  },
  urgencyBar: {
    width: 6,
    height: '100%',
  },
  contentRow: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    paddingLeft: 16,
    paddingRight: 12,
  },
  infoSection: {
    flex: 1,
    justifyContent: 'center',
  },
  gravityLabel: {
    fontSize: 10,
    fontWeight: "900",
    letterSpacing: 1,
    marginBottom: 2,
  },
  urgencyType: {
    color: "#FFF",
    fontSize: 15,
    fontWeight: "800",
    marginBottom: 2,
  },
  victimName: {
    color: "rgba(255,255,255,0.4)",
    fontSize: 12,
    fontWeight: "600",
  },
  tacticalSection: {
    alignItems: "flex-end",
    gap: 8,
  },
  tacticalRow: {
    flexDirection: "row",
    gap: 8,
  },
  metaBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: "rgba(255,255,255,0.05)",
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.05)",
  },
  metaText: {
    color: "rgba(255,255,255,0.7)",
    fontSize: 11,
    fontWeight: "800",
  },
  actionRow: {
    flexDirection: "row",
    gap: 8,
  },
  refuseBtn: {
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "rgba(255, 82, 82, 0.2)",
    justifyContent: "center",
    alignItems: "center",
  },
  refuseBtnText: {
    color: "#FF5252",
    fontSize: 9,
    fontWeight: "900",
  },
  acceptBtn: {
    backgroundColor: colors.secondary,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 12,
    justifyContent: "center",
    alignItems: "center",
    minWidth: 80,
    ...Platform.select({
      ios: {
        shadowColor: colors.secondary,
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.3,
        shadowRadius: 8,
      },
    }),
  },
  acceptBtnText: {
    color: "#FFF",
    fontSize: 10,
    fontWeight: "900",
    letterSpacing: 0.5,
  },
});
