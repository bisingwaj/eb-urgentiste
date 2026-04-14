import React, { memo } from 'react';
import { View, Text, StyleSheet, Pressable, Platform } from 'react-native';
import { Navigation2, TriangleAlert, Hospital, Ambulance } from 'lucide-react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
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
  /** Si défini (nombre fini), flèche de cap type Google ; sinon icône ambulance seule. */
  headingDeg,
}: {
  status: string;
  onPress?: () => void;
  headingDeg?: number | null;
}) {
  const bg =
    status === 'en_route'
      ? colors.markerUnitEnRoute
      : status === 'on_scene' || status === 'en_intervention'
        ? colors.markerUnitBusy
        : colors.markerUnit;
  const showDirection = headingDeg != null && Number.isFinite(headingDeg);
  const iconSize = 19;
  return (
    <MarkerHost>
      <Pressable onPress={onPress} style={[styles.unit, { backgroundColor: bg, shadowColor: bg }]}>
        {showDirection ? (
          <View style={{ transform: [{ rotate: `${headingDeg}deg` }] }}>
            <Navigation2 size={iconSize} color="#FFFFFF" strokeWidth={2.5} />
          </View>
        ) : (
          <Ambulance size={iconSize} color="#FFFFFF" strokeWidth={2.5} />
        )}
      </Pressable>
    </MarkerHost>
  );
});

export const ProximityCluster = memo(function ProximityCluster({
  priority,
  onPress,
}: {
  priority: Priority;
  onPress?: () => void;
}) {
  const bg = priorityColor(priority);
  return (
    <MarkerHost>
      <Pressable onPress={onPress} style={styles.proximityContainer}>
        <View style={[styles.proximityRing, { borderColor: bg }]}>
          <View style={[styles.proximityInner, { backgroundColor: bg }]}>
            <MaterialCommunityIcons name="account-check" size={20} color="#FFFFFF" />
          </View>
        </View>
        <View style={styles.proximityLabel}>
          <Text style={styles.proximityLabelText}>SUR SITE</Text>
        </View>
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
    width: 40,
    height: 40,
    borderRadius: 12,
    borderWidth: 2,
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: colors.markerIncident,
    shadowOpacity: 0.55,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 2 },
    elevation: 7,
  },
  hospital: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.markerHospital,
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderRadius: radius.sm,
    maxWidth: 140,
    borderWidth: 1.5,
    borderColor: 'rgba(255,255,255,0.3)',
    shadowColor: colors.markerHospital,
    shadowOpacity: 0.5,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 2 },
    elevation: 6,
  },
  hospitalText: { color: '#FFF', fontSize: 12, fontWeight: '700', marginLeft: 4 },
  bedsBadge: {
    backgroundColor: colors.success,
    borderRadius: 6,
    paddingHorizontal: 5,
    paddingVertical: 2,
    marginLeft: 4,
  },
  bedsText: { color: '#FFF', fontSize: 11, fontWeight: '800' },
  unit: {
    width: 40,
    height: 40,
    borderRadius: 20,
    borderWidth: 2,
    borderColor: '#FFFFFF',
    justifyContent: 'center',
    alignItems: 'center',
    shadowOpacity: 0.5,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 2 },
    elevation: 6,
  },
  proximityContainer: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  proximityRing: {
    width: 54,
    height: 54,
    borderRadius: 27,
    borderWidth: 3,
    backgroundColor: 'rgba(255,255,255,0.9)',
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOpacity: 0.3,
    shadowRadius: 10,
    elevation: 10,
  },
  proximityInner: {
    width: 40,
    height: 40,
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center',
  },
  proximityLabel: {
    marginTop: 4,
    backgroundColor: colors.markerIncident,
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 6,
  },
  proximityLabelText: {
    color: '#FFF',
    fontSize: 10,
    fontWeight: '900',
  },
});
