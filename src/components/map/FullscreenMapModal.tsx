import React from 'react';
import {
  Modal,
  View,
  StyleSheet,
  StatusBar,
  Platform
} from 'react-native';
import { AppTouchableOpacity } from '../ui/AppTouchableOpacity';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Mapbox from '@rnmapbox/maps';
import { MaterialIcons } from '@expo/vector-icons';
import { MapboxMapView } from './MapboxMapView';

type FullscreenMapModalProps = {
  visible: boolean;
  onClose: () => void;
  /** Contenu Mapbox à l’intérieur de MapView (Camera, annotations, layers). */
  children: React.ReactNode;
  /** Pastilles / bandeau au-dessus de la carte (distance, statut GPS, etc.). */
  topOverlay?: React.ReactNode;
};

/**
 * Carte Mapbox en plein écran (2ᵉ instance Mapbox — même logique de données que l’écran parent).
 */
export function FullscreenMapModal({ visible, onClose, children, topOverlay }: FullscreenMapModalProps) {
  const insets = useSafeAreaInsets();

  if (!visible) return null;

  return (
    <Modal
      visible={visible}
      animationType="fade"
      presentationStyle="fullScreen"
      onRequestClose={onClose}
      statusBarTranslucent={false}
    >
      <StatusBar barStyle="dark-content" backgroundColor="#FFF" />
      <View style={[styles.root, { paddingTop: insets.top, paddingBottom: insets.bottom }]}>
        {children}

        {topOverlay != null ? (
          <View style={[styles.topOverlayWrap, { paddingTop: 52 }]} pointerEvents="box-none">
            {topOverlay}
          </View>
        ) : null}

        <AppTouchableOpacity
          style={[styles.closeBtn, { top: 55, left: 16 }]}
          onPress={onClose}
          accessibilityRole="button"
          accessibilityLabel="Fermer la carte plein écran"
        >
          <MaterialIcons name="arrow-back" color="#FFF" size={26} />
        </AppTouchableOpacity>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: '#000',
  },
  map: {
    flex: 1,
  },
  closeBtn: {
    position: 'absolute',
    top: 40,
    left: 16,
    zIndex: 999,
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOpacity: 0.3,
    shadowRadius: 5,
    elevation: 10,
  },
  topOverlayWrap: {
    position: 'absolute',
    left: 0,
    right: 56,
    zIndex: 20,
  },
});
