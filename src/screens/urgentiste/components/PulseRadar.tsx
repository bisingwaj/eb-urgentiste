import React, { useEffect, useRef } from 'react';
import { View, Animated, StyleSheet } from 'react-native';
import { MaterialCommunityIcons, MaterialIcons } from '@expo/vector-icons';
import { colors } from '../../../theme/colors';

interface PulseRadarProps {
  isActive: boolean;
  isConnected?: boolean;
}

export const PulseRadar = ({ isActive, isConnected = true }: PulseRadarProps) => {
  const scale = useRef(new Animated.Value(1)).current;
  const opacity = useRef(new Animated.Value(0.8)).current;

  useEffect(() => {
    if (isActive && isConnected) {
      Animated.loop(
        Animated.parallel([
          Animated.timing(scale, {
            toValue: 2.2,
            duration: 2000,
            useNativeDriver: true,
          }),
          Animated.timing(opacity, {
            toValue: 0,
            duration: 2000,
            useNativeDriver: true,
          }),
        ])
      ).start();
    } else {
      scale.stopAnimation();
      opacity.stopAnimation();
      scale.setValue(1);
      if (isActive && !isConnected) {
        opacity.setValue(0.3);
      } else {
        opacity.setValue(0);
      }
    }
  }, [isActive, isConnected, scale, opacity]);

  const getRadarColor = () => {
    if (!isConnected) return '#FB8C00';
    return isActive ? colors.success : colors.textMuted;
  };

  const getIcon = () => {
    if (!isConnected) return <MaterialCommunityIcons name="cloud-off-outline" size={56} color="#FFF" />;
    return isActive ? (
      <MaterialCommunityIcons name="radar" size={64} color="#FFF" />
    ) : (
      <MaterialIcons name="portable-wifi-off" size={56} color="#FFF" />
    );
  };

  return (
    <View style={styles.radarContainer}>
      {isActive && isConnected && (
        <Animated.View style={[styles.radarWave, { transform: [{ scale }], opacity }]} />
      )}
      <View style={[styles.radarCore, { backgroundColor: getRadarColor() }]}>
        {getIcon()}
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  radarContainer: {
    width: 220,
    height: 220,
    justifyContent: 'center',
    alignItems: 'center',
    // Removed marginBottom to let the flex: 1 center it perfectly in the available space
  },
  radarWave: {
    position: 'absolute',
    width: 200,
    height: 200,
    borderRadius: 100,
    backgroundColor: colors.success,
  },
  radarCore: {
    width: 120,
    height: 120,
    borderRadius: 60,
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.4,
    shadowRadius: 12,
    elevation: 12,
    borderWidth: 6,
    borderColor: 'rgba(255,255,255,0.1)',
  },
});
