import { createClient } from '@supabase/supabase-js';
import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';

const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL?.trim() ?? '';
const supabaseAnonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY?.trim() ?? '';

/** True quand l’URL et la clé anon sont présentes (build local ou secrets EAS). */
export function isSupabaseConfigured(): boolean {
  return Boolean(supabaseUrl && supabaseAnonKey);
}

// Valeurs factices : le bundle release sans EXPO_PUBLIC_* ne doit pas crasher au chargement du module.
// L’app affiche un écran d’erreur si `!isSupabaseConfigured()` ; pas d’appels réseau auth inutiles.
const PLACEHOLDER_URL = 'https://placeholder.supabase.co';
const PLACEHOLDER_ANON_KEY =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIn0.placeholder';

const resolvedUrl = isSupabaseConfigured() ? supabaseUrl : PLACEHOLDER_URL;
const resolvedKey = isSupabaseConfigured() ? supabaseAnonKey : PLACEHOLDER_ANON_KEY;

// Adapter SecureStore pour Supabase Auth storage (persistance des tokens)
const ExpoSecureStoreAdapter = {
  getItem: async (key: string): Promise<string | null> => {
    if (Platform.OS === 'web') {
      // Fallback localStorage pour le web (dev)
      return localStorage.getItem(key);
    }
    return await SecureStore.getItemAsync(key);
  },
  setItem: async (key: string, value: string): Promise<void> => {
    if (Platform.OS === 'web') {
      localStorage.setItem(key, value);
      return;
    }
    await SecureStore.setItemAsync(key, value);
  },
  removeItem: async (key: string): Promise<void> => {
    if (Platform.OS === 'web') {
      localStorage.removeItem(key);
      return;
    }
    await SecureStore.deleteItemAsync(key);
  },
};

export const supabase = createClient(resolvedUrl, resolvedKey, {
  auth: isSupabaseConfigured()
    ? {
        storage: ExpoSecureStoreAdapter,
        autoRefreshToken: true,
        persistSession: true,
        detectSessionInUrl: false,
      }
    : {
        autoRefreshToken: false,
        persistSession: false,
        detectSessionInUrl: false,
      },
});
