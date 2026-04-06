import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  TextInput,
  Platform,
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { MaterialIcons } from '@expo/vector-icons';
import { colors } from '../../theme/colors';

const ISSUE_TYPES = [
  { key: 'beds', label: 'Manque de lits', icon: 'king-bed' as const },
  { key: 'staff', label: 'Pénurie de personnel', icon: 'groups' as const },
  { key: 'equip', label: 'Panne d\'équipement', icon: 'settings' as const },
  { key: 'meds', label: 'Manque de médicaments', icon: 'medication' as const },
];

export function HospitalIssuesScreen({ navigation }: any) {
  const [selectedIssues, setSelectedIssues] = useState<string[]>([]);
  const [comment, setComment] = useState('');

  const toggleIssue = (key: string) => {
    if (selectedIssues.includes(key)) {
      setSelectedIssues(selectedIssues.filter(i => i !== key));
    } else {
      setSelectedIssues([...selectedIssues, key]);
    }
  };

  const handleSubmit = () => {
    if (selectedIssues.length === 0) {
      Alert.alert('Champs requis', 'Veuillez sélectionner au moins une contrainte.');
      return;
    }

    Alert.alert(
      'Signalement transmis',
      'Vos contraintes ont été transmises à l\'administration et au centre de régulation en temps réel.',
      [{ text: 'OK', onPress: () => navigation.goBack() }]
    );
  };

  return (
    <SafeAreaView style={styles.safeArea} edges={['top', 'bottom']}>
      {/* App bar */}
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
        contentContainerStyle={{ paddingBottom: 120 }}
      >
        <View style={styles.header}>
          <MaterialIcons name="error-outline" color={colors.primary} size={48} />
          <Text style={styles.headerTitle}>Signaler des difficultés</Text>
          <Text style={styles.headerSub}>Informer instantanément le centre de régulation des blocages opérationnels.</Text>
        </View>

        {/* Issue Grid */}
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

        {/* Comments section */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Précisions (Optionnel)</Text>
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

      {/* Primary Action */}
      <View style={styles.bottomBar}>
        <TouchableOpacity
          style={[styles.submitBtn, selectedIssues.length === 0 && styles.disabledBtn]}
          onPress={handleSubmit}
        >
          <Text style={styles.submitBtnText}>Signaler au Centre de Régulation</Text>
          <MaterialIcons name="priority-high" color="#FFF" size={24} />
        </TouchableOpacity>
      </View>
    </SafeAreaView>
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
  issueCard: { width: '47%' as any, backgroundColor: '#1A1A1A', borderRadius: 20, padding: 20, alignItems: 'center', borderWidth: 2, borderColor: 'rgba(255,255,255,0.05)', gap: 12 },
  issueIcon: { width: 56, height: 56, borderRadius: 28, backgroundColor: 'rgba(255,255,255,0.03)', justifyContent: 'center', alignItems: 'center' },
  issueLabel: { color: colors.textMuted, fontSize: 12, fontWeight: '700', textAlign: 'center', lineHeight: 16 },
  commentContainer: { backgroundColor: '#1A1A1A', borderRadius: 14, borderWidth: 1, borderColor: 'rgba(255,255,255,0.05)', marginTop: 8 },
  commentInput: { color: '#FFF', fontSize: 14, padding: 16, minHeight: 120, lineHeight: 22 },
  bottomBar: { position: 'absolute', bottom: 0, left: 0, right: 0, paddingHorizontal: 20, paddingBottom: Platform.OS === 'ios' ? 34 : 20, paddingTop: 14, backgroundColor: colors.mainBackground, borderTopWidth: 1, borderTopColor: 'rgba(255,255,255,0.05)' },
  submitBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 12, paddingVertical: 16, borderRadius: 28, backgroundColor: colors.primary },
  submitBtnText: { color: '#FFF', fontWeight: '800', fontSize: 16 },
  disabledBtn: { opacity: 0.5 },
});
