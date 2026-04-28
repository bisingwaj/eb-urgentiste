import React, { createContext, useContext, useEffect, useState, useCallback, useRef } from 'react';
import { supabase, isSupabaseConfigured } from '../lib/supabase';
import type { Session } from '@supabase/supabase-js';
import type { UserProfile } from '../types/userProfile';
import {
  clearLocalAppCacheForSession,
  readUserProfileCache,
  writeUserProfileCache,
} from '../lib/localAppCache';
import { runSessionBootstrap } from '../lib/sessionBootstrap';


interface AuthState {
  session: Session | null;
  profile: UserProfile | null;
  isLoading: boolean;
  isAuthenticated: boolean;
}

type AuthPortal = 'urgentiste' | 'hopital';

interface AuthContextType extends AuthState {
  signInWithAgent: (agentLoginId: string, pinCode: string) => Promise<{ success: boolean; error?: string; mustChangePassword?: boolean }>;
  /** Après connexion : vérifie que le rôle `users_directory` correspond au portail choisi (urgentiste ≠ hopital). */
  validatePortalRole: (portal: AuthPortal) => Promise<{ ok: boolean; error?: string }>;
  signOut: () => Promise<void>;
  refreshProfile: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const sessionBootstrapKeyRef = useRef<string | null>(null);
  const [state, setState] = useState<AuthState>({
    session: null,
    profile: null,
    isLoading: true,
    isAuthenticated: false,
  });

  const attachHospitalStructure = useCallback(async (profile: UserProfile) => {
    if (profile.role !== 'hopital') {
      profile.linkedStructure = null;
      return;
    }
    let { data: st } = await supabase
      .from('health_structures')
      .select('id, name, short_name, address, phone')
      .eq('linked_user_id', profile.id)
      .maybeSingle();
    if (!st?.id) {
      const r2 = await supabase
        .from('health_structures')
        .select('id, name, short_name, address, phone')
        .eq('linked_user_id', profile.auth_user_id)
        .maybeSingle();
      st = r2.data;
    }
    profile.health_structure_id = st?.id || null;
    if (st?.id) {
      profile.linkedStructure = {
        id: st.id,
        name: typeof st.name === 'string' && st.name.trim() ? st.name.trim() : 'Structure',
        short_name: st.short_name != null && String(st.short_name).trim() ? String(st.short_name).trim() : null,
        address: st.address != null && String(st.address).trim() ? String(st.address).trim() : null,
        phone: st.phone != null && String(st.phone).trim() ? String(st.phone).trim() : null,
      };
    } else {
      profile.linkedStructure = null;
    }
  }, []);

  // Charger le profil depuis users_directory (+ fiche health_structures pour le portail hôpital)
  const fetchProfile = useCallback(async (authUserId: string): Promise<UserProfile | null> => {
    try {
      const { data, error } = await supabase
        .from('users_directory')
        .select('id, auth_user_id, role, first_name, last_name, email, phone, photo_url, status, available, grade, matricule, specialization, zone, address, assigned_unit_id, must_change_password, agent_login_id')
        .eq('auth_user_id', authUserId)
        .not('agent_login_id', 'is', null)
        .limit(1)
        .maybeSingle();

      // Fallback si pas de résultat ou erreur (ex: hôpitaux sans agent_login_id)
      if (error || !data) {
        if (error) console.warn('[Auth] Erreur ou profil non trouvé avec agent_login_id, tentative fallback:', error.message);
        
        const { data: fallbackData, error: fallbackError } = await supabase
          .from('users_directory')
          .select('id, auth_user_id, role, first_name, last_name, email, phone, photo_url, status, available, grade, matricule, specialization, zone, address, assigned_unit_id, must_change_password, agent_login_id')
          .eq('auth_user_id', authUserId)
          .limit(1)
          .maybeSingle();

        if (fallbackError || !fallbackData) {
          if (fallbackError) console.error('[Auth] Erreur fallback profil:', fallbackError.message);
          return null;
        }

        const profile = fallbackData as UserProfile;
        await attachHospitalStructure(profile);
        await writeUserProfileCache(authUserId, profile);
        return profile;
      }

      const profile = data as UserProfile;
      await attachHospitalStructure(profile);
      await writeUserProfileCache(authUserId, profile);
      return profile;
    } catch (err) {
      console.error('[Auth] Exception chargement profil:', err);
      return null;
    }
  }, [attachHospitalStructure]);

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
        const cached = await readUserProfileCache(session.user.id);
        if (cached) {
          setState({
            session,
            profile: cached,
            isLoading: false,
            isAuthenticated: true,
          });
        }
        const profile = await fetchProfile(session.user.id);
        console.log('[Auth] Profil chargé:', profile ? `${profile.first_name} ${profile.last_name} (${profile.role})` : 'NULL');
        setState({
          session,
          profile: profile ?? cached ?? null,
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
            const cached = await readUserProfileCache(session.user.id);
            if (cached) {
              setState({
                session,
                profile: cached,
                isLoading: false,
                isAuthenticated: true,
              });
            }
            const profile = await fetchProfile(session.user.id);
            console.log('[Auth] onAuthStateChange Profil chargé:', profile ? `${profile.first_name} ${profile.last_name}` : 'NULL');
            setState({
              session,
              profile: profile ?? cached ?? null,
              isLoading: false,
              isAuthenticated: true,
            });
          } else {
            // Pour SIGNED_IN et les autres, on NE DOIT PAS utiliser "await" sinon supabase-js bloque (deadlock)
            setState((prev) => ({
              ...prev,
              session,
              isLoading: false,
              isAuthenticated: true,
            }));
            readUserProfileCache(session.user.id).then((cached) => {
              if (cached) {
                setState((prev) => ({ ...prev, profile: cached }));
              }
            });
            fetchProfile(session.user.id)
              .then((profile) => {
                console.log(
                  '[Auth] Profil asynchrone chargé:',
                  profile ? `${profile.first_name} ${profile.last_name}` : 'NULL',
                );
                setState((prev) => ({ ...prev, profile }));
              })
              .catch(console.error);
          }
        }
      }
    );

    return () => subscription.unsubscribe();
  }, [fetchProfile]);

  /** Préchargement cache historique (urgentiste) — une fois par couple user + unité. */
  useEffect(() => {
    const p = state.profile;
    if (!p?.assigned_unit_id || p.role === 'hopital') return;
    const key = `${p.auth_user_id}:${p.assigned_unit_id}`;
    if (sessionBootstrapKeyRef.current === key) return;
    sessionBootstrapKeyRef.current = key;
    void runSessionBootstrap(p);
  }, [state.profile]);

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
        let errorDetail = 'Erreur de connexion. réessayez.';
        try {
          if (error.context && typeof error.context.json === 'function') {
            const errorBody = await error.context.json();
            console.log('[Auth] Edge Function error body:', JSON.stringify(errorBody));
            errorDetail = errorBody?.error || errorBody?.message || errorDetail;
          } else {
            console.log('[Auth] Edge Function error:', error.message || error);
          }
        } catch (parseErr) {
          console.log('[Auth] Edge Function error (raw):', error);
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
        return { ok: false, error: 'Session introuvable. réessayez.' };
      }
      const loaded = await fetchProfile(userData.user.id);
      if (!loaded) {
        return {
          ok: false,
          error: "utilisateur n'existe pas",
        };
      }

      // 1. Vérification stricte des rôles autorisés (uniquement hôpital et secouriste)
      if (loaded.role !== 'hopital' && loaded.role !== 'secouriste') {
        return {
          ok: false,
          error: "utilisateur n'existe pas",
        };
      }

      // 2. Vérification de la correspondance avec le portail choisi
      if (portal === 'hopital') {
        if (loaded.role !== 'hopital') {
          return {
            ok: false,
            error: 'Ce compte n’est pas autorisé sur le portail hôpital.',
          };
        }
      } else {
        // Pour le portail urgentiste, on n'autorise QUE le rôle 'secouriste'
        if (loaded.role !== 'secouriste') {
          return {
            ok: false,
            error: 'Ce compte est réservé au portail urgentiste. Choisissez « Urgentiste » sur l’écran d’accueil.',
          };
        }
      }
      return { ok: true };
    },
    [fetchProfile],
  );

  // Déconnexion propre
  const signOut = useCallback(async () => {
    sessionBootstrapKeyRef.current = null;
    try {
      if (state.profile?.auth_user_id) {
        await clearLocalAppCacheForSession({
          authUserId: state.profile.auth_user_id,
          unitId: state.profile.assigned_unit_id,
          structureId: state.profile.health_structure_id,
        });
      }
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
