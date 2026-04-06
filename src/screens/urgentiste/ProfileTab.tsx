import React, { useEffect, useState } from "react";
import { TabScreenSafeArea } from "../../components/layout/TabScreenSafeArea";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  StatusBar,
  Alert,
  Switch,
  Image,
} from "react-native";
import { useAuth } from "../../contexts/AuthContext";
import { useAppLock } from "../../contexts/AppLockContext";
import { colors } from "../../theme/colors";
import { MaterialIcons, MaterialCommunityIcons } from "@expo/vector-icons";

export function ProfileTab({ navigation }: any) {
  const { profile, signOut } = useAuth();
  const [avatarLoadError, setAvatarLoadError] = useState(false);

  useEffect(() => {
    setAvatarLoadError(false);
  }, [profile?.photo_url]);

  const {
    appLockEnabled,
    setAppLockEnabled,
    biometricAvailable,
    nativeModuleLinked,
  } = useAppLock();

  const handleLogout = () => {
    Alert.alert("Déconnexion", "Voulez-vous vraiment vous déconnecter ?", [
      { text: "Annuler", style: "cancel" },
      {
        text: "Déconnexion",
        style: "destructive",
        onPress: async () => {
          try {
            await signOut();
            console.log("[Profile] Déconnexion réussie");
          } catch (e) {
            console.error(e);
          }
        },
      },
    ]);
  };

  const photoUri = profile?.photo_url?.trim();
  const showAvatarPhoto = Boolean(photoUri) && !avatarLoadError;

  return (
    <TabScreenSafeArea style={styles.container}>
      <StatusBar barStyle="light-content" />

      <View style={styles.topHeader}>
        <View style={styles.headerRow}>
          <View>
            <Text style={styles.greetingText}>VOTRE COMPTE</Text>
            <Text style={styles.hospitalName}>Profil Agent</Text>
          </View>
          <TouchableOpacity style={styles.notifBtn} onPress={handleLogout}>
            <MaterialIcons name="logout" color={colors.primary} size={22} />
          </TouchableOpacity>
        </View>

        {/* Profile Card Summary */}
        <View style={styles.profileSummary}>
          <View style={styles.avatarBox}>
            <View style={styles.avatarCircle}>
              {showAvatarPhoto ? (
                <Image
                  source={{ uri: photoUri! }}
                  style={styles.avatarImage}
                  resizeMode="cover"
                  onError={() => setAvatarLoadError(true)}
                />
              ) : (
                <MaterialIcons name="person" color={colors.secondary} size={40} />
              )}
            </View>
            <View style={styles.statusBadge} />
          </View>
          <View style={styles.profileInfo}>
            <Text style={styles.agentName}>
              {profile?.first_name} {profile?.last_name}
            </Text>
            <Text style={styles.agentRank}>
              {profile?.role === "secouriste"
                ? "Médecin Urgentiste"
                : profile?.role}
            </Text>
            <View style={styles.idBadge}>
              <Text style={styles.idBadgeText}>
                MATRICULE:{" "}
                {profile?.agent_login_id || profile?.matricule || "XXX"}
              </Text>
            </View>
          </View>
        </View>
      </View>

      <ScrollView
        contentContainerStyle={styles.scrollPad}
        showsVerticalScrollIndicator={false}
      >
        {/* <View style={styles.statsRow}>
          <View style={styles.statBox}>
             <View style={[styles.statIcon, { backgroundColor: colors.secondary + '15' }]}>
                <MaterialCommunityIcons name="pulse" color={colors.secondary} size={20} />
             </View>
             <Text style={styles.statLabel}>Statut</Text>
             <Text style={styles.statValue}>{profile?.status === 'online' ? 'Ligne' : 'Repos'}</Text>
          </View>
          <View style={styles.statBox}>
             <View style={[styles.statIcon, { backgroundColor: '#FF980015' }]}>
                <MaterialIcons name="security" color="#FF9800" size={20} />
             </View>
             <Text style={styles.statLabel}>Accès</Text>
             <Text style={styles.statValue}>Niveau 2</Text>
          </View>
          <View style={styles.statBox}>
             <View style={[styles.statIcon, { backgroundColor: colors.primary + '15' }]}>
                <MaterialIcons name="card-membership" color={colors.primary} size={20} />
             </View>
             <Text style={styles.statLabel}>Groupe</Text>
             <Text style={styles.statValue}>Non déf.</Text>
          </View>
        </View> */}

        {/* Menu Groups */}
        <Text style={styles.sectionTitle}>SÉCURITÉ ET CONTACT</Text>
        <View style={styles.menuList}>
          <TouchableOpacity style={styles.menuItem}>
            <View style={[styles.menuIcon, { backgroundColor: "#1A1A1A" }]}>
              <MaterialIcons name="phone" color={colors.textMuted} size={20} />
            </View>
            <View style={styles.menuText}>
              <Text style={styles.menuLabel}>Téléphone</Text>
              <Text style={styles.menuValue}>
                {profile?.phone || "Non renseigné"}
              </Text>
            </View>
            <MaterialIcons
              name="chevron-right"
              color="rgba(255,255,255,0.1)"
              size={24}
            />
          </TouchableOpacity>

          <View style={styles.menuItem}>
            <View style={[styles.menuIcon, { backgroundColor: "#1A1A1A" }]}>
              <MaterialIcons
                name="fingerprint"
                color={colors.textMuted}
                size={20}
              />
            </View>
            <View style={styles.menuText}>
              <Text style={styles.menuLabel}>Verrouillage appareil</Text>
              <Text style={styles.menuValue}>
                {!nativeModuleLinked
                  ? "Recompilez l’app (expo run:android) pour activer la biométrie"
                  : biometricAvailable
                    ? "Face ID / empreinte / code du téléphone"
                    : "Configurez le verrouillage dans les réglages du téléphone"}
              </Text>
            </View>
            <Switch
              value={appLockEnabled}
              disabled={!nativeModuleLinked}
              onValueChange={(v) => void setAppLockEnabled(v)}
              trackColor={{ false: "#3A3A3A", true: colors.secondary + "99" }}
              thumbColor={appLockEnabled ? colors.secondary : "#888"}
            />
          </View>
        </View>

        <Text style={styles.sectionTitle}>SYSTÈME</Text>
        <View style={styles.menuList}>
          <TouchableOpacity
            style={styles.menuItem}
            onPress={() => navigation.navigate("CallHistoryCalls")}
          >
            <View
              style={[
                styles.menuIcon,
                { backgroundColor: colors.secondary + "18" },
              ]}
            >
              <MaterialIcons
                name="phone-callback"
                color={colors.secondary}
                size={20}
              />
            </View>
            <View style={styles.menuText}>
              <Text style={styles.menuLabel}>
                Historique des appels (centrale)
              </Text>
              <Text style={styles.menuValue}>Appels entrants et sortants</Text>
            </View>
            <MaterialIcons
              name="chevron-right"
              color="rgba(255,255,255,0.1)"
              size={24}
            />
          </TouchableOpacity>
          {/* <TouchableOpacity style={styles.menuItem}>
              <View style={[styles.menuIcon, { backgroundColor: "#1A1A1A" }]}>
                 <MaterialIcons name="settings" color={colors.textMuted} size={20} />
              </View>
              <View style={styles.menuText}>
                 <Text style={styles.menuLabel}>Configuration Terminal</Text>
              </View>
              <MaterialIcons name="chevron-right" color="rgba(255,255,255,0.1)" size={24} />
           </TouchableOpacity> */}
        </View>

        <TouchableOpacity style={styles.logoutBtn} onPress={handleLogout}>
          <MaterialIcons name="logout" color={colors.primary} size={22} />
          <Text style={styles.logoutText}>Se déconnecter de la session</Text>
        </TouchableOpacity>
      </ScrollView>
    </TabScreenSafeArea>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.mainBackground },
  topHeader: {
    paddingHorizontal: 24,
    paddingTop: 16,
    borderBottomLeftRadius: 36,
    borderBottomRightRadius: 36,
    backgroundColor: "#0A0A0A",
  },
  headerRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 24,
  },
  greetingText: {
    color: "rgba(255,255,255,0.4)",
    fontSize: 12,
    fontWeight: "800",
    letterSpacing: 1.5,
    textTransform: "uppercase",
  },
  hospitalName: {
    color: "#FFF",
    fontSize: 24,
    fontWeight: "700",
    marginTop: 4,
  },
  notifBtn: {
    width: 44,
    height: 44,
    borderRadius: 16,
    backgroundColor: "#1A1A1A",
    justifyContent: "center",
    alignItems: "center",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.1)",
  },
  profileSummary: {
    flexDirection: "row",
    alignItems: "center",
    gap: 20,
    backgroundColor: "#1A1A1A",
    padding: 24,
    borderRadius: 32,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.05)",
  },
  avatarBox: { position: "relative" },
  avatarCircle: {
    width: 70,
    height: 70,
    borderRadius: 35,
    overflow: "hidden",
    backgroundColor: colors.secondary + "15",
    justifyContent: "center",
    alignItems: "center",
  },
  avatarImage: {
    width: "100%",
    height: "100%",
  },
  statusBadge: {
    position: "absolute",
    bottom: 4,
    right: 4,
    width: 14,
    height: 14,
    borderRadius: 7,
    backgroundColor: colors.success,
    borderWidth: 2,
    borderColor: "#1A1A1A",
  },
  profileInfo: { flex: 1 },
  agentName: {
    fontSize: 22,
    fontWeight: "900",
    color: "#FFF",
    marginBottom: 4,
  },
  agentRank: {
    fontSize: 13,
    fontWeight: "700",
    color: colors.textMuted,
    marginBottom: 12,
  },
  idBadge: {
    backgroundColor: "rgba(255,255,255,0.05)",
    alignSelf: "flex-start",
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 10,
  },
  idBadgeText: {
    fontSize: 10,
    fontWeight: "900",
    color: colors.textMuted,
    letterSpacing: 1,
  },

  scrollPad: { paddingBottom: 24 },
  statsRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingHorizontal: 20,
    marginTop: 24,
  },
  statBox: {
    flex: 1,
    backgroundColor: "#1A1A1A",
    borderRadius: 24,
    padding: 20,
    marginHorizontal: 4,
    alignItems: "center",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.05)",
  },
  statIcon: {
    width: 44,
    height: 44,
    borderRadius: 16,
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 12,
  },
  statLabel: {
    fontSize: 11,
    fontWeight: "800",
    color: colors.textMuted,
    marginBottom: 4,
    letterSpacing: 0.5,
  },
  statValue: { fontSize: 15, fontWeight: "900", color: "#FFF" },

  sectionTitle: {
    color: "#FFF",
    fontSize: 13,
    fontWeight: "800",
    marginHorizontal: 30,
    marginTop: 30,
    marginBottom: 12,
    letterSpacing: 1.5,
    opacity: 0.4,
  },
  menuList: {
    backgroundColor: "#1A1A1A",
    marginHorizontal: 20,
    borderRadius: 32,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.05)",
  },
  menuItem: {
    flexDirection: "row",
    alignItems: "center",
    padding: 20,
    borderBottomWidth: 1,
    borderBottomColor: "rgba(255,255,255,0.02)",
  },
  menuIcon: {
    width: 48,
    height: 48,
    borderRadius: 16,
    justifyContent: "center",
    alignItems: "center",
    marginRight: 20,
  },
  menuText: { flex: 1 },
  menuLabel: { fontSize: 16, fontWeight: "700", color: "#FFF" },
  menuValue: {
    fontSize: 14,
    color: colors.textMuted,
    marginTop: 2,
    fontWeight: "600",
  },

  logoutBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.primary + "10",
    marginHorizontal: 20,
    paddingVertical: 20,
    borderRadius: 32,
    marginTop: 30,
    borderWidth: 1,
    borderColor: colors.primary + "20",
  },
  logoutText: {
    color: colors.primary,
    fontSize: 15,
    fontWeight: "800",
    marginLeft: 12,
    letterSpacing: 0.5,
  },
});
