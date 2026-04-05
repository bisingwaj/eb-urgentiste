import { useEffect, useRef } from 'react';
import * as Location from 'expo-location';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';

/**
 * Hook pour suivre et synchroniser la position GPS de l'urgentiste
 * avec les tables active_rescuers et units (flotte) dans Supabase.
 */
export function useLocationTracking() {
  const { profile, isAuthenticated } = useAuth();
  const subscriptionRef = useRef<Location.LocationSubscription | null>(null);

  const updateLocationInSupabase = async (location: Location.LocationObject) => {
    if (!profile?.auth_user_id) return;

    const { latitude, longitude, accuracy, heading, speed } = location.coords;
    const batteryLevel = 100; // Placeholder, peut être enrichi avec expo-battery

    try {
      // 1. Mise à jour de la table de tracking individuel (active_rescuers)
      const { error: rescuersError } = await supabase
        .from('active_rescuers')
        .upsert({
          user_id: profile.auth_user_id,
          lat: latitude,
          lng: longitude,
          accuracy,
          heading,
          speed,
          battery: batteryLevel,
          status: 'active',
          updated_at: new Date().toISOString(),
        }, { onConflict: 'user_id' });

      if (rescuersError) console.error('[Location] Error updating active_rescuers:', rescuersError.message);

      // 2. Mise à jour de l'unité assignée (Flotte / Fleet Management)
      if (profile.assigned_unit_id) {
        const { error: unitError } = await supabase
          .from('units')
          .update({
            location_lat: latitude,
            location_lng: longitude,
            last_location_update: new Date().toISOString(),
          })
          .eq('id', profile.assigned_unit_id);

        if (unitError) console.error('[Location] Error updating unit fleet:', unitError.message);
      }
    } catch (err) {
      console.error('[Location] Exception during sync:', err);
    }
  };

  useEffect(() => {
    let isMounted = true;

    async function startTracking() {
      if (!isAuthenticated || !profile) return;

      try {
        const { status } = await Location.requestForegroundPermissionsAsync();
        if (status !== 'granted') {
          console.warn('[Location] Permission refusée');
          return;
        }

        // Première position immédiate
        const initialLocation = await Location.getCurrentPositionAsync({
          accuracy: Location.Accuracy.Balanced,
        });
        
        console.log(`🚀 [DÉMARRAGE APP - POSITION URGENTISTE] : ${initialLocation.coords.latitude}, ${initialLocation.coords.longitude}`);
        
        if (isMounted) {
          updateLocationInSupabase(initialLocation);
        }

        // Suivi continu (toutes les 30 secondes ou 50 mètres)
        subscriptionRef.current = await Location.watchPositionAsync(
          {
            accuracy: Location.Accuracy.High,
            timeInterval: 30000,
            distanceInterval: 50,
          },
          (location: Location.LocationObject) => {
            if (isMounted) {
              updateLocationInSupabase(location);
            }
          }
        );
      } catch (err) {
        console.error('[Location] Error starting tracker:', err);
      }
    }

    startTracking();

    return () => {
      isMounted = false;
      if (subscriptionRef.current) {
        subscriptionRef.current.remove();
      }
    };
  }, [isAuthenticated, profile?.id]);

  return null;
}
