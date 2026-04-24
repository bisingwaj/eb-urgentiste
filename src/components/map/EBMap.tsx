import React, { forwardRef, useMemo, useCallback, useState, useEffect, useRef } from 'react';
import { StyleSheet, View, Text } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Mapbox, { UserTrackingMode, UserLocationRenderMode } from '@rnmapbox/maps';
import { MapboxMapView, MapboxMapViewProps } from './MapboxMapView';
import { colors } from '../../theme/colors';
import { TriangleAlert, Hospital as HospitalIcon, Ambulance, Compass, Target, Navigation } from 'lucide-react-native';
import { AppTouchableOpacity } from '../ui/AppTouchableOpacity';
import {
  IncidentMarker,
  HospitalMarker,
  UnitMarker,
  MePuck,
  ProximityCluster,
  RouteETABadge,
} from './mapMarkers';
import { buildRouteFeature, type RouteResult, haversineMeters } from '../../lib/mapbox';
import { EBMapSheet } from './EBMapSheet';
import { MaterialIcons, MaterialCommunityIcons } from '@expo/vector-icons';

export type EBMapMode = 'TRACKING' | 'NAVIGATION' | 'FLEET';

export interface EBMapMarker {
  id: string;
  type: 'incident' | 'hospital' | 'unit' | 'me';
  coordinate: [number, number];
  data?: any;
  /** For units mostly */
  headingDeg?: number;
  /** For units/hospitals status */
  status?: string;
  /** For hospitals/units */
  label?: string;
  beds?: number;
  /** For incidents */
  priority?: string;
  /** For grouped markers (Approach 4) */
  count?: number;
  groupedUnitIds?: string[];
  /** Telemetry for premium UI */
  speed?: number;
  etaMinutes?: number;
}

export interface EBMapProps extends Omit<MapboxMapViewProps, 'onPress'> {
  mode: EBMapMode;
  markers?: EBMapMarker[];
  routeData?: {
    routes: RouteResult[];
    selectedIndex: number;
    showAlternatives?: boolean;
  };
  myLocation?: [number, number];
  myHeading?: number;
  mySpeed?: number;
  waypoint?: [number, number];
  onMarkerPress?: (marker: EBMapMarker) => void;
  onRoutePress?: (index: number) => void;
  /** When clicking anywhere on the map */
  onMapPress?: (point: [number, number]) => void;
  cameraConfig?: {
    center?: [number, number];
    zoom?: number;
    bounds?: {
      ne: [number, number];
      sw: [number, number];
      paddingTop?: number;
      paddingBottom?: number;
      paddingLeft?: number;
      paddingRight?: number;
    };
  };
  /** For grouping on Fleet screen */
  useClustering?: boolean;
  /** Whether to show navigation controls (Layers, Compass, Recenter) */
  showControls?: boolean;
}

/**
 * EBMap: Unified Map Component
 * Handles multiple modes (Navigation, Tracking, Fleet) with consistent styling.
 */
export const EBMap = forwardRef<Mapbox.MapView, EBMapProps>((props, ref) => {
  const {
    mode,
    markers = [],
    routeData,
    myLocation,
    myHeading = 0,
    mySpeed = 0,
    waypoint,
    onMarkerPress,
    onRoutePress,
    onMapPress,
    cameraConfig,
    useClustering = false,
    showControls = true,
    ...mapProps
  } = props;

  const insets = useSafeAreaInsets();
  const mapRef = useRef<Mapbox.MapView>(null);
  const cameraRef = useRef<Mapbox.Camera>(null);
  const [selectedMarkerId, setSelectedMarkerId] = useState<string | null>(null);
  const [mapStyle, setMapStyle] = useState<string>(Mapbox.StyleURL.Street);
  const [cameraState, setCameraState] = useState({
    center: cameraConfig?.center || markers[0]?.coordinate || undefined,
    zoom: cameraConfig?.zoom || 13,
    heading: 0,
    pitch: 0,
  });

  // Data Shield: only show map content once valid coordinates are locked
  const isMapReady = useMemo(() => {
    if (mode === 'NAVIGATION') {
      const hasMe = !!myLocation && myLocation[0] !== 0 && myLocation[1] !== 0;
      // We also check if we have at least one valid destination marker if NAVIGATION
      const hasDest = markers.some(m => m.type === 'incident' || m.type === 'hospital');
      return hasMe && hasDest;
    }
    return true; // Other modes rely on provided static markers/bounds
  }, [mode, myLocation, markers]);

  // Camera config synchronization logic
  // We rely on declarative props for most states now.
  // This effect can stay empty or be removed if no other side effects are needed.
  useEffect(() => {
    // Logic moved to declarative props in Mapbox.Camera
  }, [cameraConfig?.center, cameraConfig?.zoom, cameraConfig?.bounds]);



  const handleRecenter = useCallback(() => {
    setIsFollowingPosition(true);
    setIsFollowingHeading(true);
    const target = myLocation || (markers.length > 0 ? markers[0].coordinate : null);
    if (target) {
      cameraRef.current?.setCamera({
        centerCoordinate: target,
        zoomLevel: 17,
        animationDuration: 1000,
        animationMode: 'flyTo',
      });
    }
  }, [myLocation, markers]);

  const handleResetNorth = useCallback(() => {
    cameraRef.current?.setCamera({
      heading: 0,
      animationDuration: 1000,
      animationMode: 'flyTo',
    });
  }, []);

  const toggleMapStyle = useCallback(() => {
    setMapStyle(prev => prev === Mapbox.StyleURL.Light ? Mapbox.StyleURL.Satellite : Mapbox.StyleURL.Light);
  }, []);

  const [showSheet, setShowSheet] = useState(mode === 'NAVIGATION');
  // Initial state logic: if bounds are provided, start in Overview (no following)
  // This ensures the origin and destination both fit at startup.
  const [isFollowingPosition, setIsFollowingPosition] = useState(mode === 'NAVIGATION' && !cameraConfig?.bounds);
  const [isFollowingHeading, setIsFollowingHeading] = useState(mode === 'NAVIGATION' && !cameraConfig?.bounds);
  const lastManualHeadingRef = useRef<number>(0);

  // Auto-follow logic for active navigation (Native implementation)
  const followUserLocation = mode === 'NAVIGATION' && isFollowingPosition;
  const followUserHeading = mode === 'NAVIGATION' && isFollowingHeading;

  // Adaptive Camera Metrics: Pitch & Zoom adjust to speed (m/s)
  const speedKmh = (mySpeed || 0) * 3.6;
  const adaptivePitch = Math.min(60, 35 + (speedKmh > 30 ? (speedKmh - 30) / 2 : 0));
  const adaptiveZoom = speedKmh > 80 ? 15.5 : 16.5;

  // Smart Heading Selection: Compass at stop, Course when moving
  const currentTrackingMode = useMemo(() => {
    if (!followUserHeading) return UserTrackingMode.Follow;
    return speedKmh > 5 ? UserTrackingMode.FollowWithCourse : UserTrackingMode.FollowWithHeading;
  }, [followUserHeading, speedKmh]);

  const selectedMarker = useMemo(() =>
    markers.find(m => m.id === selectedMarkerId),
    [markers, selectedMarkerId]);

  const handlePress = useCallback((e: any) => {
    const point = e.geometry.coordinates;
    onMapPress?.(point as [number, number]);
    setSelectedMarkerId(null);
  }, [onMapPress]);

  const handleMarkerPressLocal = useCallback((m: EBMapMarker) => {
    setSelectedMarkerId(m.id);
    onMarkerPress?.(m);
    setShowSheet(true);
  }, [onMarkerPress]);

  const routeBadges = useMemo(() => {
    if (!routeData || routeData.routes.length === 0) return [];
    
    return routeData.routes.map((r, i) => {
      const isPrimary = i === routeData.selectedIndex;
      const shouldShow = isPrimary || !!routeData.showAlternatives;
      if (!shouldShow) return null;

      const coords = r.geometry.coordinates;
      
      // Fixed percentages to keep them separate and predictable
      // Primary in the first third, alternatives staggered across the middle/last half
      const percentages = [0.25, 0.45, 0.65];
      const posIdx = Math.floor(coords.length * (percentages[i] || 0.5));
      const point = coords[posIdx];

      return {
        id: `eta-stable-${i}`,
        coordinate: point as [number, number],
        isPrimary,
        duration: `${Math.round(r.duration / 60)} min`
      };
    }).filter((b): b is any => b !== null);
  }, [routeData]);

  // Split markers by type to handle clustering vs individual rendering
  const { pointMarkers, symbolMarkers } = useMemo(() => {
    const processed: EBMapMarker[] = [];
    const groupedIds = new Set<string>();

    const units = markers.filter(m => m.type === 'unit');
    const targets = markers.filter(m => m.type === 'incident' || m.type === 'hospital' || m.type === 'me');

    // 1. Proximity Grouping (Manual Clustering for high-fidelity)
    targets.forEach(t => {
      const unitsNear = units.filter(u => haversineMeters(u.coordinate, t.coordinate) < 25);
      if (unitsNear.length > 0) {
        groupedIds.add(t.id);
        unitsNear.forEach(u => groupedIds.add(u.id));
        processed.push({
          ...t,
          id: `group-${t.id}`,
          type: 'unit',
          status: 'sur_site',
          priority: t.priority || unitsNear[0].priority,
          count: unitsNear.length,
          groupedUnitIds: unitsNear.map(u => u.id),
        });
      }
    });

    // 2. Individual Units
    units.forEach(u => {
      if (!groupedIds.has(u.id)) processed.push(u);
    });

    // 3. Isolated Targets / Me
    targets.forEach(t => {
      if (!groupedIds.has(t.id)) processed.push(t);
    });

    return { pointMarkers: processed, symbolMarkers: [] as EBMapMarker[] };
  }, [markers, mode]);

  return (
    <View style={styles.container}>
      <MapboxMapView
        ref={mapRef}
        style={StyleSheet.absoluteFill}
        styleURL={mapStyle}
        onPress={handlePress}
        rotateEnabled={true}
        pitchEnabled={true}
        scrollEnabled={true}
        zoomEnabled={true}
        compassEnabled={false}
        onCameraChanged={(e) => {
          if (!isMapReady) return; // Ignore camera changes during boot
          if (e.gestures.isGestureActive) {
            // Panning always stops following position
            setIsFollowingPosition(false);

            // Detect manual rotation: if heading changed significantly while gesturing
            const currentCamHeading = e.properties.heading;
            if (Math.abs(currentCamHeading - lastManualHeadingRef.current) > 1) {
              setIsFollowingHeading(false);
            }
            lastManualHeadingRef.current = currentCamHeading;
          }
        }}
        {...mapProps}
      >
        <Mapbox.Camera
          ref={cameraRef}
          defaultSettings={cameraConfig?.bounds ? {
            bounds: cameraConfig.bounds,
          } : {
            centerCoordinate: cameraConfig?.center || cameraState.center,
            zoomLevel: cameraConfig?.zoom || cameraState.zoom,
          }}
          followUserLocation={followUserLocation}
          followUserMode={followUserLocation ? currentTrackingMode : undefined}
          followZoomLevel={followUserLocation ? (cameraConfig?.zoom || adaptiveZoom) : undefined}
          followPitch={followUserLocation ? adaptivePitch : undefined}
          
          // Declarative Camera State
          bounds={!followUserLocation ? cameraConfig?.bounds : undefined}
          centerCoordinate={!followUserLocation && !cameraConfig?.bounds ? (cameraConfig?.center || cameraState.center) : undefined}
          zoomLevel={!followUserLocation && !cameraConfig?.bounds ? (cameraConfig?.zoom || cameraState.zoom) : undefined}
          heading={!followUserLocation ? cameraState.heading : undefined}
          pitch={!followUserLocation ? cameraState.pitch : undefined}
          
          animationMode="flyTo"
          animationDuration={1000}
        />

        {/* Native User Location (The Puck) */}
        {(!useClustering ? (
          <Mapbox.UserLocation
            renderMode={UserLocationRenderMode.Normal}
            visible={mode === 'NAVIGATION' || mode === 'TRACKING'}
            minDisplacement={1}
            androidRenderMode="compass"
          >
            <Mapbox.LocationPuck
              puckBearingEnabled={true}
              puckBearing={speedKmh > 5 ? 'course' : 'heading'}
              pulsing={{ isEnabled: true, color: colors.secondary, radius: 25 }}
            />
          </Mapbox.UserLocation>
        ) : null) as any}

        {/* Custom Water Color (Custom clinical blue) */}
        <Mapbox.FillLayer
          id="eb-water-custom"
          sourceLayerID="water"
          style={{
            fillColor: '#AADAFF', // A premium, vibrant clinical blue for water
            fillOpacity: 1,
          }}
        />

        {routeData ? routeData.routes.map((r, i) => {
          const isPrimary = i === routeData.selectedIndex;
          const shouldShow = isPrimary || !!routeData.showAlternatives || (mode === 'FLEET');
          if (!shouldShow) return (null as any);

          const layerId = `route-layer-${i}`;
          const glowId = `route-glow-${i}`;

          return (
            <Mapbox.ShapeSource
              key={`route-src-${i}`}
              id={`route-source-${i}`}
              shape={buildRouteFeature(r)}
              onPress={() => onRoutePress?.(i)}
            >
              <Mapbox.LineLayer
                id={glowId}
                style={{
                  lineColor: colors.secondary,
                  lineWidth: 10,
                  lineOpacity: isPrimary ? 0.25 : 0,
                  lineCap: 'round',
                  lineJoin: 'round',
                }}
              />
              
              {/* Walking Before (Origin -> Road) */}
              <Mapbox.LineLayer
                id={`${layerId}-walk-before`}
                filter={['==', ['get', 'routeType'], 'walking-before']}
                style={{
                  lineColor: '#9CA3AF',
                  lineWidth: 3,
                  lineDasharray: [2, 2],
                  lineCap: 'round',
                }}
              />

              {/* Main Drive Path */}
              <Mapbox.LineLayer
                id={layerId}
                filter={['==', ['get', 'routeType'], 'main']}
                style={{
                  lineColor: isPrimary ? colors.secondary : 'rgba(100, 180, 255, 0.6)',
                  lineWidth: isPrimary ? 6 : 4,
                  lineOpacity: isPrimary ? 1 : 0.7,
                  lineCap: 'round',
                  lineJoin: 'round',
                  lineDasharray: isPrimary ? [1, 0] : [2, 1],
                }}
              />

              {/* Walking After (Road -> Destination) */}
              <Mapbox.LineLayer
                id={`${layerId}-walk-after`}
                filter={['==', ['get', 'routeType'], 'walking-after']}
                style={{
                  lineColor: '#9CA3AF',
                  lineWidth: 3,
                  lineDasharray: [2, 2],
                  lineCap: 'round',
                }}
              />
            </Mapbox.ShapeSource>
          );
        }) : (null as any)}

        {(mode === 'FLEET' || useClustering) ? (
          <Mapbox.ShapeSource
            id="clustered-points"
            cluster={true}
            clusterRadius={50}
            shape={{
              type: 'FeatureCollection',
              features: symbolMarkers.map(m => ({
                type: 'Feature',
                id: m.id,
                properties: { ...m },
                geometry: { type: 'Point', coordinates: m.coordinate },
              }))
            }}
          >
            <Mapbox.CircleLayer
              id="clusters"
              belowLayerID="point-count"
              filter={['has', 'point_count']}
              style={{
                circleColor: colors.secondary,
                circleRadius: 18,
                circleOpacity: 0.8,
                circleStrokeWidth: 2,
                circleStrokeColor: 'rgba(255,255,255,0.2)',
              }}
            />
            <Mapbox.SymbolLayer
              id="point-count"
              filter={['has', 'point_count']}
              style={{
                textField: ['get', 'point_count'],
                textSize: 12,
                textColor: '#FFF',
                textIgnorePlacement: true,
                textAllowOverlap: true,
              }}
            />
            <Mapbox.SymbolLayer
              id="unclustered-point"
              filter={['!', ['has', 'point_count']]}
              style={{
                iconImage: ['match', ['get', 'type'],
                  'unit', 'ambulance',
                  'hospital', 'hospital',
                  'incident', 'incident',
                  'marker'
                ],
                iconSize: 0.8,
                iconAllowOverlap: true,
              }}
            />
          </Mapbox.ShapeSource>
        ) : (null as any)}

        {/* Markers rendered individually */}
        {pointMarkers.map(m => (
          <Mapbox.MarkerView
            id={`mv-${m.id}`}
            key={`mv-${m.id}`}
            coordinate={m.coordinate}
          >
            {m.type === 'me' ? (
              <MePuck headingDeg={m.headingDeg ?? myHeading} />
            ) : m.type === 'hospital' ? (
              <HospitalMarker
                label={m.label}
                beds={m.beds}
                onPress={() => handleMarkerPressLocal(m)}
              />
            ) : m.type === 'incident' ? (
              <IncidentMarker
                priority={m.priority || 'medium'}
                label={m.label}
                onPress={() => handleMarkerPressLocal(m)}
              />
            ) : (m as any).count > 0 ? (
              <ProximityCluster
                priority={m.priority || 'medium'}
                count={(m as any).count}
                onPress={() => handleMarkerPressLocal(m)}
              />
            ) : (
              <UnitMarker
                status={m.status || 'available'}
                headingDeg={m.headingDeg}
                label={m.label}
                onPress={() => handleMarkerPressLocal(m)}
              />
            )}
          </Mapbox.MarkerView>
        ))}

        {routeBadges.map(rb => rb ? (
          <Mapbox.MarkerView 
            key={rb.id} 
            id={rb.id}
            coordinate={rb.coordinate} 
            anchor={{ x: 0.5, y: 0.5 }}
            allowOverlap={true}
            isSelected={rb.isPrimary}
          >
            <RouteETABadge
              duration={rb.duration}
              isPrimary={rb.isPrimary}
              onPress={() => {
                const parts = rb.id.split('-');
                const idxStr = parts[parts.length - 1];
                const idx = parseInt(idxStr);
                if (!isNaN(idx)) {
                  onRoutePress?.(idx);
                }
              }}
            />
          </Mapbox.MarkerView>
        ) : null)}

        {(myLocation && mode !== 'NAVIGATION') ? (
          <Mapbox.PointAnnotation
            id="eb-my-puck"
            coordinate={myLocation}
          >
            <MePuck headingDeg={myHeading} />
          </Mapbox.PointAnnotation>
        ) : (null as any)}

        {!isMapReady && (
          <View style={[StyleSheet.absoluteFill, { backgroundColor: '#0A0A0A', justifyContent: 'center', alignItems: 'center', zIndex: 100 }]}>
            <View style={{ width: 60, height: 60, borderRadius: 30, backgroundColor: 'rgba(255,255,255,0.05)', justifyContent: 'center', alignItems: 'center' }}>
              <MaterialCommunityIcons name="satellite-variant" size={32} color={colors.secondary} style={{ opacity: 0.6 }} />
            </View>
            <Text style={{ color: 'rgba(255,255,255,0.4)', marginTop: 16, fontSize: 13, fontWeight: '600' }}>Synchronisation GPS...</Text>
          </View>
        )}
      </MapboxMapView>



      {showControls && (
        <View style={[
          styles.controlsGroup,
          { bottom: showSheet ? 150 : insets.bottom + 24 }
        ]}>
          {/* North Pin (Shows when rotated) */}
          {cameraState.heading !== 0 && (
            <AppTouchableOpacity style={styles.miniControlBtn} onPress={handleResetNorth}>
              <Compass size={20} color={colors.secondary} />
            </AppTouchableOpacity>
          )}

          <View style={styles.mainControlsStack}>
            {/* Map Style */}
            <AppTouchableOpacity style={styles.stackBtn} onPress={toggleMapStyle}>
              <MaterialCommunityIcons name="layers-outline" size={24} color="#FFF" />
            </AppTouchableOpacity>

            <View style={styles.separator} />

            {/* Recenter */}
            <AppTouchableOpacity style={styles.stackBtn} onPress={handleRecenter}>
              <Target size={24} color={followUserLocation ? colors.secondary : "#FFF"} />
            </AppTouchableOpacity>
          </View>
        </View>
      )}

      {showSheet && routeData && (
        <EBMapSheet
          duration={`${Math.round(routeData.routes[routeData.selectedIndex].duration / 60)} min`}
          distance={`${(routeData.routes[routeData.selectedIndex].distance / 1000).toFixed(1)} km`}
          onClose={() => setShowSheet(false)}
          onStart={() => setShowSheet(false)}
        />
      )}
    </View>
  );
});

EBMap.displayName = 'EBMap';

const styles = StyleSheet.create({
  container: {
    flex: 1,
    overflow: 'hidden',
    backgroundColor: '#F8F9FA',
  },
  controlsGroup: {
    position: 'absolute',
    right: 16,
    alignItems: 'center',
  },
  miniControlBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(10, 10, 10, 0.8)',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 8,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.1)',
  },
  mainControlsStack: {
    backgroundColor: 'rgba(10, 10, 10, 0.85)',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.15)',
    overflow: 'hidden',
  },
  stackBtn: {
    width: 52,
    height: 52,
    justifyContent: 'center',
    alignItems: 'center',
  },
  separator: {
    height: 1,
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    marginHorizontal: 12,
  },
  fabTopRight: {
    position: 'absolute',
    top: 50,
    right: 16,
  },
  fabBtn: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: '#FFF',
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOpacity: 0.15,
    shadowRadius: 8,
    elevation: 4,
  },
  controlsContainer: {
    position: 'absolute',
    right: 16,
    bottom: 150, // Stacked above sheet
    gap: 12,
  },
  controlBtn: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: '#FFF',
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOpacity: 0.15,
    shadowRadius: 10,
    elevation: 8,
    borderWidth: 1,
    borderColor: '#F1F3F4',
  },
});
