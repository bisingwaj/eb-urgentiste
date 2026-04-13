import React from 'react';
import { View, Text, StyleSheet, Platform } from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { navigationRef } from '../../navigation/navigationRef';
import { colors } from '../../theme/colors';
import { useCallSession } from '../../contexts/CallSessionContext';
import { AppTouchableOpacity } from '../ui/AppTouchableOpacity';
import { TAB_BAR_FLOAT_GAP, FLOATING_TAB_BAR_HEIGHT } from '../../navigation/tabBarLayout';

export function FloatingCallBar() {
  const insets = useSafeAreaInsets();
  const { minimized } = useCallSession();

  if (!minimized) {
    return null;
  }

  const openCall = () => {
    if (navigationRef.isReady()) {
      navigationRef.navigate('CallCenter', { resume: true });
    }
  };

  const bottomOffset = insets.bottom + TAB_BAR_FLOAT_GAP + FLOATING_TAB_BAR_HEIGHT + 8;

  return (
    <View
      style={[
        styles.wrap,
        {
          bottom: bottomOffset,
        },
      ]}
      pointerEvents="box-none"
    >
      <AppTouchableOpacity style={styles.bar} onPress={openCall} activeOpacity={0.92} accessibilityLabel="Reprendre l’appel">
        <View style={styles.pulse} />
        <MaterialIcons name="phone-in-talk" size={22} color="#FFF" />
        <View style={styles.textCol}>
          <Text style={styles.title}>Appel en cours</Text>
          <Text style={styles.sub}>Centrale · Touchez pour revenir</Text>
        </View>
        <MaterialIcons name="keyboard-arrow-up" size={26} color="rgba(255,255,255,0.85)" />
      </AppTouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: 'center',
    zIndex: 50,
    elevation: Platform.OS === 'android' ? 50 : 0,
  },
  bar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: '#0D4A2B',
    paddingVertical: 14,
    paddingHorizontal: 18,
    borderRadius: 20,
    marginHorizontal: 16,
    maxWidth: 420,
    width: '100%',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.35,
    shadowRadius: 8,
  },
  pulse: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: colors.success,
  },
  textCol: {
    flex: 1,
  },
  title: {
    color: '#FFF',
    fontSize: 16,
    fontWeight: '800',
  },
  sub: {
    color: 'rgba(255,255,255,0.75)',
    fontSize: 12,
    marginTop: 2,
    fontWeight: '600',
  },
});
