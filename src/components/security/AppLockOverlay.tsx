import React, { useCallback, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  Modal,
  StatusBar,
  Platform,
  ActivityIndicator,
  InteractionManager,
} from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { colors } from '../../theme/colors';

type Props = {
  onUnlock: () => void | Promise<void>;
};

export function AppLockOverlay({ onUnlock }: Props) {
  const [busy, setBusy] = useState(false);
  const busyRef = useRef(false);

  const runUnlock = useCallback(() => {
    if (busyRef.current) {
      return;
    }
    busyRef.current = true;
    setBusy(true);
    InteractionManager.runAfterInteractions(() => {
      const delay = Platform.OS === 'android' ? 320 : 80;
      setTimeout(() => {
        void Promise.resolve(onUnlock())
          .catch((e) => console.warn('[AppLock] onUnlock', e))
          .finally(() => {
            busyRef.current = false;
            setBusy(false);
          });
      }, delay);
    });
  }, [onUnlock]);

  return (
    <Modal visible animationType="fade" statusBarTranslucent transparent={Platform.OS === 'ios'}>
      <StatusBar barStyle="light-content" backgroundColor="#050505" />
      <View style={[styles.root, Platform.OS === 'android' && styles.rootAndroid]}>
        <MaterialIcons name="lock" size={56} color={colors.secondary} />
        <Text style={styles.title}>Application verrouillée</Text>
        <Text style={styles.subtitle}>
          Confirmez votre identité avec l’empreinte, le visage ou le code du téléphone. Cette étape s’ajoute à votre
          connexion agent.
        </Text>
        <Pressable
          style={({ pressed }) => [styles.btn, pressed && styles.btnPressed, busy && styles.btnDisabled]}
          onPress={runUnlock}
          disabled={busy}
          accessibilityRole="button"
          accessibilityLabel="Déverrouiller avec la biométrie ou le code du téléphone"
        >
          {busy ? (
            <ActivityIndicator color="#0A0A0A" />
          ) : (
            <>
              <MaterialIcons name="fingerprint" size={26} color="#0A0A0A" />
              <Text style={styles.btnText}>Déverrouiller</Text>
            </>
          )}
        </Pressable>
        <Text style={styles.hint}>Si rien ne s’affiche, appuyez à nouveau après la fermeture du clavier ou du dialogue système.</Text>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: '#050505',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 32,
    paddingTop: Platform.OS === 'android' ? StatusBar.currentHeight ?? 0 : 0,
  },
  rootAndroid: {
    elevation: 24,
  },
  title: {
    color: '#FFF',
    fontSize: 22,
    fontWeight: '800',
    marginTop: 24,
    textAlign: 'center',
  },
  subtitle: {
    color: 'rgba(255,255,255,0.55)',
    fontSize: 15,
    lineHeight: 22,
    textAlign: 'center',
    marginTop: 12,
    marginBottom: 28,
  },
  hint: {
    color: 'rgba(255,255,255,0.35)',
    fontSize: 12,
    lineHeight: 18,
    textAlign: 'center',
    marginTop: 24,
    paddingHorizontal: 8,
  },
  btn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    minHeight: 52,
    minWidth: 220,
    backgroundColor: colors.secondary,
    paddingVertical: 16,
    paddingHorizontal: 28,
    borderRadius: 16,
  },
  btnPressed: {
    opacity: 0.88,
  },
  btnDisabled: {
    opacity: 0.75,
  },
  btnText: {
    color: '#0A0A0A',
    fontSize: 17,
    fontWeight: '800',
  },
});
