import { useState, useEffect, useCallback, useMemo } from "react";
import * as Location from "expo-location";
import { useMapPuckHeading } from "../../../hooks/useMapPuckHeading";

const DEFAULT_COORDS = { latitude: -4.3224, longitude: 15.307 };

export function useLiveMapLocation(isFocused: boolean) {
  const [myLocation, setMyLocation] = useState<Location.LocationObject | null>(null);
  const [gpsReady, setGpsReady] = useState(false);
  const [speed, setSpeed] = useState(0);
  const [accuracy, setAccuracy] = useState(0);
  const [battery] = useState(87); // Hardcoded for now based on original code

  const headingResolved = useMapPuckHeading(myLocation);

  const myCoords = useMemo(
    () =>
      myLocation
        ? {
            latitude: myLocation.coords.latitude,
            longitude: myLocation.coords.longitude,
          }
        : DEFAULT_COORDS,
    [myLocation],
  );

  const updateTelemetry = useCallback((loc: Location.LocationObject) => {
    setSpeed(Math.max(0, (loc.coords.speed || 0) * 3.6));
    setAccuracy(loc.coords.accuracy || 0);
  }, []);

  useEffect(() => {
    if (!isFocused) return;
    let sub: Location.LocationSubscription | null = null;
    let cancelled = false;

    (async () => {
      try {
        const { status } = await Location.requestForegroundPermissionsAsync();
        if (status !== "granted" || cancelled) return;

        const loc = await Location.getCurrentPositionAsync({
          accuracy: Location.Accuracy.Balanced,
        });
        if (cancelled) return;
        setMyLocation(loc);
        setGpsReady(true);
        updateTelemetry(loc);

        sub = await Location.watchPositionAsync(
          {
            accuracy: Location.Accuracy.Balanced,
            timeInterval: 6000,
            distanceInterval: 25,
          },
          (location) => {
            if (cancelled) return;
            setMyLocation(location);
            updateTelemetry(location);
          },
        );
      } catch (err) {
        console.warn("[Location] Position indisponible sur cet appareil:", err);
      }
    })();

    return () => {
      cancelled = true;
      sub?.remove();
    };
  }, [isFocused, updateTelemetry]);

  return {
    myLocation,
    gpsReady,
    speed,
    accuracy,
    battery,
    headingResolved,
    myCoords,
  };
}
