import React from 'react';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { HomeIcon, MapGpsIcon, HistoryIcon, ProfileIcon } from '../components/icons/TabIcons';
import { CustomTabBar } from './CustomTabBar';

// Screens
import { HomeTab } from '../screens/urgentiste/HomeTab';
import { LiveMapTab } from '../screens/urgentiste/LiveMapTab';
import { HistoryTab } from '../screens/urgentiste/HistoryTab';
import { ProfileTab } from '../screens/urgentiste/ProfileTab';

const Tab = createBottomTabNavigator();

export function MainTabs() {
  return (
    <Tab.Navigator
      tabBar={(props) => <CustomTabBar {...props} />}
      screenOptions={{
        headerShown: false,
      }}
    >
      <Tab.Screen
        name="Accueil"
        component={HomeTab}
        options={{
          tabBarIcon: ({ color, size }) => (
            <HomeIcon color={color} size={size} />
          ),
        }}
      />
      <Tab.Screen
        name="Carte"
        component={LiveMapTab}
        options={{
          tabBarIcon: ({ color, size }) => (
            <MapGpsIcon color={color} size={size} />
          ),
        }}
      />
      <Tab.Screen
        name="Historique"
        component={HistoryTab}
        options={{
          tabBarIcon: ({ color, size }) => (
            <HistoryIcon color={color} size={size} />
          ),
        }}
      />
      <Tab.Screen
        name="Profil"
        component={ProfileTab}
        options={{
          tabBarIcon: ({ color, size }) => (
            <ProfileIcon color={color} size={size} />
          ),
        }}
      />
    </Tab.Navigator>
  );
}
