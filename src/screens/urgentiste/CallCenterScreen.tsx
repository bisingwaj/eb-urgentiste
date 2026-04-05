import React, { useState, useEffect, useRef, useCallback } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, StatusBar, Alert, Linking } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { MaterialIcons } from '@expo/vector-icons';
import {
  RtcSurfaceView,
  RenderModeType,
  VideoSourceType,
} from 'react-native-agora';

import { colors } from '../../theme/colors';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';
import {
  joinAgoraChannel,
  leaveAgoraChannel,
  setAgoraRtcCallbacks,
  setLocalAudioMuted,
  setLocalVideoMuted,
  setSpeakerphoneOn,
} from '../../services/agoraRtc';

type CallState = 'selection' | 'calling' | 'active';
type CallType = 'audio' | 'video' | null;

function buildChannelName(): string {
  return `OP-${Date.now()}`;
}

export function CallCenterScreen({ navigation }: { navigation: { goBack: () => void } }) {
  const { profile, session } = useAuth();

  const [callState, setCallState] = useState<CallState>('selection');
  const [callType, setCallType] = useState<CallType>(null);
  const [currentCallId, setCurrentCallId] = useState<string | null>(null);

  const [isMuted, setIsMuted] = useState(false);
  const [isVideoOff, setIsVideoOff] = useState(false);
  const [isSpeakerOn, setIsSpeakerOn] = useState(false);
  const [callDuration, setCallDuration] = useState(0);
  const [remoteUid, setRemoteUid] = useState<number | null>(null);

  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const subscriptionRef = useRef<ReturnType<typeof supabase.channel> | null>(null);

  const cleanupSubscription = useCallback(() => {
    if (subscriptionRef.current) {
      supabase.removeChannel(subscriptionRef.current);
      subscriptionRef.current = null;
    }
  }, []);

  // ── Realtime : statut de l'appel (prise en charge centrale) ──
  useEffect(() => {
    if (callState !== 'calling' || !currentCallId) {
      return;
    }

    console.log('[Call] 📡 Abonnement Realtime pour call_id:', currentCallId);
    cleanupSubscription();

    const ch = supabase
      .channel(`call-${currentCallId}`)
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'call_history',
          filter: `id=eq.${currentCallId}`,
        },
        (payload: { new?: { status?: string } }) => {
          console.log('[Call] 📥 Realtime UPDATE:', payload.new?.status);
          const status = payload.new?.status;
          if (status === 'active') {
            setCallState('active');
          } else if (status && ['completed', 'failed', 'missed'].includes(status)) {
            Alert.alert('Appel terminé', "L'opérateur a mis fin à l'appel.");
            void endCallRemotelyRef.current();
          }
        }
      )
      .subscribe();

    subscriptionRef.current = ch;

    return () => {
      cleanupSubscription();
    };
  }, [callState, currentCallId, cleanupSubscription]);

  // ── Timer durée d'appel ──
  useEffect(() => {
    if (callState === 'active') {
      timerRef.current = setInterval(() => {
        setCallDuration((prev) => prev + 1);
      }, 1000);
      if (callType === 'video') {
        setIsSpeakerOn(true);
        setSpeakerphoneOn(true);
      }
    }
    return () => {
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
    };
  }, [callState, callType]);

  const endCallRemotelyRef = useRef<() => Promise<void>>(async () => {});

  const cleanupAndGoBack = useCallback(() => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
    cleanupSubscription();
    setAgoraRtcCallbacks({});
    leaveAgoraChannel();
    setCallState('selection');
    setCurrentCallId(null);
    setCallDuration(0);
    setRemoteUid(null);
    setIsMuted(false);
    setIsVideoOff(false);
    navigation.goBack();
  }, [cleanupSubscription, navigation]);

  /** Raccrochage côté urgentiste : met à jour la ligne (ended_by = rescuer) puis quitte. */
  const endCallLocal = useCallback(async () => {
    try {
      leaveAgoraChannel();
      if (currentCallId) {
        await supabase
          .from('call_history')
          .update({
            status: 'completed',
            ended_by: 'rescuer',
            ended_at: new Date().toISOString(),
            duration_seconds: callDuration,
          })
          .eq('id', currentCallId);
      }
    } catch (e) {
      console.error('[Call] Erreur endCall:', e);
    }
    cleanupAndGoBack();
  }, [currentCallId, callDuration, cleanupAndGoBack]);

  /** Fin d'appel déjà enregistrée côté centrale (Realtime) : ne pas réécrire le statut. */
  const endCallRemotely = useCallback(async () => {
    leaveAgoraChannel();
    cleanupAndGoBack();
  }, [cleanupAndGoBack]);

  endCallRemotelyRef.current = endCallRemotely;

  useEffect(() => {
    setAgoraRtcCallbacks({
      onRemoteUserJoined: (uid) => {
        setRemoteUid(uid);
      },
      onRemoteUserOffline: () => {
        setRemoteUid(null);
      },
      onError: (code, msg) => {
        console.error('[Call] Agora error:', code, msg);
        Alert.alert('Appel', `Erreur média (${code}). ${msg || ''}`);
      },
    });
    return () => {
      setAgoraRtcCallbacks({});
    };
  }, []);

  // ── Initier un appel : DB puis Agora ──
  const initiateCall = async (type: CallType) => {
    const chName = buildChannelName();
    try {
      setCallType(type);
      if (type === 'audio') {
        setIsVideoOff(true);
      }
      setCallState('calling');

      console.log('[Call] 📞 INSERT call_history...', chName);
      const { data, error } = await supabase
        .from('call_history')
        .insert({
          channel_name: chName,
          call_type: 'internal',
          status: 'ringing',
          caller_name: profile ? `${profile.first_name} ${profile.last_name}` : 'Urgentiste',
          caller_phone: profile?.phone ?? null,
          has_video: type === 'video',
          role: profile?.role ?? 'secouriste',
          citizen_id: session?.user?.id,
          started_at: new Date().toISOString(),
        })
        .select('id, channel_name')
        .single();

      if (error) {
        console.error('[Call] ❌ Erreur INSERT:', error.message);
        Alert.alert('Erreur', "Impossible de joindre la centrale. Réessayez.");
        setCallState('selection');
        return;
      }

      const row = data as { id: string; channel_name: string | null };
      const resolvedChannel = row.channel_name ?? chName;
      setCurrentCallId(row.id);

      try {
        await joinAgoraChannel({
          channelId: resolvedChannel,
          isVideo: type === 'video',
        });
      } catch (agoraErr) {
        console.error('[Call] ❌ Agora:', agoraErr);
        Alert.alert(
          'Connexion média',
          agoraErr instanceof Error ? agoraErr.message : 'Impossible de rejoindre le canal audio/vidéo.'
        );
        await supabase
          .from('call_history')
          .update({
            status: 'failed',
            ended_at: new Date().toISOString(),
            ended_by: 'rescuer',
          })
          .eq('id', row.id);
        leaveAgoraChannel();
        setCallState('selection');
        setCurrentCallId(null);
      }
    } catch (err) {
      console.error('[Call] ❌ Exception:', err);
      Alert.alert('Erreur', 'Erreur réseau. Vérifiez votre connexion.');
      setCallState('selection');
      leaveAgoraChannel();
    }
  };

  const callGSM = () => {
    Linking.openURL('tel:+243000000000').catch(() => {
      Alert.alert('Erreur', 'Impossible de passer un appel téléphonique.');
    });
  };

  const formatTime = (seconds: number) => {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  };

  useEffect(() => {
    setLocalAudioMuted(isMuted);
  }, [isMuted]);

  useEffect(() => {
    if (callType === 'video') {
      setLocalVideoMuted(isVideoOff);
    }
  }, [isVideoOff, callType]);

  useEffect(() => {
    setSpeakerphoneOn(isSpeakerOn);
  }, [isSpeakerOn]);

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <StatusBar barStyle="light-content" />

      {callState === 'selection' && (
        <View style={{ flex: 1 }}>
          <View style={styles.topHeader}>
            <View style={styles.headerRow}>
              <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
                <MaterialIcons name="arrow-back" color="#FFF" size={24} />
              </TouchableOpacity>
              <View>
                <Text style={styles.greetingText}>Régulation</Text>
                <Text style={styles.hospitalName}>La Centrale</Text>
              </View>
              <View style={{ width: 44 }} />
            </View>
          </View>

          <View style={styles.profileTop}>
            <View style={styles.avatarLarge}>
              <Text style={styles.avatarInitials}>C</Text>
              <View style={styles.onlineBadge} />
            </View>
            <Text style={styles.profileName}>La Centrale (SAMU)</Text>
            <Text style={styles.profileStatus}>Prêt pour réception</Text>

            <View style={styles.callGridRow}>
              <TouchableOpacity style={styles.miniCallCard} onPress={() => void initiateCall('audio')}>
                <View style={[styles.miniCallIconBox, { backgroundColor: colors.success + '15' }]}>
                  <MaterialIcons name="phone" color={colors.success} size={24} />
                </View>
                <Text style={styles.miniCallLabel}>Audio</Text>
              </TouchableOpacity>

              <TouchableOpacity style={styles.miniCallCard} onPress={() => void initiateCall('video')}>
                <View style={[styles.miniCallIconBox, { backgroundColor: colors.secondary + '15' }]}>
                  <MaterialIcons name="videocam" color={colors.secondary} size={24} />
                </View>
                <Text style={styles.miniCallLabel}>Vidéo</Text>
              </TouchableOpacity>

              <TouchableOpacity style={styles.miniCallCard} onPress={callGSM}>
                <View style={[styles.miniCallIconBox, { backgroundColor: '#FF980015' }]}>
                  <MaterialIcons name="sim-card" color="#FF9800" size={24} />
                </View>
                <Text style={styles.miniCallLabel}>GSM</Text>
                <Text style={styles.miniCallSub}>Airtime</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      )}

      {(callState === 'calling' || callState === 'active') && (
        <View style={styles.callBackground}>
          <View style={styles.callHeader}>
            <Text style={styles.encryptText}>Système de cryptage tactique actif</Text>

            {callType === 'audio' && (
              <View style={styles.audioCallerInfo}>
                <View style={styles.audioAvatar}>
                  <Text style={styles.audioAvatarText}>C</Text>
                </View>
                <Text style={styles.callerNameTitle}>La Centrale</Text>
                <Text style={styles.timerText}>
                  {callState === 'calling' ? 'Connexion…' : formatTime(callDuration)}
                </Text>
              </View>
            )}
          </View>

          {callType === 'video' && (
            <View style={styles.videoStage}>
              {remoteUid != null ? (
                <RtcSurfaceView
                  style={styles.remoteVideo}
                  canvas={{
                    uid: remoteUid,
                    renderMode: RenderModeType.RenderModeHidden,
                  }}
                />
              ) : (
                <View style={styles.remotePlaceholder}>
                  <Text style={styles.placeholderText}>En attente de la centrale…</Text>
                </View>
              )}

              {(callState === 'calling' || callState === 'active') && !isVideoOff && (
                <View style={styles.pipWindow}>
                  <RtcSurfaceView
                    style={styles.localVideo}
                    canvas={{
                      uid: 0,
                      sourceType: VideoSourceType.VideoSourceCamera,
                      renderMode: RenderModeType.RenderModeHidden,
                    }}
                  />
                </View>
              )}

              {isVideoOff && (
                <View style={styles.videoOffOverlay}>
                  <Text style={styles.placeholderText}>Caméra désactivée</Text>
                </View>
              )}
            </View>
          )}

          <View style={styles.bottomControls}>
            <View style={styles.controlsRow}>
              <TouchableOpacity
                style={styles.controlCircle}
                onPress={() => setIsSpeakerOn((v) => !v)}
              >
                <MaterialIcons name={isSpeakerOn ? 'volume-up' : 'volume-off'} color="#FFF" size={28} />
              </TouchableOpacity>

              {callType === 'video' && (
                <TouchableOpacity
                  style={[styles.controlCircle, isVideoOff && { backgroundColor: '#FFF' }]}
                  onPress={() => setIsVideoOff((v) => !v)}
                >
                  <MaterialIcons
                    name={isVideoOff ? 'videocam-off' : 'videocam'}
                    color={isVideoOff ? '#000' : '#FFF'}
                    size={28}
                  />
                </TouchableOpacity>
              )}

              <TouchableOpacity
                style={[styles.controlCircle, isMuted && { backgroundColor: '#FFF' }]}
                onPress={() => setIsMuted((v) => !v)}
              >
                <MaterialIcons name={isMuted ? 'mic-off' : 'mic'} color={isMuted ? '#000' : '#FFF'} size={28} />
              </TouchableOpacity>

              <TouchableOpacity style={styles.endCallCircle} onPress={() => void endCallLocal()}>
                <MaterialIcons name="call-end" color="#FFFFFF" size={32} />
              </TouchableOpacity>
            </View>
          </View>
        </View>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.mainBackground },
  topHeader: {
    paddingHorizontal: 24,
    paddingTop: 16,
    paddingBottom: 24,
    borderBottomLeftRadius: 36,
    borderBottomRightRadius: 36,
    backgroundColor: '#0A0A0A',
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  backBtn: {
    width: 44,
    height: 44,
    borderRadius: 16,
    backgroundColor: '#1A1A1A',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
  },
  greetingText: {
    color: 'rgba(255,255,255,0.4)',
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 1.5,
  },
  hospitalName: {
    color: '#FFF',
    fontSize: 24,
    fontWeight: '700',
    marginTop: 4,
  },

  profileTop: { alignItems: 'center', marginTop: 40, paddingHorizontal: 24 },
  avatarLarge: {
    width: 120,
    height: 120,
    borderRadius: 44,
    backgroundColor: '#1A1A1A',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 20,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
  },
  avatarInitials: { fontSize: 44, color: colors.secondary, fontWeight: '800' },
  onlineBadge: {
    position: 'absolute',
    bottom: -4,
    right: -4,
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: colors.success,
    borderWidth: 4,
    borderColor: colors.mainBackground,
  },
  profileName: { fontSize: 22, fontWeight: '900', color: '#FFF', marginBottom: 6 },
  profileStatus: { fontSize: 13, color: colors.success, fontWeight: '800', letterSpacing: 1.5 },

  callGridRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    width: '100%',
    marginTop: 40,
    gap: 12,
  },
  miniCallCard: {
    flex: 1,
    backgroundColor: '#161616',
    borderRadius: 24,
    paddingVertical: 20,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.05)',
  },
  miniCallIconBox: {
    width: 48,
    height: 48,
    borderRadius: 16,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 10,
  },
  miniCallLabel: {
    color: '#FFF',
    fontSize: 12,
    fontWeight: '800',
  },
  miniCallSub: {
    color: 'rgba(255,255,255,0.3)',
    fontSize: 8,
    fontWeight: '900',
    marginTop: 2,
    textTransform: 'uppercase',
  },

  callBackground: { flex: 1, backgroundColor: '#0A0A0A', justifyContent: 'space-between' },
  callHeader: { paddingTop: 40, paddingHorizontal: 20, alignItems: 'center' },
  encryptText: {
    color: 'rgba(255,255,255,0.3)',
    fontSize: 10,
    fontWeight: '900',
    letterSpacing: 1.5,
  },
  audioCallerInfo: { alignItems: 'center', marginTop: 60 },
  audioAvatar: {
    width: 160,
    height: 160,
    borderRadius: 60,
    backgroundColor: '#1A1A1A',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 30,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.05)',
  },
  audioAvatarText: { fontSize: 60, color: colors.secondary, fontWeight: '800' },
  callerNameTitle: { fontSize: 32, color: '#FFF', fontWeight: '900', marginBottom: 12 },
  timerText: { fontSize: 18, color: 'rgba(255,255,255,0.4)', fontWeight: '700' },

  videoStage: {
    flex: 1,
    marginTop: 8,
    backgroundColor: '#050505',
    position: 'relative',
  },
  remoteVideo: { flex: 1, width: '100%' },
  remotePlaceholder: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  placeholderText: { color: 'rgba(255,255,255,0.6)', fontSize: 16 },
  localVideo: { width: '100%', height: '100%' },
  pipWindow: {
    position: 'absolute',
    top: 16,
    right: 16,
    width: 112,
    height: 168,
    borderRadius: 16,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.25)',
    backgroundColor: '#111',
  },
  videoOffOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.65)',
    justifyContent: 'center',
    alignItems: 'center',
  },

  bottomControls: { paddingBottom: 60, paddingTop: 30, backgroundColor: 'transparent' },
  controlsRow: {
    flexDirection: 'row',
    justifyContent: 'space-evenly',
    alignItems: 'center',
    paddingHorizontal: 20,
  },
  controlCircle: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: 'rgba(255,255,255,0.1)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  endCallCircle: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: colors.primary,
    justifyContent: 'center',
    alignItems: 'center',
  },
});
