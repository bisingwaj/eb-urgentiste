import React, { memo, useEffect, useRef } from 'react';
import { View, Text, StyleSheet, Pressable, Platform, Animated } from 'react-native';
import { Navigation2, TriangleAlert, Target } from 'lucide-react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import Svg, { Path, Defs, RadialGradient, Stop } from 'react-native-svg';
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
  // box-none: outer container passes touches through (allows map scroll),
  // but children (Pressable icons) still receive taps.
  if (Platform.OS !== 'android') return <View pointerEvents="box-none">{children}</View>;
  return (
    <View collapsable={false} pointerEvents="box-none"
      style={{ alignItems: 'center', justifyContent: 'center' }}>
      {children}
    </View>
  );
}



export const IncidentMarker = memo(function IncidentMarker({
  priority,
  onPress,
  label,
}: {
  priority: Priority;
  onPress?: () => void;
  label?: string;
}) {
  const bg = priorityColor(priority);
  return (
    <MarkerHost>
      <PulseRing color={bg} size={30} />
      <Pressable onPress={onPress} style={[styles.incident, { backgroundColor: bg, borderColor: '#FFF' }]}>
        <TriangleAlert size={18} color="#FFFFFF" strokeWidth={2.5} />
      </Pressable>
      {label && (
        <View style={styles.topLabel}>
          <Text style={styles.topLabelText}>{label.toUpperCase()}</Text>
        </View>
      )}
    </MarkerHost>
  );
});

export const HospitalMarker = memo(function HospitalMarker({
  onPress,
  label,
  beds,
  isSelected = false,
}: {
  label?: string;
  beds?: number;
  onPress?: () => void;
  isSelected?: boolean;
}) {
  const dotColor = isSelected ? '#D32F2F' : '#757575';
  return (
    <MarkerHost>
      <View style={styles.hospitalContainer}>
        <Pressable
          onPress={onPress}
          style={[
            styles.hospitalDot, 
            { backgroundColor: dotColor, borderColor: isSelected ? '#FF5252' : 'rgba(255,255,255,0.6)' }
          ]}
        />
        {label && (
          <View style={styles.hospitalLabelWrap} pointerEvents="none">
            <Text style={[styles.hospitalLabelText, isSelected && { color: '#FF5252', fontWeight: '800' }]} numberOfLines={1}>
              {label}
            </Text>
          </View>
        )}
      </View>
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
        <View style={styles.topLabel}>
          <Text style={styles.topLabelText} numberOfLines={1}>{label}</Text>
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
            <Target size={20} color="#FFFFFF" strokeWidth={2.5} />
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

/** 
 * Refined Google Maps Style Beam (SVG Cone)
 * Shorter, wider, and more integrated.
 */
const LocationBeam = ({ heading, size }: { heading: number, size: number }) => {
  const beamSize = size * 3.5;
  return (
    <View style={[styles.beamContainer, { width: beamSize, height: beamSize, transform: [{ rotate: `${heading}deg` }] }]}>
      <Svg width={beamSize} height={beamSize} viewBox="0 0 100 100">
        <Defs>
          <RadialGradient id="beamGrad" cx="50" cy="50" rx="50" ry="50" fx="50" fy="50" gradientUnits="userSpaceOnUse">
            <Stop offset="0%" stopColor="#4285F4" stopOpacity="4" />
            <Stop offset="45%" stopColor="#4285F4" stopOpacity="1" />
            <Stop offset="80%" stopColor="#4285F4" stopOpacity="0" />
          </RadialGradient>
        </Defs>
        <Path
          d="M 50 50 L 30 10.3 A 45 45 0 0 1 70 10.3 Z"
          fill="url(#beamGrad)"
        />
      </Svg>
    </View>
  );
};

/** Google Maps Style Puck (Blue dot + Direction beam + Pulse) */
export const MePuck = memo(function MePuck({
  headingDeg,
  size = 18,
}: {
  headingDeg: number;
  size?: number;
}) {
  return (
    <MarkerHost>
      <View style={styles.meContainer}>
        {/* Pulsing accuracy ring */}
        <PulseRing color="#4285F4" size={size * 2} />

        {/* Conical Direction Beam (Radar) */}
        <LocationBeam heading={headingDeg} size={size} />

        {/* Central Puck with Arrow Icon */}
        <View style={[styles.meDot, { width: size, height: size, borderRadius: size / 2 }]}>
          <View style={{ transform: [{ rotate: `${headingDeg}deg` }] }}>
            <Navigation2 size={size * 0.7} color="#FFFFFF" fill="#FFFFFF" strokeWidth={3} />
          </View>
        </View>
      </View>
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
  topLabel: {
    position: 'absolute',
    top: -28,
    alignItems: 'center',
    justifyContent: 'center',
    width: 120,
  },
  topLabelText: {
    color: '#FFFFFF',
    fontSize: 11,
    fontWeight: '900',
    backgroundColor: 'rgba(0,0,0,0.55)',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
    overflow: 'hidden',
    textShadowColor: 'rgba(0,0,0,0)',
    textShadowOffset: { width: 0, height: 0 },
    textShadowRadius: 0,
  },
  meContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    width: 60,
    height: 100,
  },
  meDot: {
    backgroundColor: '#4285F4',
    borderWidth: 2.2,
    borderColor: '#FFFFFF',
    shadowColor: '#000',
    shadowOpacity: 0.3,
    shadowRadius: 3,
    shadowOffset: { width: 0, height: 1 },
    elevation: 6,
    alignItems: 'center',
    justifyContent: 'center',
  },
  beamContainer: {
    position: 'absolute',
    alignItems: 'center',
    justifyContent: 'center',
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
  // ── Hospital marker styles ──
  hospitalContainer: {
    alignItems: 'center',
  },
  hospitalDot: {
    width: 14,
    height: 14,
    borderRadius: 7,
    borderWidth: 1.5,
    shadowColor: '#000',
    shadowOpacity: 0.25,
    shadowRadius: 3,
    shadowOffset: { width: 0, height: 1.5 },
    elevation: 4,
  },
  hospitalLabelWrap: {
    marginTop: 2,
    maxWidth: 100,
    alignItems: 'center',
  },
  hospitalLabelText: {
    color: 'rgba(40,40,40,0.9)',
    fontSize: 9.5,
    fontWeight: '600',
    textShadowColor: 'rgba(255,255,255,0.95)',
    textShadowOffset: { width: 0, height: 0 },
    textShadowRadius: 3,
    letterSpacing: 0.1,
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

