import React, { createContext, useContext, useState, useCallback } from 'react';
import { Modal, View, Text, StyleSheet, Dimensions, Platform } from 'react-native';
import { MaterialIcons, MaterialCommunityIcons } from '@expo/vector-icons';
import { colors } from '../theme/colors';
import { AppTouchableOpacity } from '../components/ui/AppTouchableOpacity';

const { width } = Dimensions.get('window');

type DialogIconType = 'material' | 'community';

interface DialogConfig {
  title: string;
  message: string;
  icon?: string;
  iconType?: DialogIconType;
  iconColor?: string;
  confirmText?: string;
  onConfirm?: () => void;
  cancelText?: string;
  onCancel?: () => void;
  isError?: boolean;
}

interface GlobalDialogContextType {
  showDialog: (config: DialogConfig) => void;
  hideDialog: () => void;
}

const GlobalDialogContext = createContext<GlobalDialogContextType | undefined>(undefined);

export const GlobalDialogProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [visible, setVisible] = useState(false);
  const [config, setConfig] = useState<DialogConfig | null>(null);

  const showDialog = useCallback((newConfig: DialogConfig) => {
    setConfig(newConfig);
    setVisible(true);
  }, []);

  const hideDialog = useCallback(() => {
    setVisible(false);
  }, []);

  const handleConfirm = () => {
    hideDialog();
    if (config?.onConfirm) config.onConfirm();
  };

  const handleCancel = () => {
    hideDialog();
    if (config?.onCancel) config.onCancel();
  };

  // Render icon based on type
  const renderIcon = () => {
    if (!config?.icon) return null;
    const IconColor = config.iconColor || (config.isError ? colors.primary : colors.secondary);
    
    if (config.iconType === 'community') {
      return <MaterialCommunityIcons name={config.icon as any} size={48} color={IconColor} />;
    }
    return <MaterialIcons name={config.icon as any} size={48} color={IconColor} />;
  };

  return (
    <GlobalDialogContext.Provider value={{ showDialog, hideDialog }}>
      {children}
      <Modal
        visible={visible}
        transparent
        animationType="fade"
        onRequestClose={hideDialog}
      >
        <View style={styles.overlay}>
          <View style={styles.dialogCard}>
            <View style={styles.content}>
              {config?.icon && (
                <View style={[styles.iconWrapper, { backgroundColor: (config.iconColor || (config.isError ? colors.primary : colors.secondary)) + '15' }]}>
                  {renderIcon()}
                </View>
              )}
              
              <Text style={styles.title}>{config?.title}</Text>
              <Text style={styles.message}>{config?.message}</Text>
            </View>

            <View style={styles.footer}>
              {config?.cancelText && (
                <AppTouchableOpacity style={styles.cancelBtn} onPress={handleCancel}>
                  <Text style={styles.cancelBtnText}>{config.cancelText}</Text>
                </AppTouchableOpacity>
              )}
              
              <AppTouchableOpacity 
                style={[
                  styles.confirmBtn, 
                  config?.isError && { backgroundColor: colors.primary },
                  !config?.cancelText && { flex: 1 }
                ]} 
                onPress={handleConfirm}
              >
                <Text style={styles.confirmBtnText}>{config?.confirmText || 'OK'}</Text>
              </AppTouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </GlobalDialogContext.Provider>
  );
};

export const useDialog = () => {
  const context = useContext(GlobalDialogContext);
  if (!context) {
    throw new Error('useDialog must be used within a GlobalDialogProvider');
  }
  return context;
};

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.75)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  dialogCard: {
    width: '100%',
    maxWidth: 400,
    backgroundColor: '#1E1E1E',
    borderRadius: 28,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.08)',
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.5,
    shadowRadius: 20,
    elevation: 10,
  },
  content: {
    padding: 24,
    alignItems: 'center',
  },
  iconWrapper: {
    width: 80,
    height: 80,
    borderRadius: 40,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 20,
  },
  title: {
    color: '#FFF',
    fontSize: 20,
    fontWeight: '800',
    textAlign: 'center',
    marginBottom: 12,
  },
  message: {
    color: 'rgba(255, 255, 255, 0.7)',
    fontSize: 15,
    lineHeight: 22,
    textAlign: 'center',
  },
  footer: {
    flexDirection: 'row',
    padding: 16,
    gap: 12,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255, 255, 255, 0.05)',
  },
  confirmBtn: {
    flex: 1.5,
    height: 54,
    backgroundColor: colors.secondary,
    borderRadius: 16,
    justifyContent: 'center',
    alignItems: 'center',
  },
  confirmBtnText: {
    color: '#FFF',
    fontSize: 15,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  cancelBtn: {
    flex: 1,
    height: 54,
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
    borderRadius: 16,
    justifyContent: 'center',
    alignItems: 'center',
  },
  cancelBtnText: {
    color: 'rgba(255, 255, 255, 0.6)',
    fontSize: 15,
    fontWeight: '700',
  },
});
