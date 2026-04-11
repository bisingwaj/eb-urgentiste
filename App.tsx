import React, { useEffect } from 'react';
import { useFonts } from 'expo-font';
import * as SystemUI from 'expo-system-ui';
import { NavigationContainer, DarkTheme } from '@react-navigation/native';
import { navigationRef } from './src/navigation/navigationRef';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { StatusBar, View, Text, ScrollView, Appearance } from 'react-native';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import Mapbox from '@rnmapbox/maps';

const mapboxToken = process.env.EXPO_PUBLIC_MAPBOX_TOKEN?.trim();
if (mapboxToken) {
  Mapbox.setAccessToken(mapboxToken);
}

import { colors } from './src/theme/colors';
import { applyMarianneDefaultTextStyle, fonts as marianneFonts } from './src/theme/fonts';
import { isSupabaseConfigured } from './src/lib/supabase';
import { AuthProvider, useAuth } from './src/contexts/AuthContext';
import { AppLockProvider } from './src/contexts/AppLockContext';
import { MissionProvider } from './src/contexts/MissionContext';
import { HospitalProvider } from './src/contexts/HospitalContext';
import { CallSessionProvider } from './src/contexts/CallSessionContext';
import { GlobalAlert } from './src/components/shared/GlobalAlert';
import { AlertAlarmManager } from './src/components/alerts/AlertAlarmManager';
import { HospitalAlertManager } from './src/components/alerts/HospitalAlertManager';
import { BrandedSplashScreen } from './src/components/splash/BrandedSplashScreen';
import { ForegroundSync } from './src/components/sync/ForegroundSync';

// Shared entry screens
import { LoginPage } from './src/screens/LoginPage';
import { RoleSelectionScreen } from './src/screens/RoleSelectionScreen';
// Navigators
import { HospitalTabs } from './src/navigation/HospitalTabs';
import { MainTabs } from './src/navigation/MainTabs';

// Hospital Screens
import { HospitalUrgencyDetailScreen } from './src/screens/hospital/HospitalUrgencyDetailScreen';
import { HospitalCaseDetailScreen } from './src/screens/hospital/HospitalCaseDetailScreen';
import { HospitalAdmissionScreen } from './src/screens/hospital/HospitalAdmissionScreen';
import { HospitalTriageScreen } from './src/screens/hospital/HospitalTriageScreen';
import { HospitalPriseEnChargeScreen } from './src/screens/hospital/HospitalPriseEnChargeScreen';
import { HospitalMonitoringScreen } from './src/screens/hospital/HospitalMonitoringScreen';
import { HospitalClosureScreen } from './src/screens/hospital/HospitalClosureScreen';
import { HospitalReportScreen } from './src/screens/hospital/HospitalReportScreen';
import { HospitalIssuesScreen } from './src/screens/hospital/HospitalIssuesScreen';
import { HospitalHistoryScreen } from './src/screens/hospital/HospitalHistoryScreen';
import { HospitalStatsScreen } from './src/screens/hospital/HospitalStatsScreen';
import { HospitalSettingsScreen } from './src/screens/hospital/HospitalSettingsScreen';
import { HospitalAdmissionsListScreen } from './src/screens/hospital/HospitalAdmissionsListScreen';

// Urgentiste Screens
import { CallCenterScreen } from './src/screens/urgentiste/CallCenterScreen';
import { CallHistoryCallsScreen } from './src/screens/urgentiste/CallHistoryCallsScreen';
import { IncomingCallSubscriber } from './src/components/calls/IncomingCallSubscriber';
import { IncomingCallNotificationHandler } from './src/components/calls/IncomingCallNotificationHandler';
import { usePushTokenRegistration } from './src/hooks/usePushTokenRegistration';
import { FloatingCallBar } from './src/components/calls/FloatingCallBar';
import { SignalementScreen } from './src/screens/urgentiste/SignalementScreen';
import { ProtocolesScreen } from './src/screens/urgentiste/ProtocolesScreen';
import { SignalerProblemeScreen } from './src/screens/urgentiste/SignalerProblemeScreen';
import { MissionActiveScreen } from './src/screens/urgentiste/MissionActiveScreen';
import { MissionDetailScreen } from './src/screens/urgentiste/MissionDetailScreen';
import { NotificationsScreen } from './src/screens/urgentiste/NotificationsScreen';
import { SignalementHubScreen } from './src/screens/urgentiste/SignalementHubScreen';
import { SuiviSignalementsScreen } from './src/screens/urgentiste/SuiviSignalementsScreen';
import { SignalementDetailScreen } from './src/screens/urgentiste/SignalementDetailScreen';

const Stack = createNativeStackNavigator();

const navTheme = {
  ...DarkTheme,
  colors: {
    ...DarkTheme.colors,
    background: colors.mainBackground,
    primary: colors.secondary,
    card: '#161616',
    text: '#FFF',
    border: 'transparent',
    notification: colors.primary,
  },
  fonts: {
    regular: { fontFamily: marianneFonts.regular, fontWeight: '400' as const },
    medium: { fontFamily: marianneFonts.medium, fontWeight: '500' as const },
    bold: { fontFamily: marianneFonts.bold, fontWeight: '600' as const },
    heavy: { fontFamily: marianneFonts.bold, fontWeight: '700' as const },
  },
};

/** Build sans variables Supabase (souvent APK EAS sans secrets) : message clair au lieu d’un crash silencieux. */
function ConfigErrorScreen() {
  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: '#050505' }} edges={['top', 'bottom', 'left', 'right']}>
      <View style={{ flex: 1, padding: 24, justifyContent: 'center' }}>
      <ScrollView contentContainerStyle={{ paddingBottom: 32 }}>
        <Text style={{ color: '#fff', fontSize: 20, fontWeight: '600', marginBottom: 12 }}>
          Configuration manquante
        </Text>
        <Text style={{ color: '#ccc', fontSize: 15, lineHeight: 22 }}>
          L’application a été compilée sans les variables{' '}
          <Text style={{ color: colors.secondary }}>EXPO_PUBLIC_SUPABASE_URL</Text> et{' '}
          <Text style={{ color: colors.secondary }}>EXPO_PUBLIC_SUPABASE_ANON_KEY</Text>.
          {'\n\n'}
          Pour un APK de test (EAS Build), ajoutez ces variables dans le tableau de bord Expo : projet →
          Environment variables (profil preview / production), puis relancez le build.
          {'\n\n'}
          En local, renseignez-les dans <Text style={{ color: colors.secondary }}>.local.env</Text> (voir{' '}
          <Text style={{ color: colors.secondary }}>.local.env.example</Text>).
        </Text>
      </ScrollView>
      </View>
    </SafeAreaView>
  );
}

// Écran de chargement (polices / session) — identité Étoile Bleue
function LoadingScreen() {
  return <BrandedSplashScreen showSpinner />;
}

/** Enregistre le token FCM natif pour `send-call-push` (Edge Supabase). */
function PushTokenRegistration() {
  const { isAuthenticated, session } = useAuth();
  usePushTokenRegistration(isAuthenticated && !!session?.user?.id, session?.user?.id);
  return null;
}

// Navigation interne basée sur l'état d'auth
function RootNavigator() {
  const { isLoading, isAuthenticated, profile } = useAuth();

  console.log('[App] RootNavigator render, state:', { isLoading, isAuthenticated, hasProfile: !!profile });

  if (isLoading) {
    return <LoadingScreen />;
  }

  // Profil en cours de chargement après login
  if (isAuthenticated && !profile) {
    console.log('[App] Authenticated but no profile yet -> LoadingScreen');
    return <LoadingScreen />;
  }

  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      {!isAuthenticated ? (
        // ── Non authentifié ── Écrans de login
        <>
          <Stack.Screen name="RoleSelection" component={RoleSelectionScreen} />
          <Stack.Screen name="Login" component={LoginPage} />
        </>
      ) : (
        // ── Authentifié ── Écrans principaux (auth ID + PIN uniquement, pas d’écran mot de passe obligatoire)
        <>
          {/* Écran initial basé sur le rôle */}
          {profile?.role === 'hopital' ? (
            <Stack.Screen name="HospitalTabs" component={HospitalTabs} />
          ) : (
            <Stack.Screen name="MainTabs" component={MainTabs} />
          )}

          {/* Hospital Stack */}
          <Stack.Screen name="HospitalCaseDetail" component={HospitalCaseDetailScreen} />
          <Stack.Screen name="HospitalAdmission" component={HospitalAdmissionScreen} />
          <Stack.Screen name="HospitalTriage" component={HospitalTriageScreen} />
          <Stack.Screen name="HospitalPriseEnCharge" component={HospitalPriseEnChargeScreen} />
          <Stack.Screen name="HospitalMonitoring" component={HospitalMonitoringScreen} />
          <Stack.Screen name="HospitalClosure" component={HospitalClosureScreen} />
          <Stack.Screen name="HospitalReport" component={HospitalReportScreen} />
          <Stack.Screen name="HospitalIssues" component={HospitalIssuesScreen} />
          <Stack.Screen name="HospitalHistory" component={HospitalHistoryScreen} />
          <Stack.Screen name="HospitalStats" component={HospitalStatsScreen} />
          <Stack.Screen name="HospitalSettings" component={HospitalSettingsScreen} />
          <Stack.Screen name="HospitalAdmissionsList" component={HospitalAdmissionsListScreen} />
          <Stack.Screen name="HospitalUrgencyDetail" component={HospitalUrgencyDetailScreen} />

          {/* Urgentiste Stack */}
          <Stack.Screen
            name="CallCenter"
            component={CallCenterScreen}
            options={{ gestureEnabled: false, animation: 'slide_from_bottom' }}
          />
          <Stack.Screen name="CallHistoryCalls" component={CallHistoryCallsScreen} />
          <Stack.Screen name="Signalement" component={SignalementScreen} />
          <Stack.Screen name="Protocoles" component={ProtocolesScreen} />
          <Stack.Screen name="SignalerProbleme" component={SignalerProblemeScreen} />
          <Stack.Screen name="SignalementHub" component={SignalementHubScreen} />
          <Stack.Screen name="SuiviSignalements" component={SuiviSignalementsScreen} />
          <Stack.Screen name="SignalementDetail" component={SignalementDetailScreen} />
          <Stack.Screen name="MissionActive" component={MissionActiveScreen} />
          <Stack.Screen name="MissionDetail" component={MissionDetailScreen} />
          <Stack.Screen name="Notifications" component={NotificationsScreen} />
        </>
      )}
    </Stack.Navigator>
  );
}

export default function App() {
  const [fontsLoaded] = useFonts({
    'Marianne-Regular': require('./assets/fonts/Marianne-Regular.otf'),
    'Marianne-Medium': require('./assets/fonts/Marianne-Medium.otf'),
    'Marianne-Bold': require('./assets/fonts/Marianne-Bold.otf'),
    'Marianne-Light': require('./assets/fonts/Marianne-Light.otf'),
  });

  useEffect(() => {
    /** Toujours sombre : barres système / contrôles comme en mode dark, même si le téléphone est en mode clair. */
    Appearance.setColorScheme('dark');
    void SystemUI.setBackgroundColorAsync('#000000');
  }, []);

  useEffect(() => {
    if (fontsLoaded) {
      applyMarianneDefaultTextStyle();
    }
  }, [fontsLoaded]);

  if (!fontsLoaded) {
    return (
      <SafeAreaProvider>
        <StatusBar barStyle="light-content" backgroundColor="#000000" />
        <LoadingScreen />
      </SafeAreaProvider>
    );
  }

  if (!isSupabaseConfigured()) {
    return (
      <SafeAreaProvider>
        <StatusBar barStyle="light-content" backgroundColor="#000000" />
        <ConfigErrorScreen />
      </SafeAreaProvider>
    );
  }

  return (
    <AuthProvider>
      <MissionProvider>
        <HospitalProvider>
          <AppLockProvider>
            <SafeAreaProvider>
              <StatusBar barStyle="light-content" backgroundColor="#000000" />
              <NavigationContainer ref={navigationRef} theme={navTheme}>
                <CallSessionProvider>
                  <PushTokenRegistration />
                  <ForegroundSync />
                  <RootNavigator />
                  <FloatingCallBar />
                  <IncomingCallSubscriber />
                  <IncomingCallNotificationHandler />
                  <GlobalAlert />
                  <AlertAlarmManager />
                  <HospitalAlertManager />
                </CallSessionProvider>
              </NavigationContainer>
            </SafeAreaProvider>
          </AppLockProvider>
        </HospitalProvider>
      </MissionProvider>
    </AuthProvider>
  );
}
