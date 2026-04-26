import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { AppTouchableOpacity } from '../../../components/ui/AppTouchableOpacity';
import { colors } from '../../../theme/colors';
import { spacing } from '../../../theme/spacing';

interface LiveMapLegendHUDProps {
  legendExpanded: boolean;
  setLegendExpanded: React.Dispatch<React.SetStateAction<boolean>>;
  setTelemetryExpanded: (val: boolean) => void;
  hideCard?: () => void;
  rescuersCount: number;
  rescuerTruncLegend: boolean;
  hospitalsCount: number;
  hospTruncLegend: boolean;
  incidentsCount: number;
  incTruncLegend: boolean;
}

export function LiveMapLegendHUD({
  legendExpanded,
  setLegendExpanded,
  setTelemetryExpanded,
  hideCard,
  rescuersCount,
  rescuerTruncLegend,
  hospitalsCount,
  hospTruncLegend,
  incidentsCount,
  incTruncLegend
}: LiveMapLegendHUDProps) {
  return (
    <>
      {legendExpanded && (
        <View style={[styles.hudExpandedRight, { bottom: spacing.sm + 44 }]}>
          <View style={styles.hudExpandedCard}>
            {[
              { color: colors.secondary, label: "Votre position" },
              { color: colors.success, label: `Unités (${rescuersCount}${rescuerTruncLegend ? "+" : ""})` },
              { color: "#2E7D32", label: `Établ. (${hospitalsCount}${hospTruncLegend ? "+" : ""})` },
              { color: "#FF453A", label: `Signal. (${incidentsCount}${incTruncLegend ? "+" : ""})` },
            ].map((item, i) => (
              <View key={i} style={[styles.legendRow, i === 3 && { marginBottom: 0 }]}>
                <View style={[styles.legendDot, { backgroundColor: item.color }]} />
                <Text style={styles.legendText} numberOfLines={1}>{item.label}</Text>
              </View>
            ))}
          </View>
        </View>
      )}
      <View style={[styles.legendHUD, { bottom: spacing.sm }]}>
        <AppTouchableOpacity
          style={styles.hudPill}
          onPress={() => { setLegendExpanded((v) => !v); setTelemetryExpanded(false); hideCard?.(); }}
          activeOpacity={0.85}
        >
          <MaterialIcons name="layers" color={colors.secondary} size={16} />
          <Text style={styles.hudPillValue}>Légende</Text>
          <MaterialIcons name={legendExpanded ? "expand-more" : "expand-less"} color="rgba(255,255,255,0.5)" size={18} />
        </AppTouchableOpacity>
      </View>
    </>
  );
}

const styles = StyleSheet.create({
  hudExpandedRight: {
    position: 'absolute',
    right: spacing.md,
    zIndex: 100,
  },
  legendHUD: {
    position: 'absolute',
    right: spacing.md,
    zIndex: 100,
  },
  hudPill: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(25,25,25,0.95)',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
  },
  hudPillValue: {
    color: '#FFF',
    fontSize: 13,
    fontWeight: '800',
    marginHorizontal: 8,
  },
  hudExpandedCard: {
    backgroundColor: 'rgba(25,25,25,0.95)',
    padding: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
    width: 140,
  },
  legendRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
  },
  legendDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginRight: 8,
  },
  legendText: {
    color: '#FFF',
    fontSize: 11,
    fontWeight: '600',
    flex: 1,
  },
});
