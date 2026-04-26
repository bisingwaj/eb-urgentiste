import React from 'react';
import { View, Text, StyleSheet, ScrollView } from 'react-native';
import { MaterialIcons, MaterialCommunityIcons } from '@expo/vector-icons';
import { AppTouchableOpacity } from '../../../components/ui/AppTouchableOpacity';
import { colors } from '../../../theme/colors';
import { formatDurationSeconds, formatDistanceMeters } from '../../../lib/mapbox';
import { openExternalDirections, openWazeDirections } from '../../../utils/navigation';

interface LiveMapTacticalCardProps {
  selection: any;
  destLngLat: any;
  selectionTitle: string;
  selectionSubtitle: string;
  clearSelection: () => void;
  routeLoading: boolean;
  selectedRoute: any;
  routeList: any[];
  selectedRouteIndex: number;
  onSelectRouteIndex: (idx: number) => void;
}

export function LiveMapTacticalCard({
  selection,
  destLngLat,
  selectionTitle,
  selectionSubtitle,
  clearSelection,
  routeLoading,
  selectedRoute,
  routeList,
  selectedRouteIndex,
  onSelectRouteIndex
}: LiveMapTacticalCardProps) {
  if (!selection || !destLngLat) return null;

  return (
    <View style={styles.floatingInfoContainer}>
      <View style={styles.tacticalCard}>
        <View style={styles.cardHeader}>
          <View style={[styles.statusDot, { backgroundColor: selection.kind === 'incident' ? '#FF453A' : colors.success }]} />
          <View style={{ flex: 1 }}>
            <Text style={styles.unitName} numberOfLines={1}>{selectionTitle}</Text>
            <Text style={styles.caseRef} numberOfLines={1}>{selectionSubtitle}</Text>
          </View>
          <AppTouchableOpacity onPress={clearSelection} hitSlop={12}>
            <MaterialIcons name="close" size={22} color="rgba(255,255,255,0.4)" />
          </AppTouchableOpacity>
        </View>

        <View style={styles.statsRow}>
          <View style={styles.statItem}>
            <MaterialIcons name="timer" size={20} color={colors.secondary} />
            <View>
              <Text style={styles.statLabel}>TEMPS ESTIMÉ</Text>
              <Text style={styles.statValue}>
                {routeLoading ? '...' : (selectedRoute ? formatDurationSeconds(selectedRoute.duration) : '—')}
              </Text>
            </View>
          </View>

          <View style={styles.statDivider} />

          <View style={styles.statItem}>
            <MaterialIcons name="straighten" size={20} color="#34A853" />
            <View>
              <Text style={styles.statLabel}>DISTANCE</Text>
              <Text style={styles.statValue}>
                {routeLoading ? '...' : (selectedRoute ? formatDistanceMeters(selectedRoute.distance) : '—')}
              </Text>
            </View>
          </View>
        </View>

        {routeList.length > 1 && (
          <View style={styles.routePickSection}>
            <Text style={styles.routePickLabel}>ITINÉRAIRES ALTERNATIFS</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.routeChipsRow}>
              {routeList.map((r, idx) => (
                <AppTouchableOpacity
                  key={`route-chip-${idx}`}
                  style={[styles.routeChip, idx === selectedRouteIndex && styles.routeChipActive]}
                  onPress={() => onSelectRouteIndex(idx)}
                >
                  <Text style={styles.routeChipTitle}>MODÈLE {idx + 1}</Text>
                  <Text style={styles.routeChipMeta}>{formatDurationSeconds(r.duration)}</Text>
                </AppTouchableOpacity>
              ))}
            </ScrollView>
          </View>
        )}

        <View style={styles.destActions}>
          <AppTouchableOpacity
            style={styles.destBtnPrimary}
            onPress={() => openExternalDirections(destLngLat[1], destLngLat[0])}
          >
            <MaterialIcons name="map" size={18} color="#fff" />
            <Text style={styles.destBtnPrimaryText}>Google Maps</Text>
          </AppTouchableOpacity>
          <AppTouchableOpacity
            style={styles.destBtnSecondary}
            onPress={() => openWazeDirections(destLngLat[1], destLngLat[0])}
          >
            <MaterialCommunityIcons name="waze" size={18} color={colors.secondary} />
            <Text style={styles.destBtnSecondaryText}>Waze</Text>
          </AppTouchableOpacity>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  floatingInfoContainer: {
    position: 'absolute',
    bottom: 120,
    left: 24,
    right: 24,
    zIndex: 50,
  },
  tacticalCard: {
    backgroundColor: 'rgba(25,25,25,0.98)',
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.5,
    shadowRadius: 16,
    elevation: 12,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16,
  },
  statusDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
    marginRight: 12,
    borderWidth: 2,
    borderColor: '#FFF',
  },
  unitName: {
    color: '#FFF',
    fontSize: 18,
    fontWeight: '800',
    marginBottom: 2,
  },
  caseRef: {
    color: 'rgba(255,255,255,0.5)',
    fontSize: 12,
    fontWeight: '600',
    letterSpacing: 0.5,
  },
  statsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.3)',
    borderRadius: 12,
    padding: 12,
  },
  statItem: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  statDivider: {
    width: 1,
    height: 30,
    backgroundColor: 'rgba(255,255,255,0.1)',
    marginHorizontal: 12,
  },
  statLabel: {
    color: 'rgba(255,255,255,0.5)',
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 1,
    marginBottom: 2,
  },
  statValue: {
    color: '#FFF',
    fontSize: 16,
    fontWeight: '900',
  },
  routePickSection: {
    marginTop: 16,
    paddingTop: 16,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255,255,255,0.05)',
  },
  routePickLabel: {
    color: 'rgba(255,255,255,0.4)',
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 1,
    marginBottom: 8,
  },
  routeChipsRow: {
    gap: 8,
  },
  routeChip: {
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  routeChipActive: {
    backgroundColor: 'rgba(52,199,89,0.15)',
    borderColor: '#34A853',
  },
  routeChipTitle: {
    color: '#FFF',
    fontSize: 12,
    fontWeight: '700',
    marginBottom: 2,
  },
  routeChipMeta: {
    color: 'rgba(255,255,255,0.6)',
    fontSize: 11,
    fontWeight: '500',
  },
  destActions: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 16,
  },
  destBtnPrimary: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(52,152,219,0.2)',
    borderWidth: 1,
    borderColor: 'rgba(52,152,219,0.5)',
    paddingVertical: 12,
    borderRadius: 12,
    gap: 6,
  },
  destBtnPrimaryText: {
    color: '#FFF',
    fontSize: 14,
    fontWeight: '700',
  },
  destBtnSecondary: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
    paddingVertical: 12,
    borderRadius: 12,
    gap: 6,
  },
  destBtnSecondaryText: {
    color: colors.secondary,
    fontSize: 14,
    fontWeight: '700',
  },
});
