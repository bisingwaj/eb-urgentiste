import React from 'react';
import { View, Text, StyleSheet, Animated, Pressable, Dimensions } from 'react-native';
import { colors } from '../../../theme/colors';

const { width } = Dimensions.get('window');

export type HospitalTab = 'requests' | 'en_route' | 'admissions';

interface TabConfig {
  id: HospitalTab;
  label: string;
}

interface DashboardSegmentedControlProps {
  activeTab: HospitalTab;
  onTabChange: (tab: HospitalTab) => void;
  counts: Record<HospitalTab, number>;
}

const TABS: TabConfig[] = [
  { id: 'requests', label: 'DEMANDES' },
  { id: 'en_route', label: 'EN ROUTE' },
  { id: 'admissions', label: 'ADMISSIONS' },
];

export const DashboardSegmentedControl: React.FC<DashboardSegmentedControlProps> = ({
  activeTab,
  onTabChange,
  counts,
}) => {
  return (
    <View style={styles.container}>
      {TABS.map((tab) => {
        const isActive = activeTab === tab.id;
        const count = counts[tab.id] || 0;

        return (
          <Pressable
            key={tab.id}
            style={[
              styles.tab,
              isActive && styles.activeTab
            ]}
            onPress={() => onTabChange(tab.id)}
          >
            <View style={styles.tabContent}>
              <Text style={[
                styles.tabLabel,
                isActive ? styles.activeLabel : styles.inactiveLabel
              ]}>
                {tab.label}
              </Text>
              
              {count > 0 && (
                <View style={[
                  styles.badge,
                  isActive ? styles.activeBadge : styles.inactiveBadge
                ]}>
                  <Text style={[
                    styles.badgeText,
                    isActive ? styles.activeBadgeText : styles.inactiveBadgeText
                  ]}>
                    {count}
                  </Text>
                </View>
              )}
            </View>
            
            {isActive && <View style={styles.activeIndicator} />}
          </Pressable>
        );
      })}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    backgroundColor: 'rgba(255,255,255,0.03)',
    borderRadius: 14,
    padding: 2,
    marginTop: 16,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.05)',
  },
  tab: {
    flex: 1,
    height: 44,
    justifyContent: 'center',
    alignItems: 'center',
    borderRadius: 12,
    position: 'relative',
  },
  activeTab: {
    backgroundColor: 'rgba(255,255,255,0.05)',
  },
  tabContent: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  tabLabel: {
    fontSize: 10,
    fontWeight: '900',
    letterSpacing: 0.5,
  },
  activeLabel: {
    color: '#FFF',
  },
  inactiveLabel: {
    color: 'rgba(255,255,255,0.3)',
  },
  activeIndicator: {
    position: 'absolute',
    bottom: 6,
    width: 4,
    height: 4,
    borderRadius: 2,
    backgroundColor: colors.secondary,
  },
  // Badge Styles
  badge: {
    minWidth: 18,
    height: 18,
    borderRadius: 9,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 4,
  },
  activeBadge: {
    backgroundColor: colors.secondary,
  },
  inactiveBadge: {
    backgroundColor: 'rgba(255,255,255,0.1)',
  },
  badgeText: {
    fontSize: 10,
    fontWeight: '900',
  },
  activeBadgeText: {
    color: '#000',
  },
  inactiveBadgeText: {
    color: 'rgba(255,255,255,0.4)',
  },
});
