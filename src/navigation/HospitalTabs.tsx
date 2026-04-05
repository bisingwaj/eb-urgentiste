import React from 'react';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { CustomTabBar } from './CustomTabBar';

// Screens
import { HospitalDashboardTab } from '../screens/hospital/HospitalDashboardTab';
import { HospitalProfileTab } from '../screens/hospital/HospitalProfileTab';
import { HospitalSettingsScreen } from '../screens/hospital/HospitalSettingsScreen';
import { HospitalAdmissionsListScreen } from '../screens/hospital/HospitalAdmissionsListScreen';

const HospitalTab = createBottomTabNavigator();

export function HospitalTabs() {
  return (
    <HospitalTab.Navigator
      tabBar={(props) => <CustomTabBar {...props} />}
      screenOptions={{
        headerShown: false,
      }}
    >
      <HospitalTab.Screen 
        name="Urgences" 
        component={HospitalDashboardTab} 
        options={{ 
          tabBarIcon: ({ color, size }) => <MaterialCommunityIcons name="alert-decagram-outline" color={color} size={size} /> 
        }} 
      />
      <HospitalTab.Screen 
        name="Admissions" 
        component={HospitalAdmissionsListScreen} 
        options={{ 
          tabBarIcon: ({ color, size }) => <MaterialCommunityIcons name="clipboard-list-outline" color={color} size={size} /> 
        }} 
      />
      <HospitalTab.Screen 
        name="Paramètres" 
        component={HospitalSettingsScreen} 
        options={{ 
          tabBarIcon: ({ color, size }) => <MaterialCommunityIcons name="dots-horizontal-circle-outline" color={color} size={size} />,
          tabBarLabel: "Plus"
        }} 
      />
      <HospitalTab.Screen 
        name="ProfilHopital" 
        component={HospitalProfileTab} 
        options={{ 
          tabBarIcon: ({ color, size }) => <MaterialCommunityIcons name="account-circle-outline" color={color} size={size} /> 
        }} 
      />
    </HospitalTab.Navigator>
  );
}
