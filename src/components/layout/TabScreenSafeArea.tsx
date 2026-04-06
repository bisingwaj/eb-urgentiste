import React from 'react';
import { StyleSheet, ViewStyle } from 'react-native';
import { SafeAreaView, type Edge } from 'react-native-safe-area-context';
import { useTabScreenBottomPadding } from '../../navigation/tabBarLayout';

type Props = {
  children: React.ReactNode;
  style?: ViewStyle | ViewStyle[];
  edges?: Edge[];
};

/**
 * Écrans affichés sous la barre d’onglets flottante : réserve l’espace bas (navigation système + pill).
 */
export function TabScreenSafeArea({ children, style, edges = ['top', 'left', 'right'] }: Props) {
  const bottomPad = useTabScreenBottomPadding();
  return (
    <SafeAreaView style={[styles.flex, { paddingBottom: bottomPad }, style]} edges={edges}>
      {children}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
});
