import React, { useEffect, useRef } from 'react';
import { AppState, type AppStateStatus, DeviceEventEmitter } from 'react-native';
import { useAuth } from '../../contexts/AuthContext';
import { APP_FOREGROUND_SYNC } from '../../lib/syncEvents';

/**
 * Au retour au premier plan : profil + signal aux contextes (mission, hôpital, historique) pour sync silencieuse.
 */
export function ForegroundSync() {
  const { refreshProfile, isAuthenticated } = useAuth();
  const appState = useRef(AppState.currentState);

  useEffect(() => {
    const sub = AppState.addEventListener('change', (next: AppStateStatus) => {
      const wasBg = appState.current === 'background' || appState.current === 'inactive';
      if (wasBg && next === 'active' && isAuthenticated) {
        void refreshProfile();
        DeviceEventEmitter.emit(APP_FOREGROUND_SYNC);
      }
      appState.current = next;
    });
    return () => sub.remove();
  }, [refreshProfile, isAuthenticated]);

  return null;
}
