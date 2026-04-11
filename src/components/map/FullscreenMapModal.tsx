import React from 'react';
import {
  Modal,
  View,
  StyleSheet,
  TouchableOpacity,
  StatusBar,
  Platform,
} from 'react-native';
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

  return (
    <Modal
      visible={visible}
      animationType="fade"
      presentationStyle="fullScreen"
      onRequestClose={onClose}
      statusBarTranslucent={Platform.OS === 'android'}
    >
      <StatusBar barStyle="light-content" />
      <View style={styles.root}>
        <MapboxMapView style={styles.map} styleURL={Mapbox.StyleURL.Dark} compassEnabled={false} scaleBarEnabled={false}>
          {children}
        </MapboxMapView>

        {topOverlay != null ? (
          <View style={[styles.topOverlayWrap, { paddingTop: insets.top + 52 }]} pointerEvents="box-none">
            {topOverlay}
          </View>
        ) : null}

        <TouchableOpacity
          style={[styles.closeBtn, { top: insets.top + 10 }]}
          onPress={onClose}
          accessibilityRole="button"
          accessibilityLabel="Fermer la carte plein écran"
        >
          <MaterialIcons name="close" color="#FFF" size={26} />
        </TouchableOpacity>
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
    right: 12,
    zIndex: 30,
    width: 44,
    height: 44,
    borderRadius: 16,
    backgroundColor: 'rgba(0,0,0,0.55)',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
  },
  topOverlayWrap: {
    position: 'absolute',
    left: 0,
    right: 56,
    zIndex: 20,
  },
});
