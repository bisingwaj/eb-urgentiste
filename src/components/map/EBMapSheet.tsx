import React, { useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Animated,
  Dimensions,
  PanResponder,
  ScrollView,
} from 'react-native';
import { MaterialIcons, MaterialCommunityIcons, Feather } from '@expo/vector-icons';
import { AppTouchableOpacity } from '../ui/AppTouchableOpacity';
import { colors } from '../../theme/colors';

const { height: SCREEN_HEIGHT } = Dimensions.get('window');
const MIN_HEIGHT = 120;
const MID_HEIGHT = 380;
const MAX_HEIGHT = SCREEN_HEIGHT * 0.85;

interface EBMapSheetProps {
  title?: string;
  duration?: string;
  distance?: string;
  onStart?: () => void;
  onClose?: () => void;
  transportMode?: 'car' | 'transit' | 'walk';
  onTransportModeChange?: (mode: 'car' | 'transit' | 'walk') => void;
}

export function EBMapSheet({
  title = "Itinéraire",
  duration,
  distance,
  onStart,
  onClose,
  transportMode = 'car',
  onTransportModeChange,
}: EBMapSheetProps) {
  const translateY = useRef(new Animated.Value(SCREEN_HEIGHT)).current;
  const lastY = useRef(0);

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderMove: (_, gesture) => {
        const nextY = lastY.current + gesture.dy;
        if (nextY >= SCREEN_HEIGHT - MAX_HEIGHT && nextY <= SCREEN_HEIGHT - MIN_HEIGHT) {
          translateY.setValue(nextY);
        }
      },
      onPanResponderRelease: (_, gesture) => {
        const velocity = gesture.vy;
        const currentY = lastY.current + gesture.dy;

        let targetY = MID_HEIGHT;
        if (velocity > 0.5) {
          targetY = MIN_HEIGHT;
        } else if (velocity < -0.5) {
          targetY = MAX_HEIGHT;
        } else {
          // Snap based on position
          if (currentY < SCREEN_HEIGHT - MID_HEIGHT - 100) targetY = MAX_HEIGHT;
          else if (currentY > SCREEN_HEIGHT - MIN_HEIGHT - 100) targetY = MIN_HEIGHT;
          else targetY = MID_HEIGHT;
        }

        animateTo(targetY);
      },
    })
  ).current;

  const animateTo = (targetHeight: number) => {
    const targetY = SCREEN_HEIGHT - targetHeight;
    Animated.spring(translateY, {
      toValue: targetY,
      useNativeDriver: true,
      damping: 20,
      stiffness: 90,
    }).start(() => {
      lastY.current = targetY;
    });
  };

  useEffect(() => {
    animateTo(MID_HEIGHT);
  }, []);

  return (
    <Animated.View
      style={[
        styles.container,
        { transform: [{ translateY }] },
      ]}
    >
      {/* Handle */}
      <View {...panResponder.panHandlers} style={styles.handleContainer}>
        <View style={styles.handle} />
      </View>

      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.title}>{title}</Text>
        <View style={styles.headerActions}>
          <AppTouchableOpacity style={styles.iconBtn}>
            <MaterialIcons name="tune" size={20} color="#666" />
          </AppTouchableOpacity>
          <AppTouchableOpacity style={styles.iconBtn}>
            <MaterialIcons name="share" size={20} color="#666" />
          </AppTouchableOpacity>
          <AppTouchableOpacity style={[styles.iconBtn, styles.closeBtn]} onPress={onClose}>
            <MaterialIcons name="close" size={22} color="#666" />
          </AppTouchableOpacity>
        </View>
      </View>

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scrollBody}>
        {/* Transport Modes */}
        <View style={styles.modeTabs}>
          <ModeTab 
            icon="directions-car" 
            label={duration} 
            active={transportMode === 'car'} 
            onPress={() => onTransportModeChange?.('car')} 
          />
          <ModeTab 
            icon="train" 
            label="--" 
            active={transportMode === 'transit'} 
            onPress={() => onTransportModeChange?.('transit')} 
          />
          <ModeTab 
            icon="directions-walk" 
            label="1 hr 33" 
            active={transportMode === 'walk'} 
            onPress={() => onTransportModeChange?.('walk')} 
          />
        </View>

        <View style={styles.divider} />

        {/* Route Info */}
        <View style={styles.routeDetail}>
          <View style={styles.timeRow}>
            <Text style={styles.mainDuration}>{duration}</Text>
            <Text style={styles.mainDistance}>({distance})</Text>
          </View>
          <Text style={styles.routeReason}>Itinéraire le plus rapide actuellement, évite les embouteillages.</Text>
          <View style={styles.ecoRow}>
            <MaterialCommunityIcons name="leaf" size={14} color="#34A853" />
            <Text style={styles.ecoText}>Réduction de 4% de CO2</Text>
          </View>
        </View>

        {/* Action Buttons Carousel */}
        <ScrollView 
          horizontal 
          showsHorizontalScrollIndicator={false} 
          contentContainerStyle={styles.actionCarousel}
        >
          <AppTouchableOpacity style={styles.startBtn} onPress={onStart}>
            <Feather name="navigation" size={18} color="#FFF" style={{ marginRight: 8 }} />
            <Text style={styles.startBtnTxt}>Démarrer</Text>
          </AppTouchableOpacity>

          <ActionButton icon="add-location-alt" label="Ajouter arrêt" />
          <ActionButton icon="share" label="Partager" />
          <ActionButton icon="bookmark-border" label="Enregistrer" />
        </ScrollView>
      </ScrollView>
    </Animated.View>
  );
}

const ModeTab = ({ icon, label, active, onPress }: any) => (
  <AppTouchableOpacity 
    style={[styles.modeTab, active && styles.modeTabActive]} 
    onPress={onPress}
  >
    <MaterialIcons name={icon} size={22} color={active ? "#1A73E8" : "#5F6368"} />
    <Text style={[styles.modeLabel, active && styles.modeLabelActive]}>{label}</Text>
    {active && <View style={styles.activeIndicator} />}
  </AppTouchableOpacity>
);

const ActionButton = ({ icon, label }: any) => (
  <AppTouchableOpacity style={styles.actionBtn}>
    <MaterialIcons name={icon} size={20} color="#1A73E8" style={{ marginRight: 6 }} />
    <Text style={styles.actionBtnTxt}>{label}</Text>
  </AppTouchableOpacity>
);

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    shadowColor: '#000',
    shadowOpacity: 0.15,
    shadowRadius: 15,
    elevation: 20,
    paddingBottom: 20,
  },
  handleContainer: {
    width: '100%',
    paddingTop: 12,
    paddingBottom: 8,
    alignItems: 'center',
  },
  handle: {
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: '#E0E0E0',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 10,
  },
  title: {
    fontSize: 22,
    fontWeight: '500',
    color: '#202124',
  },
  headerActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  iconBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#F1F3F4',
    justifyContent: 'center',
    alignItems: 'center',
  },
  closeBtn: {
    marginLeft: 4,
  },
  scrollBody: {
    paddingTop: 10,
  },
  modeTabs: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    paddingHorizontal: 10,
    marginBottom: 0,
  },
  modeTab: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 12,
    gap: 4,
  },
  modeTabActive: {
    // borderBottomWidth: 2,
    // borderBottomColor: '#1A73E8',
  },
  activeIndicator: {
    position: 'absolute',
    bottom: 0,
    width: '40%',
    height: 3,
    backgroundColor: '#1A73E8',
    borderTopLeftRadius: 3,
    borderTopRightRadius: 3,
  },
  modeLabel: {
    fontSize: 13,
    color: '#5F6368',
  },
  modeLabelActive: {
    color: '#1A73E8',
    fontWeight: '500',
  },
  divider: {
    height: 1,
    backgroundColor: '#E8EAED',
    marginHorizontal: 0,
  },
  routeDetail: {
    padding: 20,
  },
  timeRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: 6,
    marginBottom: 4,
  },
  mainDuration: {
    fontSize: 20,
    fontWeight: '600',
    color: '#E67E22', // Orange for better visibility on white
  },
  mainDistance: {
    fontSize: 18,
    color: '#70757A',
  },
  routeReason: {
    fontSize: 14,
    color: '#70757A',
    marginBottom: 6,
  },
  ecoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  ecoText: {
    fontSize: 13,
    color: '#34A853',
  },
  actionCarousel: {
    paddingHorizontal: 20,
    paddingBottom: 20,
    gap: 10,
  },
  startBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#00796B',
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 24,
  },
  startBtnTxt: {
    color: '#FFF',
    fontSize: 15,
    fontWeight: '600',
  },
  actionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#E8F0FE',
    paddingHorizontal: 18,
    paddingVertical: 12,
    borderRadius: 24,
  },
  actionBtnTxt: {
    color: '#1A73E8',
    fontSize: 14,
    fontWeight: '500',
  },
});
