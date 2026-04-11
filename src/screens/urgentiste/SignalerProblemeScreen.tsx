import React, { useState } from 'react';
import { View, Text, StyleSheet, TextInput, StatusBar, Platform, Alert, Image, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { colors } from '../../theme/colors';
import { MaterialIcons } from '@expo/vector-icons';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';
import * as Location from 'expo-location';
import * as ImagePicker from 'expo-image-picker';
import { INCIDENT_MEDIA_BUCKET } from '../../lib/incidentTerrainPhotos';
import { readAsStringAsync, EncodingType } from 'expo-file-system/legacy';
import { AppTouchableOpacity } from '../../components/ui/AppTouchableOpacity';

const CATEGORIES = [
  { id: 'vehicle', label: 'Véhicule', icon: 'local-shipping' as const },
  { id: 'equipment', label: 'Matériel', icon: 'build' as const },
  { id: 'network', label: 'Réseau', icon: 'wifi-off' as const },
  { id: 'other', label: 'Autre', icon: 'error' as const },
];

const SEVERITIES = [
  { id: 'low', label: 'Faible', color: colors.secondary },
  { id: 'medium', label: 'Modérée', color: '#FF9800' },
  { id: 'high', label: 'Critique', color: colors.primary },
];

const REPORT_STEPS = [
  { title: "Type d'anomalie", subtitle: 'Choisissez la catégorie la plus proche.' },
  { title: 'Gravité perçue', subtitle: 'Indiquez le niveau de sévérité.' },
  { title: 'Description des faits', subtitle: 'Détaillez ce qui s’est passé.' },
  { title: 'Preuves photographiques', subtitle: 'Optionnel — ajoutez des photos si utile.' },
] as const;

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
  const [step, setStep] = useState(0);
  const [selectedCat, setSelectedCat] = useState<string | null>(null);
  const [selectedSev, setSelectedSev] = useState<string | null>(null);
  const [description, setDescription] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [photos, setPhotos] = useState<{ uri: string; mimeType: string }[]>([]);
  const [photoBusy, setPhotoBusy] = useState<'camera' | 'library' | null>(null);

  const pickPhoto = async (source: 'camera' | 'library') => {
    if (photoBusy !== null) return;
    try {
      if (source === 'camera') {
        const perm = await ImagePicker.requestCameraPermissionsAsync();
        if (perm.status !== 'granted') {
          Alert.alert('Permission requise', "L'accès à la caméra est nécessaire pour prendre une photo.");
          return;
        }
      } else {
        const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
        if (perm.status !== 'granted') {
          Alert.alert('Permission requise', "L'accès à la galerie est nécessaire pour choisir une photo.");
          return;
        }
      }
      setPhotoBusy(source);
      const result =
        source === 'camera'
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
      if (result.canceled || !result.assets?.[0]) return;
      const asset = result.assets[0];
      setPhotos((prev) => [...prev, { uri: asset.uri, mimeType: asset.mimeType ?? 'image/jpeg' }]);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error('[SignalerProbleme] Erreur photo:', msg);
      Alert.alert('Erreur', 'Impossible de récupérer la photo.');
    } finally {
      setPhotoBusy(null);
    }
  };

  const handleRemovePhoto = (index: number) => {
    setPhotos((prev) => prev.filter((_, i) => i !== index));
  };

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

  const canAdvance = (): boolean => {
    if (step === 0) return !!selectedCat;
    if (step === 1) return !!selectedSev;
    if (step === 2) return description.trim().length > 0;
    return true;
  };

  const canSubmitForm = (): boolean =>
    !!selectedCat && !!selectedSev && description.trim().length > 0 && !isSubmitting;

  const handleSubmit = async () => {
    if (!canSubmitForm()) return;
    setIsSubmitting(true);
    try {
      let lat: number | null = null;
      let lng: number | null = null;
      try {
        const { status } = await Location.requestForegroundPermissionsAsync();
        if (status === 'granted') {
          const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
          lat = loc.coords.latitude;
          lng = loc.coords.longitude;
        }
      } catch {
        console.log('[Signalement] GPS non disponible');
      }

      const userId = (await supabase.auth.getUser()).data.user?.id;
      const tempReportId = `${userId ?? 'anon'}-${Date.now()}`;
      let mediaUrls: string[] = [];
      if (photos.length > 0) {
        for (const photo of photos) {
          try {
            const url = await uploadPhoto(photo, tempReportId);
            mediaUrls.push(url);
          } catch (uploadErr: unknown) {
            console.error('[Signalement] Erreur upload photo:', uploadErr);
          }
        }
      }

      const insertData: Record<string, unknown> = {
        user_id: userId,
        unit_id: profile?.assigned_unit_id || null,
        category: selectedCat,
        severity: selectedSev,
        description: description.trim(),
        location_lat: lat,
        location_lng: lng,
        status: 'new',
      };
      if (mediaUrls.length > 0) insertData.media_urls = mediaUrls;

      const { error } = await supabase.from('field_reports').insert(insertData);
      if (error) throw error;

      Alert.alert(
        '✅ Rapport envoyé',
        `Le département logistique a été notifié de l'incident.${mediaUrls.length > 0 ? ` ${mediaUrls.length} photo(s) jointe(s).` : ''} Votre signalement est enregistré.`,
        [{ text: 'Fermer', onPress: () => navigation.goBack() }],
      );
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error('[Signalement] Erreur:', msg);
      Alert.alert('Erreur', `Impossible d'envoyer le rapport : ${msg}`);
    } finally {
      setIsSubmitting(false);
    }
  };

  const goNext = () => {
    if (!canAdvance()) return;
    if (step < REPORT_STEPS.length - 1) setStep((s) => s + 1);
  };

  const goBack = () => {
    if (step > 0) setStep((s) => s - 1);
    else navigation.goBack();
  };

  const lastStep = step === REPORT_STEPS.length - 1;

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      <StatusBar barStyle="light-content" />

      <View style={styles.topHeader}>
        <View style={styles.headerRow}>
          <AppTouchableOpacity onPress={goBack} style={styles.backBtn} accessibilityLabel={step > 0 ? 'Étape précédente' : 'Retour'}>
            <MaterialIcons name="arrow-back" color="#FFF" size={24} />
          </AppTouchableOpacity>
          <View style={styles.headerTitles}>
            <Text style={styles.greetingText}>LOGISTIQUE</Text>
            <Text style={styles.hospitalName}>Rapport d'incident</Text>
          </View>
          <View style={{ width: 44 }} />
        </View>
      </View>

      <View style={styles.stepsRail}>
        <Text style={styles.stepsRailCaption}>
          Étape {step + 1} / {REPORT_STEPS.length} · {REPORT_STEPS[step].title}
        </Text>
        <View style={styles.stepsRailDots}>
          {REPORT_STEPS.map((_, i) => (
            <View key={i} style={[styles.stepDot, i <= step ? styles.stepDotActive : styles.stepDotFuture]} />
          ))}
        </View>
        <Text style={styles.stepsRailSubtitle}>{REPORT_STEPS[step].subtitle}</Text>
      </View>

      <View style={styles.stepBody}>
        {step === 0 && (
          <View style={styles.stepPane}>
            <View style={styles.grid}>
              {CATEGORIES.map((cat) => {
                const isActive = selectedCat === cat.id;
                return (
                  <AppTouchableOpacity
                    key={cat.id}
                    style={[styles.catCard, isActive && styles.catCardActive]}
                    onPress={() => setSelectedCat(cat.id)}
                    activeOpacity={0.7}
                  >
                    <View style={[styles.iconCircle, { backgroundColor: isActive ? colors.secondary + '20' : '#121212' }]}>
                      <MaterialIcons name={cat.icon} color={isActive ? colors.secondary : 'rgba(255,255,255,0.2)'} size={26} />
                    </View>
                    <Text style={[styles.catText, isActive && styles.catTextActive]}>{cat.label}</Text>
                    {isActive && (
                      <View style={styles.checkBadge}>
                        <MaterialIcons name="check" color="#FFF" size={10} />
                      </View>
                    )}
                  </AppTouchableOpacity>
                );
              })}
            </View>
          </View>
        )}

        {step === 1 && (
          <View style={styles.stepPane}>
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
                    <View style={[styles.sevRadio, { borderColor: 'rgba(255,255,255,0.1)' }, isActive && { borderColor: sev.color }]}>
                      {isActive && <View style={[styles.sevRadioInner, { backgroundColor: sev.color }]} />}
                    </View>
                    <Text style={[styles.sevText, isActive && { color: '#FFF', fontWeight: '800' }]}>{sev.label.toUpperCase()}</Text>
                    {isActive && (
                      <View style={[styles.sevTag, { backgroundColor: sev.color + '15' }]}>
                        <Text style={{ color: sev.color, fontSize: 11, fontWeight: '900', letterSpacing: 1 }}>ACTIF</Text>
                      </View>
                    )}
                  </AppTouchableOpacity>
                );
              })}
            </View>
          </View>
        )}

        {step === 2 && (
          <View style={styles.stepPane}>
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
          </View>
        )}

        {step === 3 && (
          <View style={styles.stepPane}>
            {photos.length > 0 && (
              <View style={styles.photosWrap}>
                {photos.map((photo, index) => (
                  <View key={`${photo.uri}-${index}`} style={styles.photoThumbWrapper}>
                    <Image source={{ uri: photo.uri }} style={styles.photoThumb} />
                    <AppTouchableOpacity style={styles.photoRemoveBtn} onPress={() => handleRemovePhoto(index)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                      <MaterialIcons name="close" color="#FFF" size={14} />
                    </AppTouchableOpacity>
                    <View style={styles.photoIndexBadge}>
                      <Text style={styles.photoIndexText}>{index + 1}</Text>
                    </View>
                  </View>
                ))}
              </View>
            )}
            <View style={styles.mediaButtonsRow}>
              <AppTouchableOpacity
                style={[styles.mediaBtn, styles.mediaBtnCamera, photoBusy === 'camera' && { opacity: 0.7 }]}
                onPress={() => void pickPhoto('camera')}
                disabled={photoBusy !== null}
              >
                {photoBusy === 'camera' ? (
                  <ActivityIndicator color={colors.secondary} size="small" />
                ) : (
                  <>
                    <MaterialIcons name="photo-camera" color={colors.secondary} size={22} />
                    <Text style={styles.mediaBtnText}>Caméra</Text>
                  </>
                )}
              </AppTouchableOpacity>
              <AppTouchableOpacity
                style={[styles.mediaBtn, styles.mediaBtnGallery, photoBusy === 'library' && { opacity: 0.7 }]}
                onPress={() => void pickPhoto('library')}
                disabled={photoBusy !== null}
              >
                {photoBusy === 'library' ? (
                  <ActivityIndicator color="rgba(255,255,255,0.6)" size="small" />
                ) : (
                  <>
                    <MaterialIcons name="photo-library" color="rgba(255,255,255,0.6)" size={22} />
                    <Text style={styles.mediaBtnTextSecondary}>Galerie</Text>
                  </>
                )}
              </AppTouchableOpacity>
            </View>
            {photos.length > 0 && (
              <Text style={styles.photoCountHint}>
                {photos.length} photo{photos.length > 1 ? 's' : ''} — vous pouvez envoyer ou revenir modifier le texte.
              </Text>
            )}
          </View>
        )}
      </View>

      <View style={styles.footer}>
        {!lastStep ? (
          <AppTouchableOpacity
            style={[styles.btnPrimary, !canAdvance() && styles.btnDisabled]}
            onPress={goNext}
            disabled={!canAdvance()}
          >
            <Text style={[styles.btnPrimaryText, !canAdvance() && styles.btnPrimaryTextDisabled]}>Continuer</Text>
            <MaterialIcons name="chevron-right" color={canAdvance() ? '#FFF' : 'rgba(255,255,255,0.25)'} size={22} />
          </AppTouchableOpacity>
        ) : (
          <AppTouchableOpacity
            style={[styles.btnPrimary, !canSubmitForm() && styles.btnDisabled]}
            onPress={() => void handleSubmit()}
            disabled={!canSubmitForm()}
          >
            <Text style={[styles.btnPrimaryText, !canSubmitForm() && styles.btnPrimaryTextDisabled]}>
              {isSubmitting ? 'ENVOI EN COURS…' : 'ENVOYER LE RAPPORT'}
            </Text>
          </AppTouchableOpacity>
        )}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.mainBackground },
  topHeader: {
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: 16,
    borderBottomLeftRadius: 28,
    borderBottomRightRadius: 28,
    backgroundColor: '#0A0A0A',
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  headerTitles: { flex: 1, marginHorizontal: 8 },
  backBtn: {
    width: 44,
    height: 44,
    borderRadius: 16,
    backgroundColor: '#1A1A1A',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
  },
  greetingText: {
    color: 'rgba(255,255,255,0.4)',
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 1.2,
    textTransform: 'uppercase',
  },
  hospitalName: {
    color: '#FFF',
    fontSize: 20,
    fontWeight: '700',
    marginTop: 2,
  },
  stepsRail: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.06)',
    backgroundColor: 'rgba(0,0,0,0.35)',
  },
  stepsRailCaption: {
    color: 'rgba(255,255,255,0.7)',
    fontSize: 13,
    fontWeight: '800',
  },
  stepsRailSubtitle: {
    color: 'rgba(255,255,255,0.4)',
    fontSize: 12,
    fontWeight: '600',
    marginTop: 8,
    lineHeight: 16,
  },
  stepsRailDots: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 10,
  },
  stepDot: {
    flex: 1,
    height: 4,
    borderRadius: 2,
    maxWidth: 48,
    backgroundColor: 'rgba(255,255,255,0.12)',
  },
  stepDotActive: {
    backgroundColor: colors.secondary,
  },
  stepDotFuture: {
    backgroundColor: 'rgba(255,255,255,0.08)',
  },
  stepBody: {
    flex: 1,
    minHeight: 0,
    paddingHorizontal: 20,
    paddingTop: 16,
  },
  stepPane: {
    flex: 1,
    minHeight: 0,
    justifyContent: 'flex-start',
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    gap: 0,
  },
  catCard: {
    width: '48%',
    backgroundColor: '#1A1A1A',
    borderRadius: 22,
    paddingVertical: 18,
    paddingHorizontal: 12,
    alignItems: 'center',
    marginBottom: 12,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.05)',
  },
  catCardActive: { borderColor: colors.secondary + '55' },
  iconCircle: {
    width: 56,
    height: 56,
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 10,
  },
  catText: { fontSize: 13, fontWeight: '700', color: colors.textMuted },
  catTextActive: { color: '#FFF', fontWeight: '900' },
  checkBadge: {
    position: 'absolute',
    top: 10,
    right: 10,
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: colors.secondary,
    justifyContent: 'center',
    alignItems: 'center',
  },
  listCard: {
    backgroundColor: '#1A1A1A',
    borderRadius: 22,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.05)',
  },
  sevItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 16,
    paddingHorizontal: 18,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.02)',
  },
  sevRadio: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 14,
  },
  sevRadioInner: { width: 10, height: 10, borderRadius: 5 },
  sevText: { fontSize: 14, color: colors.textMuted, fontWeight: '700', flex: 1, letterSpacing: 0.5 },
  sevTag: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 8 },
  inputCard: {
    backgroundColor: '#1A1A1A',
    borderRadius: 22,
    padding: 16,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.05)',
    flex: 1,
    minHeight: 160,
    maxHeight: 280,
  },
  input: {
    fontSize: 15,
    color: '#FFF',
    fontWeight: '600',
    flex: 1,
    textAlignVertical: 'top',
    minHeight: 120,
  },
  photosWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    marginBottom: 14,
  },
  photoThumbWrapper: { position: 'relative' },
  photoThumb: {
    width: 80,
    height: 80,
    borderRadius: 16,
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
    bottom: 4,
    left: 4,
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: 'rgba(0,0,0,0.7)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  photoIndexText: { color: '#FFF', fontSize: 10, fontWeight: '900' },
  mediaButtonsRow: { flexDirection: 'row', gap: 10 },
  mediaBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 18,
    paddingVertical: 16,
    borderWidth: 1.5,
    borderStyle: 'dashed',
    gap: 8,
  },
  mediaBtnCamera: {
    backgroundColor: colors.secondary + '08',
    borderColor: colors.secondary + '30',
  },
  mediaBtnGallery: {
    backgroundColor: 'rgba(255,255,255,0.03)',
    borderColor: 'rgba(255,255,255,0.12)',
  },
  mediaBtnText: { color: colors.secondary, fontSize: 14, fontWeight: '800' },
  mediaBtnTextSecondary: { color: 'rgba(255,255,255,0.6)', fontSize: 14, fontWeight: '800' },
  photoCountHint: {
    color: 'rgba(255,255,255,0.45)',
    fontSize: 12,
    fontWeight: '600',
    textAlign: 'center',
    marginTop: 12,
    lineHeight: 17,
  },
  footer: {
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255,255,255,0.05)',
    backgroundColor: colors.mainBackground,
  },
  btnPrimary: {
    backgroundColor: colors.secondary,
    height: 56,
    borderRadius: 28,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: 8,
  },
  btnDisabled: {
    backgroundColor: '#1A1A1A',
    opacity: 0.55,
  },
  btnPrimaryText: {
    color: '#FFF',
    fontSize: 15,
    fontWeight: '900',
    letterSpacing: 0.8,
  },
  btnPrimaryTextDisabled: {
    color: 'rgba(255,255,255,0.35)',
  },
});
