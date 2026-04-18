import React, { memo, useEffect, useRef } from 'react';
import { View, Text, StyleSheet, Pressable, Platform, Animated } from 'react-native';
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

/** Pulsing Ring Effect for markers */
const PulseRing = ({ color, size, active = true }: { color: string, size: number, active?: boolean }) => {
  const scale = useRef(new Animated.Value(1)).current;
  const opacity = useRef(new Animated.Value(0.6)).current;

  useEffect(() => {
    if (!active) return;
    Animated.loop(
      Animated.parallel([
        Animated.timing(scale, { toValue: 1.8, duration: 2000, useNativeDriver: true }),
        Animated.timing(opacity, { toValue: 0, duration: 2000, useNativeDriver: true }),
      ])
    ).start();
  }, [active]);

  if (!active) return null;

  return (
    <Animated.View 
      style={[
        styles.pulseRing, 
        { 
          width: size, 
          height: size, 
          borderRadius: size / 2, 
          backgroundColor: color,
          transform: [{ scale }],
          opacity
        }
      ]} 
    />
  );
};

/** Évite la suppression de la vue Android dans les MarkerView Mapbox (icônes invisibles). */
function MarkerHost({ children }: { children: React.ReactNode }) {
  if (Platform.OS !== 'android') return <>{children}</>;
  return <View collapsable={false} style={{ alignItems: 'center', justifyContent: 'center' }}>{children}</View>;
}



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
      <PulseRing color={bg} size={30} />
      <Pressable onPress={onPress} style={[styles.incident, { backgroundColor: bg, borderColor: '#FFF' }]}>
        <TriangleAlert size={18} color="#FFFFFF" strokeWidth={2.5} />
      </Pressable>
    </MarkerHost>
  );
});

export const HospitalMarker = memo(function HospitalMarker({
  onPress,
  label,
}: {
  label?: string;
  beds?: number;
  onPress?: () => void;
}) {
  return (
    <MarkerHost>
      <PulseRing color="#E53935" size={32} />
      <Pressable onPress={onPress} style={styles.hospital}>
        <Hospital size={16} color="#E53935" strokeWidth={2.5} />
      </Pressable>
      {label && (
        <View style={styles.markerLabel}>
          <Text style={styles.markerLabelText}>{label.toUpperCase()}</Text>
        </View>
      )}
    </MarkerHost>
  );
});

export const UnitMarker = memo(function UnitMarker({
  status,
  onPress,
  headingDeg,
  label,
}: {
  status: string;
  onPress?: () => void;
  headingDeg?: number | null;
  label?: string;
}) {
  const bg =
    status === 'en_route'
      ? colors.markerUnitEnRoute
      : status === 'on_scene' || status === 'en_intervention'
        ? colors.markerUnitBusy
        : colors.markerUnit;
  const showDirection = headingDeg != null && Number.isFinite(headingDeg);
  const isEnRoute = status === 'en_route';
  
  return (
    <MarkerHost>
      <PulseRing color={bg} size={34} active={isEnRoute} />
      <Pressable onPress={onPress} style={[styles.unit, { backgroundColor: bg, shadowColor: bg }]}>
        {showDirection ? (
          <View style={{ transform: [{ rotate: `${headingDeg}deg` }] }}>
            <Navigation2 size={16} color="#FFFFFF" strokeWidth={2.5} />
          </View>
        ) : (
          <MaterialCommunityIcons name="ambulance" size={18} color="#FFFFFF" />
        )}
      </Pressable>
      {label && label !== 'AMBULANCE' && (
        <View style={styles.markerLabel}>
          <Text style={styles.markerLabelText}>{label}</Text>
        </View>
      )}
    </MarkerHost>
  );
});

export const ProximityCluster = memo(function ProximityCluster({
  priority,
  onPress,
  count = 1,
}: {
  priority: Priority;
  onPress?: () => void;
  count?: number;
}) {
  const bg = priorityColor(priority);
  return (
    <MarkerHost>
      <PulseRing color={bg} size={50} />
      <Pressable onPress={onPress} style={styles.proximityContainer}>
        <View style={[styles.proximityRing, { borderColor: bg }]}>
          <View style={[styles.proximityInner, { backgroundColor: bg }]}>
            <Hospital size={20} color="#FFFFFF" strokeWidth={2.5} />
          </View>
          {count > 1 && (
            <View style={styles.proximityBadge}>
              <Text style={styles.proximityBadgeText}>{count}</Text>
            </View>
          )}
        </View>
        <View style={styles.proximityLabel}>
          <Text style={styles.proximityLabelText}>SUR SITE</Text>
        </View>
      </Pressable>
    </MarkerHost>
  );
});

/** Google Maps Style Puck (Blue dot + Direction beam) */
export const MePuck = memo(function MePuck({
  headingDeg,
  size = 22,
}: {
  headingDeg: number;
  size?: number;
}) {
  const outerSize = size * 1.8;
  return (
    <MarkerHost>
      <View style={styles.meContainer}>
        {/* Direction Beam */}
        <View style={[styles.beamContainer, { transform: [{ rotate: `${headingDeg}deg` }] }]}>
          <View style={styles.beam} />
        </View>
        {/* Outer Glow */}
        <View style={[styles.meOuterGlow, { width: outerSize, height: outerSize, borderRadius: outerSize / 2 }]} />
        {/* Inner Dot */}
        <View style={[styles.meDot, { width: size, height: size, borderRadius: size / 2 }]} />
      </View>
    </MarkerHost>
  );
});

/** Hospital Marker (Map Pin with Plus) */
export const HospitalPin = memo(function HospitalPin({
  onPress,
}: {
  onPress?: () => void;
}) {
  return (
    <MarkerHost>
      <Pressable onPress={onPress} style={styles.hospitalPinContainer}>
        <MaterialCommunityIcons name="map-marker-plus" size={38} color="#EA4335" />
      </Pressable>
    </MarkerHost>
  );
});

/** Generic Incident Pin (Classic Destination) */
export const DestinationPin = memo(function DestinationPin({
  onPress,
}: {
  onPress?: () => void;
}) {
  return (
    <MarkerHost>
      <Pressable onPress={onPress}>
        <View style={styles.pinContainer}>
          <View style={styles.pinCircle} />
          <View style={styles.pinStem} />
          <View style={styles.pinPoint} />
        </View>
      </Pressable>
    </MarkerHost>
  );
});

/** ETA Badge for Route */
export const RouteETABadge = memo(function RouteETABadge({
  duration,
  isPrimary,
  onPress,
}: {
  duration: string;
  isPrimary?: boolean;
  onPress?: () => void;
}) {
  return (
    <MarkerHost>
      <Pressable onPress={onPress} style={[
        styles.etaBadge, 
        isPrimary ? styles.etaBadgePrimary : styles.etaBadgeAlt
      ]}>
        <Text style={[
          styles.etaText, 
          isPrimary ? styles.etaTextPrimary : styles.etaTextAlt
        ]}>{duration}</Text>
        {isPrimary && (
          <MaterialCommunityIcons 
            name="leaf" 
            size={12} 
            color="#FFF" 
            style={{ marginLeft: 4 }} 
          />
        )}
      </Pressable>
    </MarkerHost>
  );
});

const styles = StyleSheet.create({
  pulseRing: {
    position: 'absolute',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.2)',
  },
  markerLabel: {
    position: 'absolute',
    top: -18,
    backgroundColor: 'rgba(5, 5, 5, 0.75)',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
    borderWidth: 0.5,
    borderColor: 'rgba(255,255,255,0.15)',
  },
  markerLabelText: {
    color: '#FFFFFF',
    fontSize: 9,
    fontWeight: '900',
    letterSpacing: 0.5,
  },
  meContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    width: 60,
    height: 60,
  },
  meDot: {
    backgroundColor: '#4285F4',
    borderWidth: 3,
    borderColor: '#FFFFFF',
    shadowColor: '#000',
    shadowOpacity: 0.25,
    shadowRadius: 5,
    elevation: 5,
  },
  meOuterGlow: {
    position: 'absolute',
    backgroundColor: 'rgba(66, 133, 244, 0.2)',
  },
  beamContainer: {
    position: 'absolute',
    width: 80,
    height: 80,
    alignItems: 'center',
    justifyContent: 'center',
  },
  beam: {
    width: 40,
    height: 60,
    backgroundColor: 'rgba(66, 133, 244, 0.4)',
    borderTopLeftRadius: 30,
    borderTopRightRadius: 30,
    top: -20,
    position: 'absolute',
    transform: [{ scaleX: 0.5 }],
  },
  pinContainer: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  hospitalPinContainer: {
    shadowColor: '#000',
    shadowOpacity: 0.25,
    shadowRadius: 5,
    elevation: 5,
  },
  pinCircle: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#EA4335',
    borderWidth: 1,
    borderColor: '#B31412',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 2,
  },
  pinPoint: {
    width: 8,
    height: 8,
    backgroundColor: '#FFFFFF',
    borderRadius: 4,
    zIndex: 3,
    position: 'absolute',
    top: 12,
  },
  pinStem: {
    width: 4,
    height: 12,
    backgroundColor: '#EA4335',
    marginTop: -8,
    zIndex: 1,
  },
  etaBadge: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 100,
    flexDirection: 'row',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOpacity: 0.2,
    shadowRadius: 5,
    elevation: 3,
    borderWidth: 1,
  },
  etaBadgePrimary: {
    backgroundColor: '#185ABC', // Google Deep Blue
    borderColor: '#185ABC',
  },
  etaBadgeAlt: {
    backgroundColor: '#FFFFFF',
    borderColor: '#E8EAED',
  },
  etaText: {
    fontSize: 14,
    fontWeight: '600',
  },
  etaTextPrimary: {
    color: '#FFFFFF',
  },
  etaTextAlt: {
    color: '#202124',
  },
  incident: {
    width: 36,
    height: 36,
    borderRadius: 10,
    borderWidth: 1.5,
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: colors.markerIncident,
    shadowOpacity: 0.55,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 2 },
    elevation: 7,
  },
  hospital: {
    width: 32,
    height: 32,
    borderRadius: 8,
    backgroundColor: '#FFFFFF',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1.5,
    borderColor: '#E53935',
    shadowColor: '#000',
    shadowOpacity: 0.2,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
    elevation: 5,
  },
  bedsBadge: {
    backgroundColor: colors.success,
    borderRadius: 6,
    paddingHorizontal: 5,
    paddingVertical: 2,
    marginLeft: 4,
  },
  bedsText: { color: '#FFF', fontSize: 11, fontWeight: '800' },
  unit: {
    width: 32,
    height: 32,
    borderRadius: 16,
    borderWidth: 1.5,
    borderColor: '#FFFFFF',
    justifyContent: 'center',
    alignItems: 'center',
    shadowOpacity: 0.4,
    shadowRadius: 8,
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
  proximityBadge: {
    position: 'absolute',
    top: -5,
    right: -5,
    backgroundColor: '#FFF',
    width: 20,
    height: 20,
    borderRadius: 10,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1.5,
    borderColor: colors.secondary,
  },
  proximityBadgeText: {
    color: colors.secondary,
    fontSize: 10,
    fontWeight: '900',
  },
});

