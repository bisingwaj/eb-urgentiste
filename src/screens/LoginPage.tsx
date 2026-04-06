import React, { useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Dimensions, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { MaterialIcons } from '@expo/vector-icons';
import { colors } from '../theme/colors';
import { useAuth } from '../contexts/AuthContext';

const { height } = Dimensions.get('window');

export function LoginPage({ route, navigation }: any) {
  const role = route.params?.role || 'urgentiste';
  const { signInWithAgent } = useAuth();

  const [currentStep, setCurrentStep] = useState(0); // 0 = ID, 1 = PIN
  const [identifier, setIdentifier] = useState('');
  const [pin, setPin] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const onNumpadTap = (number: string) => {
    setErrorMessage(null);
    if (currentStep === 0) {
      if (identifier.length < 6) setIdentifier(prev => prev + number);
    } else {
      if (pin.length < 6) {
        const newPin = pin + number;
        setPin(newPin);
        if (newPin.length === 6) {
          handleLogin(newPin);
        }
      }
    }
  };

  const onBackspace = () => {
    if (currentStep === 0 && identifier.length > 0) {
      setIdentifier(prev => prev.slice(0, -1));
    } else if (currentStep === 1 && pin.length > 0) {
      setPin(prev => prev.slice(0, -1));
    }
  };

  const verifyIdentifier = () => {
    if (identifier.length !== 6) return;
    setCurrentStep(1);
  };

  const handleLogin = async (pinCode?: string) => {
    const finalPin = pinCode || pin;
    if (finalPin.length !== 6) return;

    setIsLoading(true);
    setErrorMessage(null);

    try {
      const result = await signInWithAgent(identifier, finalPin);

      if (!result.success) {
        setErrorMessage(result.error || 'Identifiant ou code PIN invalide');
        setPin('');
        setIsLoading(false);
        return;
      }

      // Login réussi — la navigation est gérée automatiquement par
      // le AuthContext dans App.tsx (conditional navigator)
      // Pas besoin de navigation.replace() ici
      console.log('[Login] Succès ! Navigation auto via AuthContext...');

    } catch (err) {
      console.error('[Login] Exception:', err);
      setErrorMessage('Erreur réseau. Vérifiez votre connexion.');
      setPin('');
      setIsLoading(false);
    }
  };


  const renderBoxes = (value: string, isObscure = false) => {
    return (
      <View style={styles.boxRow}>
        {[0, 1, 2, 3, 4, 5].map((index) => {
          const isFilled = index < value.length;
          const isCurrent = index === value.length;

          return (
            <View
              key={index}
              style={[
                styles.box,
                {
                  backgroundColor: isFilled ? 'rgba(255,255,255,0.1)' : 'transparent',
                  borderColor: isCurrent ? colors.secondary : (isFilled ? 'rgba(255,255,255,0.54)' : 'rgba(255,255,255,0.24)'),
                  borderWidth: isCurrent ? 2 : 1,
                }
              ]}
            >
              {isFilled && (
                isObscure ? (
                  <View style={styles.dot} />
                ) : (
                  <Text style={styles.boxText}>{value[index]}</Text>
                )
              )}
            </View>
          );
        })}
      </View>
    );
  };

  const renderNumpadKey = (num: string) => (
    <TouchableOpacity key={num} style={styles.numpadKey} onPress={() => onNumpadTap(num)}>
      <Text style={styles.numpadText}>{num}</Text>
    </TouchableOpacity>
  );

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      <View style={styles.content}>
        
        <View style={styles.header}>
          <MaterialIcons name="medical-services" color={colors.secondary} size={32} />
          <Text style={styles.title}>ÉTOILE BLEUE</Text>
        </View>
        <View style={styles.badge}>
          <Text style={styles.badgeText}>
            {role === 'urgentiste' ? 'PORTAIL URGENTISTE' : 'PORTAIL HÔPITAL'}
          </Text>
        </View>

        <View style={styles.middleSection}>
          {currentStep === 0 ? (
            <View style={styles.stepContainer}>
              <Text style={styles.stepTitle}>IDENTIFIANT</Text>
              {renderBoxes(identifier)}
              <View style={styles.actionArea}>
                {identifier.length === 6 && (
                  <TouchableOpacity style={styles.nextBtn} onPress={verifyIdentifier}>
                    <Text style={styles.nextBtnText}>SUIVANT</Text>
                  </TouchableOpacity>
                )}
              </View>
            </View>
          ) : (
            <View style={styles.stepContainer}>
              <Text style={styles.welcomeText}>
                {role === 'urgentiste' ? `Bienvenue, Recrue ${identifier}` : `Bienvenue, Hôpital ${identifier}`}
              </Text>
              <Text style={styles.roleText}>
                {role === 'urgentiste' ? 'URGENTISTE' : 'HÔPITAL'}
              </Text>
              <Text style={[styles.stepTitle, { marginTop: 40 }]}>CODE PIN SECRET</Text>
              {renderBoxes(pin, true)}
              <View style={styles.actionArea}>
                {isLoading ? (
                  <ActivityIndicator color={colors.secondary} size="large" />
                ) : (
                  <TouchableOpacity style={styles.backBtn} onPress={() => { setCurrentStep(0); setPin(''); setIdentifier(''); setErrorMessage(null); }}>
                    <MaterialIcons name="arrow-back" size={16} color="rgba(255,255,255,0.54)" />
                    <Text style={styles.backBtnText}>Changer d'identifiant</Text>
                  </TouchableOpacity>
                )}
              </View>
            </View>
          )}

          {errorMessage && (
            <Text style={styles.errorText}>{errorMessage}</Text>
          )}
        </View>

        <View style={styles.numpad}>
          <View style={styles.numpadRow}>
            {['1', '2', '3'].map(renderNumpadKey)}
          </View>
          <View style={styles.numpadRow}>
            {['4', '5', '6'].map(renderNumpadKey)}
          </View>
          <View style={styles.numpadRow}>
            {['7', '8', '9'].map(renderNumpadKey)}
          </View>
          <View style={styles.numpadRow}>
            <View style={{ width: 70 }} />
            {renderNumpadKey('0')}
            <TouchableOpacity style={styles.numpadKey} onPress={onBackspace}>
              <MaterialIcons name="backspace" color="rgba(255,255,255,0.54)" size={28} />
            </TouchableOpacity>
          </View>
        </View>

      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#050505' },
  content: { flex: 1, minHeight: height, paddingVertical: 40 },
  header: { flexDirection: 'row', justifyContent: 'center', alignItems: 'center', marginBottom: 8 },
  title: { color: '#FFF', fontSize: 20, fontWeight: '900', letterSpacing: 2.0, marginLeft: 12 },
  badge: { backgroundColor: 'rgba(255, 82, 82, 0.1)', alignSelf: 'center', paddingHorizontal: 12, paddingVertical: 4, borderRadius: 16 },
  badgeText: { color: colors.primary, fontWeight: 'bold', fontSize: 12 },
  middleSection: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  stepContainer: { alignItems: 'center', width: '100%' },
  stepTitle: { color: 'rgba(255,255,255,0.54)', fontSize: 14, letterSpacing: 2.0, fontWeight: 'bold', marginBottom: 24 },
  welcomeText: { color: '#FFF', fontSize: 22, fontWeight: '600' },
  roleText: { color: colors.secondary, fontSize: 12, fontWeight: 'bold', letterSpacing: 1.5 },
  boxRow: { flexDirection: 'row', justifyContent: 'center', marginBottom: 32 },
  box: { width: 45, height: 55, marginHorizontal: 6, borderRadius: 8, justifyContent: 'center', alignItems: 'center' },
  boxText: { color: '#FFF', fontSize: 24, fontWeight: 'bold' },
  dot: { width: 12, height: 12, borderRadius: 6, backgroundColor: '#FFF' },
  actionArea: { height: 50, justifyContent: 'center', alignItems: 'center' },
  nextBtn: { backgroundColor: colors.secondary, paddingHorizontal: 64, paddingVertical: 16, borderRadius: 30 },
  nextBtnText: { color: '#FFF', fontWeight: 'bold', letterSpacing: 1.5 },
  backBtn: { flexDirection: 'row', alignItems: 'center' },
  backBtnText: { color: 'rgba(255,255,255,0.54)', marginLeft: 8 },
  errorText: { color: colors.primary, fontWeight: 'bold', marginTop: 16 },
  numpad: { paddingHorizontal: 40, paddingBottom: 40 },
  numpadRow: { flexDirection: 'row', justifyContent: 'space-evenly', marginBottom: 16 },
  numpadKey: { width: 70, height: 70, borderRadius: 35, justifyContent: 'center', alignItems: 'center' },
  numpadText: { color: '#FFF', fontSize: 28, fontWeight: '400' },
});
