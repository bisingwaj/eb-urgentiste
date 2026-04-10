import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  TextInput,
  Platform,
  Alert,
  ActivityIndicator,
  KeyboardAvoidingView,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { MaterialIcons } from '@expo/vector-icons';
import { colors } from '../../theme/colors';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';

const ISSUE_TYPES = [
  { key: 'beds', label: 'Manque de lits', icon: 'king-bed' as const, constraintType: 'lits' as const },
  { key: 'staff', label: 'Pénurie de personnel', icon: 'groups' as const, constraintType: 'personnel' as const },
  { key: 'equip', label: "Panne d'équipement", icon: 'settings' as const, constraintType: 'equipement' as const },
  { key: 'meds', label: 'Manque de médicaments', icon: 'medication' as const, constraintType: 'medicaments' as const },
];

const SEVERITY_OPTIONS = [
  { key: 'low' as const, label: 'Faible' },
  { key: 'medium' as const, label: 'Moyen' },
  { key: 'high' as const, label: 'Élevé' },
  { key: 'critical' as const, label: 'Critique' },
];

type ConstraintRow = {
  id: string;
  constraint_type: string;
  severity: string;
  description: string | null;
  is_resolved: boolean;
  created_at?: string;
};

export function HospitalIssuesScreen({ navigation }: any) {
  const { profile, session } = useAuth();
  const [selectedIssues, setSelectedIssues] = useState<string[]>([]);
  const [comment, setComment] = useState('');
  const [severity, setSeverity] = useState<'low' | 'medium' | 'high' | 'critical'>('medium');
  const [submitting, setSubmitting] = useState(false);
  const [loadingList, setLoadingList] = useState(false);
  const [openConstraints, setOpenConstraints] = useState<ConstraintRow[]>([]);

  const structureId = profile?.health_structure_id;

  const loadOpen = useCallback(async () => {
    if (!structureId) return;
    setLoadingList(true);
    try {
      const { data, error } = await supabase
        .from('hospital_constraints')
        .select('id, constraint_type, severity, description, is_resolved, created_at')
        .eq('structure_id', structureId)
        .eq('is_resolved', false)
        .order('created_at', { ascending: false })
        .limit(30);
      if (error) throw error;
      setOpenConstraints((data as ConstraintRow[]) || []);
    } catch (e) {
      console.warn('[HospitalIssues] load constraints', e);
      setOpenConstraints([]);
    } finally {
      setLoadingList(false);
    }
  }, [structureId]);

  useEffect(() => {
    loadOpen();
  }, [loadOpen]);

  const toggleIssue = (key: string) => {
    if (selectedIssues.includes(key)) {
      setSelectedIssues(selectedIssues.filter((i) => i !== key));
    } else {
      setSelectedIssues([...selectedIssues, key]);
    }
  };

  const resolveConstraint = async (id: string) => {
    const uid = session?.user?.id;
    if (!uid) {
      Alert.alert('Session', 'Vous devez être connecté pour résoudre une contrainte.');
      return;
    }
    try {
      const { error } = await supabase
        .from('hospital_constraints')
        .update({
          is_resolved: true,
          resolved_at: new Date().toISOString(),
          resolved_by: uid,
        })
        .eq('id', id);
      if (error) throw error;
      await loadOpen();
    } catch (e: any) {
      Alert.alert('Erreur', e?.message ?? 'Mise à jour impossible.');
    }
  };

  const handleSubmit = async () => {
    if (!structureId) {
      Alert.alert('Configuration', 'Structure hôpital non liée au compte.');
      return;
    }
    const uid = session?.user?.id;
    if (!uid) {
      Alert.alert('Session', 'Connexion requise.');
      return;
    }
    if (selectedIssues.length === 0) {
      Alert.alert('Champs requis', 'Veuillez sélectionner au moins une contrainte.');
      return;
    }

    setSubmitting(true);
    try {
      const baseDesc = comment.trim();
      for (const sel of selectedIssues) {
        const meta = ISSUE_TYPES.find((t) => t.key === sel);
        const constraint_type = meta?.constraintType ?? 'autre';
        const description = [meta?.label, baseDesc].filter(Boolean).join(' — ') || null;
        const { error } = await supabase.from('hospital_constraints').insert({
          structure_id: structureId,
          constraint_type,
          severity,
          description,
          is_resolved: false,
          reported_by: uid,
        });
        if (error) throw error;
      }
      setSelectedIssues([]);
      setComment('');
      await loadOpen();
      Alert.alert('Signalement transmis', 'Les contraintes ont été enregistrées.');
    } catch (e: any) {
      Alert.alert('Erreur', e?.message ?? 'Envoi impossible. Vérifiez les droits (RLS) ou le réseau.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
      <SafeAreaView style={styles.safeArea} edges={['top', 'bottom']}>
      <View style={styles.appBar}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
          <MaterialIcons name="arrow-back" size={24} color="#FFF" />
        </TouchableOpacity>
        <Text style={styles.appBarTitle}>Problèmes & Contraintes</Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView
        style={styles.scroll}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={{ paddingBottom: 140 }}
      >
        <View style={styles.header}>
          <MaterialIcons name="error-outline" color={colors.primary} size={48} />
          <Text style={styles.headerTitle}>Signaler des difficultés</Text>
          <Text style={styles.headerSub}>
            Les signalements sont enregistrés pour la centrale et votre structure.
          </Text>
        </View>

        {openConstraints.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Contraintes non résolues</Text>
            {loadingList ? (
              <ActivityIndicator color={colors.secondary} />
            ) : (
              openConstraints.map((c) => (
                <View key={c.id} style={styles.openCard}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.openType}>{c.constraint_type} · {c.severity}</Text>
                    <Text style={styles.openDesc} numberOfLines={3}>
                      {c.description || '—'}
                    </Text>
                  </View>
                  <TouchableOpacity style={styles.resolveBtn} onPress={() => resolveConstraint(c.id)}>
                    <Text style={styles.resolveBtnText}>Résoudre</Text>
                  </TouchableOpacity>
                </View>
              ))
            )}
          </View>
        )}

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Gravité perçue</Text>
          <View style={styles.severityRow}>
            {SEVERITY_OPTIONS.map((s) => {
              const on = severity === s.key;
              return (
                <TouchableOpacity
                  key={s.key}
                  style={[styles.severityChip, on && styles.severityChipOn]}
                  onPress={() => setSeverity(s.key)}
                >
                  <Text style={[styles.severityChipText, on && styles.severityChipTextOn]}>{s.label}</Text>
                </TouchableOpacity>
              );
            })}
          </View>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Type de contrainte</Text>
          <View style={styles.issueGrid}>
            {ISSUE_TYPES.map((issue) => {
              const isSelected = selectedIssues.includes(issue.key);
              return (
                <TouchableOpacity
                  key={issue.key}
                  style={[
                    styles.issueCard,
                    isSelected && { borderColor: colors.primary, backgroundColor: 'rgba(255, 82, 82, 0.1)' },
                  ]}
                  onPress={() => toggleIssue(issue.key)}
                >
                  <View style={[styles.issueIcon, isSelected && { backgroundColor: 'rgba(255, 82, 82, 0.2)' }]}>
                    <MaterialIcons name={issue.icon} color={isSelected ? colors.primary : colors.textMuted} size={28} />
                  </View>
                  <Text style={[styles.issueLabel, isSelected && { color: '#FFF' }]}>{issue.label}</Text>
                </TouchableOpacity>
              );
            })}
          </View>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Précisions (recommandé)</Text>
          <View style={styles.commentContainer}>
            <TextInput
              style={styles.commentInput}
              value={comment}
              onChangeText={setComment}
              placeholder="Détaillez le problème rencontré ici..."
              placeholderTextColor="rgba(255,255,255,0.2)"
              multiline
              numberOfLines={4}
              textAlignVertical="top"
            />
          </View>
        </View>
      </ScrollView>

      <View style={styles.bottomBar}>
        <TouchableOpacity
          style={[styles.submitBtn, (selectedIssues.length === 0 || submitting) && styles.disabledBtn]}
          onPress={handleSubmit}
          disabled={selectedIssues.length === 0 || submitting}
        >
          {submitting ? (
            <ActivityIndicator color="#FFF" />
          ) : (
            <>
              <Text style={styles.submitBtnText}>Signaler au Centre de Régulation</Text>
              <MaterialIcons name="priority-high" color="#FFF" size={24} />
            </>
          )}
        </TouchableOpacity>
      </View>
      </SafeAreaView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: colors.mainBackground },
  appBar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, height: 52 },
  backBtn: { width: 40, height: 40, justifyContent: 'center', alignItems: 'center' },
  appBarTitle: { color: '#FFF', fontSize: 17, fontWeight: '700' },
  scroll: { flex: 1 },
  header: { alignItems: 'center', padding: 24, textAlign: 'center' },
  headerTitle: { color: '#FFF', fontSize: 20, fontWeight: '800', marginTop: 12 },
  headerSub: { color: colors.textMuted, fontSize: 13, textAlign: 'center', marginTop: 8, lineHeight: 20 },
  section: { marginHorizontal: 20, marginTop: 12 },
  sectionTitle: { color: '#FFF', fontSize: 16, fontWeight: '700', marginBottom: 16 },
  issueGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  issueCard: {
    width: '47%' as any,
    backgroundColor: '#1A1A1A',
    borderRadius: 20,
    padding: 20,
    alignItems: 'center',
    borderWidth: 2,
    borderColor: 'rgba(255,255,255,0.05)',
    gap: 12,
  },
  issueIcon: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: 'rgba(255,255,255,0.03)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  issueLabel: { color: colors.textMuted, fontSize: 12, fontWeight: '700', textAlign: 'center', lineHeight: 16 },
  commentContainer: {
    backgroundColor: '#1A1A1A',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.05)',
    marginTop: 8,
  },
  commentInput: { color: '#FFF', fontSize: 14, padding: 16, minHeight: 120, lineHeight: 22 },
  bottomBar: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    paddingHorizontal: 20,
    paddingBottom: Platform.OS === 'ios' ? 34 : 20,
    paddingTop: 14,
    backgroundColor: colors.mainBackground,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255,255,255,0.05)',
  },
  submitBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
    paddingVertical: 16,
    borderRadius: 28,
    backgroundColor: colors.primary,
  },
  submitBtnText: { color: '#FFF', fontWeight: '800', fontSize: 16 },
  disabledBtn: { opacity: 0.5 },
  severityRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  severityChip: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: '#1A1A1A',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
  },
  severityChipOn: { borderColor: colors.secondary, backgroundColor: colors.secondary + '22' },
  severityChipText: { color: colors.textMuted, fontSize: 12, fontWeight: '700' },
  severityChipTextOn: { color: '#FFF' },
  openCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: '#1A1A1A',
    borderRadius: 14,
    padding: 14,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.06)',
  },
  openType: { color: colors.secondary, fontSize: 12, fontWeight: '800' },
  openDesc: { color: 'rgba(255,255,255,0.75)', fontSize: 13, marginTop: 4 },
  resolveBtn: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 12,
    backgroundColor: 'rgba(255,255,255,0.08)',
  },
  resolveBtnText: { color: '#FFF', fontSize: 12, fontWeight: '800' },
});
