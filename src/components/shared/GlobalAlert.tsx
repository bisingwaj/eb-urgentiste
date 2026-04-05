import React, { useState, useEffect } from 'react';
import { Modal, View, Text, TouchableOpacity, StyleSheet, Alert as NativeAlert, DeviceEventEmitter } from 'react-native';
import { NotificationIcon } from '../icons/TabIcons';

// Subvert React Native's default Alert.alert to use our Global Custom Modal instead!
const originalAlert = NativeAlert.alert;

NativeAlert.alert = (title: string, message?: string, buttons?: any[], options?: any) => {
  // Fallback to native if there are more than 2 buttons (complex alerts)
  if (buttons && buttons.length > 2) {
    originalAlert(title, message, buttons, options);
    return;
  }
  
  // Convert standard strings or undefined message to empty string for safety
  const safeMessage = message || '';
  DeviceEventEmitter.emit('SHOW_CUSTOM_ALERT', { title, message: safeMessage, buttons });
};

export const GlobalAlert = () => {
  const [visible, setVisible] = useState(false);
  const [config, setConfig] = useState<any>(null);

  useEffect(() => {
    const sub = DeviceEventEmitter.addListener('SHOW_CUSTOM_ALERT', (alertConfig) => {
      setConfig(alertConfig);
      setVisible(true);
    });
    return () => sub.remove();
  }, []);

  const close = () => {
    setVisible(false);
    setTimeout(() => setConfig(null), 300); // Clear state after the fade animation finishes
  };

  if (!config) return null;

  // React Native defaults to an "OK" button dismissing the alert if no buttons are provided
  const buttons = config.buttons && config.buttons.length > 0 
    ? config.buttons 
    : [{ text: 'OK', onPress: () => {} }];

  return (
    <Modal visible={visible} transparent animationType="fade">
      <View style={styles.modalOverlay}>
        <View style={styles.modalContent}>
          <View style={styles.modalIconBox}>
            <NotificationIcon color="#1564bf" size={40} />
          </View>
          <Text style={styles.modalTitle}>{config.title}</Text>
          {!!config.message && <Text style={styles.modalMessage}>{config.message}</Text>}
          
          <View style={styles.buttonsContainer}>
            {buttons.map((btn: any, idx: number) => {
              // Usually the first button is 'Cancel' or secondary if there are 2 buttons
              const isSecondary = buttons.length === 2 && idx === 0;
              // Add special logic: if button text indicates danger/deletion, use red instead
              const isDestructive = btn.style === 'destructive' || btn.style === 'cancel' && !isSecondary;

              return (
                <TouchableOpacity 
                  key={idx}
                  style={[
                    styles.modalButton, 
                    isSecondary && styles.modalButtonSecondary,
                    isDestructive && { backgroundColor: '#E3242B' }
                  ]} 
                  onPress={() => {
                    close();
                    if (btn.onPress) {
                      setTimeout(() => btn.onPress(), 100); // add a tiny delay to ensure smooth dismissal
                    }
                  }}
                >
                  <Text style={[
                    styles.modalButtonText,
                    isSecondary && styles.modalButtonTextSecondary,
                    isDestructive && { color: '#FFF' }
                  ]}>
                    {btn.text || 'OK'}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>
        </View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.65)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  modalContent: {
    backgroundColor: '#1E1E1E',
    borderRadius: 32,
    padding: 32,
    alignItems: 'center',
    width: '100%',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.5,
    shadowRadius: 20,
    elevation: 10,
  },
  modalIconBox: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: 'rgba(21, 100, 191, 0.1)',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 24,
  },
  modalTitle: {
    color: '#FFF',
    fontSize: 22,
    fontWeight: '900',
    marginBottom: 12,
    textAlign: 'center',
  },
  modalMessage: {
    color: 'rgba(255,255,255,0.5)',
    fontSize: 15,
    textAlign: 'center',
    lineHeight: 22,
    marginBottom: 32,
  },
  buttonsContainer: {
    flexDirection: 'row',
    width: '100%',
    gap: 12,
  },
  modalButton: {
    flex: 1,
    backgroundColor: '#1564bf',
    paddingVertical: 16,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalButtonSecondary: {
    backgroundColor: 'rgba(255,255,255,0.08)',
  },
  modalButtonText: {
    color: '#FFF',
    fontSize: 16,
    fontWeight: '800',
  },
  modalButtonTextSecondary: {
    color: '#FFF',
    opacity: 0.7,
  },
});
