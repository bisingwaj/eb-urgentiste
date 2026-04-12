import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Platform, UIManager, LayoutAnimation } from 'react-native';
import { BottomTabBarProps } from '@react-navigation/bottom-tabs';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors } from '../theme/colors';
import { TAB_BAR_FLOAT_GAP } from './tabBarLayout';

if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

export function CustomTabBar({ state, descriptors, navigation }: BottomTabBarProps) {
  const insets = useSafeAreaInsets();

  const bottomOffset = insets.bottom + TAB_BAR_FLOAT_GAP;

  return (
    <View style={[styles.wrapper, { bottom: bottomOffset }]}>
      <View style={styles.container}>
        {state.routes.map((route, index) => {
          const { options } = descriptors[route.key];

          let label =
            options.tabBarLabel !== undefined
              ? options.tabBarLabel
              : options.title !== undefined
                ? options.title
                : route.name;

          if (route.name === 'ProfilHopital') label = 'Profil';

          const isFocused = state.index === index;

          const onPress = () => {
            const event = navigation.emit({
              type: 'tabPress',
              target: route.key,
              canPreventDefault: true,
            });

            if (!isFocused && !event.defaultPrevented) {
              const config = {
                duration: 250,
                update: { type: 'spring', springDamping: 0.7, property: 'scaleXY' },
                create: { type: 'linear', property: 'opacity' },
                delete: { type: 'linear', property: 'opacity' },
              } as const;
              LayoutAnimation.configureNext(config);
              navigation.navigate(route.name);
            }
          };

          const onLongPress = () => {
            navigation.emit({
              type: 'tabLongPress',
              target: route.key,
            });
          };

          const activeColor = '#FFFFFF';
          const inactiveColor = 'rgba(255, 255, 255, 0.4)';
          const activeBg = 'rgba(255, 255, 255, 0.12)';

          return (
            <TouchableOpacity
              key={route.key}
              accessibilityRole="button"
              accessibilityState={isFocused ? { selected: true } : {}}
              accessibilityLabel={options.tabBarAccessibilityLabel}
              testID={(options as any).tabBarTestID}
              onPress={onPress}
              onLongPress={onLongPress}
              style={[
                styles.tabItem,
                isFocused && [styles.tabItemFocused, { backgroundColor: activeBg }]
              ]}
              activeOpacity={0.8}
            >
              <View style={styles.iconContainer}>
                {options.tabBarIcon && options.tabBarIcon({
                  focused: isFocused,
                  color: isFocused ? activeColor : inactiveColor,
                  size: 24
                })}
              </View>

              {isFocused && (
                <Text
                  style={[styles.labelStyle, { color: activeColor }]}
                  numberOfLines={1}
                >
                  {label as string}
                </Text>
              )}
            </TouchableOpacity>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    position: 'absolute',
    left: 20,
    right: 20,
  },
  container: {
    flexDirection: 'row',
    height: 64,
    backgroundColor: 'rgba(15, 15, 15, 0.95)',
    borderRadius: 32,
    alignItems: 'center',
    paddingHorizontal: 8,
    justifyContent: 'space-between',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.08)',
  },
  tabItem: {
    height: 48,
    width: 48,
    justifyContent: 'center',
    alignItems: 'center',
    borderRadius: 24,
  },
  tabItemFocused: {
    flexDirection: 'row',
    width: 'auto',
    paddingHorizontal: 16,
    justifyContent: 'center',
  },
  iconContainer: {
    justifyContent: 'center',
    alignItems: 'center',
  },
  labelStyle: {
    marginLeft: 8,
    fontSize: 14,
    fontWeight: '700',
  },
});
