import React, { useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TextInput, StatusBar, Platform } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { colors } from '../../theme/colors';
import { MaterialIcons, MaterialCommunityIcons } from '@expo/vector-icons';
import { AppTouchableOpacity } from '../../components/ui/AppTouchableOpacity';

const PROTOCOLS = [
  { id: 'RDC-P01', title: 'Traumatologie sévère et hémorragie', type: 'Intervention Choc', updated: '12 Mars 2026' },
  { id: 'RDC-P02', title: 'Arrêt cardio-respiratoire (ACR)', type: 'Réanimation', updated: '05 Jan 2026' },
  { id: 'RDC-P03', title: 'Urgences obstétricales', type: 'Gynéco-Obst.', updated: '22 Fév 2026' },
  { id: 'RDC-P04', title: 'Décès sur la voie publique', type: 'Médico-Légal', updated: '18 Mars 2026' },
  { id: 'RDC-P05', title: 'Intoxication aux hydrocarbures', type: 'Toxicologie', updated: '02 Nov 2025' },
];

export function ProtocolesScreen({ navigation }: any) {
  const [search, setSearch] = useState('');
  const [viewing, setViewing] = useState<string | null>(null);

  const filteredProtocols = PROTOCOLS.filter(p => p.title.toLowerCase().includes(search.toLowerCase()) || p.id.toLowerCase().includes(search.toLowerCase()));

  if (viewing) {
    const doc = PROTOCOLS.find(p => p.id === viewing);
    return (
      <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
        <StatusBar barStyle="light-content" />
        <View style={styles.topHeader}>
          <View style={styles.headerRow}>
            <AppTouchableOpacity onPress={() => setViewing(null)} style={styles.backBtn}>
              <MaterialIcons name="arrow-back" color="#FFF" size={24} />
            </AppTouchableOpacity>
            <View>
              <Text style={styles.greetingText}>PROTOCOLE LÉGAL</Text>
              <Text style={[styles.hospitalName, { fontSize: 18 }]}>{doc?.id}</Text>
            </View>
            <View style={{ width: 44 }} />
          </View>
        </View>

        <ScrollView style={styles.pdfViewer} contentContainerStyle={{ padding: 24, paddingBottom: 60 }}>
           <MaterialIcons name="description" color={colors.secondary} size={48} style={{ marginBottom: 20, alignSelf: 'center' }} />
           <Text style={styles.pdfTitle}>{doc?.title}</Text>
           <Text style={styles.pdfMeta}>ID: {doc?.id} | Mise à jour: {doc?.updated}</Text>
           <View style={styles.pdfContentMock}>
              <Text style={styles.pdfSectionTitle}>1. ÉVALUATION PRIMAIRE</Text>
              <Text style={styles.pdfBodyText}>Procédure standard ABCDE. Vérification des voies aériennes et contrôle des hémorragies externes massives par compression ou garrot si nécessaire.</Text>
              
              <Text style={styles.pdfSectionTitle}>2. INTERVENTION</Text>
              <Text style={styles.pdfBodyText}>Administration d'oxygène haut débit. Pose de voie veineuse périphérique (VVP) de gros calibre.</Text>
           </View>
        </ScrollView>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      <StatusBar barStyle="light-content" />
      
      <View style={styles.topHeader}>
        <View style={styles.headerRow}>
          <AppTouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
            <MaterialIcons name="arrow-back" color="#FFF" size={24} />
          </AppTouchableOpacity>
          <View>
             <Text style={styles.greetingText}>BASE DOCUMENTAIRE</Text>
             <Text style={styles.hospitalName}>Protocoles RDC</Text>
          </View>
          <View style={{ width: 44 }} />
        </View>
      </View>

      <View style={styles.searchContainer}>
        <View style={styles.searchBox}>
          <MaterialIcons name="search" color="rgba(255,255,255,0.3)" size={20} />
          <TextInput 
            style={styles.searchInput} 
            placeholder="Rechercher par titre ou identifiant..." 
            placeholderTextColor="rgba(255,255,255,0.3)"
            value={search}
            onChangeText={setSearch}
          />
        </View>
      </View>

      <ScrollView contentContainerStyle={styles.scrollPad} showsVerticalScrollIndicator={false}>
        <Text style={styles.sectionTitle}>BIBLIOTHÈQUE MÉDICALE</Text>
        <View style={styles.listCard}>
          {filteredProtocols.map((p, i) => (
             <AppTouchableOpacity key={p.id} style={[styles.protocolItem, i === filteredProtocols.length - 1 && { borderBottomWidth: 0 }]} onPress={() => setViewing(p.id)} activeOpacity={0.7}>
               <View style={styles.iconCircle}>
                  <MaterialIcons name="description" color={colors.secondary} size={24} />
               </View>
               <View style={styles.cardContent}>
                 <Text style={styles.cardTitle}>{p.title}</Text>
                 <Text style={styles.cardType}>{p.type.toUpperCase()} • {p.id}</Text>
               </View>
               <MaterialIcons name="chevron-right" color="rgba(255,255,255,0.1)" size={24} />
             </AppTouchableOpacity>
          ))}
        </View>
        {filteredProtocols.length === 0 && (
          <View style={styles.emptyView}>
             <MaterialIcons name="search" color={colors.textMuted} size={40} style={{ marginBottom: 16 }} />
             <Text style={styles.emptyText}>Aucun résultat pour "{search}"</Text>
          </View>
        )}
      </ScrollView>
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

  searchContainer: { paddingHorizontal: 20, paddingVertical: 20, backgroundColor: colors.mainBackground },
  searchBox: { flexDirection: 'row', alignItems: 'center', backgroundColor: "#1A1A1A", borderRadius: 20, paddingHorizontal: 15, height: 56, borderWidth: 1, borderColor: "rgba(255,255,255,0.05)" },
  searchInput: { flex: 1, color: "#FFF", fontSize: 16, fontWeight: '600', marginLeft: 10 },

  scrollPad: { paddingHorizontal: 20, paddingBottom: 100 },
  sectionTitle: { color: colors.textMuted, fontSize: 13, fontWeight: '800', marginLeft: 16, marginBottom: 15, marginTop: 10, letterSpacing: 1.5 },

  listCard: { backgroundColor: "#1A1A1A", borderRadius: 32, overflow: 'hidden', borderWidth: 1, borderColor: "rgba(255,255,255,0.05)" },
  protocolItem: { flexDirection: 'row', alignItems: 'center', padding: 20, borderBottomWidth: 1, borderBottomColor: "rgba(255,255,255,0.02)" },
  iconCircle: { width: 48, height: 48, backgroundColor: colors.secondary + '10', borderRadius: 16, justifyContent: 'center', alignItems: 'center', marginRight: 15 },
  cardContent: { flex: 1 },
  cardTitle: { color: "#FFF", fontSize: 16, fontWeight: '800', marginBottom: 4 },
  cardType: { color: colors.textMuted, fontSize: 13, fontWeight: '700', letterSpacing: 0.5 },

  emptyView: { alignItems: 'center', marginTop: 80 },
  emptyText: { color: colors.textMuted, fontSize: 16, fontWeight: '600' },

  pdfViewer: { flex: 1, backgroundColor: colors.mainBackground },
  pdfTitle: { fontSize: 24, fontWeight: '900', color: "#FFF", textAlign: 'center', marginBottom: 8 },
  pdfMeta: { fontSize: 14, color: colors.textMuted, textAlign: 'center', marginBottom: 30 },
  pdfContentMock: { borderTopWidth: 1, borderTopColor: "rgba(255,255,255,0.1)", paddingTop: 30, marginTop: 10 },
  pdfSectionTitle: { fontSize: 12, fontWeight: '900', color: colors.secondary, marginBottom: 12, marginTop: 25, letterSpacing: 1.5 },
  pdfBodyText: { fontSize: 16, color: "rgba(255,255,255,0.7)", lineHeight: 26, fontWeight: '500' },
});
