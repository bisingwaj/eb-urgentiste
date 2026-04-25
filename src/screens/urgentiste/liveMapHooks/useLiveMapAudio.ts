import { useEffect, useCallback } from "react";
import * as Location from "expo-location";
import { speakFrench, stopSpeech } from "../../../lib/speechSafe";
import { haversineMeters } from "../../../lib/mapbox";
import type { RouteResult } from "../../../lib/mapbox";

export function useLiveMapAudio(
  autoTts: boolean,
  myLocation: Location.LocationObject | null,
  selectedRoute: RouteResult | null,
  ttsStepIndex: number,
  setTtsStepIndex: (idx: number) => void,
  lastAnnouncedStepRef: React.MutableRefObject<number>
) {
  useEffect(() => {
    if (!autoTts || !myLocation || !selectedRoute?.steps?.length) return;
    const user: [number, number] = [
      myLocation.coords.longitude,
      myLocation.coords.latitude,
    ];
    const steps = selectedRoute.steps;
    const nextIdx = lastAnnouncedStepRef.current + 1;
    if (nextIdx >= steps.length) return;
    const coord = steps[nextIdx].coordinate;
    if (!coord) {
      lastAnnouncedStepRef.current = nextIdx;
      return;
    }
    if (haversineMeters(user, coord) < 72) {
      speakFrench(steps[nextIdx].instruction);
      lastAnnouncedStepRef.current = nextIdx;
    }
  }, [myLocation, autoTts, selectedRoute, lastAnnouncedStepRef]);

  const speakTtsRepeat = useCallback(() => {
    if (!selectedRoute?.steps?.length) return;
    const i = Math.min(ttsStepIndex, selectedRoute.steps.length - 1);
    speakFrench(selectedRoute.steps[i].instruction);
  }, [selectedRoute, ttsStepIndex]);

  const speakTtsNext = useCallback(() => {
    if (!selectedRoute?.steps?.length) return;
    const n = Math.min(ttsStepIndex + 1, selectedRoute.steps.length - 1);
    setTtsStepIndex(n);
    speakFrench(selectedRoute.steps[n].instruction);
  }, [selectedRoute, ttsStepIndex, setTtsStepIndex]);

  return {
    speakTtsRepeat,
    speakTtsNext,
    stopSpeech
  };
}
