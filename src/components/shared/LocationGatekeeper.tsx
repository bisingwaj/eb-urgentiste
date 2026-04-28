import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Linking,
  Platform,
  BackHandler,
  ActivityIndicator,
  useWindowDimensions
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as Location from 'expo-location';
import { MaterialIcons, MaterialCommunityIcons } from '@expo/vector-icons';
import { colors } from '../../theme/colors';
import { AppTouchableOpacity } from '../ui/AppTouchableOpacity';

type PermissionStatus = 'checking' | 'granted' | 'denied' | 'disabled';

export function LocationGatekeeper({ children }: { children: React.ReactNode }) {
  const [status, setStatus] = useState<PermissionStatus>('checking');
  const { width } = useWindowDimensions();

  const checkPermission = async () => {
    try {
      // 1. Check if GPS service is physically enabled
      const isServiceEnabled = await Location.hasServicesEnabledAsync();
      if (!isServiceEnabled) {
        setStatus('disabled');
        return;
      }

      // 2. Check permission status
      const { status: foregroundStatus } = await Location.getForegroundPermissionsAsync();
      
      if (foregroundStatus === 'granted') {
        setStatus('granted');
      } else {
        // Request it once if we are in 'checking' or it was denied before
        const { status: requestStatus } = await Location.requestForegroundPermissionsAsync();
        setStatus(requestStatus === 'granted' ? 'granted' : 'denied');
      }
    } catch (error) {
      console.error('[LocationGatekeeper] Error checking permissions:', error);
      setStatus('denied');
    }
  };

  useEffect(() => {
    checkPermission();

    // Re-check when app comes back to foreground (if user went to settings)
    const subscription = Linking.addEventListener('url', checkPermission);
    
    // Also periodically check to be safe (fallback)
    const interval = setInterval(checkPermission, 3000);

    return () => {
      subscription.remove();
      clearInterval(interval);
    };
  }, []);

  if (status === 'granted') {
    return <>{children}</>;
  }

  if (status === 'checking') {
    return (
      <View style={styles.root}>
        <ActivityIndicator size="large" color={colors.secondary} />
      </View>
    );
  }

  const isGpsDisabled = status === 'disabled';

  return (
    <View style={styles.root}>
      <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
        <View style={styles.centerBlock}>
          <View style={[styles.iconContainer, isGpsDisabled && { backgroundColor: 'rgba(251, 140, 0, 0.1)' }]}>
            <MaterialIcons 
              name={isGpsDisabled ? "location-off" : "location-disabled"} 
              size={80} 
              color={isGpsDisabled ? "#FB8C00" : colors.primary} 
            />
          </View>
          
          <Text style={styles.title}>{isGpsDisabled ? "GPS Désactivé" : "Position requise"}</Text>
          <Text style={styles.description}>
            {isGpsDisabled 
              ? "Le service de localisation de votre téléphone est désactivé. Veuillez l'activer pour pouvoir utiliser l'application."
              : "L’accès à votre position GPS est indispensable pour localiser les incidents et assurer la sécurité des interventions en temps réel."
            }
          </Text>

          <AppTouchableOpacity 
            style={[styles.settingsBtn, isGpsDisabled && { backgroundColor: '#FB8C00' }]} 
            onPress={() => isGpsDisabled ? (Platform.OS === 'android' ? Linking.sendIntent('android.settings.LOCATION_SOURCE_SETTINGS') : Linking.openSettings()) : Linking.openSettings()}
          >
            <MaterialIcons name="settings" size={20} color="#FFF" />
            <Text style={styles.settingsBtnText}>
              {isGpsDisabled ? "ACTIVER LE GPS" : "OUVRIR LES RÉGLAGES"}
            </Text>
          </AppTouchableOpacity>

          {Platform.OS === 'android' && (
            <AppTouchableOpacity 
              style={styles.exitBtn} 
              onPress={() => BackHandler.exitApp()}
            >
              <Text style={styles.exitBtnText}>Quitter l'application</Text>
            </AppTouchableOpacity>
          )}
        </View>

        <View style={styles.footerBlock}>
          <Text style={styles.footerText}>
            Sans cette permission, ÉTOILE BLEUE URGENCE ne peut pas assurer le suivi tactique nécessaire aux missions d'urgence.
          </Text>
        </View>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: '#0D0D0D',
    justifyContent: 'center',
    alignItems: 'center',
  },
  safe: {
    flex: 1,
    width: '100%',
    paddingHorizontal: 28,
  },
  centerBlock: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  iconContainer: {
    width: 140,
    height: 140,
    borderRadius: 70,
    backgroundColor: 'rgba(255, 82, 82, 0.1)',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 32,
  },
  title: {
    color: '#FFFFFF',
    fontSize: 28,
    fontWeight: '800',
    marginBottom: 16,
    textAlign: 'center',
  },
  description: {
    color: 'rgba(255, 255, 255, 0.7)',
    fontSize: 16,
    lineHeight: 24,
    textAlign: 'center',
    marginBottom: 40,
  },
  settingsBtn: {
    backgroundColor: colors.secondary,
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 16,
    paddingHorizontal: 24,
    borderRadius: 16,
    gap: 10,
    width: '100%',
    justifyContent: 'center',
  },
  settingsBtnText: {
    color: '#FFF',
    fontSize: 15,
    fontWeight: '800',
    letterSpacing: 1,
  },
  exitBtn: {
    marginTop: 20,
    paddingVertical: 12,
  },
  exitBtnText: {
    color: 'rgba(255, 255, 255, 0.4)',
    fontSize: 14,
    fontWeight: '600',
    textDecorationLine: 'underline',
  },
  footerBlock: {
    paddingBottom: 20,
  },
  footerText: {
    color: 'rgba(255, 255, 255, 0.3)',
    fontSize: 12,
    lineHeight: 18,
    textAlign: 'center',
  },
});
