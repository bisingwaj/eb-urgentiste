import React, { useState } from 'react';
import { View, Text, StyleSheet, Switch, StatusBar } from 'react-native';
import { TabScreenSafeArea } from '../../components/layout/TabScreenSafeArea';
import { MaterialIcons, MaterialCommunityIcons } from '@expo/vector-icons';
import { colors } from '../../theme/colors';

export function RadarTab() {
  const [isDutyActive, setIsDutyActive] = useState(false);

  return (
    <TabScreenSafeArea style={styles.container}>
      <StatusBar barStyle="light-content" />
      
      {/* Harmonized Header */}
      <View style={styles.topHeader}>
        <View style={styles.headerRow}>
          <View>
             <Text style={styles.greetingText}>SYSTÈME TACTIQUE</Text>
             <Text style={styles.hospitalName}>Radar d'alerte</Text>
          </View>
        </View>
      </View>

      <View style={styles.content}>
        <View style={styles.spacer} />

        <View style={[
          styles.radarBox,
          { borderColor: isDutyActive ? colors.success + '30' : 'rgba(255, 255, 255, 0.05)' }
        ]}>
          <View style={[
            styles.iconContainer,
            { backgroundColor: isDutyActive ? colors.success + '10' : 'rgba(255, 255, 255, 0.03)' }
          ]}>
            <MaterialCommunityIcons
              name={isDutyActive ? "radar" : "antenna"}
              size={100}
              color={isDutyActive ? colors.success : colors.textMuted}
            />
          </View>
          <View style={[styles.glow, { backgroundColor: isDutyActive ? colors.success : 'transparent' }]} />
        </View>

        <Text style={[
          styles.statusText,
          { color: isDutyActive ? colors.success : colors.textMuted }
        ]}>
          {isDutyActive ? 'RADAR ACTIF' : 'SCANNER DÉSACTIVÉ'}
        </Text>

        <Text style={styles.descriptionText}>
          {isDutyActive
            ? 'Scan en cours... Votre position est transmise au centre de régulation en temps réel.'
            : "Connectez-vous pour apparaître sur la carte tactique et recevoir les missions prioritaires."}
        </Text>

        <View style={styles.spacer} />

        <View style={styles.switchBox}>
          <Switch
            value={isDutyActive}
            onValueChange={setIsDutyActive}
            trackColor={{ false: 'rgba(255, 255, 255, 0.05)', true: colors.success + '40' }}
            thumbColor={isDutyActive ? colors.success : colors.textMuted}
            style={{ transform: [{ scaleX: 1.4 }, { scaleY: 1.4 }] }}
          />
          <Text style={[styles.switchLabel, { color: isDutyActive ? colors.success : colors.textMuted }]}>
             {isDutyActive ? 'DÉCONNEXION' : 'PASSER EN LIGNE'}
          </Text>
        </View>
      </View>
    </TabScreenSafeArea>
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
    backgroundColor: "#0A0A0A" 
  },
  headerRow: { 
    flexDirection: "row", 
    justifyContent: "space-between", 
    alignItems: "center", 
  },
  greetingText: { 
    color: "rgba(255,255,255,0.4)", 
    fontSize: 12, 
    fontWeight: "800", 
    letterSpacing: 1.5, 
    textTransform: "uppercase" 
  },
  hospitalName: { 
    color: "#FFF", 
    fontSize: 24, 
    fontWeight: "700", 
    marginTop: 4 
  },
  content: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 40,
  },
  radarBox: {
    width: 240,
    height: 240,
    borderRadius: 120,
    borderWidth: 2,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 40,
  },
  iconContainer: {
    width: 200,
    height: 200,
    borderRadius: 100,
    justifyContent: 'center',
    alignItems: 'center',
  },
  glow: {
    position: 'absolute',
    width: 260,
    height: 260,
    borderRadius: 130,
    opacity: 0.05,
    zIndex: -1,
  },
  statusText: {
    fontSize: 24,
    fontWeight: '900',
    letterSpacing: 2.0,
    marginBottom: 20,
    textAlign: 'center',
  },
  descriptionText: {
    color: 'rgba(255, 255, 255, 0.4)',
    fontSize: 15,
    textAlign: 'center',
    lineHeight: 22,
    fontWeight: '500',
  },
  switchBox: {
    marginTop: 60,
    alignItems: 'center',
    gap: 20,
  },
  switchLabel: {
    fontSize: 12,
    fontWeight: '900',
    letterSpacing: 2,
  },
  spacer: {
    flex: 1,
  }
});
