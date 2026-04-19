import React from 'react';
import {
  TouchableOpacity as RNTouchableOpacity,
  type TouchableOpacityProps,
} from 'react-native';

const DEFAULT_ACTIVE_OPACITY = 0.96;

/**
 * Même API que Touchable RN, avec un activeOpacity par défaut moins agressif
 * (évite l’effet « clignotement » du défaut 0.2).
 */
export function AppTouchableOpacity({
  activeOpacity = DEFAULT_ACTIVE_OPACITY,
  ...rest
}: TouchableOpacityProps) {
  return <RNTouchableOpacity activeOpacity={activeOpacity} {...rest} />;
}
