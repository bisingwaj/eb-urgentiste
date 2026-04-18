import React from 'react';
import {
  TouchableOpacity as RNTouchableOpacity,
  ActivityIndicator,
  View,
  type TouchableOpacityProps,
} from 'react-native';

interface AppTouchableOpacityProps extends TouchableOpacityProps {
  loading?: boolean;
}

const DEFAULT_ACTIVE_OPACITY = 0.96;

/**
 * Même API que Touchable RN, avec un activeOpacity par défaut moins agressif
 * et le support optionnel d'un état 'loading'.
 */
export function AppTouchableOpacity({
  activeOpacity = DEFAULT_ACTIVE_OPACITY,
  loading,
  disabled,
  children,
  style,
  ...rest
}: AppTouchableOpacityProps) {
  return (
    <RNTouchableOpacity 
      activeOpacity={activeOpacity} 
      disabled={disabled || loading} 
      style={style}
      {...rest}
    >
      {loading ? (
        <View style={{ flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center' }}>
          <ActivityIndicator size="small" color="#000" />
        </View>
      ) : (
        children
      )}
    </RNTouchableOpacity>
  );
}
