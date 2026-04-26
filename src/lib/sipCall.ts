import {
  RTCPeerConnection,
  RTCIceCandidate,
  RTCSessionDescription,
  mediaDevices,
  MediaStream,
  MediaStreamTrack
} from 'react-native-webrtc';
import { UserAgent, Registerer, Inviter, SessionState, TransportState } from 'sip.js';
import InCallManager from 'react-native-incall-manager';
import { AppState, AppStateStatus } from 'react-native';
import { supabase } from './supabase';

// Polyfill WebRTC pour sip.js
if (!global.window) {
  (global as any).window = {};
}
(global.window as any).RTCPeerConnection = RTCPeerConnection;
(global.window as any).RTCIceCandidate = RTCIceCandidate;
(global.window as any).RTCSessionDescription = RTCSessionDescription;
(global.window as any).MediaStream = MediaStream;
(global.window as any).MediaStreamTrack = MediaStreamTrack;

// FIX CRASH : Injection ou Mock de MediaStreamTrackEvent
(global.window as any).MediaStreamTrackEvent = function() {};

if (!global.navigator) {
  (global as any).navigator = {};
}
if (!global.navigator.mediaDevices) {
  (global.navigator as any).mediaDevices = mediaDevices;
}

let userAgent: UserAgent | null = null;
let registerer: Registerer | null = null;
let currentInviter: Inviter | null = null;
let appStateSubscription: ReturnType<typeof AppState.addEventListener> | null = null;

// ─── AppState listener : réveil automatique du WebSocket SIP ───
function setupAppStateListener() {
  // Supprimer l'ancien listener s'il existe
  if (appStateSubscription) {
    appStateSubscription.remove();
    appStateSubscription = null;
  }

  appStateSubscription = AppState.addEventListener('change', async (nextAppState: AppStateStatus) => {
    if (nextAppState === 'active') {
      console.log('[SIP] App revenue au premier plan. Vérification du WebSocket SIP...');
      if (userAgent && !userAgent.transport.isConnected()) {
        try {
          await userAgent.transport.connect();
          if (registerer) {
            await registerer.register();
          }
          console.log('[SIP] Reconnexion au premier plan réussie.');
        } catch (err) {
          console.warn('[SIP] Échec reconnexion au premier plan:', err);
        }
      }
    }
  });
}

// ─── Transport auto-reconnect listener ───
function setupTransportReconnect() {
  if (!userAgent) return;

  userAgent.transport.stateChange.addListener(async (state: TransportState) => {
    if (state === TransportState.Disconnected) {
      console.log('[SIP] WebSocket déconnecté ! Tentative de reconnexion en arrière-plan...');
      try {
        await userAgent!.transport.connect();
        if (registerer) {
          await registerer.register();
        }
        console.log('[SIP] Reconnexion SIP réussie.');
      } catch (error) {
        console.warn('[SIP] Échec de la reconnexion automatique:', error);
      }
    }
  });
}

export type SipSessionState = SessionState;

export const getSipCallState = (): SessionState | null => {
  return currentInviter?.state || null;
};

export const startSipCall = async (
  targetPhone: string,
  onTerminated?: () => void,
  onCalling?: () => void,
  onActive?: () => void
) => {
  try {
    const { data: { user }, error: authErr } = await supabase.auth.getUser();
    if (authErr || !user) throw new Error("Veuillez vous reconnecter.");

    // Récupérer l'extension SIP dans la DB
    const { data: profileData } = await supabase
      .from('profiles')
      .select('sip_extension, sip_password')
      .eq('id', user.id)
      .single();

    const extension = profileData?.sip_extension || "1002";
    const password = profileData?.sip_password || "Ext12345678@";

    const serverUrl = 'wss://pbx.en-action.com/ws';
    const domain = 'pbx.en-action.com';

    // Normaliser le numéro de téléphone: +2439... -> 09...
    let normalizedPhone = targetPhone.replace(/^\+243/, '0').replace(/\s+/g, '');

    const uri = UserAgent.makeURI(`sip:${extension}@${domain}`);
    if (!uri) throw new Error("URI SIP invalide");

    userAgent = new UserAgent({
      uri: uri,
      authorizationUsername: extension,
      authorizationPassword: password,
      transportOptions: {
        server: serverUrl,
        keepAliveInterval: 15,
        keepAliveDebounce: 10,
        connectionTimeout: 10,
      },
    });

    await userAgent.start();

    // Activer la reconnexion automatique du transport
    setupTransportReconnect();

    // Activer le réveil AppState
    setupAppStateListener();

    registerer = new Registerer(userAgent);
    await registerer.register();

    const targetUri = UserAgent.makeURI(`sip:${normalizedPhone}@${domain}`);
    if (!targetUri) throw new Error("Numéro cible invalide");

    currentInviter = new Inviter(userAgent, targetUri, {
      sessionDescriptionHandlerOptions: {
        constraints: { audio: true, video: false }
      }
    });

    currentInviter.stateChange.addListener((state) => {
      console.log("[SIP] État de l'appel:", state);
      if (state === SessionState.Establishing) {
        InCallManager.start({ media: 'audio' });
        InCallManager.setForceSpeakerphoneOn(false);
        if (onCalling) onCalling();
      } else if (state === SessionState.Established) {
        if (onActive) onActive();
      } else if (state === SessionState.Terminated) {
        InCallManager.stop();
        if (onTerminated) onTerminated();
      }
    });

    await currentInviter.invite();
  } catch (err) {
    console.error("[SIP] Erreur:", err);
    InCallManager.stop();
    if (onTerminated) onTerminated();
    throw err;
  }
};

export const endSipCall = async () => {
  try {
    if (currentInviter) {
      if (currentInviter.state === SessionState.Established) {
        await currentInviter.bye();
      } else if (currentInviter.state === SessionState.Establishing) {
        await currentInviter.cancel();
      }
    }
  } catch (e) {
      console.warn("[SIP] Erreur raccrochage", e);
  } finally {
    // Nettoyer le listener AppState
    if (appStateSubscription) {
      appStateSubscription.remove();
      appStateSubscription = null;
    }
    if (registerer) {
      await registerer.unregister().catch(() => {});
    }
    if (userAgent) {
      await userAgent.stop().catch(() => {});
    }
    InCallManager.stop();
    currentInviter = null;
    userAgent = null;
    registerer = null;
  }
};
