import React from 'react';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { CustomTabBar } from './CustomTabBar';

// Screens
import { HospitalDashboardTab } from '../screens/hospital/HospitalDashboardTab';
import { HospitalFleetScreen } from '../screens/hospital/HospitalFleetScreen';
import { HospitalSearchScreen } from '../screens/hospital/HospitalSearchScreen';
import { HospitalAdminScreen } from '../screens/hospital/HospitalAdminScreen';

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
          tabBarLabel: "Accueil",
          tabBarIcon: ({ color, size }) => <MaterialCommunityIcons name="view-dashboard-outline" color={color} size={size} /> 
        }} 
      />
      <HospitalTab.Screen 
        name="Flotte" 
        component={HospitalFleetScreen} 
        options={{ 
          tabBarIcon: ({ color, size }) => <MaterialCommunityIcons name="map-marker-path" color={color} size={size} /> 
        }} 
      />
      <HospitalTab.Screen 
        name="Recherche" 
        component={HospitalSearchScreen} 
        options={{ 
          tabBarIcon: ({ color, size }) => <MaterialCommunityIcons name="magnify" color={color} size={size} /> 
        }} 
      />
      <HospitalTab.Screen 
        name="Administration" 
        component={HospitalAdminScreen} 
        options={{ 
          tabBarLabel: "Plus",
          tabBarIcon: ({ color, size }) => <MaterialCommunityIcons name="menu" color={color} size={size} /> 
        }} 
      />
    </HospitalTab.Navigator>
  );
}
