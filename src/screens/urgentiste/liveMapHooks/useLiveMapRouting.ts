import { useState, useMemo, useEffect, useRef } from "react";
import {
  getRouteWithAlternatives,
  pickBestRoute,
  type RouteResult,
  type RouteCriterion,
} from "../../../lib/mapbox";
import { incidentLngLat, type PoiSelection } from "./useLiveMapData";

export function useLiveMapRouting(
  gpsReady: boolean,
  myCoords: { latitude: number; longitude: number }
) {
  const [selection, setSelection] = useState<PoiSelection | null>(null);
  const [routeList, setRouteList] = useState<RouteResult[]>([]);
  const [selectedRouteIndex, setSelectedRouteIndex] = useState(0);
  const [routeCriterion, setRouteCriterion] = useState<RouteCriterion>("fastest");
  const [routeInfo, setRouteInfo] = useState<{
    distance: number;
    duration: number;
  } | null>(null);
  const [routeLoading, setRouteLoading] = useState(false);
  
  // States related to TTS guidance that must reset on route change
  const [ttsStepIndex, setTtsStepIndex] = useState(0);
  const [autoTts, setAutoTts] = useState(false);
  const lastAnnouncedStepRef = useRef(-1);

  const routeCriterionRef = useRef(routeCriterion);
  routeCriterionRef.current = routeCriterion;

  const destLngLat = useMemo((): [number, number] | null => {
    if (!selection) return null;
    if (selection.kind === "incident") {
      return incidentLngLat(selection.data);
    }
    if (selection.kind === "hospital") {
      const { lng, lat } = selection.data;
      if (lng == null || lat == null) return null;
      return [lng, lat];
    }
    return [selection.data.lng, selection.data.lat];
  }, [selection]);

  useEffect(() => {
    if (!selection || !gpsReady || !destLngLat) {
      setRouteList([]);
      setSelectedRouteIndex(0);
      setRouteInfo(null);
      setTtsStepIndex(0);
      lastAnnouncedStepRef.current = -1;
      return;
    }

    const origin: [number, number] = [myCoords.longitude, myCoords.latitude];
    let cancelled = false;
    setRouteLoading(true);

    (async () => {
      const result = await getRouteWithAlternatives(origin, destLngLat);
      if (cancelled) return;
      if (!result) {
        setRouteList([]);
        setRouteInfo(null);
        setRouteLoading(false);
        return;
      }
      const idx = pickBestRoute(result.routes, routeCriterionRef.current);
      setRouteList(result.routes);
      setSelectedRouteIndex(idx);
      setTtsStepIndex(0);
      lastAnnouncedStepRef.current = -1;
      setRouteLoading(false);
    })();

    return () => {
      cancelled = true;
    };
  }, [selection, destLngLat, myCoords.latitude, myCoords.longitude, gpsReady]);

  useEffect(() => {
    const r = routeList[selectedRouteIndex];
    if (!r) {
      setRouteInfo(null);
      return;
    }
    setRouteInfo({ distance: r.distance, duration: r.duration });
  }, [selectedRouteIndex, routeList]);

  useEffect(() => {
    setTtsStepIndex(0);
    lastAnnouncedStepRef.current = -1;
  }, [selectedRouteIndex, selection]);

  const selectedRoute = routeList[selectedRouteIndex] ?? null;

  return {
    selection,
    setSelection,
    routeList,
    setRouteList,
    selectedRouteIndex,
    setSelectedRouteIndex,
    routeCriterion,
    setRouteCriterion,
    routeInfo,
    setRouteInfo,
    routeLoading,
    selectedRoute,
    destLngLat,
    ttsStepIndex,
    setTtsStepIndex,
    autoTts,
    setAutoTts,
    lastAnnouncedStepRef
  };
}
