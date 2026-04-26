import React, { useState } from 'react';
import { View, Text, StyleSheet, Dimensions, ActivityIndicator, LayoutAnimation, Platform, UIManager, Animated } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { MaterialIcons } from '@expo/vector-icons';
import { colors } from '../theme/colors';
import { useAuth } from '../contexts/AuthContext';
import { AppTouchableOpacity } from '../components/ui/AppTouchableOpacity';

const { height } = Dimensions.get('window');

if (
  Platform.OS === 'android' &&
  UIManager.setLayoutAnimationEnabledExperimental
) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

export function LoginPage({ navigation }: any) {
  const { signInWithAgent, refreshProfile } = useAuth();

  const [activeInput, setActiveInput] = useState<'ID' | 'PIN'>('ID');
  const [identifier, setIdentifier] = useState('');
  const [pin, setPin] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const pinValueAnim = React.useRef(new Animated.Value(0)).current;

  React.useEffect(() => {
    Animated.timing(pinValueAnim, {
      toValue: activeInput === 'PIN' ? 1 : 0,
      duration: 400,
      useNativeDriver: true,
    }).start();
  }, [activeInput]);

  const onNumpadTap = (number: string) => {
    setErrorMessage(null);
    if (activeInput === 'ID') {
      if (identifier.length < 6) {
        const newVal = identifier + number;
        setIdentifier(newVal);
        if (newVal.length === 6) {
          LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
          setActiveInput('PIN');
          setPin('');
        }
      }
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
    setErrorMessage(null);
    if (activeInput === 'ID') {
      if (identifier.length > 0) {
        setIdentifier(prev => prev.slice(0, -1));
      }
    } else {
      if (pin.length > 0) {
        setPin(prev => prev.slice(0, -1));
      } else {
        // If pin is empty and backspace is pressed, move back to editing ID
        LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
        setActiveInput('ID');
        setIdentifier(prev => prev.slice(0, -1));
      }
    }
  };

  const resetToId = () => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setActiveInput('ID');
    setIdentifier('');
    setPin('');
    setErrorMessage(null);
  };

  const handleLogin = async (pinCode?: string) => {
    const finalPin = pinCode || pin;
    if (finalPin.length !== 6 || identifier.length !== 6) return;

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

      await refreshProfile();
      console.log('[Login] Succès ! Navigation auto via AuthContext...');

    } catch (err) {
      console.error('[Login] Exception:', err);
      setErrorMessage('Erreur réseau. vérifiez votre connexion.');
      setPin('');
      setIsLoading(false);
    }
  };

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      <View style={styles.content}>
        
        <View style={styles.header}>
          <MaterialIcons name="medical-services" color={colors.secondary} size={32} />
          <Text style={styles.title}>EB-URGENCE</Text>
        </View>
        <Text style={styles.subtitle}>S'IDENTIFIER</Text>

        <View style={styles.middleSection}>
          <View style={styles.stepContainer}>
            {/* IDENTIFIER FIELD */}
            <AppTouchableOpacity onPress={resetToId} activeOpacity={0.8}>
              <Text style={[styles.stepTitle, activeInput === 'PIN' && styles.stepTitleInactive]}>IDENTIFIANT</Text>
              <View style={[styles.boxRow, activeInput === 'PIN' && styles.boxRowInactive]}>
                {[0, 1, 2, 3, 4, 5].map((index) => {
                  const isFilled = index < identifier.length;
                  const isCurrent = activeInput === 'ID' && index === identifier.length;

                  return (
                    <View
                      key={`id-${index}`}
                      style={[
                        styles.box,
                        activeInput === 'PIN' ? styles.boxInactive : null,
                        {
                          backgroundColor: isFilled ? 'rgba(255,255,255,0.1)' : 'transparent',
                          borderColor: isCurrent ? colors.secondary : (isFilled ? 'rgba(255,255,255,0.54)' : 'rgba(255,255,255,0.24)'),
                          borderWidth: isCurrent ? 2 : 1,
                        }
                      ]}
                    >
                      {isFilled && <Text style={styles.boxText}>{identifier[index]}</Text>}
                    </View>
                  );
                })}
              </View>
            </AppTouchableOpacity>

            {/* PIN FIELD */}
            <Animated.View 
              style={[
                styles.pinSection,
                {
                  opacity: pinValueAnim,
                  transform: [
                    { translateY: pinValueAnim.interpolate({ inputRange: [0, 1], outputRange: [20, 0] }) },
                    { scale: pinValueAnim.interpolate({ inputRange: [0, 1], outputRange: [0.95, 1] }) }
                  ]
                }
              ]}
              pointerEvents={activeInput === 'PIN' ? 'auto' : 'none'}
            >
              <Text style={styles.stepTitle}>CODE PIN SECRET</Text>
              <View style={styles.boxRow}>
                {[0, 1, 2, 3, 4, 5].map((index) => {
                  const isFilled = index < pin.length;
                  const isCurrent = activeInput === 'PIN' && index === pin.length;

                  return (
                    <View
                      key={`pin-${index}`}
                      style={[
                        styles.box,
                        {
                          backgroundColor: isFilled ? 'rgba(255,255,255,0.1)' : 'transparent',
                          borderColor: isCurrent ? colors.secondary : (isFilled ? 'rgba(255,255,255,0.54)' : 'rgba(255,255,255,0.24)'),
                          borderWidth: isCurrent ? 2 : 1,
                        }
                      ]}
                    >
                      {isFilled && <View style={styles.dot} />}
                    </View>
                  );
                })}
              </View>
            </Animated.View>
          </View>

          <View style={styles.actionArea}>
            {isLoading && <ActivityIndicator color={colors.secondary} size="large" />}
            {errorMessage && <Text style={styles.errorText}>{errorMessage}</Text>}
          </View>
        </View>

        <View style={styles.numpad}>
          <View style={styles.numpadRow}>
            {['1', '2', '3'].map((num) => (
              <AppTouchableOpacity key={num} style={styles.numpadKey} onPress={() => onNumpadTap(num)}>
                <Text style={styles.numpadText}>{num}</Text>
              </AppTouchableOpacity>
            ))}
          </View>
          <View style={styles.numpadRow}>
            {['4', '5', '6'].map((num) => (
              <AppTouchableOpacity key={num} style={styles.numpadKey} onPress={() => onNumpadTap(num)}>
                <Text style={styles.numpadText}>{num}</Text>
              </AppTouchableOpacity>
            ))}
          </View>
          <View style={styles.numpadRow}>
            {['7', '8', '9'].map((num) => (
              <AppTouchableOpacity key={num} style={styles.numpadKey} onPress={() => onNumpadTap(num)}>
                <Text style={styles.numpadText}>{num}</Text>
              </AppTouchableOpacity>
            ))}
          </View>
          <View style={styles.numpadRow}>
            <View style={{ width: 70 }} />
            <AppTouchableOpacity key={'0'} style={styles.numpadKey} onPress={() => onNumpadTap('0')}>
              <Text style={styles.numpadText}>0</Text>
            </AppTouchableOpacity>
            <AppTouchableOpacity style={styles.numpadKey} onPress={onBackspace}>
              <MaterialIcons name="backspace" color="rgba(255,255,255,0.54)" size={28} />
            </AppTouchableOpacity>
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
  subtitle: { alignSelf: 'center', color: colors.secondary, fontWeight: 'bold', fontSize: 12, letterSpacing: 1.5, marginBottom: 20 },
  middleSection: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  stepContainer: { alignItems: 'center', width: '100%' },
  pinSection: { alignItems: 'center', width: '100%', marginTop: 24, paddingVertical: 8, overflow: 'hidden' },
  stepTitle: { color: '#FFF', fontSize: 14, letterSpacing: 2.0, fontWeight: 'bold', marginBottom: 16 },
  stepTitleInactive: { color: 'rgba(255,255,255,0.3)', fontSize: 12 },
  boxRow: { flexDirection: 'row', justifyContent: 'center', marginBottom: 16 },
  boxRowInactive: { transform: [{ scale: 0.85 }], opacity: 0.6, marginBottom: 8 },
  box: { width: 45, height: 55, marginHorizontal: 6, borderRadius: 8, justifyContent: 'center', alignItems: 'center' },
  boxInactive: { height: 45 },
  boxText: { color: '#FFF', fontSize: 24, fontWeight: 'bold' },
  dot: { width: 12, height: 12, borderRadius: 6, backgroundColor: '#FFF' },
  actionArea: { height: 50, justifyContent: 'center', alignItems: 'center', marginTop: 16 },
  errorText: { color: colors.primary, fontWeight: 'bold', textAlign: 'center' },
  numpad: { paddingHorizontal: 40, paddingBottom: 40 },
  numpadRow: { flexDirection: 'row', justifyContent: 'space-evenly', marginBottom: 16 },
  numpadKey: { width: 70, height: 70, borderRadius: 35, justifyContent: 'center', alignItems: 'center', backgroundColor: 'rgba(255,255,255,0.05)' },
  numpadText: { color: '#FFF', fontSize: 28, fontWeight: '400' },
});
