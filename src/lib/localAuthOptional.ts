import { Platform } from 'react-native';
import { requireOptionalNativeModule } from 'expo-modules-core';

type LocalAuthNative = {
  hasHardwareAsync: () => Promise<boolean>;
  isEnrolledAsync: () => Promise<boolean>;
  authenticateAsync: (options: Record<string, unknown>) => Promise<{
    success: boolean;
    error?: string;
    warning?: string;
  }>;
};

const native = requireOptionalNativeModule<LocalAuthNative>('ExpoLocalAuthentication');

export function isLocalAuthNativeLinked(): boolean {
  return native != null;
}

export async function hasHardwareAsync(): Promise<boolean> {
  if (!native?.hasHardwareAsync) {
    return false;
  }
  return native.hasHardwareAsync();
}

export async function isEnrolledAsync(): Promise<boolean> {
  if (!native?.isEnrolledAsync) {
    return false;
  }
  return native.isEnrolledAsync();
}

/** Options alignées sur expo-local-authentication (Android : weak + pas de double confirmation implicite bloquante). */
export async function authenticateAsync(options: {
  promptMessage?: string;
  promptSubtitle?: string;
  cancelLabel?: string;
  fallbackLabel?: string;
  disableDeviceFallback?: boolean;
  requireConfirmation?: boolean;
  biometricsSecurityLevel?: 'weak' | 'strong';
} = {}): Promise<{ success: boolean; error?: string }> {
  if (!native?.authenticateAsync) {
    return { success: false, error: 'native_module_unavailable' };
  }
  const promptMessage = options.promptMessage || 'Authenticate';
  const cancelLabel = options.cancelLabel || 'Cancel';
  const payload: Record<string, unknown> = {
    ...options,
    promptMessage,
    cancelLabel,
  };
  if (Platform.OS === 'android') {
    payload.biometricsSecurityLevel = options.biometricsSecurityLevel ?? 'weak';
    if (options.requireConfirmation === undefined) {
      payload.requireConfirmation = false;
    }
  }
  return native.authenticateAsync(payload);
}
