import React, { useEffect, useRef } from 'react';
import { View, Animated, StyleSheet } from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { colors } from '../../../theme/colors';

export const AlertPulseIcon = () => {
  const scale = useRef(new Animated.Value(1)).current;
  const opacity = useRef(new Animated.Value(0.6)).current;

  useEffect(() => {
    Animated.loop(
      Animated.parallel([
        Animated.timing(scale, { toValue: 2.2, duration: 2000, useNativeDriver: true }),
        Animated.timing(opacity, { toValue: 0, duration: 2000, useNativeDriver: true }),
      ])
    ).start();
  }, [scale, opacity]);

  return (
    <View style={styles.alertIconPulseContainer}>
      <Animated.View style={[styles.alertRadarWave, { transform: [{ scale }], opacity }]} />
      <MaterialIcons
        name="warning"
        size={46}
        color={colors.primary}
        style={{ marginTop: -5 }} // Nudge up for optical centering
      />
    </View>
  );
};

const styles = StyleSheet.create({
  alertIconPulseContainer: {
    width: 120,
    height: 120,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 20,
  },
  alertRadarWave: {
    position: 'absolute',
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: colors.primary,
  },
});
