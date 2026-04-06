import React, { useState } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity,
  TextInput, ActivityIndicator, KeyboardAvoidingView, Platform, ScrollView,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { MaterialIcons } from '@expo/vector-icons';
import { colors } from '../theme/colors';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';

export function ChangePasswordScreen({ navigation }: any) {
  const { profile, refreshProfile } = useAuth();
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showPassword, setShowPassword] = useState(false);

  const isValid = newPassword.length >= 8 && newPassword === confirmPassword;

  const handleChangePassword = async () => {
    if (!isValid) return;

    setIsLoading(true);
    setError(null);

    try {
      // 1. Mettre à jour le mot de passe Auth
      const { error: authError } = await supabase.auth.updateUser({
        password: newPassword,
      });

      if (authError) {
        setError(authError.message);
        setIsLoading(false);
        return;
      }

      // 2. Marquer must_change_password = false dans users_directory
      if (profile?.auth_user_id) {
        await supabase.from('users_directory')
          .update({ must_change_password: false })
          .eq('auth_user_id', profile.auth_user_id);
      }

      // 3. Rafraîchir le profil — la navigation est gérée automatiquement
      // par App.tsx (conditional navigator : must_change_password=false → MainTabs)
      console.log('[ChangePassword] Succès ! Rafraîchissement du profil...');
      await refreshProfile();

    } catch (err: any) {
      setError('Erreur lors du changement de mot de passe.');
      console.error('[ChangePassword]', err);
      setIsLoading(false);
    }
  };

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        <ScrollView contentContainerStyle={styles.scrollContent} keyboardShouldPersistTaps="handled">
          {/* Header */}
          <View style={styles.header}>
            <View style={styles.iconCircle}>
              <MaterialIcons name="lock-outline" color={colors.secondary} size={40} />
            </View>
            <Text style={styles.title}>Changement de mot de passe</Text>
            <Text style={styles.subtitle}>
              Pour votre sécurité, vous devez définir un nouveau mot de passe avant de continuer.
            </Text>
          </View>

          {/* Welcome */}
          {profile && (
            <View style={styles.welcomeBox}>
              <Text style={styles.welcomeName}>
                {profile.first_name} {profile.last_name}
              </Text>
              <Text style={styles.welcomeRole}>
                {profile.role === 'secouriste' ? 'URGENTISTE' : profile.role?.toUpperCase()}
              </Text>
            </View>
          )}

          {/* Form */}
          <View style={styles.form}>
            <View style={styles.inputGroup}>
              <Text style={styles.label}>NOUVEAU MOT DE PASSE</Text>
              <View style={styles.inputWrapper}>
                <TextInput
                  style={styles.input}
                  value={newPassword}
                  onChangeText={(text) => { setNewPassword(text); setError(null); }}
                  secureTextEntry={!showPassword}
                  placeholder="Minimum 8 caractères"
                  placeholderTextColor="rgba(255,255,255,0.24)"
                  autoCapitalize="none"
                />
                <TouchableOpacity
                  style={styles.eyeBtn}
                  onPress={() => setShowPassword(!showPassword)}
                >
                  <MaterialIcons
                    name={showPassword ? 'visibility' : 'visibility-off'}
                    size={22}
                    color="rgba(255,255,255,0.4)"
                  />
                </TouchableOpacity>
              </View>
            </View>

            <View style={styles.inputGroup}>
              <Text style={styles.label}>CONFIRMER LE MOT DE PASSE</Text>
              <View style={styles.inputWrapper}>
                <TextInput
                  style={styles.input}
                  value={confirmPassword}
                  onChangeText={(text) => { setConfirmPassword(text); setError(null); }}
                  secureTextEntry={!showPassword}
                  placeholder="Retapez le mot de passe"
                  placeholderTextColor="rgba(255,255,255,0.24)"
                  autoCapitalize="none"
                />
              </View>
              {confirmPassword.length > 0 && newPassword !== confirmPassword && (
                <Text style={styles.mismatchText}>Les mots de passe ne correspondent pas</Text>
              )}
            </View>

            {/* Password strength hints */}
            <View style={styles.hintsBox}>
              <HintRow valid={newPassword.length >= 8} text="Au moins 8 caractères" />
              <HintRow valid={/[A-Z]/.test(newPassword)} text="Une lettre majuscule" />
              <HintRow valid={/[0-9]/.test(newPassword)} text="Un chiffre" />
              <HintRow valid={newPassword === confirmPassword && confirmPassword.length > 0} text="Les deux mots de passe correspondent" />
            </View>

            {error && (
              <Text style={styles.errorText}>{error}</Text>
            )}

            <TouchableOpacity
              style={[styles.submitBtn, !isValid && styles.submitBtnDisabled]}
              onPress={handleChangePassword}
              disabled={!isValid || isLoading}
              activeOpacity={0.8}
            >
              {isLoading ? (
                <ActivityIndicator color="#FFF" />
              ) : (
                <Text style={styles.submitBtnText}>DÉFINIR LE MOT DE PASSE</Text>
              )}
            </TouchableOpacity>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

function HintRow({ valid, text }: { valid: boolean; text: string }) {
  return (
    <View style={styles.hintRow}>
      <MaterialIcons
        name={valid ? 'check-circle' : 'radio-button-unchecked'}
        size={16}
        color={valid ? colors.success : 'rgba(255,255,255,0.24)'}
      />
      <Text style={[styles.hintText, valid && styles.hintTextValid]}>{text}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#050505' },
  scrollContent: { flexGrow: 1, padding: 24, justifyContent: 'center' },
  header: { alignItems: 'center', marginBottom: 32 },
  iconCircle: {
    width: 80, height: 80, borderRadius: 40,
    backgroundColor: 'rgba(68, 138, 255, 0.1)',
    justifyContent: 'center', alignItems: 'center', marginBottom: 20,
  },
  title: { color: '#FFF', fontSize: 22, fontWeight: '700', marginBottom: 8 },
  subtitle: { color: 'rgba(255,255,255,0.54)', fontSize: 14, textAlign: 'center', lineHeight: 20, paddingHorizontal: 16 },
  welcomeBox: { alignItems: 'center', marginBottom: 32 },
  welcomeName: { color: '#FFF', fontSize: 18, fontWeight: '600' },
  welcomeRole: { color: colors.secondary, fontSize: 12, fontWeight: 'bold', letterSpacing: 1.5, marginTop: 2 },
  form: { gap: 20 },
  inputGroup: { gap: 8 },
  label: { color: 'rgba(255,255,255,0.54)', fontSize: 12, fontWeight: 'bold', letterSpacing: 1.5 },
  inputWrapper: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderRadius: 12, borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
  },
  input: {
    flex: 1, color: '#FFF', fontSize: 16,
    paddingHorizontal: 16, paddingVertical: 14,
  },
  eyeBtn: { paddingHorizontal: 14 },
  mismatchText: { color: colors.primary, fontSize: 12, marginTop: 2 },
  hintsBox: {
    backgroundColor: 'rgba(255,255,255,0.03)',
    borderRadius: 12, padding: 16, gap: 10,
  },
  hintRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  hintText: { color: 'rgba(255,255,255,0.38)', fontSize: 13 },
  hintTextValid: { color: 'rgba(255,255,255,0.7)' },
  errorText: { color: colors.primary, fontWeight: 'bold', textAlign: 'center' },
  submitBtn: {
    backgroundColor: colors.secondary,
    borderRadius: 30, paddingVertical: 16,
    alignItems: 'center', marginTop: 8,
  },
  submitBtnDisabled: { opacity: 0.4 },
  submitBtnText: { color: '#FFF', fontWeight: 'bold', fontSize: 15, letterSpacing: 1 },
});
