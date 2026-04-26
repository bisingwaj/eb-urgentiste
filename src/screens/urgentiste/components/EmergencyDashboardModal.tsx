import React from 'react';
import { View, Text, StyleSheet, Modal, ScrollView, Animated, Dimensions } from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { AppTouchableOpacity } from '../../../components/ui/AppTouchableOpacity';
import { colors } from '../../../theme/colors';

const { width } = Dimensions.get('window');

interface EmergencyDashboardModalProps {
  hasActiveAlert: boolean;
  isModalMinimized: boolean;
  setIsModalMinimized: (val: boolean) => void;
  activeMission: any;
  getVictimMetadata: () => { age: any; gender: any; height: any };
  calculateDistance: () => string | null;
  setShowMapPreview: (val: boolean) => void;
  getMotifDAppel: () => string;
  capitalize: (str?: string) => string;
  handleConfirmPressIn: () => void;
  handleConfirmPressOut: () => void;
  confirmProgress: Animated.Value;
  handleRefusePressIn: () => void;
  handleRefusePressOut: () => void;
  refuseProgress: Animated.Value;
  navigation: any;
}

export function EmergencyDashboardModal({
  hasActiveAlert,
  isModalMinimized,
  setIsModalMinimized,
  activeMission,
  getVictimMetadata,
  calculateDistance,
  setShowMapPreview,
  getMotifDAppel,
  capitalize,
  handleConfirmPressIn,
  handleConfirmPressOut,
  confirmProgress,
  handleRefusePressIn,
  handleRefusePressOut,
  refuseProgress,
  navigation
}: EmergencyDashboardModalProps) {
  const metadata = getVictimMetadata();

  return (
    <Modal
      visible={hasActiveAlert && !isModalMinimized}
      animationType="fade"
      presentationStyle="overFullScreen"
      transparent={false}
    >
      <View style={styles.missionModalContainer}>
        <View style={styles.missionModalHeader}>
          <View style={styles.headerTopRow}>
            <View style={styles.refBadge}>
              <Text style={styles.refBadgeTxt}>REF: {activeMission?.reference || '---'}</Text>
            </View>
            <AppTouchableOpacity
              style={styles.minimizeBtnDashboard}
              onPress={() => setIsModalMinimized(true)}
            >
              <MaterialIcons name="keyboard-arrow-down" size={28} color="#FFF" />
            </AppTouchableOpacity>
          </View>

          <View style={styles.urgentHeaderRow}>
            <MaterialIcons name="warning" size={28} color={colors.primary} />
            <Text style={styles.urgentTitle}>MISSION ASSIGNÉE</Text>
          </View>
        </View>

        <ScrollView style={styles.dashboardScroll} showsVerticalScrollIndicator={false}>
          {/* CARD 1: WHO (Identity) */}
          <View style={styles.dashboardCard}>
            <View style={styles.cardHeaderRow}>
              <MaterialIcons name="person" size={20} color={colors.secondary} />
              <Text style={styles.cardLabel}>IDENTITÉ PATIENT</Text>
            </View>
            <Text style={styles.victimNamePrimary}>{capitalize(activeMission?.caller?.name)}</Text>

            {(metadata.age || metadata.gender || metadata.height) && (
              <View style={styles.victimMetaRow}>
                {metadata.age && (
                  <View style={styles.metaBadge}>
                    <Text style={styles.metaBadgeLbl}>ÂGE</Text>
                    <Text style={styles.metaBadgeVal}>{metadata.age}</Text>
                  </View>
                )}
                {metadata.gender && (
                  <View style={styles.metaBadge}>
                    <Text style={styles.metaBadgeLbl}>SEXE</Text>
                    <Text style={styles.metaBadgeVal}>{metadata.gender}</Text>
                  </View>
                )}
                {metadata.height && (
                  <View style={styles.metaBadge}>
                    <Text style={styles.metaBadgeLbl}>TAILLE</Text>
                    <Text style={styles.metaBadgeVal}>{metadata.height}</Text>
                  </View>
                )}
              </View>
            )}
          </View>

          {/* CARD 2: WHERE (Location) */}
          <View style={styles.dashboardCard}>
            <View style={styles.cardHeaderRow}>
              <MaterialIcons name="place" size={20} color={colors.secondary} />
              <Text style={styles.cardLabel}>LOCALISATION & NAVIGATION</Text>
            </View>
            <Text style={styles.locationAddrTxt}>{activeMission?.location?.address || 'Adresse non disponible'}</Text>

            <View style={styles.distRow}>
              <View style={styles.distInfo}>
                <Text style={styles.distVal}>{calculateDistance() || '---'}</Text>
                <Text style={styles.distUnit}>KM</Text>
              </View>
              <AppTouchableOpacity style={styles.mapPreviewBtn} onPress={() => setShowMapPreview(true)}>
                <MaterialIcons name="map" size={20} color="#FFF" />
                <Text style={styles.mapPreviewBtnTxt}>VOIR CARTE</Text>
              </AppTouchableOpacity>
            </View>
          </View>

          {/* CARD 3: WHY (Type & Symptoms) */}
          <View style={styles.dashboardCard}>
            <View style={styles.cardHeaderRow}>
              <MaterialIcons name="medical-services" size={18} color={colors.secondary} />
              <Text style={styles.cardLabel}>TYPE D'URGENCE & SYMPTÔMES</Text>
            </View>

            <Text style={[styles.incidentMotifTxtSmall, { color: colors.secondary, fontSize: 20, fontWeight: '900', marginBottom: 2 }]}>
              {getMotifDAppel()}
            </Text>

            <View style={styles.symptomsList}>
              {activeMission?.incident_notes && (
                <View style={[styles.symptomItem, { backgroundColor: 'rgba(52, 199, 89, 0.08)', borderRadius: 12, padding: 12, marginBottom: 12, borderWidth: 1, borderColor: 'rgba(52, 199, 89, 0.2)' }]}>
                  <Text style={[styles.symptomQuest, { color: colors.success, fontSize: 11 }]}>NOTES PRIORITAIRES CENTRALE :</Text>
                  <Text style={[styles.symptomAns, { color: '#FFF', fontSize: 15 }]}>{activeMission.incident_notes}</Text>
                </View>
              )}

              {activeMission?.sos_responses && activeMission.sos_responses.length > 0 ? (
                activeMission.sos_responses.map((resp: any, i: number) => (
                  <View key={i} style={[styles.symptomItem, { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', marginBottom: 4 }]}>
                    <Text style={[styles.symptomQuest, { marginBottom: 0, marginRight: 6 }]}>{resp.question_text || resp.question_key} :</Text>
                    <Text style={styles.symptomAns}>{resp.answer || '---'}</Text>
                  </View>
                ))
              ) : (
                !activeMission?.incident_notes && (
                  <Text style={styles.noSymptomsTxt}>Aucune donnée supplémentaire disponible.</Text>
                )
              )}

              {activeMission?.description && (
                <Text style={[styles.incidentDescTxt, { marginTop: 8 }]}>Commentaire Opérateur: {activeMission.description}</Text>
              )}
            </View>
          </View>
        </ScrollView>

        <View style={styles.missionModalFooter}>
          <View style={styles.emergencyActionsRow}>
            <Text style={styles.actionHintTextModal}>Maintenez appuyé pour confirmer</Text>
            
            <AppTouchableOpacity
              activeOpacity={1}
              style={styles.btnAcceptLong}
              onPressIn={handleConfirmPressIn}
              onPressOut={handleConfirmPressOut}
            >
              <Animated.View
                style={[
                  styles.confirmButtonProgress,
                  {
                    backgroundColor: colors.success,
                    transform: [
                      { translateX: - (width - 48) },
                      {
                        translateX: confirmProgress.interpolate({
                          inputRange: [0, 1],
                          outputRange: [0, width - 48]
                        })
                      }
                    ]
                  }
                ]}
              />
              <Text style={styles.btnAcceptTxt}>ACCEPTER LA MISSION</Text>
            </AppTouchableOpacity>

            <AppTouchableOpacity
              activeOpacity={1}
              style={styles.btnRefuseLong}
              onPressIn={handleRefusePressIn}
              onPressOut={handleRefusePressOut}
            >
              <Animated.View
                style={[
                  styles.confirmButtonProgress,
                  {
                    backgroundColor: colors.primary,
                    transform: [
                      { translateX: - (width - 48) },
                      {
                        translateX: refuseProgress.interpolate({
                          inputRange: [0, 1],
                          outputRange: [0, width - 48]
                        })
                      }
                    ]
                  }
                ]}
              />
              <Text style={styles.btnRefuseTxt}>REFUSER LA MISSION</Text>
            </AppTouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  missionModalContainer: {
    flex: 1,
    backgroundColor: '#050505',
    paddingTop: 50,
  },
  missionModalHeader: {
    paddingHorizontal: 24,
    paddingBottom: 20,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.05)',
  },
  headerTopRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  refBadge: {
    backgroundColor: 'rgba(255, 69, 58, 0.15)',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: 'rgba(255, 69, 58, 0.3)',
  },
  refBadgeTxt: {
    color: colors.primary,
    fontSize: 13,
    fontWeight: '800',
    letterSpacing: 1,
  },
  minimizeBtnDashboard: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(255,255,255,0.08)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  urgentHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  urgentTitle: {
    color: '#FFF',
    fontSize: 28,
    fontWeight: '900',
    marginLeft: 12,
    letterSpacing: -0.5,
  },
  dashboardScroll: {
    flex: 1,
    paddingHorizontal: 24,
    paddingTop: 24,
  },
  dashboardCard: {
    backgroundColor: 'rgba(255,255,255,0.03)',
    borderRadius: 16,
    padding: 20,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.05)',
  },
  cardHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  cardLabel: {
    color: colors.textMuted,
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 1.5,
    marginLeft: 8,
  },
  victimNamePrimary: {
    color: '#FFF',
    fontSize: 24,
    fontWeight: '800',
    marginBottom: 16,
  },
  victimMetaRow: {
    flexDirection: 'row',
    gap: 12,
  },
  metaBadge: {
    backgroundColor: 'rgba(255,255,255,0.06)',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
    flex: 1,
  },
  metaBadgeLbl: {
    color: 'rgba(255,255,255,0.4)',
    fontSize: 10,
    fontWeight: '800',
    marginBottom: 4,
  },
  metaBadgeVal: {
    color: '#FFF',
    fontSize: 16,
    fontWeight: '700',
  },
  locationAddrTxt: {
    color: '#FFF',
    fontSize: 16,
    fontWeight: '600',
    lineHeight: 24,
    marginBottom: 20,
  },
  distRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-end',
    borderTopWidth: 1,
    borderTopColor: 'rgba(255,255,255,0.1)',
    paddingTop: 16,
  },
  distInfo: {
    flexDirection: 'row',
    alignItems: 'baseline',
  },
  distVal: {
    color: colors.secondary,
    fontSize: 32,
    fontWeight: '900',
  },
  distUnit: {
    color: colors.secondary,
    fontSize: 16,
    fontWeight: '700',
    marginLeft: 4,
    opacity: 0.8,
  },
  mapPreviewBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(68, 138, 255, 0.15)', // secondary blue with opacity
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 24,
    borderWidth: 1,
    borderColor: 'rgba(68, 138, 255, 0.3)',
  },
  mapPreviewBtnTxt: {
    color: colors.secondary,
    fontSize: 14,
    fontWeight: '900',
    marginLeft: 8,
    letterSpacing: 0.5,
  },
  incidentMotifTxtSmall: {
    color: '#FFF',
    fontSize: 16,
    fontWeight: '800',
    marginBottom: 16,
  },
  symptomsList: {
    backgroundColor: 'rgba(0,0,0,0.2)',
    borderRadius: 12,
    padding: 16,
  },
  symptomItem: {
    marginBottom: 12,
  },
  symptomQuest: {
    color: 'rgba(255,255,255,0.5)',
    fontSize: 12,
    fontWeight: '600',
    marginBottom: 4,
  },
  symptomAns: {
    color: '#FFF',
    fontSize: 15,
    fontWeight: '500',
  },
  noSymptomsTxt: {
    color: 'rgba(255,255,255,0.4)',
    fontSize: 14,
    fontStyle: 'italic',
  },
  incidentDescTxt: {
    color: 'rgba(255,255,255,0.8)',
    fontSize: 14,
    lineHeight: 20,
    marginTop: 8,
  },
  missionModalFooter: {
    paddingHorizontal: 24,
    paddingTop: 12,
    paddingBottom: 32,
    backgroundColor: '#050505',
    borderTopWidth: 1,
    borderTopColor: 'rgba(255,255,255,0.05)',
  },
  emergencyActionsRow: {
    marginBottom: 8,
    gap: 8,
  },
  actionHintTextModal: {
    color: 'rgba(255,255,255,0.4)',
    fontSize: 10,
    fontWeight: '800',
    textAlign: 'center',
    marginBottom: 8,
    textTransform: 'uppercase',
    letterSpacing: 2,
  },
  btnAcceptLong: {
    height: 56,
    backgroundColor: 'rgba(105, 240, 174, 0.05)',
    borderRadius: 14,
    justifyContent: 'center',
    alignItems: 'center',
    overflow: 'hidden',
    borderWidth: 1.5,
    borderColor: 'rgba(105, 240, 174, 0.25)',
  },
  btnAcceptTxt: {
    color: colors.success,
    fontSize: 15,
    fontWeight: '900',
    letterSpacing: 1.2,
  },
  btnRefuseLong: {
    height: 56,
    backgroundColor: 'rgba(255, 82, 82, 0.05)',
    borderRadius: 14,
    justifyContent: 'center',
    alignItems: 'center',
    overflow: 'hidden',
    borderWidth: 1.5,
    borderColor: 'rgba(255, 82, 82, 0.25)',
  },
  btnRefuseTxt: {
    color: colors.primary,
    fontSize: 15,
    fontWeight: '900',
    letterSpacing: 1.2,
  },
  confirmButtonProgress: {
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 0,
    width: '100%',
    opacity: 0.3,
  },
});
