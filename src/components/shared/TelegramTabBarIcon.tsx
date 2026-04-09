import React from 'react';
import { View, Text, StyleSheet } from 'react-native';

interface TabIconProps {
  focused: boolean;
  label: string;
  Icon: React.ComponentType<{ size?: number; color?: string }>;
}

export const TelegramTabBarIcon = ({ focused, label, Icon }: TabIconProps) => {
  return (
    <View style={styles.container}>
      <Icon
        size={24}
        color={focused ? '#00D4AA' : 'rgba(255,255,255,0.5)'}
      />
      <Text style={[styles.label, focused && styles.labelActive]}>
        {label}
      </Text>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingTop: 6,
  },
  label: {
    color: 'rgba(255,255,255,0.5)',
    fontSize: 12,
    fontWeight: '500',
    marginTop: 4,
  },
  labelActive: {
    color: '#00D4AA',
    fontWeight: '600',
  },
});
