import React from 'react';
import { NavigationContainer, DarkTheme } from '@react-navigation/native';
import { navigationRef } from './src/navigation/navigationRef';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { StatusBar, ActivityIndicator, View, Text, ScrollView } from 'react-native';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import Mapbox from '@rnmapbox/maps';

const mapboxToken = process.env.EXPO_PUBLIC_MAPBOX_TOKEN?.trim();
if (mapboxToken) {
  Mapbox.setAccessToken(mapboxToken);
}

import { colors } from './src/theme/colors';
import { isSupabaseConfigured } from './src/lib/supabase';
import { AuthProvider, useAuth } from './src/contexts/AuthContext';
import { AppLockProvider } from './src/contexts/AppLockContext';
import { MissionProvider } from './src/contexts/MissionContext';
import { GlobalAlert } from './src/components/shared/GlobalAlert';

// Shared entry screens
import { LoginPage } from './src/screens/LoginPage';
import { RoleSelectionScreen } from './src/screens/RoleSelectionScreen';
import { ChangePasswordScreen } from './src/screens/ChangePasswordScreen';

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
import { HospitalSettingsScreen } from './src/screens/hospital/HospitalSettingsScreen';
import { HospitalAdmissionsListScreen } from './src/screens/hospital/HospitalAdmissionsListScreen';

// Urgentiste Screens
import { CallCenterScreen } from './src/screens/urgentiste/CallCenterScreen';
import { CallHistoryCallsScreen } from './src/screens/urgentiste/CallHistoryCallsScreen';
import { IncomingCallSubscriber } from './src/components/calls/IncomingCallSubscriber';
import { SignalementScreen } from './src/screens/urgentiste/SignalementScreen';
import { ProtocolesScreen } from './src/screens/urgentiste/ProtocolesScreen';
import { SignalerProblemeScreen } from './src/screens/urgentiste/SignalerProblemeScreen';
import { MissionActiveScreen } from './src/screens/urgentiste/MissionActiveScreen';
import { MissionDetailScreen } from './src/screens/urgentiste/MissionDetailScreen';
import { NotificationsScreen } from './src/screens/urgentiste/NotificationsScreen';

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

// Écran de chargement pendant la vérification de session
function LoadingScreen() {
  return (
    <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#050505' }}>
      <ActivityIndicator size="large" color={colors.secondary} />
    </View>
  );
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
      ) : profile?.must_change_password ? (
        // ── Authentifié mais doit changer le mot de passe
        <>
          <Stack.Screen name="ChangePassword" component={ChangePasswordScreen} />
        </>
      ) : (
        // ── Authentifié ── Écrans principaux
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
          <Stack.Screen name="HospitalSettings" component={HospitalSettingsScreen} />
          <Stack.Screen name="HospitalAdmissionsList" component={HospitalAdmissionsListScreen} />
          <Stack.Screen name="HospitalUrgencyDetail" component={HospitalUrgencyDetailScreen} />

          {/* Urgentiste Stack */}
          <Stack.Screen name="CallCenter" component={CallCenterScreen} />
          <Stack.Screen name="CallHistoryCalls" component={CallHistoryCallsScreen} />
          <Stack.Screen name="Signalement" component={SignalementScreen} />
          <Stack.Screen name="Protocoles" component={ProtocolesScreen} />
          <Stack.Screen name="SignalerProbleme" component={SignalerProblemeScreen} />
          <Stack.Screen name="MissionActive" component={MissionActiveScreen} />
          <Stack.Screen name="MissionDetail" component={MissionDetailScreen} />
          <Stack.Screen name="Notifications" component={NotificationsScreen} />
        </>
      )}
    </Stack.Navigator>
  );
}

export default function App() {
  if (!isSupabaseConfigured()) {
    return (
      <SafeAreaProvider>
        <StatusBar barStyle="light-content" backgroundColor={colors.mainBackground} />
        <ConfigErrorScreen />
      </SafeAreaProvider>
    );
  }

  return (
    <AuthProvider>
      <MissionProvider>
        <AppLockProvider>
          <SafeAreaProvider>
            <StatusBar barStyle="light-content" backgroundColor={colors.mainBackground} />
            <NavigationContainer ref={navigationRef} theme={navTheme}>
              <RootNavigator />
              <IncomingCallSubscriber />
              <GlobalAlert />
            </NavigationContainer>
          </SafeAreaProvider>
        </AppLockProvider>
      </MissionProvider>
    </AuthProvider>
  );
}
