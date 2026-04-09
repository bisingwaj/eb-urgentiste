import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Linking,
  Alert,
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { MaterialIcons } from '@expo/vector-icons';
import { colors } from '../../theme/colors';

const getLevelConfig = (level: string) => {
  switch (level) {
    case 'critique':
      return { color: '#FF5252', bg: 'rgba(255, 82, 82, 0.12)', label: 'CRITIQUE' };
    case 'grave':
      return { color: '#FF9800', bg: 'rgba(255, 152, 0, 0.12)', label: 'GRAVE' };
    case 'modere':
      return { color: '#FFD600', bg: 'rgba(255, 214, 0, 0.12)', label: 'MODÉRÉ' };
    default:
      return { color: colors.textMuted, bg: 'rgba(255, 255, 255, 0.08)', label: 'INCONNU' };
  }
};

type TimelineStep = {
  title: string;
  subtitle: string;
  status: 'done' | 'active' | 'pending';
  label: string;
};

const getTimeline = (status: string): TimelineStep[] => [
  {
    title: 'SOS Déclenché',
    subtitle: 'Adresse inconnue',
    status: 'done',
    label: 'Validé',
  },
  {
    title: 'Pris en charge',
    subtitle: 'Évaluation en cours',
    status: 'done',
    label: 'Patienter',
  },
  {
    title: 'En route',
    subtitle: 'Unité assignée',
    status:
      status === 'en_route'
        ? 'active'
        : ['sur_place', 'en_traitement', 'termine'].includes(status)
          ? 'done'
          : 'pending',
    label:
      status === 'en_route'
        ? 'En cours'
        : ['sur_place', 'en_traitement', 'termine'].includes(status)
          ? 'Complété'
          : '',
  },
  {
    title: 'Sur place',
    subtitle: 'Restez calme',
    status:
      status === 'sur_place'
        ? 'active'
        : ['en_traitement', 'termine'].includes(status)
          ? 'done'
          : 'pending',
    label:
      status === 'sur_place'
        ? 'En cours'
        : ['en_traitement', 'termine'].includes(status)
          ? 'Complété'
          : 'Estimé',
  },
  {
    title: 'En traitement',
    subtitle: 'Soins prodigués',
    status:
      status === 'en_traitement'
        ? 'active'
        : status === 'termine'
          ? 'done'
          : 'pending',
    label:
      status === 'en_traitement' ? 'En cours' : status === 'termine' ? 'Complété' : '',
  },
  {
    title: 'Transport hôpital',
    subtitle: 'Transfert du patient',
    status: status === 'termine' ? 'done' : 'pending',
    label: status === 'termine' ? 'Arrivé' : '',
  },
];

const getStatusLabel = (status: string) => {
  switch (status) {
    case 'en_route': return 'En route';
    case 'sur_place': return 'Sur place';
    case 'en_traitement': return 'En traitement';
    case 'termine': return 'Terminé';
    default: return status;
  }
};

export function HospitalUrgencyDetailScreen({ route, navigation }: any) {
  const { urgency } = route.params;
  const levelCfg = getLevelConfig(urgency.level);
  const timeline = getTimeline(urgency.status);

  const handleCall = () => {
    Alert.alert(
      'Appeler l\'urgentiste',
      `Voulez-vous appeler ${urgency.urgentisteName} ?\n${urgency.urgentistePhone}`,
      [
        { text: 'Annuler', style: 'cancel' },
        {
          text: 'Appeler',
          onPress: () => Linking.openURL(`tel:${urgency.urgentistePhone.replace(/\s/g, '')}`),
        },
      ]
    );
  };

  const handleSMS = () => {
    Linking.openURL(`sms:${urgency.urgentistePhone.replace(/\s/g, '')}`);
  };

  return (
    <SafeAreaView style={styles.safeArea} edges={['top', 'bottom']}>
      {/* App bar */}
      <View style={styles.appBar}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
          <MaterialIcons name="arrow-back" size={24} color="#FFF" />
        </TouchableOpacity>
        <Text style={styles.appBarTitle}>Détails de l'incident</Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView
        style={styles.scroll}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: 120 }}
      >
        {/* Brand */}
        <View style={styles.brandRow}>
          <MaterialIcons name="favorite" color={colors.primary} size={22} />
          <Text style={styles.brandText}>Étoile Bleue</Text>
        </View>

        {/* Urgentiste unit card */}
        <View style={styles.unitCard}>
          <View style={styles.unitLeft}>
            <View style={styles.unitAvatar}>
              <MaterialIcons name="groups" color={colors.secondary} size={22} />
            </View>
            <View>
              <Text style={styles.unitLabel}>Unité de secours</Text>
              <View style={styles.unitNameRow}>
                <View style={styles.greenDot} />
                <Text style={styles.unitName}>{urgency.urgentisteName}</Text>
              </View>
            </View>
          </View>
          <View style={styles.unitRight}>
            <Text style={styles.delayLabel}>Délai est.</Text>
            <Text style={styles.delayValue}>{urgency.eta}</Text>
          </View>
        </View>

        {/* Tag pills */}
        <View style={styles.tagRow}>
          <View style={styles.tagPill}>
            <MaterialIcons name="location-on" color={colors.secondary} size={14} />
            <Text style={styles.tagText}>Véhicule GPS</Text>
          </View>
          <View style={[styles.tagPill, { borderColor: colors.primary }]}>
            <MaterialIcons name="medical-services" color={colors.primary} size={14} />
            <Text style={[styles.tagText, { color: colors.primary }]}>Liaison Médicale</Text>
          </View>
        </View>

        {/* Patient info */}
        <View style={styles.patientSection}>
          <Text style={styles.patientSectionTitle}>Informations patient</Text>
          <View style={styles.patientInfoCard}>
            <View style={styles.patientRow}>
              <Text style={styles.piLabel}>Nom</Text>
              <Text style={styles.piValue}>{urgency.victimName}</Text>
            </View>
            <View style={styles.patientDivider} />
            <View style={styles.patientRow}>
              <Text style={styles.piLabel}>Âge</Text>
              <Text style={styles.piValue}>{urgency.age} ans</Text>
            </View>
            <View style={styles.patientDivider} />
            <View style={styles.patientRow}>
              <Text style={styles.piLabel}>Urgence</Text>
              <View style={[styles.levelMini, { backgroundColor: levelCfg.bg }]}>
                <Text style={[styles.levelMiniText, { color: levelCfg.color }]}>{levelCfg.label}</Text>
              </View>
            </View>
            <View style={styles.patientDivider} />
            <View style={styles.patientRow}>
              <Text style={styles.piLabel}>Description</Text>
              <Text style={[styles.piValue, { flex: 1, textAlign: 'right' }]} numberOfLines={2}>{urgency.description}</Text>
            </View>
          </View>
        </View>

        {/* Timeline */}
        <Text style={styles.timelineTitle}>Historique du suivi</Text>

        <View style={styles.timelineContainer}>
          {timeline.map((step, index) => {
            const isLast = index === timeline.length - 1;
            const dotColor =
              step.status === 'done'
                ? colors.secondary
                : step.status === 'active'
                  ? colors.secondary
                  : 'rgba(255, 255, 255, 0.2)';
            const dotSize = step.status === 'active' ? 14 : 10;
            const lineColor = step.status === 'done' ? 'rgba(68, 138, 255, 0.3)' : 'rgba(255, 255, 255, 0.05)';
            const labelColor =
              step.status === 'done'
                ? colors.success
                : step.status === 'active'
                  ? colors.secondary
                  : colors.textMuted;

            return (
              <View key={index} style={styles.tlItem}>
                {/* Dot column */}
                <View style={styles.tlDotCol}>
                  <View
                    style={[
                      styles.tlDot,
                      {
                        width: dotSize,
                        height: dotSize,
                        borderRadius: dotSize / 2,
                        backgroundColor: dotColor,
                      },
                    ]}
                  />
                  {!isLast && (
                    <View style={[styles.tlLine, { backgroundColor: lineColor }]} />
                  )}
                </View>

                {/* Text */}
                <View style={styles.tlContent}>
                  <Text
                    style={[
                      styles.tlStepTitle,
                      { color: step.status === 'pending' ? colors.textMuted : '#FFF' },
                      step.status === 'active' && { fontWeight: '700' },
                    ]}
                  >
                    {step.title}
                  </Text>
                  <Text style={styles.tlStepSub}>{step.subtitle}</Text>
                </View>

                {/* Right label */}
                <Text style={[styles.tlLabel, { color: labelColor }]}>{step.label}</Text>
              </View>
            );
          })}
        </View>

        {/* Status Card */}
        <View style={styles.statusCard}>
          <Text style={styles.statusCardTitle}>Alerte SOS</Text>
          <Text style={styles.statusCardSub}>Statut Actuel</Text>
          <Text style={styles.statusCardValue}>{getStatusLabel(urgency.status)}</Text>
        </View>
      </ScrollView>

      {/* Bottom Actions */}
      <View style={styles.bottomBar}>
        <TouchableOpacity style={styles.smsBtn} onPress={handleSMS}>
          <MaterialIcons name="message" color={colors.secondary} size={20} />
          <Text style={styles.smsBtnText}>SMS Normal</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.callBtn} onPress={handleCall}>
          <MaterialIcons name="phone" color="#FFF" size={20} />
          <Text style={styles.callBtnText}>Appel Normal</Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: colors.mainBackground,
  },
  appBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    height: 52,
  },
  backBtn: {
    width: 40,
    height: 40,
    justifyContent: 'center',
    alignItems: 'center',
  },
  appBarTitle: {
    color: '#FFF',
    fontSize: 17,
    fontWeight: '700',
  },
  scroll: {
    flex: 1,
  },
  brandRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 12,
    backgroundColor: 'rgba(255, 255, 255, 0.03)',
  },
  brandText: {
    color: '#FFF',
    fontSize: 16,
    fontWeight: '700',
  },

  // Unit card
  unitCard: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginHorizontal: 20,
    marginTop: 16,
    backgroundColor: '#1A1A1A',
    borderRadius: 14,
    padding: 16,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.05)',
  },
  unitLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  unitAvatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(68, 138, 255, 0.1)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  unitLabel: {
    color: colors.textMuted,
    fontSize: 12,
  },
  unitNameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 2,
  },
  greenDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: colors.success,
  },
  unitName: {
    color: '#FFF',
    fontSize: 15,
    fontWeight: '600',
  },
  unitRight: {
    alignItems: 'flex-end',
  },
  delayLabel: {
    color: colors.textMuted,
    fontSize: 13,
  },
  delayValue: {
    color: colors.secondary,
    fontSize: 18,
    fontWeight: '800',
    marginTop: 2,
  },

  // Tags
  tagRow: {
    flexDirection: 'row',
    gap: 10,
    marginHorizontal: 20,
    marginTop: 14,
    marginBottom: 20,
  },
  tagPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
    borderWidth: 1.2,
    borderColor: colors.secondary,
  },
  tagText: {
    color: colors.secondary,
    fontSize: 12,
    fontWeight: '600',
  },

  // Patient info
  patientSection: {
    marginHorizontal: 20,
    marginBottom: 24,
  },
  patientSectionTitle: {
    color: '#FFF',
    fontSize: 16,
    fontWeight: '700',
    marginBottom: 12,
  },
  patientInfoCard: {
    backgroundColor: '#1A1A1A',
    borderRadius: 14,
    padding: 4,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.05)',
  },
  patientRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  patientDivider: {
    height: 1,
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
    marginHorizontal: 16,
  },
  piLabel: {
    color: colors.textMuted,
    fontSize: 14,
  },
  piValue: {
    color: '#FFF',
    fontSize: 14,
    fontWeight: '600',
  },
  levelMini: {
    paddingHorizontal: 10,
    paddingVertical: 3,
    borderRadius: 12,
  },
  levelMiniText: {
    fontSize: 13,
    fontWeight: '800',
  },

  // Timeline
  timelineTitle: {
    color: colors.textMuted,
    fontSize: 14,
    marginHorizontal: 20,
    marginBottom: 16,
  },
  timelineContainer: {
    marginHorizontal: 20,
    marginBottom: 24,
  },
  tlItem: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    minHeight: 56,
  },
  tlDotCol: {
    width: 24,
    alignItems: 'center',
  },
  tlDot: {
    marginTop: 4,
  },
  tlLine: {
    width: 2,
    flex: 1,
    marginTop: 6,
    marginBottom: -2,
  },
  tlContent: {
    flex: 1,
    marginLeft: 14,
    paddingBottom: 20,
  },
  tlStepTitle: {
    fontSize: 15,
    fontWeight: '600',
    color: '#FFF',
  },
  tlStepSub: {
    color: 'rgba(255, 255, 255, 0.3)',
    fontSize: 12,
    marginTop: 2,
  },
  tlLabel: {
    fontSize: 12,
    fontWeight: '500',
    marginTop: 4,
  },

  // Status card
  statusCard: {
    marginHorizontal: 20,
    backgroundColor: 'rgba(68, 138, 255, 0.1)',
    borderRadius: 20,
    padding: 28,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(68, 138, 255, 0.2)',
  },
  statusCardTitle: {
    color: colors.secondary,
    fontSize: 15,
    fontWeight: '700',
    marginBottom: 4,
  },
  statusCardSub: {
    color: colors.textMuted,
    fontSize: 13,
    marginBottom: 8,
  },
  statusCardValue: {
    color: '#FFF',
    fontSize: 24,
    fontWeight: '800',
  },

  // Bottom bar
  bottomBar: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    flexDirection: 'row',
    paddingHorizontal: 20,
    paddingBottom: Platform.OS === 'ios' ? 34 : 20,
    paddingTop: 14,
    gap: 12,
    backgroundColor: colors.mainBackground,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255, 255, 255, 0.05)',
  },
  smsBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 16,
    borderRadius: 28,
    borderWidth: 1.5,
    borderColor: colors.secondary,
    backgroundColor: 'transparent',
  },
  smsBtnText: {
    color: colors.secondary,
    fontWeight: '700',
    fontSize: 14,
  },
  callBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 16,
    borderRadius: 28,
    backgroundColor: colors.primary,
  },
  callBtnText: {
    color: '#FFF',
    fontWeight: '700',
    fontSize: 14,
  },
});
