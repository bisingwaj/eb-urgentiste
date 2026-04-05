import React from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, StatusBar } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { colors } from '../../theme/colors';
import { MaterialIcons, MaterialCommunityIcons } from '@expo/vector-icons';

function formatTime(dateStr?: string): string {
  if (!dateStr) return '—';
  const d = new Date(dateStr);
  return d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
}

function calcDuration(startStr?: string, endStr?: string): string {
  if (!startStr || !endStr) return 'N/A';
  const diff = new Date(endStr).getTime() - new Date(startStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 60) return `${mins} min`;
  const hrs = Math.floor(mins / 60);
  const remMins = mins % 60;
  return `${hrs}h ${remMins}min`;
}

export function MissionDetailScreen({ navigation, route }: any) {
   const { mission } = route.params;
 
   const getOutcomeSpecs = (status: string) => {
     switch(status) {
       case 'completed': return { icon: "check-circle" as const, color: colors.success, label: "Réussi" };
       case 'refused': return { icon: "cancel" as const, color: "#FF9800", label: "Refusé" };
       case 'critical': return { icon: "error" as const, color: colors.primary, label: "Critique" };
       default: return { icon: "check-circle" as const, color: colors.secondary, label: "Terminé" };
     }
   };
 
   const specs = getOutcomeSpecs(mission.dispatch_status);
   const missionDate = mission.created_at 
     ? new Date(mission.created_at).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' }) 
     : 'Date inconnue';
   const duration = calcDuration(mission.dispatched_at || mission.created_at, mission.completed_at);

   // Timeline dynamique basée sur les vrais timestamps
   const timeline = [
     { time: formatTime(mission.dispatched_at || mission.created_at), label: "Dispatch reçu", icon: "assignment-turned-in", done: true },
     { time: formatTime(mission.arrived_at), label: "Arrivée sur les lieux", icon: "place", done: !!mission.arrived_at },
     { time: formatTime(mission.completed_at), label: "Mission clôturée", icon: "check-circle", done: !!mission.completed_at },
   ];

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <StatusBar barStyle="light-content" />
      
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
          <MaterialIcons name="arrow-back" size={24} color="#FFF" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Détail Mission</Text>
        <View style={{ width: 44 }} />
      </View>

      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        
        {/* Mission Status Card */}
        <View style={styles.mainCard}>
          <View style={styles.cardHeader}>
             <View style={[styles.statusBadge, { backgroundColor: specs.color + '15' }]}>
                <MaterialIcons name={specs.icon} color={specs.color} size={16} />
                <Text style={[styles.statusText, { color: specs.color }]}>{specs.label}</Text>
             </View>
             <Text style={styles.missionId}>{mission.reference || mission.id?.slice(0, 8)}</Text>
          </View>
          
           <Text style={styles.typeText}>{mission.title || mission.type}</Text>
           
           <View style={styles.metaRow}>
             <View style={styles.metaItem}>
               <MaterialCommunityIcons name="clock-outline" size={16} color="rgba(255,255,255,0.4)" />
               <Text style={styles.metaText}>{missionDate}</Text>
             </View>
             <View style={styles.metaItem}>
               <MaterialCommunityIcons name="timer-outline" size={16} color="rgba(255,255,255,0.4)" />
               <Text style={styles.metaText}>{duration}</Text>
             </View>
           </View>

          <View style={styles.divider} />

           <View style={styles.infoSection}>
             <View style={styles.infoRow}>
               <MaterialIcons name="place" size={20} color={colors.secondary} />
               <View style={{ flex: 1 }}>
                 <Text style={styles.infoLabel}>LOCALISATION</Text>
                 <Text style={styles.infoVal}>{mission.location?.address || 'Adresse inconnue'}</Text>
               </View>
             </View>
             <View style={[styles.infoRow, { marginTop: 16 }]}>
               <MaterialIcons name="local-hospital" size={20} color={colors.secondary} />
               <View style={{ flex: 1 }}>
                 <Text style={styles.infoLabel}>DESTINATION</Text>
                 <Text style={styles.infoVal}>{mission.destination || 'Non spécifiée'}</Text>
               </View>
             </View>
           </View>
        </View>

        {/* Patient Section */}
        <Text style={styles.sectionHeading}>PATIENT / APPELANT</Text>
        <View style={styles.sectionCard}>
          <View style={styles.patientRow}>
            <View style={styles.avatarBox}>
               <MaterialIcons name="person" size={32} color={colors.secondary} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.patientName}>{mission.caller?.name || 'Anonyme'}</Text>
              <Text style={styles.patientSub}>{mission.caller?.phone || 'Téléphone non renseigné'}</Text>
            </View>
          </View>
        </View>

        {/* Priority */}
        <Text style={styles.sectionHeading}>PRIORITÉ</Text>
        <View style={styles.sectionCard}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
            <View style={[styles.priorityIndicator, { 
              backgroundColor: mission.priority === 'critical' ? colors.primary + '20' : 
                mission.priority === 'high' ? '#FF9500' + '20' : colors.secondary + '20' 
            }]}>
              <MaterialIcons name="warning" size={20} color={
                mission.priority === 'critical' ? colors.primary : 
                mission.priority === 'high' ? '#FF9500' : colors.secondary
              } />
            </View>
            <Text style={styles.priorityText}>
              {mission.priority === 'critical' ? 'Critique' : 
               mission.priority === 'high' ? 'Haute' : 
               mission.priority === 'medium' ? 'Moyenne' : 'Basse'}
            </Text>
          </View>
        </View>

        {/* Description */}
        {mission.description && (
          <>
            <Text style={styles.sectionHeading}>DESCRIPTION</Text>
            <View style={styles.sectionCard}>
              <Text style={styles.descriptionText}>{mission.description}</Text>
            </View>
          </>
        )}

        {/* Tactical Timeline */}
        <Text style={styles.sectionHeading}>TIMELINE TACTIQUE</Text>
        <View style={styles.timelineContainer}>
          {timeline.map((item, idx) => (
            <View key={idx} style={styles.timelineItem}>
              <View style={styles.timelineSidebar}>
                <View style={[styles.timelineDot, !item.done && styles.timelineDotInactive]} />
                {idx < timeline.length - 1 && <View style={[styles.timelineLine, !timeline[idx + 1].done && styles.timelineLineInactive]} />}
              </View>
              <View style={styles.timelineContent}>
                <Text style={[styles.timelineTime, !item.done && { opacity: 0.3 }]}>{item.time}</Text>
                <Text style={[styles.timelineLabel, !item.done && { opacity: 0.3 }]}>{item.label}</Text>
              </View>
            </View>
          ))}
        </View>

      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.mainBackground },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingVertical: 12,
    borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,0.05)',
  },
  backBtn: {
    width: 44, height: 44, borderRadius: 12, backgroundColor: '#1A1A1A',
    justifyContent: 'center', alignItems: 'center',
  },
  headerTitle: { color: '#FFF', fontSize: 18, fontWeight: '800' },
  scrollContent: { padding: 24, paddingBottom: 60 },

  mainCard: {
    backgroundColor: '#161616', borderRadius: 32, padding: 24,
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.06)', marginBottom: 24,
  },
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 },
  statusBadge: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 12, paddingVertical: 8, borderRadius: 12 },
  statusText: { fontSize: 11, fontWeight: '900', letterSpacing: 0.5 },
  missionId: { color: 'rgba(255,255,255,0.3)', fontSize: 12, fontWeight: '800' },
  typeText: { color: '#FFF', fontSize: 24, fontWeight: '900', marginBottom: 12 },
  metaRow: { flexDirection: 'row', gap: 16, marginBottom: 24 },
  metaItem: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  metaText: { color: 'rgba(255,255,255,0.5)', fontSize: 13, fontWeight: '600' },
  divider: { height: 1, backgroundColor: 'rgba(255,255,255,0.05)', marginBottom: 24 },
  infoSection: {},
  infoRow: { flexDirection: 'row', gap: 12, alignItems: 'flex-start' },
  infoLabel: { color: 'rgba(255,255,255,0.3)', fontSize: 10, fontWeight: '900', letterSpacing: 1, marginBottom: 4 },
  infoVal: { color: '#FFF', fontSize: 15, fontWeight: '700' },

  sectionHeading: { color: 'rgba(255,255,255,0.3)', fontSize: 12, fontWeight: '900', letterSpacing: 1.5, marginBottom: 16, marginTop: 8 },
  sectionCard: {
    backgroundColor: '#161616', borderRadius: 24, padding: 20,
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.05)', marginBottom: 24,
  },
  patientRow: { flexDirection: 'row', alignItems: 'center', gap: 16 },
  avatarBox: { width: 56, height: 56, borderRadius: 18, backgroundColor: '#1A1A1A', justifyContent: 'center', alignItems: 'center' },
  patientName: { color: '#FFF', fontSize: 17, fontWeight: '800', marginBottom: 2 },
  patientSub: { color: 'rgba(255,255,255,0.4)', fontSize: 13, fontWeight: '600' },

  priorityIndicator: { width: 44, height: 44, borderRadius: 14, justifyContent: 'center', alignItems: 'center' },
  priorityText: { color: '#FFF', fontSize: 16, fontWeight: '800' },

  descriptionText: { color: 'rgba(255,255,255,0.6)', fontSize: 14, fontWeight: '500', lineHeight: 22 },

  timelineContainer: {
    backgroundColor: '#161616', borderRadius: 24, padding: 20,
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.05)',
  },
  timelineItem: { flexDirection: 'row', gap: 16 },
  timelineSidebar: { alignItems: 'center', width: 20 },
  timelineDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: colors.secondary, marginTop: 6 },
  timelineDotInactive: { backgroundColor: 'rgba(255,255,255,0.1)' },
  timelineLine: { width: 2, flex: 1, backgroundColor: colors.secondary + '30', marginVertical: 4 },
  timelineLineInactive: { backgroundColor: 'rgba(255,255,255,0.05)' },
  timelineContent: { paddingBottom: 24 },
  timelineTime: { color: 'rgba(255,255,255,0.5)', fontSize: 12, fontWeight: '800', marginBottom: 4 },
  timelineLabel: { color: '#FFF', fontSize: 14, fontWeight: '700' },
});
