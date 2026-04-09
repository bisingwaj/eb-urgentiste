import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Switch, ActivityIndicator, Alert } from 'react-native';
import { TabScreenSafeArea } from '../../components/layout/TabScreenSafeArea';
import { MaterialIcons } from '@expo/vector-icons';
import { colors } from '../../theme/colors';
import { useAppLock } from '../../contexts/AppLockContext';
import { useAuth } from '../../contexts/AuthContext';

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
    profile?.first_name || profile?.last_name
      ? `${profile?.first_name ?? ''} ${profile?.last_name ?? ''}`.trim()
      : 'Structure sanitaire';

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

  return (
    <TabScreenSafeArea style={styles.safeArea}>
      <View style={styles.appBar}>
        <Text style={styles.appBarTitle}>Profil</Text>
      </View>

      <View style={styles.container}>
        {/* Avatar */}
        <View style={styles.avatarOuter}>
          <View style={styles.avatarCircle}>
            <MaterialIcons name="local-hospital" size={40} color={colors.secondary} />
          </View>
        </View>
        {!profile ? (
          <ActivityIndicator color={colors.secondary} style={{ marginVertical: 24 }} />
        ) : (
          <>
        <Text style={styles.hospitalName}>{displayName}</Text>
        {displayId ? <Text style={styles.hospitalId}>{displayId}</Text> : null}

        {/* Info cards */}
        <View style={styles.infoList}>
          {[
            {
              icon: 'location-on' as const,
              label: 'Adresse',
              value: profile.address?.trim() || 'Non renseignée',
              color: colors.primary,
            },
            {
              icon: 'phone' as const,
              label: 'Téléphone',
              value: profile.phone?.trim() || 'Non renseigné',
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
          ].map((item, i) => (
            <View key={i} style={styles.infoCard}>
              <View style={[styles.infoIcon, { backgroundColor: 'rgba(255, 255, 255, 0.05)' }]}>
                <MaterialIcons name={item.icon} color={item.color} size={20} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.infoLabel}>{item.label}</Text>
                <Text style={[
                  styles.infoValue,
                  item.label === 'Statut compte' && profile?.status === 'online' && { color: colors.success },
                ]}>{item.value}</Text>
              </View>
              <MaterialIcons name="chevron-right" color="rgba(255, 255, 255, 0.2)" size={20} />
            </View>
          ))}
        </View>
          </>
        )}

        <View style={styles.securityCard}>
          <MaterialIcons name="fingerprint" size={22} color={colors.secondary} />
          <View style={{ flex: 1 }}>
            <Text style={styles.securityTitle}>Verrouillage appareil</Text>
            <Text style={styles.securitySub}>
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

        {/* Logout */}
        <TouchableOpacity style={styles.logoutBtn} onPress={handleLogout}>
          <MaterialIcons name="logout" size={18} color={colors.primary} />
          <Text style={styles.logoutText}>Se déconnecter</Text>
        </TouchableOpacity>
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
    height: 52,
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
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingTop: 24,
  },
  avatarOuter: {
    padding: 4,
    borderRadius: 50,
    borderWidth: 2,
    borderColor: 'rgba(68, 138, 255, 0.3)',
    marginBottom: 16,
  },
  avatarCircle: {
    width: 76,
    height: 76,
    borderRadius: 38,
    backgroundColor: 'rgba(68, 138, 255, 0.1)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  hospitalName: {
    color: '#FFF',
    fontSize: 20,
    fontWeight: '700',
    textAlign: 'center',
    marginBottom: 4,
  },
  hospitalId: {
    color: colors.textMuted,
    fontSize: 13,
    marginBottom: 32,
  },
  infoList: {
    width: '100%',
    gap: 8,
    marginBottom: 24,
  },
  securityCard: {
    width: '100%',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    padding: 18,
    borderRadius: 16,
    backgroundColor: '#1A1A1A',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.06)',
    marginBottom: 32,
  },
  securityTitle: {
    color: '#FFF',
    fontSize: 16,
    fontWeight: '700',
  },
  securitySub: {
    color: colors.textMuted,
    fontSize: 12,
    marginTop: 4,
    fontWeight: '600',
  },
  infoCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#1A1A1A',
    borderRadius: 14,
    padding: 16,
    gap: 14,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.05)',
  },
  infoIcon: {
    width: 40,
    height: 40,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
  },
  infoLabel: {
    color: colors.textMuted,
    fontSize: 13,
    letterSpacing: 0.3,
  },
  infoValue: {
    color: '#FFF',
    fontSize: 14,
    fontWeight: '600',
    marginTop: 2,
  },
  logoutBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 32,
    paddingVertical: 14,
    borderRadius: 28,
    borderWidth: 1.5,
    borderColor: colors.primary,
    backgroundColor: 'transparent',
  },
  logoutText: {
    color: colors.primary,
    fontSize: 15,
    fontWeight: '700',
  },
});
