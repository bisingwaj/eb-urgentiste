import React, { useRef, useEffect } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, StatusBar, Animated, Dimensions } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { colors } from '../../theme/colors';
import { MaterialIcons } from '@expo/vector-icons';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

export function SignalementHubScreen({ navigation }: any) {
  const fadeCard1 = useRef(new Animated.Value(0)).current;
  const fadeCard2 = useRef(new Animated.Value(0)).current;
  const slideCard1 = useRef(new Animated.Value(30)).current;
  const slideCard2 = useRef(new Animated.Value(30)).current;

  useEffect(() => {
    Animated.stagger(120, [
      Animated.parallel([
        Animated.spring(fadeCard1, { toValue: 1, tension: 50, friction: 8, useNativeDriver: true }),
        Animated.spring(slideCard1, { toValue: 0, tension: 50, friction: 8, useNativeDriver: true }),
      ]),
      Animated.parallel([
        Animated.spring(fadeCard2, { toValue: 1, tension: 50, friction: 8, useNativeDriver: true }),
        Animated.spring(slideCard2, { toValue: 0, tension: 50, friction: 8, useNativeDriver: true }),
      ]),
    ]).start();
  }, []);

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      <StatusBar barStyle="light-content" />

      {/* Header */}
      <View style={styles.topHeader}>
        <View style={styles.headerRow}>
          <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
            <MaterialIcons name="arrow-back" color="#FFF" size={24} />
          </TouchableOpacity>
          <View style={{ flex: 1, paddingHorizontal: 15 }}>
            <Text style={styles.greetingText}>TERRAIN</Text>
            <Text style={styles.hospitalName}>Signalements</Text>
          </View>
          <View style={{ width: 44 }} />
        </View>
      </View>

      {/* Choix */}
      <View style={styles.cardsContainer}>
        {/* ── Card 1 : Nouveau signalement ── */}
        <Animated.View style={{ opacity: fadeCard1, transform: [{ translateY: slideCard1 }] }}>
          <TouchableOpacity
            style={styles.choiceCard}
            activeOpacity={0.8}
            onPress={() => navigation.navigate('SignalerProbleme')}
          >
            <View style={styles.choiceIconBox}>
              <View style={styles.choiceIconCircle}>
                <MaterialIcons name="add-circle-outline" color={colors.secondary} size={36} />
              </View>
            </View>
            <View style={styles.choiceTextCol}>
              <Text style={styles.choiceTitle}>Nouveau signalement</Text>
              <Text style={styles.choiceDesc}>
                Signalez un incident terrain : véhicule, matériel, réseau ou autre anomalie rencontrée.
              </Text>
            </View>
            <View style={styles.choiceArrow}>
              <MaterialIcons name="chevron-right" color="rgba(255,255,255,0.3)" size={28} />
            </View>
          </TouchableOpacity>
        </Animated.View>

        {/* ── Card 2 : Suivi des signalements ── */}
        <Animated.View style={{ opacity: fadeCard2, transform: [{ translateY: slideCard2 }] }}>
          <TouchableOpacity
            style={styles.choiceCard}
            activeOpacity={0.8}
            onPress={() => navigation.navigate('SuiviSignalements')}
          >
            <View style={styles.choiceIconBox}>
              <View style={[styles.choiceIconCircle, { backgroundColor: '#FF950010' }]}>
                <MaterialIcons name="fact-check" color="#FF9500" size={34} />
              </View>
            </View>
            <View style={styles.choiceTextCol}>
              <Text style={styles.choiceTitle}>Suivi des signalements</Text>
              <Text style={styles.choiceDesc}>
                Consultez l'état de vos rapports d'incidents envoyés : en cours, traité ou en attente.
              </Text>
            </View>
            <View style={styles.choiceArrow}>
              <MaterialIcons name="chevron-right" color="rgba(255,255,255,0.3)" size={28} />
            </View>
          </TouchableOpacity>
        </Animated.View>

        {/* Hint */}
        <View style={styles.hintBox}>
          <MaterialIcons name="info-outline" color="rgba(255,255,255,0.2)" size={18} />
          <Text style={styles.hintText}>
            Les signalements sont transmis en temps réel au département logistique de la centrale.
          </Text>
        </View>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.mainBackground },

  topHeader: {
    paddingHorizontal: 24,
    paddingTop: 16,
    paddingBottom: 24,
    borderBottomLeftRadius: 36,
    borderBottomRightRadius: 36,
    backgroundColor: '#0A0A0A',
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  backBtn: {
    width: 44,
    height: 44,
    borderRadius: 16,
    backgroundColor: '#1A1A1A',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
  },
  greetingText: {
    color: 'rgba(255,255,255,0.4)',
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 1.5,
    textTransform: 'uppercase',
  },
  hospitalName: {
    color: '#FFF',
    fontSize: 24,
    fontWeight: '700',
    marginTop: 4,
  },

  cardsContainer: {
    flex: 1,
    paddingHorizontal: 20,
    paddingTop: 30,
  },

  choiceCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#1A1A1A',
    borderRadius: 28,
    padding: 24,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.06)',
  },
  choiceIconBox: {
    marginRight: 18,
  },
  choiceIconCircle: {
    width: 64,
    height: 64,
    borderRadius: 22,
    backgroundColor: colors.secondary + '10',
    justifyContent: 'center',
    alignItems: 'center',
  },
  choiceTextCol: {
    flex: 1,
    marginRight: 8,
  },
  choiceTitle: {
    color: '#FFF',
    fontSize: 17,
    fontWeight: '800',
    marginBottom: 6,
  },
  choiceDesc: {
    color: 'rgba(255,255,255,0.45)',
    fontSize: 13,
    fontWeight: '500',
    lineHeight: 19,
  },
  choiceArrow: {
    width: 36,
    height: 36,
    borderRadius: 12,
    backgroundColor: 'rgba(255,255,255,0.04)',
    justifyContent: 'center',
    alignItems: 'center',
  },

  hintBox: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    paddingHorizontal: 16,
    marginTop: 20,
  },
  hintText: {
    flex: 1,
    color: 'rgba(255,255,255,0.2)',
    fontSize: 12,
    fontWeight: '600',
    lineHeight: 18,
  },
});
