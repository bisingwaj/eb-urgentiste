import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, TextInput, StatusBar, Platform, Alert, Dimensions, Image, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { colors } from '../../theme/colors';
import { MaterialIcons, MaterialCommunityIcons } from '@expo/vector-icons';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';
import * as Location from 'expo-location';
import * as ImagePicker from 'expo-image-picker';
import { INCIDENT_MEDIA_BUCKET } from '../../lib/incidentTerrainPhotos';
import { readAsStringAsync, EncodingType } from 'expo-file-system/legacy';
import { AppTouchableOpacity } from "../../components/ui/AppTouchableOpacity";

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

/** Convertit un base64 en ArrayBuffer pour l'upload Storage Supabase */
function base64ToArrayBuffer(base64: string): ArrayBuffer {
  const binaryString = globalThis.atob(base64);
  const len = binaryString.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return bytes.buffer;
}

export function SignalerProblemeScreen({ navigation }: any) {
  const { profile } = useAuth();
  const [selectedCat, setSelectedCat] = useState<string | null>(null);
  const [selectedSev, setSelectedSev] = useState<string | null>(null);
  const [description, setDescription] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  // ── Photo state ──
  const [photos, setPhotos] = useState<{ uri: string; mimeType: string }[]>([]);
  const [photoBusy, setPhotoBusy] = useState<'camera' | 'library' | null>(null);

  // ── Prise de photo / sélection galerie ──
  const handlePickPhoto = () => {
    Alert.alert(
      '📸 Ajouter une photo',
      'Choisissez la source de l\'image',
      [
        {
          text: 'Caméra',
          onPress: () => pickPhoto('camera'),
        },
        {
          text: 'Galerie',
          onPress: () => pickPhoto('library'),
        },
        { text: 'Annuler', style: 'cancel' },
      ],
    );
  };

  const pickPhoto = async (source: 'camera' | 'library') => {
    if (photoBusy !== null) return;

    try {
      // Demande de permission
      if (source === 'camera') {
        const perm = await ImagePicker.requestCameraPermissionsAsync();
        if (perm.status !== 'granted') {
          Alert.alert('Permission requise', 'L\'accès à la caméra est nécessaire pour prendre une photo.');
          return;
        }
      } else {
        const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
        if (perm.status !== 'granted') {
          Alert.alert('Permission requise', 'L\'accès à la galerie est nécessaire pour choisir une photo.');
          return;
        }
      }

      setPhotoBusy(source);

      const result = source === 'camera'
        ? await ImagePicker.launchCameraAsync({
            mediaTypes: ImagePicker.MediaTypeOptions.Images,
            quality: 0.75,
          })
        : await ImagePicker.launchImageLibraryAsync({
            mediaTypes: ['images'],
            quality: 0.75,
            allowsMultipleSelection: false,
            ...(Platform.OS === 'android' ? { legacy: true as const } : {}),
          });

      if (result.canceled || !result.assets?.[0]) {
        return;
      }

      const asset = result.assets[0];
      setPhotos(prev => [...prev, {
        uri: asset.uri,
        mimeType: asset.mimeType ?? 'image/jpeg',
      }]);
    } catch (err: any) {
      console.error('[SignalerProbleme] Erreur photo:', err.message);
      Alert.alert('Erreur', 'Impossible de récupérer la photo.');
    } finally {
      setPhotoBusy(null);
    }
  };

  const handleRemovePhoto = (index: number) => {
    setPhotos(prev => prev.filter((_, i) => i !== index));
  };

  // ── Upload des photos vers Supabase Storage ──
  const uploadPhoto = async (photo: { uri: string; mimeType: string }, reportId: string): Promise<string> => {
    const isPng = photo.mimeType.toLowerCase().includes('png');
    const ext = isPng ? 'png' : 'jpg';
    const contentType = isPng ? 'image/png' : 'image/jpeg';
    const path = `field-reports/${reportId}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;

    let arrayBuffer: ArrayBuffer;
    if (photo.uri.startsWith('http://') || photo.uri.startsWith('https://')) {
      const res = await fetch(photo.uri);
      if (!res.ok) throw new Error(`Téléchargement impossible (${res.status})`);
      arrayBuffer = await res.arrayBuffer();
    } else {
      const base64 = await readAsStringAsync(photo.uri, { encoding: EncodingType.Base64 });
      arrayBuffer = base64ToArrayBuffer(base64);
    }

    const { error: uploadError } = await supabase.storage
      .from(INCIDENT_MEDIA_BUCKET)
      .upload(path, arrayBuffer, { contentType, upsert: false });

    if (uploadError) throw uploadError;

    const { data: pub } = supabase.storage.from(INCIDENT_MEDIA_BUCKET).getPublicUrl(path);
    return pub.publicUrl;
  };

  // ── Soumission du rapport ──
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

      // Générer un ID temporaire pour le chemin Storage
      const tempReportId = `${userId ?? 'anon'}-${Date.now()}`;

      // Upload des photos si présentes
      let mediaUrls: string[] = [];
      if (photos.length > 0) {
        console.log(`[Signalement] Upload de ${photos.length} photo(s)...`);
        for (const photo of photos) {
          try {
            const url = await uploadPhoto(photo, tempReportId);
            mediaUrls.push(url);
          } catch (uploadErr: any) {
            console.error('[Signalement] Erreur upload photo:', uploadErr.message);
            // On continue même si une photo échoue
          }
        }
      }
      
      const insertData: Record<string, any> = {
        user_id: userId,
        unit_id: profile?.assigned_unit_id || null,
        category: selectedCat,
        severity: selectedSev,
        description: description.trim(),
        location_lat: lat,
        location_lng: lng,
        status: 'new',
      };

      // Ajouter les URLs des photos si disponibles
      if (mediaUrls.length > 0) {
        insertData.media_urls = mediaUrls;
      }

      const { error } = await supabase
        .from('field_reports')
        .insert(insertData);

      if (error) throw error;

      Alert.alert(
        '✅ Rapport envoyé',
        `Le département logistique a été notifié de l'incident.${mediaUrls.length > 0 ? ` ${mediaUrls.length} photo(s) jointe(s).` : ''} Votre signalement est enregistré.`,
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
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      <StatusBar barStyle="light-content" />
      
      <View style={styles.topHeader}>
        <View style={styles.headerRow}>
          <AppTouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
            <MaterialIcons name="arrow-back" color="#FFF" size={24} />
          </AppTouchableOpacity>
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
                <AppTouchableOpacity 
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
                </AppTouchableOpacity>
             )
          })}
        </View>

        <Text style={styles.sectionTitle}>SÉVÉRITÉ IDENTIFIÉE</Text>
        <View style={styles.listCard}>
          {SEVERITIES.map((sev, i) => {
             const isActive = selectedSev === sev.id;
             return (
                <AppTouchableOpacity
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
                    <Text style={{ color: sev.color, fontSize: 12, fontWeight: '900', letterSpacing: 1 }}>ACTIF</Text>
                  </View>}
                </AppTouchableOpacity>
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

        {/* ── Section Photos ── */}
        <Text style={styles.sectionTitle}>PREUVES PHOTOGRAPHIQUES</Text>

        {/* Miniatures des photos prises */}
        {photos.length > 0 && (
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            style={styles.photosScrollContainer}
            contentContainerStyle={styles.photosScroll}
          >
            {photos.map((photo, index) => (
              <View key={`${photo.uri}-${index}`} style={styles.photoThumbWrapper}>
                <Image source={{ uri: photo.uri }} style={styles.photoThumb} />
                <TouchableOpacity
                  style={styles.photoRemoveBtn}
                  onPress={() => handleRemovePhoto(index)}
                  hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                >
                  <MaterialIcons name="close" color="#FFF" size={14} />
                </TouchableOpacity>
                <View style={styles.photoIndexBadge}>
                  <Text style={styles.photoIndexText}>{index + 1}</Text>
                </View>
              </View>
            ))}
          </ScrollView>
        )}

        {/* Boutons Caméra + Galerie */}
        <View style={styles.mediaButtonsRow}>
          <TouchableOpacity
            style={[styles.mediaBtn, styles.mediaBtnCamera, photoBusy === 'camera' && { opacity: 0.7 }]}
            onPress={() => pickPhoto('camera')}
            disabled={photoBusy !== null}
            activeOpacity={0.7}
          >
            {photoBusy === 'camera' ? (
              <ActivityIndicator color={colors.secondary} size="small" />
            ) : (
              <>
                <MaterialIcons name="photo-camera" color={colors.secondary} size={24} />
                <Text style={styles.mediaBtnText}>Caméra</Text>
              </>
            )}
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.mediaBtn, styles.mediaBtnGallery, photoBusy === 'library' && { opacity: 0.7 }]}
            onPress={() => pickPhoto('library')}
            disabled={photoBusy !== null}
            activeOpacity={0.7}
          >
            {photoBusy === 'library' ? (
              <ActivityIndicator color="rgba(255,255,255,0.6)" size="small" />
            ) : (
              <>
                <MaterialIcons name="photo-library" color="rgba(255,255,255,0.6)" size={24} />
                <Text style={styles.mediaBtnTextSecondary}>Galerie</Text>
              </>
            )}
          </TouchableOpacity>
        </View>

        {photos.length > 0 && (
          <Text style={styles.photoCountHint}>
            {photos.length} photo{photos.length > 1 ? 's' : ''} sélectionnée{photos.length > 1 ? 's' : ''}
          </Text>
        )}

      </ScrollView>

      <View style={styles.footer}>
         <AppTouchableOpacity 
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
         </AppTouchableOpacity>
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
  sectionTitle: { color: colors.textMuted, fontSize: 13, fontWeight: '800', marginLeft: 16, marginBottom: 15, marginTop: 25, letterSpacing: 1.5 },

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

  // ── Photos ──
  photosScrollContainer: { marginBottom: 16 },
  photosScroll: { paddingHorizontal: 4, gap: 12 },
  photoThumbWrapper: { position: 'relative' },
  photoThumb: {
    width: 88,
    height: 88,
    borderRadius: 20,
    backgroundColor: '#1A1A1A',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
  },
  photoRemoveBtn: {
    position: 'absolute',
    top: -6,
    right: -6,
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: colors.primary,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 2,
    borderColor: colors.mainBackground,
  },
  photoIndexBadge: {
    position: 'absolute',
    bottom: 6,
    left: 6,
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: 'rgba(0,0,0,0.7)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  photoIndexText: {
    color: '#FFF',
    fontSize: 11,
    fontWeight: '900',
  },

  mediaButtonsRow: {
    flexDirection: 'row',
    gap: 12,
  },
  mediaBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 32,
    paddingVertical: 22,
    borderWidth: 1.5,
    borderStyle: 'dashed',
    gap: 10,
  },
  mediaBtnCamera: {
    backgroundColor: colors.secondary + '08',
    borderColor: colors.secondary + '30',
  },
  mediaBtnGallery: {
    backgroundColor: 'rgba(255,255,255,0.03)',
    borderColor: 'rgba(255,255,255,0.12)',
  },
  mediaBtnText: { color: colors.secondary, fontSize: 15, fontWeight: '800' },
  mediaBtnTextSecondary: { color: 'rgba(255,255,255,0.6)', fontSize: 15, fontWeight: '800' },

  photoCountHint: {
    color: colors.secondary,
    fontSize: 13,
    fontWeight: '700',
    textAlign: 'center',
    marginTop: 14,
    letterSpacing: 0.5,
  },

  footer: { padding: 24, backgroundColor: colors.mainBackground, borderTopWidth: 1, borderTopColor: "rgba(255,255,255,0.05)" },
  btnSubmit: { backgroundColor: colors.secondary, height: 64, borderRadius: 32, alignItems: 'center', justifyContent: 'center' },
  btnSubmitText: { color: '#FFF', fontSize: 16, fontWeight: '900', letterSpacing: 1 },
});
