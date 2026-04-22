import React, { useState, useEffect } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TextInput,
  Switch,
  Alert,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
} from "react-native";
import * as Location from "expo-location";
import { AppTouchableOpacity } from "../../components/ui/AppTouchableOpacity";
import { SafeAreaView } from "react-native-safe-area-context";
import { MaterialCommunityIcons, MaterialIcons } from "@expo/vector-icons";
import { colors } from "../../theme/colors";
import { useHospital } from "../../contexts/HospitalContext";
import { HealthStructure } from "./hospitalTypes";

const STRUCTURE_TYPES = [
  { label: "Hôpital", value: "hopital" },
  { label: "Centre de Santé", value: "centre_sante" },
  { label: "Maternité", value: "maternite" },
  { label: "Pharmacie", value: "pharmacie" },
  { label: "Commissariat", value: "police" },
  { label: "Caserne Protection Civile", value: "pompier" },
  { label: "Base EMU", value: "base_emu" },
];

const COMMON_SPECIALTIES = [
  { label: "Cardiaque", value: "cardiaque" },
  { label: "Traumatisme", value: "traumatisme" },
  { label: "Brûlure", value: "brulure" },
  { label: "Obstétrique", value: "obstetrique" },
  { label: "Pédiatrie", value: "pediatrie" },
  { label: "Intoxication", value: "intoxication" },
  { label: "Psychiatrie", value: "psychiatrie" },
  { label: "Accident de la route", value: "accident_route" },
  { label: "Agression", value: "agression" },
  { label: "Incendie", value: "incendie" },
  { label: "Général", value: "general" },
];

export function HospitalProfileEditScreen({ navigation }: any) {
  const { structureInfo, updateStructureInfo, refreshStructureInfo } = useHospital();

  const [loading, setLoading] = useState(false);
  const [formData, setFormData] = useState<Partial<HealthStructure>>({});
  const [locatingAddress, setLocatingAddress] = useState(false);
  const [locatingCoords, setLocatingCoords] = useState(false);

  const handleAutoFillLocation = async (type: 'address' | 'coords') => {
    if (type === 'address') setLocatingAddress(true);
    else setLocatingCoords(true);

    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert("Permission refusée", "L'accès à la localisation est nécessaire pour cette fonctionnalité.");
        return;
      }

      const location = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High });
      const { latitude, longitude } = location.coords;

      const newFormData = { ...formData, lat: latitude, lng: longitude };

      if (type === 'address') {
        const geocode = await Location.reverseGeocodeAsync({ latitude, longitude });
        if (geocode && geocode.length > 0) {
          const first = geocode[0];
          // Construction d'une adresse lisible
          const addrParts = [
            first.name,
            first.streetNumber,
            first.street,
            first.district,
            first.city
          ].filter(Boolean);
          // Éviter les doublons (ex: name == street)
          const uniqueParts = addrParts.filter((item, pos) => addrParts.indexOf(item) === pos);
          newFormData.address = uniqueParts.join(", ");
        }
      }

      setFormData(newFormData);
    } catch (err) {
      console.error("[Geoloc] Error:", err);
      Alert.alert("Erreur", "Impossible de récupérer votre position actuelle.");
    } finally {
      setLocatingAddress(false);
      setLocatingCoords(false);
    }
  };

  useEffect(() => {
    if (structureInfo) {
      setFormData({
        ...structureInfo,
        specialties: structureInfo.specialties || [],
        equipment: structureInfo.equipment || [],
      });
    } else {
      void refreshStructureInfo();
    }
  }, [structureInfo, refreshStructureInfo]);

  const handleSave = async () => {
    setLoading(true);
    try {
      await updateStructureInfo(formData);
      Alert.alert("Succès", "Le profil a été mis à jour avec succès.");
      navigation.goBack();
    } catch (err: any) {
      console.error("[ProfileEdit] Save error:", err);
      Alert.alert("Erreur de mise à jour", err.message || "Une erreur inconnue est survenue.");
    } finally {
      setLoading(false);
    }
  };

  const toggleSpecialty = (spec: string) => {
    const current = formData.specialties || [];
    if (current.includes(spec)) {
      setFormData({ ...formData, specialties: current.filter((s) => s !== spec) });
    } else {
      setFormData({ ...formData, specialties: [...current, spec] });
    }
  };

  const [newSpecialty, setNewSpecialty] = useState("");
  const addSpecialty = () => {
    if (!newSpecialty.trim()) return;
    const current = formData.specialties || [];
    if (!current.map(s => s.toLowerCase()).includes(newSpecialty.trim().toLowerCase())) {
      setFormData({ ...formData, specialties: [...current, newSpecialty.trim()] });
    }
    setNewSpecialty("");
  };

  const removeSpecialty = (spec: string) => {
    const current = formData.specialties || [];
    setFormData({ ...formData, specialties: current.filter((s) => s !== spec) });
  };

  const [newEquipment, setNewEquipment] = useState("");
  const addEquipment = () => {
    if (!newEquipment.trim()) return;
    const current = formData.equipment || [];
    if (!current.map(e => e.toLowerCase()).includes(newEquipment.trim().toLowerCase())) {
      setFormData({ ...formData, equipment: [...current, newEquipment.trim()] });
    }
    setNewEquipment("");
  };

  const removeEquipment = (eq: string) => {
    const current = formData.equipment || [];
    setFormData({ ...formData, equipment: current.filter((e) => e !== eq) });
  };

  const isTypeSelected = (typeValue: string) => {
    if (!formData.type) return false;
    const dbValue = formData.type.toLowerCase().trim();
    return dbValue === typeValue;
  };

  if (!structureInfo && !loading) {
    return (
      <SafeAreaView style={styles.safeArea} edges={['top', 'left', 'right']}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={colors.secondary} />
          <Text style={styles.loadingText}>Chargement du profil...</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safeArea} edges={['top', 'left', 'right']}>
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        style={{ flex: 1 }}
      >
        {/* Header */}
        <View style={styles.header}>
          <AppTouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
            <MaterialIcons name="close" size={24} color="#FFF" />
          </AppTouchableOpacity>
          <Text style={styles.headerTitle}>Modifier le profil</Text>
          <AppTouchableOpacity
            onPress={handleSave}
            style={[styles.saveBtn, loading && { opacity: 0.5 }]}
            disabled={loading}
          >
            {loading ? <ActivityIndicator size="small" color="#FFF" /> : <Text style={styles.saveBtnText}>Enregistrer</Text>}
          </AppTouchableOpacity>
        </View>

        <ScrollView
          style={styles.container}
          contentContainerStyle={{ paddingBottom: 40 }}
          showsVerticalScrollIndicator={false}
        >
          {/* Section: Identité */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>IDENTITÉ</Text>
            <View style={styles.card}>
              <View style={styles.inputGroup}>
                <View style={styles.labelRow}><Text style={styles.label}>Nom de l'établissement (Lecture seule)</Text><MaterialIcons name="lock" size={14} color="rgba(255,255,255,0.2)" /></View>
                <TextInput
                  style={[styles.input, { color: 'rgba(255,255,255,0.5)' }]}
                  value={formData.name || ""}
                  editable={false}
                  placeholder="Nom..."
                  placeholderTextColor="rgba(255,255,255,0.2)"
                />
              </View>
              <View style={styles.divider} />
              <View style={styles.inputGroup}>
                <View style={styles.labelRow}>
                  <Text style={styles.label}>Nom Officiel (Lecture seule)</Text>
                  <MaterialIcons name="lock" size={14} color="rgba(255,255,255,0.2)" />
                </View>
                <TextInput
                  style={[styles.input, { color: 'rgba(255,255,255,0.5)' }]}
                  value={formData.official_name || ""}
                  editable={false}
                  placeholder="Nom complet officiel..."
                  placeholderTextColor="rgba(255,255,255,0.2)"
                />
              </View>
              <View style={styles.divider} />
              <View style={styles.inputGroup}>
                <Text style={styles.label}>Sigle / Nom Court (Editable)</Text>
                <TextInput
                  style={styles.input}
                  value={formData.short_name || ""}
                  onChangeText={(val) => setFormData({ ...formData, short_name: val })}
                  placeholder="Ex: HGR-K..."
                  placeholderTextColor="rgba(255,255,255,0.2)"
                />
              </View>
              <View style={styles.divider} />
              <View style={styles.inputGroup}>
                <Text style={styles.label}>Type / Catégorie</Text>
                <View style={styles.typeGrid}>
                  {(STRUCTURE_TYPES as any[]).map((type) => (
                    <View
                      key={type.value}
                      style={[
                        styles.typeGridItem,
                        isTypeSelected(type.value) && styles.typeGridItemActive,
                        { opacity: isTypeSelected(type.value) ? 1 : 0.4 }
                      ]}
                    >
                      <Text style={[
                        styles.typeGridText,
                        isTypeSelected(type.value) && styles.typeGridTextActive
                      ]}>
                        {type.label}
                      </Text>
                    </View>
                  ))}
                </View>
              </View>
            </View>
          </View>

          {/* Section: Coordonnées */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>COORDONNÉES</Text>
            <View style={styles.card}>
              <View style={styles.inputGroup}>
                <View style={styles.labelRow}>
                  <Text style={styles.label}>Adresse (Lecture seule)</Text>
                  <MaterialIcons name="lock" size={14} color="rgba(255,255,255,0.2)" />
                </View>
                <TextInput
                  style={[styles.input, { height: 60, color: 'rgba(255,255,255,0.5)' }]}
                  multiline
                  value={formData.address || ""}
                  editable={false}
                  placeholder="Avenue, Commune, Ville..."
                  placeholderTextColor="rgba(255,255,255,0.2)"
                />
              </View>
              <View style={styles.divider} />
              <View style={styles.inputGroup}>
                <Text style={styles.label}>Téléphone</Text>
                <TextInput
                  style={styles.input}
                  keyboardType="phone-pad"
                  value={formData.phone || ""}
                  onChangeText={(val) => setFormData({ ...formData, phone: val })}
                  placeholder="+243..."
                  placeholderTextColor="rgba(255,255,255,0.2)"
                />
              </View>
              <View style={styles.divider} />
              <View style={styles.inputGroup}>
                <Text style={styles.label}>Email</Text>
                <TextInput
                  style={styles.input}
                  keyboardType="email-address"
                  autoCapitalize="none"
                  value={formData.email || ""}
                  onChangeText={(val) => setFormData({ ...formData, email: val })}
                  placeholder="contact@hopital.com"
                  placeholderTextColor="rgba(255,255,255,0.2)"
                />
              </View>
              <View style={styles.divider} />
              <View style={styles.inputGroup}>
                <Text style={styles.label}>Contact de garde (Nom/Titre)</Text>
                <TextInput
                  style={styles.input}
                  value={formData.contact_person || ""}
                  onChangeText={(val) => setFormData({ ...formData, contact_person: val })}
                  placeholder="Ex: Dr. Joe (Chef de garde)"
                  placeholderTextColor="rgba(255,255,255,0.2)"
                />
              </View>
            </View>
          </View>

          {/* Section: Disponibilité */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>DISPONIBILITÉ & CAPACITÉ</Text>
            <View style={styles.card}>
              <View style={styles.toggleItem}>
                <View>
                  <Text style={styles.itemMainLabel}>Établissement ouvert</Text>
                  <Text style={styles.itemSubLabel}>Définit si l'établissement peut recevoir des urgences</Text>
                </View>
                <Switch
                  value={formData.is_open}
                  onValueChange={(val) => setFormData({ ...formData, is_open: val })}
                  trackColor={{ false: "#333", true: colors.secondary }}
                />
              </View>
              <View style={styles.divider} />
              <View style={styles.inputGroup}>
                <Text style={styles.label}>Horaires d'ouverture</Text>
                <TextInput
                  style={styles.input}
                  value={formData.operating_hours || ""}
                  onChangeText={(val) => setFormData({ ...formData, operating_hours: val })}
                  placeholder="Ex: 24h/24 ou 08:00 - 20:00"
                  placeholderTextColor="rgba(255,255,255,0.2)"
                />
              </View>
              <View style={styles.divider} />
              <View style={styles.row}>
                <View style={[styles.inputGroup, { flex: 1 }]}>
                  <Text style={styles.label}>Capacité Totale (Lits)</Text>
                  <TextInput
                    style={styles.input}
                    keyboardType="number-pad"
                    value={String(formData.capacity || "")}
                    onChangeText={(val) => setFormData({ ...formData, capacity: parseInt(val) || 0 })}
                    placeholder="0"
                    placeholderTextColor="rgba(255,255,255,0.2)"
                  />
                </View>
                <View style={[styles.divider, { width: 1, height: '100%', marginHorizontal: 0 }]} />
                <View style={[styles.inputGroup, { flex: 1 }]}>
                  <Text style={styles.label}>Lits Disponibles</Text>
                  <TextInput
                    style={styles.input}
                    keyboardType="number-pad"
                    value={String(formData.available_beds || "")}
                    onChangeText={(val) => setFormData({ ...formData, available_beds: parseInt(val) || 0 })}
                    placeholder="0"
                    placeholderTextColor="rgba(255,255,255,0.2)"
                  />
                </View>
              </View>
            </View>
          </View>

          {/* Section: GPS */}
          <View style={[styles.section, { marginBottom: 24 }]} >
            <View style={styles.labelRow}>
              <Text style={styles.sectionTitle}>GÉOLOCALISATION (GPS)</Text>
              <MaterialIcons name="lock" size={14} color="rgba(255,255,255,0.2)" style={{ marginRight: 16 }} />
            </View>
            <View style={styles.card}>
              <View style={styles.row}>
                <View style={[styles.inputGroup, { flex: 1 }]}>
                  <Text style={styles.label}>Latitude</Text>
                  <TextInput
                    style={[styles.input, { color: 'rgba(255,255,255,0.5)' }]}
                    editable={false}
                    value={String(formData.lat || "")}
                    placeholder="-4.30..."
                    placeholderTextColor="rgba(255,255,255,0.2)"
                  />
                </View>
                <View style={[styles.divider, { width: 1, height: '100%', marginHorizontal: 0 }]} />
                <View style={[styles.inputGroup, { flex: 1 }]}>
                  <Text style={styles.label}>Longitude</Text>
                  <TextInput
                    style={[styles.input, { color: 'rgba(255,255,255,0.5)' }]}
                    editable={false}
                    value={String(formData.lng || "")}
                    placeholder="15.30..."
                    placeholderTextColor="rgba(255,255,255,0.2)"
                  />
                </View>
              </View>
            </View>
          </View>

          {/* Section: Spécialités */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>SPÉCIALITÉS</Text>
            <View style={styles.card}>
              <View style={styles.tagGrid}>
                {COMMON_SPECIALTIES.map((spec) => {
                  const isActive = formData.specialties?.some(s => s.toLowerCase() === spec.value.toLowerCase());
                  return (
                    <AppTouchableOpacity
                      key={spec.value}
                      style={[
                        styles.tagGridItem,
                        isActive && styles.tagGridItemActive,
                      ]}
                      onPress={() => toggleSpecialty(spec.value)}
                    >
                      <View style={styles.tagRow}>
                        {isActive ? (
                          <MaterialIcons name="check" size={12} color={colors.secondary} style={{ marginRight: 4 }} />
                        ) : (
                          <View style={styles.emptyCheck} />
                        )}
                        <Text style={[styles.tagGridText, isActive && styles.tagGridTextActive]}>
                          {spec.label}
                        </Text>
                      </View>
                    </AppTouchableOpacity>
                  );
                })}
              </View>

              {/* Extras (Specialties added but not in common list) */}
              {formData.specialties?.filter(s =>
                !COMMON_SPECIALTIES.some(cs => cs.value.toLowerCase() === s.toLowerCase())
              ).map(extra => (
                <View key={extra} style={[styles.equipmentTag, { marginHorizontal: 16, marginBottom: 8 }]}>
                  <Text style={styles.tagText}>{extra}</Text>
                  <AppTouchableOpacity onPress={() => removeSpecialty(extra)} style={styles.removeTagBtn}>
                    <MaterialIcons name="close" size={14} color="rgba(255,255,255,0.4)" />
                  </AppTouchableOpacity>
                </View>
              ))}

              <View style={styles.equipmentInputRow}>
                <TextInput
                  style={[styles.input, { flex: 1, fontSize: 13 }]}
                  value={newSpecialty}
                  onChangeText={setNewSpecialty}
                  placeholder="Autre spécialité..."
                  placeholderTextColor="rgba(255,255,255,0.2)"
                  onSubmitEditing={addSpecialty}
                />
                <AppTouchableOpacity style={styles.addBtn} onPress={addSpecialty}>
                  <MaterialIcons name="add" size={20} color="#FFF" />
                </AppTouchableOpacity>
              </View>
            </View>
          </View>

          {/* Section: Équipements */}
          <View style={[styles.section, { marginBottom: 24 }]} >
            <Text style={styles.sectionTitle}>ÉQUIPEMENTS</Text>
            <View style={styles.card}>
              <View style={styles.equipmentInputRow}>
                <TextInput
                  style={[styles.input, { flex: 1 }]}
                  value={newEquipment}
                  onChangeText={setNewEquipment}
                  placeholder="Ajouter (Scanner, Bloc, IRM...)"
                  placeholderTextColor="rgba(255,255,255,0.2)"
                  onSubmitEditing={addEquipment}
                />
                <AppTouchableOpacity style={styles.addBtn} onPress={addEquipment}>
                  <MaterialIcons name="add" size={24} color="#FFF" />
                </AppTouchableOpacity>
              </View>
              {formData.equipment && formData.equipment.length > 0 && (
                <View style={[styles.tagContainer, { paddingTop: 0, paddingBottom: 16 }]}>
                  {formData.equipment.map((eq) => (
                    <View key={eq} style={styles.equipmentTag}>
                      <Text style={styles.tagText}>{eq}</Text>
                      <AppTouchableOpacity onPress={() => removeEquipment(eq)} style={styles.removeTagBtn}>
                        <MaterialIcons name="close" size={14} color="rgba(255,255,255,0.4)" />
                      </AppTouchableOpacity>
                    </View>
                  ))}
                </View>
              )}
            </View>
          </View>

          {/* Administrative Footer */}
          <View style={styles.footerInfo}>
            <MaterialIcons name="info-outline" size={16} color="rgba(255,255,255,0.3)" />
            <Text style={styles.footerInfoText}>
              Pour modifier les informations administratives (Nom, Adresse, GPS), contactez l'administrateur du Centre Étoile Bleue.
            </Text>
          </View>
          <View style={{ height: 40 }} />
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: colors.mainBackground },
  loadingContainer: { flex: 1, justifyContent: "center", alignItems: "center" },
  loadingText: { color: "rgba(255,255,255,0.5)", marginTop: 16, fontWeight: "600" },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    height: 60,
    backgroundColor: "#0A0A0A",
  },
  backBtn: { width: 44, height: 44, justifyContent: "center", alignItems: "center" },
  headerTitle: { color: "#FFF", fontSize: 18, fontWeight: "800" },
  saveBtn: {
    backgroundColor: colors.secondary,
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 8,
  },
  saveBtnText: { color: "#FFF", fontSize: 13, fontWeight: "900" },
  container: { flex: 1 },
  section: { marginTop: 24, paddingHorizontal: 20 },
  sectionTitle: {
    color: "rgba(255,255,255,0.25)",
    fontSize: 11,
    fontWeight: "900",
    letterSpacing: 1.5,
    marginBottom: 10,
    marginLeft: 12,
  },
  card: {
    backgroundColor: "#1A1A1A",
    borderRadius: 10,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.05)",
  },
  inputGroup: { padding: 16 },
  label: { color: "rgba(255,255,255,0.4)", fontSize: 11, fontWeight: "800", marginBottom: 6, textTransform: "uppercase" },
  input: { color: "#FFF", fontSize: 15, fontWeight: "600", padding: 0 },
  labelRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 4,
    paddingRight: 4,
  },
  divider: { height: 1, backgroundColor: "rgba(255,255,255,0.03)", marginHorizontal: 16 },
  row: { flexDirection: "row", alignItems: "center" },
  typeGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    padding: 12,
    justifyContent: "space-between",
  },
  typeGridItem: {
    width: "48%",
    backgroundColor: "rgba(255,255,255,0.03)",
    paddingVertical: 12,
    paddingHorizontal: 8,
    borderRadius: 8,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.05)",
    alignItems: "center",
  },
  typeGridItemActive: {
    backgroundColor: "rgba(56, 182, 255, 0.25)", // Plus visible
    borderColor: colors.secondary,
    borderWidth: 2, // Plus épais
  },
  typeGridText: {
    color: "rgba(255,255,255,0.4)",
    fontSize: 13,
    fontWeight: "700",
    textAlign: "center",
  },
  typeGridTextActive: {
    color: colors.secondary,
  },
  tagGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    padding: 12,
    justifyContent: "space-between",
  },
  tagGridItem: {
    width: "48%",
    backgroundColor: "rgba(255,255,255,0.02)",
    paddingVertical: 10,
    paddingHorizontal: 8,
    borderRadius: 8,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.03)",
  },
  tagGridItemActive: {
    backgroundColor: "rgba(56, 182, 255, 0.05)",
    borderColor: "rgba(56, 182, 255, 0.2)",
  },
  tagRow: {
    flexDirection: "row",
    alignItems: "center",
  },
  emptyCheck: {
    width: 12,
    height: 12,
    borderRadius: 3,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.1)",
    marginRight: 6,
  },
  tagGridText: {
    flex: 1,
    color: "rgba(255,255,255,0.4)",
    fontSize: 11,
    fontWeight: "600",
  },
  tagGridTextActive: {
    color: "#FFF",
    fontWeight: "800",
  },
  toggleItem: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    padding: 16,
  },
  itemMainLabel: { color: "#FFF", fontSize: 15, fontWeight: "700" },
  itemSubLabel: { color: "rgba(255,255,255,0.3)", fontSize: 12, marginTop: 2 },
  tagContainer: {
    flexDirection: "row",
    flexWrap: "wrap",
    padding: 12,
    gap: 8,
  },
  tag: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 12,
    backgroundColor: "rgba(255,255,255,0.05)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.05)",
  },
  tagActive: {
    backgroundColor: colors.secondary,
    borderColor: colors.secondary,
  },
  tagText: { color: "rgba(255,255,255,0.5)", fontSize: 12, fontWeight: "700" },
  tagTextActive: { color: "#FFF" },
  equipmentInputRow: {
    flexDirection: "row",
    alignItems: "center",
    padding: 16,
  },
  addBtn: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: "rgba(255,255,255,0.1)",
    justifyContent: "center",
    alignItems: "center",
    marginLeft: 12,
  },
  equipmentTag: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 10,
    backgroundColor: "rgba(255,255,255,0.08)",
    gap: 6,
  },
  removeTagBtn: {
    marginLeft: 2,
  },
  footerInfo: {
    marginTop: 24,
    marginHorizontal: 20,
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "rgba(255,255,255,0.02)",
    padding: 16,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.05)",
    gap: 12,
  },
  footerInfoText: {
    flex: 1,
    color: "rgba(255,255,255,0.3)",
    fontSize: 12,
    lineHeight: 18,
    fontWeight: "500",
  },
});
