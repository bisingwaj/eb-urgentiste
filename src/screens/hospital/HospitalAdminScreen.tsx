import React from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Alert,
} from "react-native";
import { AppTouchableOpacity } from '../../components/ui/AppTouchableOpacity';
import { TabScreenSafeArea } from "../../components/layout/TabScreenSafeArea";
import { MaterialCommunityIcons, MaterialIcons } from "@expo/vector-icons";
import { colors } from "../../theme/colors";
import { useAuth } from "../../contexts/AuthContext";
import { HospitalHeader } from "./components/HospitalHeader";
import { useNotifications } from "../../hooks/useNotifications";

import { useAppLock } from "../../contexts/AppLockContext";
import { Switch } from "react-native";

export function HospitalAdminScreen({ navigation }: any) {
  const { profile, signOut } = useAuth();
  const { unreadCount } = useNotifications();
  const { appLockEnabled, setAppLockEnabled, biometricAvailable, nativeModuleLinked } = useAppLock();

  interface AdminSettingItem {
    id: string;
    label: string;
    icon: string;
    color: string;
    route: string | null;
    badge?: number;
    logout?: boolean;
  }

  const SETTINGS_GROUPS: { title: string; items: AdminSettingItem[] }[] = [
    {
      title: "DONNÉES & ANALYSES",
      items: [
        {
          id: "notifications",
          label: "Centre de Notifications",
          icon: "bell-outline",
          color: "#FF9800",
          route: "Notifications",
          badge: unreadCount,
        },
        {
          id: "analyses",
          label: "Rapports & Archives",
          icon: "file-chart-outline",
          color: "#B388FF",
          route: "HospitalHistory",
        },
        {
          id: "stats",
          label: "Statistiques du service",
          icon: "chart-box-outline",
          color: "#69F0AE",
          route: "HospitalStats",
        },
        {
          id: "hospital_profile",
          label: "Profil de l'établissement",
          icon: "hospital-building",
          color: "#FFA726",
          route: "HospitalProfileEdit",
        },
      ],
    },
    {
      title: "PARAMÈTRES",
      items: [
        {
          id: "help",
          label: "Aide & Support",
          icon: "help-circle-outline",
          color: "rgba(255,255,255,0.4)",
          route: null,
        },
        {
          id: "logout",
          label: "Déconnexion",
          icon: "logout",
          color: "#FF5252",
          route: null,
          logout: true,
        },
      ],
    },
  ];

  const onSettingPress = (item: any) => {
    if ("logout" in item && item.logout) {
      Alert.alert("Déconnexion", "Voulez-vous vous déconnecter ?", [
        { text: "Annuler", style: "cancel" },
        { text: "Se déconnecter", style: "destructive", onPress: () => void signOut() },
      ]);
      return;
    }
    if (item.route) {
      navigation.navigate(item.route);
      return;
    }
    Alert.alert(
      "Bientôt disponible",
      "Cette section n’est pas encore disponible dans cette version de l’application."
    );
  };

  const displayName = profile?.linkedStructure?.name || profile?.first_name || 'Hôpital';
  const displayAddress = profile?.linkedStructure?.address || profile?.address || 'Adresse non renseignée';
  const displayPhone = profile?.linkedStructure?.phone || profile?.phone || 'Téléphone non renseigné';
  const displayZone = profile?.zone ? `Zone: ${profile.zone}` : null;

  return (
    <View style={styles.container}>
      <HospitalHeader title="Administration" />
      
      <ScrollView style={styles.body} showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 140 }}>
        {/* Profile Card Summary */}
        <View style={styles.profileSummary}>
          <View style={styles.avatar}>
            <MaterialCommunityIcons name="hospital-marker" size={32} color={colors.secondary} />
          </View>
          <View style={styles.profileText}>
            <Text style={styles.profileName}>{displayName}</Text>
            <Text style={styles.profileAddress}>{displayAddress}</Text>
            <Text style={styles.profileMeta}>{displayPhone}{displayZone ? ` · ${displayZone}` : ''}</Text>
          </View>
        </View>

        {/* Security Quick Toggle */}
        <View style={styles.securitySection}>
          <View style={styles.securityHeader}>
            <MaterialCommunityIcons name="fingerprint" size={20} color={colors.secondary} />
            <Text style={styles.securityTitle}>Verrouillage appareil</Text>
          </View>
          <View style={styles.securityRow}>
            <Text style={styles.securitySub}>
              {!nativeModuleLinked
                ? 'Recompilez l’app pour activer la biométrie'
                : biometricAvailable
                  ? 'Face ID / empreinte / code du téléphone'
                  : 'Configurez le verrouillage dans les réglages'}
            </Text>
            <Switch
              value={appLockEnabled}
              disabled={!nativeModuleLinked}
              onValueChange={(v) => void setAppLockEnabled(v)}
              trackColor={{ false: '#3A3A3A', true: colors.secondary + '99' }}
              thumbColor={appLockEnabled ? colors.secondary : '#888'}
            />
          </View>
        </View>

        {SETTINGS_GROUPS.map((group, idx) => (
          <View key={idx} style={styles.groupContainer}>
            <Text style={styles.groupTitle}>{group.title}</Text>
            <View style={styles.groupCard}>
              {group.items.map((item, itemIdx) => (
                <View key={item.id}>
                  <AppTouchableOpacity style={styles.settingItem} onPress={() => onSettingPress(item)}>
                    <View style={[styles.iconBg, { backgroundColor: item.color + "15" }]}>
                      <MaterialCommunityIcons name={item.icon as any} color={item.color} size={22} />
                    </View>
                    <Text style={styles.itemLabel}>{item.label}</Text>
                    {item.badge && item.badge > 0 ? (
                      <View style={styles.badge}>
                        <Text style={styles.badgeText}>{item.badge}</Text>
                      </View>
                    ) : null}
                    <MaterialIcons name="chevron-right" color="rgba(255,255,255,0.15)" size={24} />
                  </AppTouchableOpacity>
                  {itemIdx < group.items.length - 1 && <View style={styles.divider} />}
                </View>
              ))}
            </View>
          </View>
        ))}

        <View style={styles.footer}>
          <Text style={styles.versionText}>Application Hospitalière v1.5.0</Text>
          <Text style={styles.copyrightText}>Etoile Bleue Systems</Text>
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.mainBackground },
  body: { flex: 1 },
  profileSummary: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 24,
    backgroundColor: 'rgba(255,255,255,0.02)',
    marginHorizontal: 16,
    marginTop: 16,
    borderRadius: 24,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.05)',
  },
  avatar: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: colors.secondary + '15',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 16,
  },
  profileText: { flex: 1 },
  profileName: { color: '#FFF', fontSize: 18, fontWeight: '800', marginBottom: 2 },
  profileAddress: { color: 'rgba(255,255,255,0.4)', fontSize: 13, fontWeight: '600' },
  profileMeta: { color: colors.secondary, fontSize: 12, fontWeight: '700', marginTop: 4 },
  
  securitySection: {
    backgroundColor: "#0F0F0F",
    marginHorizontal: 16,
    marginTop: 16,
    padding: 16,
    borderRadius: 24,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.05)",
  },
  securityHeader: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 12 },
  securityTitle: { color: '#FFF', fontSize: 14, fontWeight: '800', textTransform: 'uppercase', letterSpacing: 0.5 },
  securityRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  securitySub: { flex: 1, color: 'rgba(255,255,255,0.3)', fontSize: 12, fontWeight: '600', marginRight: 16 },

  groupContainer: { marginTop: 24, paddingHorizontal: 16 },
  groupTitle: { color: "rgba(255,255,255,0.25)", fontSize: 11, fontWeight: "900", letterSpacing: 1.5, marginBottom: 12, marginLeft: 12 },
  groupCard: { backgroundColor: "#0F0F0F", borderRadius: 24, overflow: "hidden", borderWidth: 1, borderColor: "rgba(255,255,255,0.05)" },
  settingItem: { flexDirection: "row", alignItems: "center", padding: 16, gap: 16 },
  iconBg: { width: 40, height: 40, borderRadius: 12, justifyContent: "center", alignItems: "center" },
  itemLabel: { flex: 1, color: "#FFF", fontSize: 15, fontWeight: "600" },
  badge: { backgroundColor: colors.primary, paddingHorizontal: 8, paddingVertical: 2, borderRadius: 10, marginRight: 4 },
  badgeText: { color: '#FFF', fontSize: 10, fontWeight: '900' },
  divider: { height: 1, backgroundColor: "rgba(255,255,255,0.03)", marginLeft: 72 },
  footer: { alignItems: "center", gap: 6, marginVertical: 32 },
  versionText: { color: "rgba(255,255,255,0.2)", fontSize: 13, fontWeight: "700" },
  copyrightText: { color: colors.secondary, fontSize: 11, fontWeight: "900", textTransform: "uppercase", letterSpacing: 1 },
});
