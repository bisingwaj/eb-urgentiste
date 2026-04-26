import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';
import { Alert, AppState, AppStateStatus } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  authenticateAsync,
  hasHardwareAsync,
  isEnrolledAsync,
  isLocalAuthNativeLinked,
} from '../lib/localAuthOptional';
import { useAuth } from './AuthContext';
import { AppLockOverlay } from '../components/security/AppLockOverlay';

const STORAGE_KEY = '@eb_urgence/app_lock_enabled';

function authErrorMessage(err?: string): string | null {
  if (!err || err === 'user_cancel' || err === 'system_cancel' || err === 'app_cancel') {
    return null;
  }
  const map: Record<string, string> = {
    not_enrolled: 'Aucune empreinte ou visage enregistré sur cet appareil.',
    not_available: 'Authentification indisponible pour le moment.',
    authentication_failed: 'Échec de la reconnaissance. réessayez.',
    lockout: 'Trop de tentatives. réessayez plus tard ou utilisez le code du téléphone.',
    passcode_not_set: 'Configurez un code de déverrouillage dans les réglages du téléphone.',
    unable_to_process: 'Impossible de lancer l’authentification. réessayez.',
    timeout: 'Délai dépassé. réessayez.',
  };
  return map[err] ?? `Impossible de déverrouiller (${err}). réessayez.`;
}

type AppLockContextValue = {
  appLockEnabled: boolean;
  isUnlocked: boolean;
  isReady: boolean;
  biometricAvailable: boolean;
  /** false si le binaire n’inclut pas le module natif (rebuild : npx expo run:android). */
  nativeModuleLinked: boolean;
  setAppLockEnabled: (enabled: boolean) => Promise<void>;
};

const AppLockContext = createContext<AppLockContextValue | null>(null);

export function useAppLock(): AppLockContextValue {
  const ctx = useContext(AppLockContext);
  if (!ctx) {
    throw new Error('useAppLock doit être utilisé dans un AppLockProvider');
  }
  return ctx;
}

export function AppLockProvider({ children }: { children: React.ReactNode }) {
  const { isAuthenticated, profile } = useAuth();
  const nativeModuleLinked = isLocalAuthNativeLinked();

  const [appLockEnabled, setAppLockEnabledState] = useState(false);
  const [isUnlocked, setIsUnlocked] = useState(true);
  const [isReady, setIsReady] = useState(false);
  const [biometricAvailable, setBiometricAvailable] = useState(false);

  const needsLock =
    nativeModuleLinked &&
    isAuthenticated &&
    !!profile &&
    appLockEnabled;

  useEffect(() => {
    (async () => {
      if (!nativeModuleLinked) {
        setBiometricAvailable(false);
        return;
      }
      const h = await hasHardwareAsync();
      const e = await isEnrolledAsync();
      setBiometricAvailable(h && e);
    })();
  }, [nativeModuleLinked]);

  useEffect(() => {
    (async () => {
      try {
        const v = await AsyncStorage.getItem(STORAGE_KEY);
        let enabled = v === 'true';
        if (enabled && !nativeModuleLinked) {
          await AsyncStorage.setItem(STORAGE_KEY, 'false');
          enabled = false;
        }
        setAppLockEnabledState(enabled);
        setIsUnlocked(!enabled);
      } finally {
        setIsReady(true);
      }
    })();
  }, [nativeModuleLinked]);

  /**
   * Verrouillage uniquement quand l’app passe en arrière-plan réel (`background`).
   * Ne pas utiliser `inactive` : sur iOS il se déclenche souvent (centre de contrôle,
   * notifications, modales système) sans quitter l’app → demandes biométriques répétées.
   */
  useEffect(() => {
    if (!appLockEnabled) {
      return;
    }
    const sub = AppState.addEventListener('change', (next: AppStateStatus) => {
      if (next === 'background') {
        setIsUnlocked(false);
      }
    });
    return () => sub.remove();
  }, [appLockEnabled]);

  const requestUnlock = useCallback(async () => {
    const result = await authenticateAsync({
      promptMessage: 'Déverrouiller l’application',
      promptSubtitle: 'EB-URGENCE',
      cancelLabel: 'Annuler',
      fallbackLabel: 'Code du téléphone',
      disableDeviceFallback: false,
    });
    if (result.success) {
      setIsUnlocked(true);
      return;
    }
    const msg = authErrorMessage(result.error);
    if (msg) {
      Alert.alert('Déverrouillage', msg);
    }
  }, []);

  const setAppLockEnabled = useCallback(async (enabled: boolean) => {
    if (!enabled) {
      await AsyncStorage.setItem(STORAGE_KEY, 'false');
      setAppLockEnabledState(false);
      setIsUnlocked(true);
      return;
    }

    if (!nativeModuleLinked) {
      Alert.alert(
        'Module biométrique manquant',
        'Recompilez l’application native pour inclure la biométrie : arrêtez Metro, puis exécutez npx expo run:android (ou prebuild puis run). Un simple rechargement JS ne suffit pas après l’ajout du package.'
      );
      return;
    }

    const hasHw = await hasHardwareAsync();
    const enrolled = await isEnrolledAsync();
    if (!hasHw || !enrolled) {
      Alert.alert(
        'Biométrie indisponible',
        'Aucune empreinte, visage ou code de sécurité n’est configuré sur cet appareil. Configurez le verrouillage dans les réglages du téléphone, puis réessayez.'
      );
      return;
    }

    const result = await authenticateAsync({
      promptMessage: 'Confirmer l’activation de la protection',
      promptSubtitle: 'EB-URGENCE',
      cancelLabel: 'Annuler',
      fallbackLabel: 'Code du téléphone',
      disableDeviceFallback: false,
    });

    if (!result.success) {
      const msg = authErrorMessage(result.error);
      if (msg) {
        Alert.alert('Activation', msg);
      }
      return;
    }

    await AsyncStorage.setItem(STORAGE_KEY, 'true');
    setAppLockEnabledState(true);
    setIsUnlocked(true);
  }, [nativeModuleLinked]);

  const value = useMemo(
    () => ({
      appLockEnabled,
      isUnlocked,
      isReady,
      biometricAvailable,
      nativeModuleLinked,
      setAppLockEnabled,
    }),
    [appLockEnabled, isUnlocked, isReady, biometricAvailable, nativeModuleLinked, setAppLockEnabled]
  );

  const showOverlay = isReady && needsLock && !isUnlocked;

  return (
    <AppLockContext.Provider value={value}>
      {children}
      {showOverlay ? <AppLockOverlay onUnlock={requestUnlock} /> : null}
    </AppLockContext.Provider>
  );
}
