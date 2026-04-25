import React from 'react';
import { View, Text, StyleSheet, ScrollView } from 'react-native';
import { MaterialIcons, MaterialCommunityIcons } from '@expo/vector-icons';
import { AppTouchableOpacity } from '../../../components/ui/AppTouchableOpacity';
import { colors } from '../../../theme/colors';
import { spacing } from '../../../theme/spacing';
import { formatDurationSeconds, formatDistanceMeters } from '../../../lib/mapbox';
import { openExternalDirections, openWazeDirections } from '../../../utils/navigation';

interface LiveMapTelemetryHUDProps {
  // Telemetry
  telemetryExpanded: boolean;
  setTelemetryExpanded: React.Dispatch<React.SetStateAction<boolean>>;
  setLegendExpanded: (val: boolean) => void;
  speed: number;
  headingResolved: number;
  accuracy: number;
  battery: number;
  // Card visibility (independent from route)
  cardVisible?: boolean;
  setCardVisible?: (val: boolean) => void;
  hideCard?: () => void;
  // Selection / destination
  selection?: any;
  destLngLat?: [number, number] | null;
  selectionTitle?: string;
  selectionSubtitle?: string;
  clearSelection?: () => void;
  routeLoading?: boolean;
  selectedRoute?: any;
  routeList?: any[];
  selectedRouteIndex?: number;
  onSelectRouteIndex?: (idx: number) => void;
}

export function LiveMapTelemetryHUD({
  telemetryExpanded,
  setTelemetryExpanded,
  setLegendExpanded,
  speed,
  headingResolved,
  accuracy,
  battery,
  cardVisible = false,
  setCardVisible,
  hideCard,
  selection,
  destLngLat,
  selectionTitle = '',
  selectionSubtitle = '',
  clearSelection,
  routeLoading = false,
  selectedRoute,
  routeList = [],
  selectedRouteIndex = 0,
  onSelectRouteIndex,
}: LiveMapTelemetryHUDProps) {

  // Card shows as soon as selection exists, even before route loads
  const hasSelection = !!selection;
  // Route info requires both selection and a computed destination
  const hasRoute = !!(selection && destLngLat);

  const onPillPress = () => {
    if (hasSelection) {
      setCardVisible?.(!cardVisible);
      setLegendExpanded(false);
    } else {
      setTelemetryExpanded((v) => !v);
      setLegendExpanded(false);
    }
  };

  return (
    <View style={styles.anchorBL}>

      {/* ── Info card popup (above the pill, only when selection active & cardVisible) ── */}
      {hasSelection && cardVisible && (
        <View style={styles.popup}>

          {/* Route alternatives chips */}
          {routeList.length > 1 && (
            <View style={styles.routeChipsBubble}>
              <Text style={styles.routePickLabel}>ITINÉRAIRES ALTERNATIFS</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.routeChipsRow}>
                {routeList.map((r, idx) => (
                  <AppTouchableOpacity
                    key={`chip-${idx}`}
                    style={[styles.routeChip, idx === selectedRouteIndex && styles.routeChipActive]}
                    onPress={() => onSelectRouteIndex?.(idx)}
                  >
                    <Text style={[styles.routeChipTitle, idx === selectedRouteIndex && { color: colors.success }]}>#{idx + 1}</Text>
                    <Text style={styles.routeChipMeta}>{formatDurationSeconds(r.duration)}</Text>
                  </AppTouchableOpacity>
                ))}
              </ScrollView>
            </View>
          )}

          {/* Main card */}
          <View style={styles.card}>
            {/* Header */}
            <View style={styles.cardHeader}>
              <View style={[styles.statusDot, {
                backgroundColor: selection?.kind === 'incident' ? '#FF453A' : colors.success
              }]} />
              <View style={{ flex: 1 }}>
                <Text style={styles.cardTitle} numberOfLines={1}>{selectionTitle}</Text>
                <Text style={styles.cardSubtitle} numberOfLines={1}>{selectionSubtitle}</Text>
              </View>
              {/* Close card (keeps route) */}
              <AppTouchableOpacity onPress={hideCard} hitSlop={14} style={styles.closeBtn}>
                <MaterialIcons name="expand-more" size={20} color="rgba(255,255,255,0.5)" />
              </AppTouchableOpacity>
            </View>

            {/* Stats row */}
            <View style={styles.statsRow}>
              <View style={styles.statItem}>
                <MaterialIcons name="timer" size={16} color={colors.secondary} />
                <View>
                  <Text style={styles.statLabel}>ETA</Text>
                  <Text style={styles.statValue}>
                    {routeLoading ? '…' : (selectedRoute ? formatDurationSeconds(selectedRoute.duration) : '—')}
                  </Text>
                </View>
              </View>
              <View style={styles.statDivider} />
              <View style={styles.statItem}>
                <MaterialIcons name="straighten" size={16} color="#34A853" />
                <View>
                  <Text style={styles.statLabel}>DISTANCE</Text>
                  <Text style={styles.statValue}>
                    {routeLoading ? '…' : (selectedRoute ? formatDistanceMeters(selectedRoute.distance) : '—')}
                  </Text>
                </View>
              </View>
            </View>

            {/* Navigation CTAs */}
            <View style={styles.navRow}>
              <AppTouchableOpacity
                style={styles.navBtn}
                onPress={() => openExternalDirections(destLngLat![1], destLngLat![0])}
              >
                <MaterialIcons name="map" size={15} color="#FFF" />
                <Text style={styles.navBtnText}>Google Maps</Text>
              </AppTouchableOpacity>
              <AppTouchableOpacity
                style={[styles.navBtn, styles.navBtnWaze]}
                onPress={() => openWazeDirections(destLngLat![1], destLngLat![0])}
              >
                <MaterialCommunityIcons name="waze" size={15} color={colors.secondary} />
                <Text style={[styles.navBtnText, { color: colors.secondary }]}>Waze</Text>
              </AppTouchableOpacity>
            </View>

            {/* Clear route CTA */}
            <AppTouchableOpacity style={styles.clearRouteBtn} onPress={clearSelection}>
              <MaterialIcons name="close" size={13} color="rgba(255,255,255,0.35)" />
              <Text style={styles.clearRouteBtnText}>Annuler le tracé</Text>
            </AppTouchableOpacity>
          </View>
        </View>
      )}

      {/* ── Telemetry panel (only when no selection & expanded) ── */}
      {!hasSelection && telemetryExpanded && (
        <View style={styles.telPanel}>
          <View style={styles.telRow}>
            <MaterialIcons name="speed" color={colors.secondary} size={14} />
            <Text style={styles.telLabel}>Vitesse</Text>
            <Text style={styles.telValue}>{speed.toFixed(0)} km/h</Text>
          </View>
          <View style={styles.telRow}>
            <MaterialIcons name="explore" color={colors.secondary} size={14} />
            <Text style={styles.telLabel}>Cap</Text>
            <Text style={styles.telValue}>{headingResolved.toFixed(0)}°</Text>
          </View>
          <View style={[styles.telRow, { marginBottom: 0 }]}>
            <MaterialIcons name="gps-fixed" color={accuracy < 25 ? colors.success : '#FF9F0A'} size={14} />
            <Text style={styles.telLabel}>Précision</Text>
            <Text style={[styles.telValue, { color: accuracy < 25 ? colors.success : '#FF9F0A' }]}>
              ±{accuracy.toFixed(0)} m
            </Text>
          </View>
        </View>
      )}

      {/* ── Speed pill (ALWAYS visible) ── */}
      <AppTouchableOpacity style={styles.pill} onPress={onPillPress} activeOpacity={0.85}>
        {hasSelection ? (
          // Show hospital indicator when a destination is selected
          <>
            <MaterialIcons name="local-hospital" color={colors.success} size={16} />
            <Text style={styles.pillValue} numberOfLines={1}>
              {routeLoading ? '…' : (selectedRoute ? formatDistanceMeters(selectedRoute.distance) : selectionTitle)}
            </Text>
            <MaterialIcons
              name={cardVisible ? 'expand-more' : 'expand-less'}
              color="rgba(255,255,255,0.5)"
              size={18}
            />
          </>
        ) : (
          // Default speed display
          <>
            <MaterialIcons name="speed" color={colors.secondary} size={16} />
            <Text style={styles.pillValue}>{speed.toFixed(0)} km/h</Text>
            <MaterialIcons
              name={telemetryExpanded ? 'expand-more' : 'expand-less'}
              color="rgba(255,255,255,0.5)"
              size={18}
            />
          </>
        )}
      </AppTouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  // Fixed bottom-left anchor — everything stacks upward from here
  anchorBL: {
    position: 'absolute',
    bottom: spacing.sm,
    left: spacing.md,
    zIndex: 100,
    alignItems: 'flex-start',
  },

  // Popup panel that floats above the pill
  popup: {
    marginBottom: 8,
    width: 270,
  },

  // Route alternatives chips bubble
  routeChipsBubble: {
    backgroundColor: 'rgba(18,18,18,0.97)',
    borderRadius: 12,
    padding: 10,
    marginBottom: 6,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
  },
  routePickLabel: {
    color: 'rgba(255,255,255,0.35)',
    fontSize: 9,
    fontWeight: '800',
    letterSpacing: 1,
    marginBottom: 6,
  },
  routeChipsRow: {
    gap: 6,
    flexDirection: 'row',
  },
  routeChip: {
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 6,
    alignItems: 'center',
  },
  routeChipActive: {
    backgroundColor: 'rgba(52,199,89,0.15)',
    borderColor: colors.success,
  },
  routeChipTitle: {
    color: 'rgba(255,255,255,0.6)',
    fontSize: 11,
    fontWeight: '800',
  },
  routeChipMeta: {
    color: 'rgba(255,255,255,0.45)',
    fontSize: 10,
    fontWeight: '500',
    marginTop: 1,
  },

  // Main card
  card: {
    backgroundColor: 'rgba(18,18,18,0.97)',
    borderRadius: 16,
    padding: 14,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.5,
    shadowRadius: 14,
    elevation: 12,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
    gap: 8,
  },
  statusDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    borderWidth: 2,
    borderColor: '#FFF',
  },
  cardTitle: {
    color: '#FFF',
    fontSize: 14,
    fontWeight: '800',
    marginBottom: 1,
  },
  cardSubtitle: {
    color: 'rgba(255,255,255,0.45)',
    fontSize: 11,
    fontWeight: '600',
    letterSpacing: 0.3,
  },
  closeBtn: {
    padding: 4,
  },
  statsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.3)',
    borderRadius: 10,
    paddingVertical: 10,
    paddingHorizontal: 12,
    marginBottom: 10,
  },
  statItem: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
  },
  statDivider: {
    width: 1,
    height: 26,
    backgroundColor: 'rgba(255,255,255,0.1)',
    marginHorizontal: 10,
  },
  statLabel: {
    color: 'rgba(255,255,255,0.45)',
    fontSize: 9,
    fontWeight: '700',
    letterSpacing: 0.8,
    marginBottom: 1,
  },
  statValue: {
    color: '#FFF',
    fontSize: 14,
    fontWeight: '900',
  },
  navRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 8,
  },
  navBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(52,152,219,0.18)',
    borderWidth: 1,
    borderColor: 'rgba(52,152,219,0.45)',
    paddingVertical: 9,
    borderRadius: 10,
    gap: 5,
  },
  navBtnWaze: {
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderColor: 'rgba(255,255,255,0.12)',
  },
  navBtnText: {
    color: '#FFF',
    fontSize: 12,
    fontWeight: '700',
  },
  clearRouteBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    paddingVertical: 4,
  },
  clearRouteBtnText: {
    color: 'rgba(255,255,255,0.3)',
    fontSize: 11,
    fontWeight: '600',
  },

  // Telemetry panel (floats above pill when no selection)
  telPanel: {
    backgroundColor: 'rgba(25,25,25,0.95)',
    padding: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
    width: 150,
    marginBottom: 8,
  },
  telRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
  },
  telLabel: {
    color: 'rgba(255,255,255,0.6)',
    fontSize: 11,
    fontWeight: '600',
    marginLeft: 6,
    flex: 1,
  },
  telValue: {
    color: '#FFF',
    fontSize: 12,
    fontWeight: '800',
  },

  // Speed pill (always visible)
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(25,25,25,0.95)',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
    gap: 6,
  },
  pillValue: {
    color: '#FFF',
    fontSize: 13,
    fontWeight: '800',
    maxWidth: 140,
  },
});
