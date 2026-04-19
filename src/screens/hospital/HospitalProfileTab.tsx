import React from 'react';
import { View, Text, StyleSheet, Switch, ActivityIndicator, Alert } from 'react-native';
import { TabScreenSafeArea } from '../../components/layout/TabScreenSafeArea';
import { MaterialIcons } from '@expo/vector-icons';
import { colors } from '../../theme/colors';
import { useAppLock } from '../../contexts/AppLockContext';
import { useAuth } from '../../contexts/AuthContext';
import { AppTouchableOpacity } from '../../components/ui/AppTouchableOpacity';

export function HospitalProfileTab(_props: { navigation: unknown }) {
  const { appLockEnabled, setAppLockEnabled, biometricAvailable, nativeModuleLinked } = useAppLock();
  const { profile, signOut } = useAuth();

  const handleLogout = () => {
    Alert.alert(
      'Déconnexion',
      'Voulez-vous vous déconnecter ?',
      [
        { text: 'Annuler', style: 'cancel' },
        {
          text: 'Se déconnecter',
          style: 'destructive',
          onPress: () => {
            void signOut();
          },
        },
      ],
    );
  };

  const displayName =
    profile?.linkedStructure?.name?.trim() ||
    (profile?.first_name || profile?.last_name
      ? `${profile?.first_name ?? ''} ${profile?.last_name ?? ''}`.trim()
      : 'Structure sanitaire');

  const displayId =
    profile?.agent_login_id != null && String(profile.agent_login_id).length > 0
      ? `Identifiant: ${profile.agent_login_id}`
      : profile?.matricule != null && String(profile.matricule).length > 0
        ? `Matricule: ${profile.matricule}`
        : profile?.id != null
          ? `ID: ${profile.id.slice(0, 8)}…`
          : '';

  const statusLabel =
    profile?.status === 'online'
      ? 'En ligne'
      : profile?.status === 'active'
        ? 'Actif'
        : profile?.status === 'busy'
          ? 'Occupé'
          : profile?.status === 'offline'
            ? 'Hors ligne'
            : profile?.status ?? '—';

  const infoItems = profile
    ? [
        {
          icon: 'location-on' as const,
          label: 'Adresse',
          value:
            profile.linkedStructure?.address?.trim() ||
            profile.address?.trim() ||
            'Non renseignée',
          color: colors.primary,
        },
        {
          icon: 'phone' as const,
          label: 'Téléphone',
          value:
            profile.linkedStructure?.phone?.trim() ||
            profile.phone?.trim() ||
            'Non renseigné',
          color: colors.success,
        },
        {
          icon: 'map' as const,
          label: 'Zone',
          value: profile.zone?.trim() || '—',
          color: colors.secondary,
        },
        {
          icon: 'medical-services' as const,
          label: 'Statut compte',
          value: statusLabel,
          color: '#EF6C00',
        },
      ]
    : [];

  return (
    <TabScreenSafeArea style={styles.safeArea}>
      <View style={styles.appBar}>
        <Text style={styles.appBarTitle}>Profil</Text>
      </View>

      <View style={styles.container}>
        {!profile ? (
          <ActivityIndicator color={colors.secondary} style={{ marginVertical: 24 }} />
        ) : (
          <>
            <View style={styles.identityRow}>
              <View style={styles.avatarOuter}>
                <View style={styles.avatarCircle}>
                  <MaterialIcons name="local-hospital" size={32} color={colors.secondary} />
                </View>
              </View>
              <View style={styles.identityText}>
                <Text style={styles.hospitalName} numberOfLines={2}>
                  {displayName}
                </Text>
                {displayId ? (
                  <Text style={styles.hospitalId} numberOfLines={1}>
                    {displayId}
                  </Text>
                ) : null}
              </View>
            </View>

            <View style={styles.infoGrid}>
              {infoItems.map((item, i) => (
                <View key={i} style={styles.infoCard}>
                  <View style={[styles.infoIcon, { backgroundColor: 'rgba(255, 255, 255, 0.05)' }]}>
                    <MaterialIcons name={item.icon} color={item.color} size={18} />
                  </View>
                  <Text style={styles.infoLabel}>{item.label}</Text>
                  <Text
                    style={[
                      styles.infoValue,
                      item.label === 'Statut compte' && profile?.status === 'online' && { color: colors.success },
                    ]}
                    numberOfLines={3}
                  >
                    {item.value}
                  </Text>
                </View>
              ))}
            </View>

            <View style={styles.securityCard}>
              <MaterialIcons name="fingerprint" size={20} color={colors.secondary} />
              <View style={styles.securityText}>
                <Text style={styles.securityTitle}>Verrouillage appareil</Text>
                <Text style={styles.securitySub} numberOfLines={2}>
                  {!nativeModuleLinked
                    ? 'Recompilez l’app (expo run:android) pour activer la biométrie'
                    : biometricAvailable
                      ? 'Face ID / empreinte / code du téléphone'
                      : 'Configurez le verrouillage dans les réglages du téléphone'}
                </Text>
              </View>
              <Switch
                value={appLockEnabled}
                disabled={!nativeModuleLinked}
                onValueChange={(v) => void setAppLockEnabled(v)}
                trackColor={{ false: '#3A3A3A', true: colors.secondary + '99' }}
                thumbColor={appLockEnabled ? colors.secondary : '#888'}
              />
            </View>

            <AppTouchableOpacity style={styles.logoutBtn} onPress={handleLogout}>
              <MaterialIcons name="logout" size={18} color={colors.primary} />
              <Text style={styles.logoutText}>Se déconnecter</Text>
            </AppTouchableOpacity>
          </>
        )}
      </View>
    </TabScreenSafeArea>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: colors.mainBackground,
  },
  appBar: {
    height: 48,
    justifyContent: 'center',
    paddingHorizontal: 20,
  },
  appBarTitle: {
    color: '#FFF',
    fontSize: 20,
    fontWeight: '700',
  },
  container: {
    flex: 1,
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 12,
    justifyContent: 'space-between',
  },
  identityRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    marginBottom: 10,
  },
  avatarOuter: {
    padding: 3,
    borderRadius: 44,
    borderWidth: 2,
    borderColor: 'rgba(68, 138, 255, 0.3)',
  },
  avatarCircle: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: 'rgba(68, 138, 255, 0.1)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  identityText: {
    flex: 1,
    minWidth: 0,
  },
  hospitalName: {
    color: '#FFF',
    fontSize: 18,
    fontWeight: '700',
  },
  hospitalId: {
    color: colors.textMuted,
    fontSize: 12,
    marginTop: 4,
  },
  infoGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    gap: 8,
    flexGrow: 1,
    flexShrink: 1,
    minHeight: 0,
  },
  infoCard: {
    width: '48%',
    backgroundColor: '#1A1A1A',
    borderRadius: 12,
    padding: 10,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.05)',
  },
  infoIcon: {
    width: 32,
    height: 32,
    borderRadius: 10,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 6,
  },
  infoLabel: {
    color: colors.textMuted,
    fontSize: 11,
    letterSpacing: 0.2,
    fontWeight: '600',
  },
  infoValue: {
    color: '#FFF',
    fontSize: 12,
    fontWeight: '600',
    marginTop: 2,
    lineHeight: 16,
  },
  securityCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 14,
    backgroundColor: '#1A1A1A',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.06)',
    marginTop: 8,
    marginBottom: 8,
  },
  securityText: {
    flex: 1,
    minWidth: 0,
  },
  securityTitle: {
    color: '#FFF',
    fontSize: 14,
    fontWeight: '700',
  },
  securitySub: {
    color: colors.textMuted,
    fontSize: 11,
    marginTop: 2,
    fontWeight: '600',
  },
  logoutBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 12,
    borderRadius: 24,
    borderWidth: 1.5,
    borderColor: colors.primary,
    backgroundColor: 'transparent',
  },
  logoutText: {
    color: colors.primary,
    fontSize: 14,
    fontWeight: '700',
  },
});
