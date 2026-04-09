import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { supabase, isSupabaseConfigured } from '../lib/supabase';
import type { Session } from '@supabase/supabase-js';

// Profil urgentiste depuis users_directory
export interface UserProfile {
  id: string;
  auth_user_id: string;
  role: string;
  first_name: string;
  last_name: string;
  email: string | null;
  phone: string | null;
  photo_url: string | null;
  status: string | null;
  available: boolean;
  grade: string | null;
  matricule: string | null;
  specialization: string | null;
  zone: string | null;
  address: string | null;
  assigned_unit_id: string | null;
  health_structure_id: string | null;
  must_change_password: boolean;
  agent_login_id: string | null;
}

interface AuthState {
  session: Session | null;
  profile: UserProfile | null;
  isLoading: boolean;
  isAuthenticated: boolean;
}

export type AuthPortal = 'urgentiste' | 'hopital';

interface AuthContextType extends AuthState {
  signInWithAgent: (agentLoginId: string, pinCode: string) => Promise<{ success: boolean; error?: string; mustChangePassword?: boolean }>;
  /** Après connexion : vérifie que le rôle `users_directory` correspond au portail choisi (urgentiste ≠ hopital). */
  validatePortalRole: (portal: AuthPortal) => Promise<{ ok: boolean; error?: string }>;
  signOut: () => Promise<void>;
  refreshProfile: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<AuthState>({
    session: null,
    profile: null,
    isLoading: true,
    isAuthenticated: false,
  });

  // Charger le profil depuis users_directory
  const fetchProfile = useCallback(async (authUserId: string): Promise<UserProfile | null> => {
    try {
      const { data, error } = await supabase
        .from('users_directory')
        .select('id, auth_user_id, role, first_name, last_name, email, phone, photo_url, status, available, grade, matricule, specialization, zone, address, assigned_unit_id, must_change_password, agent_login_id')
        .eq('auth_user_id', authUserId)
        .not('agent_login_id', 'is', null)  // Préférer l'entrée avec agent_login_id
        .limit(1)
        .maybeSingle();

      if (error) {
        console.error('[Auth] Erreur chargement profil:', error.message);
        // Fallback: essayer sans le filtre agent_login_id
        const { data: fallbackData, error: fallbackError } = await supabase
          .from('users_directory')
          .select('id, auth_user_id, role, first_name, last_name, email, phone, photo_url, status, available, grade, matricule, specialization, zone, address, assigned_unit_id, must_change_password, agent_login_id')
          .eq('auth_user_id', authUserId)
          .limit(1)
          .maybeSingle();

        if (fallbackError) {
          console.error('[Auth] Erreur fallback profil:', fallbackError.message);
          return null;
        }
        
        const profile = fallbackData as UserProfile;
        if (profile && profile.role === 'hopital') {
          let { data: st } = await supabase
            .from('health_structures')
            .select('id')
            .eq('linked_user_id', profile.id)
            .maybeSingle();
          if (!st?.id) {
            const r2 = await supabase
              .from('health_structures')
              .select('id')
              .eq('linked_user_id', profile.auth_user_id)
              .maybeSingle();
            st = r2.data;
          }
          profile.health_structure_id = st?.id || null;
        }
        return profile;
      }
      
      const profile = data as UserProfile;
      if (profile && profile.role === 'hopital') {
        let { data: st } = await supabase
          .from('health_structures')
          .select('id')
          .eq('linked_user_id', profile.id)
          .maybeSingle();
        if (!st?.id) {
          const r2 = await supabase
            .from('health_structures')
            .select('id')
            .eq('linked_user_id', profile.auth_user_id)
            .maybeSingle();
          st = r2.data;
        }
        profile.health_structure_id = st?.id || null;
      }
      return profile;
    } catch (err) {
      console.error('[Auth] Exception chargement profil:', err);
      return null;
    }
  }, []);

  // Écouter les changements de session Supabase
  useEffect(() => {
    if (!isSupabaseConfigured()) {
      setState({ session: null, profile: null, isLoading: false, isAuthenticated: false });
      return;
    }

    // 1. Récupérer la session existante
    supabase.auth.getSession().then(async ({ data: { session } }) => {
      console.log('[Auth] getSession:', session ? `User ${session.user.id}` : 'Pas de session');
      if (session?.user) {
        const profile = await fetchProfile(session.user.id);
        console.log('[Auth] Profil chargé:', profile ? `${profile.first_name} ${profile.last_name} (${profile.role})` : 'NULL');
        setState({
          session,
          profile,
          isLoading: false,
          isAuthenticated: true,
        });
      } else {
        setState({
          session: null,
          profile: null,
          isLoading: false,
          isAuthenticated: false,
        });
      }
    });

    // 2. Écouter les changements (refresh, sign out, etc.)
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (event, session) => {
        console.log('[Auth] Event:', event);

        if (event === 'SIGNED_OUT') {
          setState({
            session: null,
            profile: null,
            isLoading: false,
            isAuthenticated: false,
          });
        } else if (session?.user) {
          console.log('[Auth] onAuthStateChange: evt', event, '- user exists, fetching profile...');
          
          if (event === 'INITIAL_SESSION') {
            // Au démarrage, on peut attendre sans risque de deadlock
            const profile = await fetchProfile(session.user.id);
            console.log('[Auth] onAuthStateChange Profil chargé:', profile ? `${profile.first_name} ${profile.last_name}` : 'NULL');
            setState({
              session,
              profile,
              isLoading: false,
              isAuthenticated: true,
            });
          } else {
            // Pour SIGNED_IN et les autres, on NE DOIT PAS utiliser "await" sinon supabase-js bloque (deadlock)
            // On valide la session instantanément
            setState(prev => ({ ...prev, session, isLoading: false, isAuthenticated: true }));
            
            // Puis on charge le profil sans bloquer le thread de Supabase
            fetchProfile(session.user.id).then(profile => {
              console.log('[Auth] Profil asynchrone chargé:', profile ? `${profile.first_name} ${profile.last_name}` : 'NULL');
              setState(prev => ({ ...prev, profile }));
            }).catch(console.error);
          }
        }
      }
    );

    return () => subscription.unsubscribe();
  }, [fetchProfile]);

  // Login via agent_login_id + pin_code (Edge Function)
  const signInWithAgent = useCallback(async (
    agentLoginId: string,
    pinCode: string
  ): Promise<{ success: boolean; error?: string; mustChangePassword?: boolean }> => {
    try {
      console.log('[Auth] Appel agent-login avec:', { agent_login_id: agentLoginId, pin_code: '***' });
      
      const { data, error } = await supabase.functions.invoke('agent-login', {
        body: {
          agent_login_id: agentLoginId,
          pin_code: pinCode,
        },
      });

      console.log('[Auth] Réponse Edge Function - data:', JSON.stringify(data));
      
      if (error) {
        // Extraire le message d'erreur détaillé
        let errorDetail = 'Erreur de connexion. Réessayez.';
        try {
          if (error.context && typeof error.context.json === 'function') {
            const errorBody = await error.context.json();
            console.error('[Auth] Edge Function error body:', JSON.stringify(errorBody));
            errorDetail = errorBody?.error || errorBody?.message || errorDetail;
          } else {
            console.error('[Auth] Edge Function error:', error.message || error);
          }
        } catch (parseErr) {
          console.error('[Auth] Edge Function error (raw):', error);
        }
        return { success: false, error: errorDetail };
      }

      if (!data?.success) {
        return { success: false, error: data?.error || 'Identifiant ou code PIN invalide' };
      }

      // Établir la session Supabase avec les tokens reçus
      const { error: sessionError } = await supabase.auth.setSession({
        access_token: data.session.access_token,
        refresh_token: data.session.refresh_token,
      });

      if (sessionError) {
        console.error('[Auth] Session error:', sessionError);
        return { success: false, error: 'Erreur d\'initialisation de session.' };
      }

      return {
        success: true,
        mustChangePassword: data.user?.must_change_password ?? false,
      };
    } catch (err: any) {
      console.error('[Auth] Exception:', err);
      return { success: false, error: 'Erreur réseau. Vérifiez votre connexion.' };
    }
  }, []);

  const validatePortalRole = useCallback(
    async (portal: AuthPortal): Promise<{ ok: boolean; error?: string }> => {
      const { data: userData, error: userError } = await supabase.auth.getUser();
      if (userError || !userData.user) {
        return { ok: false, error: 'Session introuvable. Réessayez.' };
      }
      const loaded = await fetchProfile(userData.user.id);
      if (!loaded) {
        return {
          ok: false,
          error: 'Profil introuvable. Vérifiez vos droits ou contactez l’administrateur.',
        };
      }
      if (portal === 'hopital') {
        if (loaded.role !== 'hopital') {
          return {
            ok: false,
            error: 'Ce compte n’est pas autorisé sur le portail hôpital.',
          };
        }
      } else {
        if (loaded.role === 'hopital') {
          return {
            ok: false,
            error: 'Ce compte est réservé au portail hôpital. Choisissez « Hôpital » sur l’écran d’accueil.',
          };
        }
      }
      return { ok: true };
    },
    [fetchProfile],
  );

  // Déconnexion propre
  const signOut = useCallback(async () => {
    try {
      // Mettre le statut à offline avant de déconnecter
      if (state.profile?.auth_user_id) {
        await supabase.from('users_directory')
          .update({ status: 'offline', is_on_call: false })
          .eq('auth_user_id', state.profile.auth_user_id);
      }
    } catch (err) {
      console.error('[Auth] Erreur mise à jour statut offline:', err);
    }

    await supabase.auth.signOut();
  }, [state.profile]);

  // Rafraîchir le profil manuellement
  const refreshProfile = useCallback(async () => {
    if (state.session?.user) {
      const profile = await fetchProfile(state.session.user.id);
      setState(prev => ({ ...prev, profile }));
    }
  }, [state.session, fetchProfile]);

  return (
    <AuthContext.Provider value={{
      ...state,
      signInWithAgent,
      validatePortalRole,
      signOut,
      refreshProfile,
    }}>
      {children}
    </AuthContext.Provider>
  );
}

// Hook d'utilisation
export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth doit être utilisé dans un AuthProvider');
  }
  return context;
}
