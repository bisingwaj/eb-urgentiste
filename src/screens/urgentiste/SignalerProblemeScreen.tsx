import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, TextInput, StatusBar, Platform, Alert, Dimensions } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { colors } from '../../theme/colors';
import { MaterialIcons, MaterialCommunityIcons } from '@expo/vector-icons';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';
import * as Location from 'expo-location';

const CATEGORIES = [
  { id: 'vehicle', label: 'Véhicule', icon: "local-shipping" as const },
  { id: 'equipment', label: 'Matériel', icon: "build" as const },
  { id: 'network', label: 'Réseau', icon: "wifi-off" as const },
  { id: 'other', label: 'Autre', icon: "error" as const },
];

const SEVERITIES = [
  { id: 'low', label: 'Faible', color: colors.secondary },
  { id: 'medium', label: 'Modérée', color: "#FF9800" },
  { id: 'high', label: 'Critique', color: colors.primary },
];

export function SignalerProblemeScreen({ navigation }: any) {
  const { profile } = useAuth();
  const [selectedCat, setSelectedCat] = useState<string | null>(null);
  const [selectedSev, setSelectedSev] = useState<string | null>(null);
  const [description, setDescription] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async () => {
    if (!selectedCat || !selectedSev || description.trim().length === 0) return;
    
    setIsSubmitting(true);
    try {
      // Récupérer la position GPS actuelle
      let lat: number | null = null;
      let lng: number | null = null;
      try {
        const { status } = await Location.requestForegroundPermissionsAsync();
        if (status === 'granted') {
          const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
          lat = loc.coords.latitude;
          lng = loc.coords.longitude;
        }
      } catch (gpsErr) {
        console.log('[Signalement] GPS non disponible');
      }

      const userId = (await supabase.auth.getUser()).data.user?.id;
      
      const { error } = await supabase
        .from('field_reports')
        .insert({
          user_id: userId,
          unit_id: profile?.assigned_unit_id || null,
          category: selectedCat,
          severity: selectedSev,
          description: description.trim(),
          location_lat: lat,
          location_lng: lng,
          status: 'new',
        });

      if (error) throw error;

      Alert.alert(
        '✅ Rapport envoyé',
        'Le département logistique a été notifié de l\'incident. Votre signalement est enregistré.',
        [{ text: 'Fermer', onPress: () => navigation.goBack() }]
      );
    } catch (err: any) {
      console.error('[Signalement] Erreur:', err.message);
      Alert.alert('Erreur', `Impossible d'envoyer le rapport : ${err.message}`);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <StatusBar barStyle="light-content" />
      
      <View style={styles.topHeader}>
        <View style={styles.headerRow}>
          <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
            <MaterialIcons name="arrow-back" color="#FFF" size={24} />
          </TouchableOpacity>
          <View>
             <Text style={styles.greetingText}>LOGISTIQUE</Text>
             <Text style={styles.hospitalName}>Rapport d'Incident</Text>
          </View>
          <View style={{ width: 44 }} />
        </View>
      </View>

      <ScrollView contentContainerStyle={styles.scrollPad} showsVerticalScrollIndicator={false}>
        
        <Text style={styles.sectionTitle}>CATÉGORIE DE L'ANOMALIE</Text>
        <View style={styles.grid}>
          {CATEGORIES.map(cat => {
             const isActive = selectedCat === cat.id;
             return (
                <TouchableOpacity 
                   key={cat.id} 
                   style={[styles.catCard, isActive && styles.catCardActive]} 
                   onPress={() => setSelectedCat(cat.id)}
                   activeOpacity={0.7}
                >
                  <View style={[styles.iconCircle, { backgroundColor: isActive ? colors.secondary + '20' : "#121212" }]}>
                     <MaterialIcons name={cat.icon} color={isActive ? colors.secondary : "rgba(255,255,255,0.2)"} size={28} />
                  </View>
                  <Text style={[styles.catText, isActive && styles.catTextActive]}>{cat.label}</Text>
                  {isActive && <View style={styles.checkBadge}><MaterialIcons name="check" color="#FFF" size={10} /></View>}
                </TouchableOpacity>
             )
          })}
        </View>

        <Text style={styles.sectionTitle}>SÉVÉRITÉ IDENTIFIÉE</Text>
        <View style={styles.listCard}>
          {SEVERITIES.map((sev, i) => {
             const isActive = selectedSev === sev.id;
             return (
                <TouchableOpacity
                   key={sev.id}
                   style={[styles.sevItem, i === SEVERITIES.length - 1 && { borderBottomWidth: 0 }]}
                   onPress={() => setSelectedSev(sev.id)}
                   activeOpacity={0.7}
                >
                  <View style={[styles.sevRadio, { borderColor: "rgba(255,255,255,0.1)" }, isActive && { borderColor: sev.color }]}>
                    {isActive && <View style={[styles.sevRadioInner, { backgroundColor: sev.color }]} />}
                  </View>
                  <Text style={[styles.sevText, isActive && { color: "#FFF", fontWeight: '800' }]}>{sev.label.toUpperCase()}</Text>
                  {isActive && <View style={[styles.sevTag, { backgroundColor: sev.color + '15' }]}>
                    <Text style={{ color: sev.color, fontSize: 10, fontWeight: '900', letterSpacing: 1 }}>ACTIF</Text>
                  </View>}
                </TouchableOpacity>
             )
          })}
        </View>

        <Text style={styles.sectionTitle}>DESCRIPTION DES FAITS</Text>
        <View style={styles.inputCard}>
          <TextInput 
             style={styles.input}
             placeholder="Détaillez le problème rencontré..."
             placeholderTextColor="rgba(255,255,255,0.3)"
             multiline
             value={description}
             onChangeText={setDescription}
          />
        </View>
 
        <TouchableOpacity style={styles.mediaBtn}>
           <MaterialIcons name="photo-camera" color={colors.secondary} size={24} />
           <Text style={styles.mediaBtnText}>Prendre une photo</Text>
        </TouchableOpacity>

      </ScrollView>

      <View style={styles.footer}>
         <TouchableOpacity 
           style={[
              styles.btnSubmit, 
              (!selectedCat || !selectedSev || description.trim().length === 0 || isSubmitting) && { backgroundColor: "#1A1A1A", opacity: 0.5 }
           ]}
           onPress={handleSubmit}
           disabled={!selectedCat || !selectedSev || description.trim().length === 0 || isSubmitting}
         >
           <Text style={[styles.btnSubmitText, (!selectedCat || !selectedSev || description.trim().length === 0) && { color: "rgba(255,255,255,0.3)" }]}>
              {isSubmitting ? 'ENVOI EN COURS...' : 'ENVOYER LE RAPPORT'}
           </Text>
         </TouchableOpacity>
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
    backgroundColor: "#0A0A0A" 
  },
  headerRow: { 
    flexDirection: "row", 
    justifyContent: "space-between", 
    alignItems: "center", 
  },
  backBtn: { 
    width: 44, 
    height: 44, 
    borderRadius: 16, 
    backgroundColor: "#1A1A1A", 
    justifyContent: "center", 
    alignItems: "center", 
    borderWidth: 1, 
    borderColor: "rgba(255,255,255,0.1)" 
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

  scrollPad: { paddingHorizontal: 20, paddingBottom: 100 },
  sectionTitle: { color: colors.textMuted, fontSize: 11, fontWeight: '800', marginLeft: 16, marginBottom: 15, marginTop: 25, letterSpacing: 1.5 },

  grid: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between' },
  catCard: { width: '48%', backgroundColor: "#1A1A1A", borderRadius: 32, padding: 24, alignItems: 'center', marginBottom: 15, borderWidth: 1, borderColor: "rgba(255,255,255,0.05)" },
  catCardActive: { borderColor: colors.secondary + '40', backgroundColor: "#1A1A1A" },
  iconCircle: { width: 64, height: 64, borderRadius: 24, justifyContent: 'center', alignItems: 'center', marginBottom: 15 },
  catText: { fontSize: 14, fontWeight: '700', color: colors.textMuted },
  catTextActive: { color: "#FFF", fontWeight: '900' },
  checkBadge: { position: 'absolute', top: 12, right: 12, width: 22, height: 22, borderRadius: 11, backgroundColor: colors.secondary, justifyContent: 'center', alignItems: 'center' },

  listCard: { backgroundColor: "#1A1A1A", borderRadius: 32, overflow: 'hidden', marginBottom: 25, borderWidth: 1, borderColor: "rgba(255,255,255,0.05)" },
  sevItem: { flexDirection: 'row', alignItems: 'center', padding: 22, borderBottomWidth: 1, borderBottomColor: "rgba(255,255,255,0.02)" },
  sevRadio: { width: 24, height: 24, borderRadius: 12, borderWidth: 2, alignItems: 'center', justifyContent: 'center', marginRight: 15 },
  sevRadioInner: { width: 12, height: 12, borderRadius: 6 },
  sevText: { fontSize: 15, color: colors.textMuted, fontWeight: '700', flex: 1, letterSpacing: 0.5 },
  sevTag: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 10 },

  inputCard: { backgroundColor: "#1A1A1A", borderRadius: 32, padding: 22, marginBottom: 20, borderWidth: 1, borderColor: "rgba(255,255,255,0.05)" },
  input: { fontSize: 16, color: "#FFF", fontWeight: '600', minHeight: 120, textAlignVertical: 'top' },

  mediaBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', backgroundColor: colors.secondary + '08', borderRadius: 32, paddingVertical: 22, borderWidth: 1.5, borderColor: colors.secondary + '20', borderStyle: 'dashed', gap: 12 },
  mediaBtnText: { color: colors.secondary, fontSize: 16, fontWeight: '800' },

  footer: { padding: 24, backgroundColor: colors.mainBackground, borderTopWidth: 1, borderTopColor: "rgba(255,255,255,0.05)" },
  btnSubmit: { backgroundColor: colors.secondary, height: 64, borderRadius: 32, alignItems: 'center', justifyContent: 'center' },
  btnSubmitText: { color: '#FFF', fontSize: 16, fontWeight: '900', letterSpacing: 1 },
});
