import React from 'react';
import { View, Text, StyleSheet} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { MaterialIcons, FontAwesome5 } from '@expo/vector-icons';
import { colors } from '../theme/colors';
import { AppTouchableOpacity } from '../components/ui/AppTouchableOpacity';

export function RoleSelectionScreen({ navigation }: any) {
  const handleSelectRole = (role: 'urgentiste' | 'hopital') => {
    navigation.navigate('Login', { role });
  };

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      <View style={styles.content}>
        <View style={styles.header}>
          <MaterialIcons name="medical-services" color={colors.secondary} size={48} />
          <Text style={styles.title}>ÉTOILE BLEUE</Text>
          <Text style={styles.subtitle}>Sélectionnez votre profil pour continuer</Text>
        </View>

        <View style={styles.cardsContainer}>
          <AppTouchableOpacity 
            style={styles.card} 
            onPress={() => handleSelectRole('urgentiste')}
            activeOpacity={0.8}
          >
            <View style={[styles.iconContainer, { backgroundColor: 'rgba(255, 82, 82, 0.1)' }]}>
              <FontAwesome5 name="user-md" size={40} color={colors.primary} />
            </View>
            <Text style={styles.cardTitle}>Urgentiste</Text>
            <Text style={styles.cardDescription}>Accédez aux missions, historique et détails des patients.</Text>
          </AppTouchableOpacity>

          <AppTouchableOpacity 
            style={styles.card} 
            onPress={() => handleSelectRole('hopital')}
            activeOpacity={0.8}
          >
            <View style={[styles.iconContainer, { backgroundColor: 'rgba(33, 150, 243, 0.1)' }]}>
              <FontAwesome5 name="hospital" size={40} color={colors.secondary} />
            </View>
            <Text style={styles.cardTitle}>Hôpital</Text>
            <Text style={styles.cardDescription}>Visualisez les urgences en approche et gérez vos disponibilités.</Text>
          </AppTouchableOpacity>
        </View>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#050505' },
  content: { flex: 1, padding: 24, justifyContent: 'center' },
  header: { alignItems: 'center', marginBottom: 60 },
  title: { color: '#FFF', fontSize: 28, fontWeight: '900', letterSpacing: 2.0, marginTop: 16, marginBottom: 8 },
  subtitle: { color: 'rgba(255,255,255,0.54)', fontSize: 16, textAlign: 'center' },
  cardsContainer: { gap: 24 },
  card: {
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderRadius: 16,
    padding: 24,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
    alignItems: 'center',
  },
  iconContainer: {
    width: 80,
    height: 80,
    borderRadius: 40,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 16,
  },
  cardTitle: { color: '#FFF', fontSize: 20, fontWeight: 'bold', marginBottom: 8 },
  cardDescription: { color: 'rgba(255,255,255,0.54)', fontSize: 14, textAlign: 'center', lineHeight: 20 },
});
