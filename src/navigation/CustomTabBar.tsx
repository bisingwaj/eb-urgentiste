import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { BottomTabBarProps } from '@react-navigation/bottom-tabs';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors } from '../theme/colors';
import { TAB_BAR_FLOAT_GAP } from './tabBarLayout';
import { AppTouchableOpacity } from '../components/ui/AppTouchableOpacity';

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
              navigation.navigate(route.name);
            }
          };

          const onLongPress = () => {
            navigation.emit({
              type: 'tabLongPress',
              target: route.key,
            });
          };

          const activeColor = colors.secondary;
          const inactiveColor = 'rgba(255, 255, 255, 0.52)';
          const activeBg = 'rgba(255, 255, 255, 0.96)';

          return (
            <AppTouchableOpacity
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
              activeOpacity={1}
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
            </AppTouchableOpacity>
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
    backgroundColor: colors.secondary,
    borderRadius: 32,
    alignItems: 'center',
    paddingHorizontal: 8,
    justifyContent: 'space-between',
    borderWidth: 0,
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
