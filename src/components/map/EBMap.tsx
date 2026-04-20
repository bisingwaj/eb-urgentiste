import React, { forwardRef, useMemo, useCallback, useState, useEffect, useRef } from 'react';
import { StyleSheet, View, Text } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Mapbox from '@rnmapbox/maps';
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

  const handleRecenter = useCallback(() => {
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
  const [followUser, setFollowUser] = useState(mode === 'NAVIGATION');

  // Auto-follow logic for active navigation
  useEffect(() => {
    if (mode === 'NAVIGATION' && followUser && myLocation) {
      cameraRef.current?.setCamera({
        centerCoordinate: myLocation,
        zoomLevel: 16.5,
        heading: myHeading,
        pitch: 0, // Keep 2D top-down as requested
        animationDuration: 1000,
        animationMode: 'flyTo',
      });
    }
  }, [mode, followUser, myLocation, myHeading]);

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
    if (!routeData) return [];
    return routeData.routes.map((r, i) => {
      const coords = r.geometry.coordinates;
      const midPoint = coords[Math.floor(coords.length / 2)];
      return {
        id: `route-badge-${i}`,
        coordinate: midPoint as [number, number],
        isPrimary: i === routeData.selectedIndex,
        duration: `${Math.round(r.duration / 60)} min`
      };
    });
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
        {...mapProps}
      >
        <Mapbox.Camera
          ref={cameraRef}
          {...(cameraConfig?.bounds ? { 
            bounds: cameraConfig.bounds,
            heading: cameraState.heading,
            pitch: cameraState.pitch,
          } : {
            centerCoordinate: cameraState.center,
            zoomLevel: cameraState.zoom,
            heading: cameraState.heading,
            pitch: cameraState.pitch,
          })}
          animationMode="flyTo"
          animationDuration={1000}
        />

        {/* Custom Water Color (Custom clinical blue) */}
        <Mapbox.FillLayer
          id="eb-water-custom"
          sourceLayerID="water"
          style={{
            fillColor: '#AADAFF', // A premium, vibrant clinical blue for water
            fillOpacity: 1,
          }}
        />

        {routeData && routeData.routes.map((r, i) => {
          const isPrimary = i === routeData.selectedIndex;
          // In Fleet/Multi-unit mode, we want to see all primary routes
          const shouldShow = isPrimary || routeData.showAlternatives || (mode === 'FLEET');
          if (!shouldShow) return null;

          return (
            <Mapbox.ShapeSource
              key={`route-${i}`}
              id={`route-src-${i}`}
              shape={buildRouteFeature(r.geometry)}
              onPress={() => onRoutePress?.(i)}
            >
              <Mapbox.LineLayer
                id={`route-layer-${i}`}
                style={{
                  lineColor: isPrimary ? colors.secondary : 'rgba(255, 255, 255, 0.3)',
                  lineWidth: isPrimary ? 6 : 4,
                  lineOpacity: isPrimary ? 0.9 : 0.6,
                  lineCap: 'round',
                  lineJoin: 'round',
                }}
              />
            </Mapbox.ShapeSource>
          );
        })}

        {(mode === 'FLEET' || useClustering) && (
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
        )}

        {pointMarkers.map(m => (
          <Mapbox.MarkerView
            id={`mv-${m.id}`}
            key={`mv-${m.id}`}
            coordinate={m.coordinate}
          >
            {m.type === 'me' ? (
              <MePuck headingDeg={myHeading} />
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

        {routeBadges.map(rb => (
          <Mapbox.MarkerView key={rb.id} coordinate={rb.coordinate} anchor={{ x: 0.5, y: 0.5 }}>
            <RouteETABadge
              duration={rb.duration}
              isPrimary={rb.isPrimary}
              onPress={() => {
                const idx = parseInt(rb.id.split('-').pop()!);
                onRoutePress?.(idx);
              }}
            />
          </Mapbox.MarkerView>
        ))}

        {myLocation && (
          <Mapbox.PointAnnotation
            id="eb-my-puck"
            coordinate={myLocation}
          >
            <MePuck headingDeg={myHeading} />
          </Mapbox.PointAnnotation>
        )}
      </MapboxMapView>



      {showControls && (
        <View style={[
          styles.controlsContainer,
          { bottom: showSheet ? 150 : insets.bottom + 20 }
        ]}>
          {/* Layers Toggle (3 Circles / Stack) */}
          <AppTouchableOpacity style={styles.controlBtn} onPress={toggleMapStyle}>
            <MaterialCommunityIcons name="layers-outline" size={24} color="#5F6368" />
          </AppTouchableOpacity>

          {/* Compass Reset (MIDDLE) */}
          <AppTouchableOpacity style={styles.controlBtn} onPress={handleResetNorth}>
            <Compass size={22} color="#5F6368" />
          </AppTouchableOpacity>

          {/* Target Recenter (BOTTOM) */}
          <AppTouchableOpacity style={styles.controlBtn} onPress={handleRecenter}>
            <Target size={24} color="#4285F4" />
          </AppTouchableOpacity>
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
