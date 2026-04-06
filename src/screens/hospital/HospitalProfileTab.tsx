import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Platform } from 'react-native';
import { TabScreenSafeArea } from '../../components/layout/TabScreenSafeArea';
import { MaterialIcons } from '@expo/vector-icons';
import { colors } from '../../theme/colors';

export function HospitalProfileTab({ navigation }: any) {
  const handleLogout = () => {
    navigation.getParent()?.reset({
      index: 0,
      routes: [{ name: 'RoleSelection' }],
    });
  };

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
        <Text style={styles.hospitalName}>Hôpital Général de Kinshasa</Text>
        <Text style={styles.hospitalId}>ID: HGK-001</Text>

        {/* Info cards */}
        <View style={styles.infoList}>
          {[
            { icon: 'location-on' as const, label: 'Adresse', value: 'Ave de l\'Hôpital, Gombe, Kinshasa', color: colors.primary },
            { icon: 'phone' as const, label: 'Téléphone', value: '+243 815 000 000', color: colors.success },
            { icon: 'local-hotel' as const, label: 'Lits disponibles', value: '12 / 50', color: colors.secondary },
            { icon: 'medical-services' as const, label: 'Service d\'urgence', value: 'Opérationnel', color: '#EF6C00' },
          ].map((item, i) => (
            <View key={i} style={styles.infoCard}>
              <View style={[styles.infoIcon, { backgroundColor: 'rgba(255, 255, 255, 0.05)' }]}>
                <MaterialIcons name={item.icon} color={item.color} size={20} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.infoLabel}>{item.label}</Text>
                <Text style={[
                  styles.infoValue,
                  item.label === 'Service d\'urgence' && { color: colors.success },
                ]}>{item.value}</Text>
              </View>
              <MaterialIcons name="chevron-right" color="rgba(255, 255, 255, 0.2)" size={20} />
            </View>
          ))}
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
    marginBottom: 40,
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
    fontSize: 11,
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
