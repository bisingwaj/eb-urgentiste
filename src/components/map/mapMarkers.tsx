import React, { memo } from 'react';
import { View, Text, StyleSheet, Pressable, Platform } from 'react-native';
import { Navigation2, TriangleAlert, Hospital, Ambulance } from 'lucide-react-native';
import { colors } from '../../theme/colors';
import { radius } from '../../theme/spacing';

type Priority = string;

function priorityColor(p: Priority): string {
  switch (p) {
    case 'critical':
      return colors.markerIncident;
    case 'high':
      return '#FF9F0A';
    case 'medium':
      return '#FFD60A';
    default:
      return colors.success;
  }
}

/** Évite la suppression de la vue Android dans les MarkerView Mapbox (icônes invisibles). */
function MarkerHost({ children }: { children: React.ReactNode }) {
  if (Platform.OS !== 'android') return <>{children}</>;
  return <View collapsable={false}>{children}</View>;
}

export const MePuck = memo(function MePuck({
  headingDeg,
  size = 34,
}: {
  headingDeg: number;
  size?: number;
}) {
  const outer = size + 12;
  const iconSize = Math.round(size * 0.55);
  return (
    <MarkerHost>
      <View style={[styles.meOuter, { width: outer, height: outer, borderRadius: outer / 2 }]}>
        <View style={[styles.meInner, { width: size, height: size, borderRadius: size / 2 }]}>
          <View style={{ transform: [{ rotate: `${headingDeg}deg` }] }}>
            <Navigation2 size={iconSize} color="#FFFFFF" strokeWidth={2.5} />
          </View>
        </View>
      </View>
    </MarkerHost>
  );
});

export const IncidentMarker = memo(function IncidentMarker({
  priority,
  onPress,
}: {
  priority: Priority;
  onPress?: () => void;
}) {
  const bg = priorityColor(priority);
  return (
    <MarkerHost>
      <Pressable onPress={onPress} style={[styles.incident, { backgroundColor: bg, borderColor: '#FFF' }]}>
        <TriangleAlert size={20} color="#FFFFFF" strokeWidth={2.5} />
      </Pressable>
    </MarkerHost>
  );
});

export const HospitalMarker = memo(function HospitalMarker({
  label,
  beds,
  onPress,
}: {
  label: string;
  beds: number;
  onPress?: () => void;
}) {
  return (
    <MarkerHost>
      <Pressable onPress={onPress} style={styles.hospital}>
        <Hospital size={16} color="#FFFFFF" strokeWidth={2.5} />
        <Text style={styles.hospitalText} numberOfLines={1}>
          {label}
        </Text>
        {beds > 0 && (
          <View style={styles.bedsBadge}>
            <Text style={styles.bedsText}>{beds}</Text>
          </View>
        )}
      </Pressable>
    </MarkerHost>
  );
});

export const UnitMarker = memo(function UnitMarker({
  status,
  onPress,
}: {
  status: string;
  onPress?: () => void;
}) {
  const border =
    status === 'en_route'
      ? colors.markerUnitEnRoute
      : status === 'on_scene' || status === 'en_intervention'
        ? colors.markerUnitBusy
        : colors.markerUnit;
  return (
    <MarkerHost>
      <Pressable onPress={onPress} style={[styles.unit, { borderColor: border }]}>
        <Ambulance size={19} color={border} strokeWidth={2.5} />
      </Pressable>
    </MarkerHost>
  );
});

const styles = StyleSheet.create({
  meOuter: {
    backgroundColor: colors.markerMe + '22',
    justifyContent: 'center',
    alignItems: 'center',
  },
  meInner: {
    backgroundColor: colors.markerMe,
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: colors.markerMe,
    shadowOpacity: 0.45,
    shadowRadius: 10,
    elevation: 8,
  },
  incident: {
    width: 38,
    height: 38,
    borderRadius: 11,
    borderWidth: 2,
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: colors.markerIncident,
    shadowOpacity: 0.45,
    shadowRadius: 10,
    elevation: 6,
  },
  hospital: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.markerHospital,
    paddingHorizontal: 9,
    paddingVertical: 6,
    borderRadius: radius.sm,
    maxWidth: 140,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.2)',
    shadowColor: '#000',
    shadowOpacity: 0.35,
    shadowRadius: 8,
  },
  hospitalText: { color: '#FFF', fontSize: 10, fontWeight: '700', marginLeft: 4 },
  bedsBadge: {
    backgroundColor: colors.success,
    borderRadius: 6,
    paddingHorizontal: 5,
    paddingVertical: 2,
    marginLeft: 4,
  },
  bedsText: { color: '#FFF', fontSize: 9, fontWeight: '800' },
  unit: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: colors.surface,
    borderWidth: 2,
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOpacity: 0.35,
    shadowRadius: 8,
    elevation: 5,
  },
});
