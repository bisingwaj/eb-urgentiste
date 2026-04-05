import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  StatusBar,
  Alert,
  ActivityIndicator,
} from 'react-native';
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
  setVideoPublishingEnabled,
} from '../../services/agoraRtc';

type CallState = 'connecting' | 'calling' | 'active';
type CallType = 'audio' | 'video';

function buildChannelName(): string {
  return `OP-${Date.now()}`;
}

export function CallCenterScreen({ navigation }: { navigation: { goBack: () => void } }) {
  const { profile, session } = useAuth();

  const [callState, setCallState] = useState<CallState>('connecting');
  const [callType, setCallType] = useState<CallType>('audio');
  const [currentCallId, setCurrentCallId] = useState<string | null>(null);
  const [mediaReady, setMediaReady] = useState(false);

  const [isMuted, setIsMuted] = useState(false);
  const [isLocalCameraOff, setIsLocalCameraOff] = useState(false);
  const [isSpeakerOn, setIsSpeakerOn] = useState(false);
  const [callDuration, setCallDuration] = useState(0);
  const [remoteUid, setRemoteUid] = useState<number | null>(null);

  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const subscriptionRef = useRef<ReturnType<typeof supabase.channel> | null>(null);
  const autoStartRef = useRef(false);

  const cleanupSubscription = useCallback(() => {
    if (subscriptionRef.current) {
      supabase.removeChannel(subscriptionRef.current);
      subscriptionRef.current = null;
    }
  }, []);

  useEffect(() => {
    if (callState !== 'calling' || !currentCallId) {
      return;
    }

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
    setMediaReady(false);
    leaveAgoraChannel();
    setCallState('connecting');
    setCurrentCallId(null);
    setCallDuration(0);
    setRemoteUid(null);
    setIsMuted(false);
    setIsLocalCameraOff(false);
    setCallType('audio');
    navigation.goBack();
  }, [cleanupSubscription, navigation]);

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

  const endCallRemotely = useCallback(async () => {
    leaveAgoraChannel();
    cleanupAndGoBack();
  }, [cleanupAndGoBack]);

  endCallRemotelyRef.current = endCallRemotely;

  useEffect(() => {
    setAgoraRtcCallbacks({
      onJoinChannelSuccess: () => {
        setMediaReady(true);
      },
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

  const initiateCall = async (type: CallType) => {
    const chName = buildChannelName();
    try {
      setCallType(type);
      if (type === 'audio') {
        setIsLocalCameraOff(true);
      }
      setCallState('calling');

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
        setCallState('connecting');
        navigation.goBack();
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
        setCallState('connecting');
        setCurrentCallId(null);
        navigation.goBack();
      }
    } catch (err) {
      console.error('[Call] ❌ Exception:', err);
      Alert.alert('Erreur', 'Erreur réseau. Vérifiez votre connexion.');
      setCallState('connecting');
      leaveAgoraChannel();
      navigation.goBack();
    }
  };

  useEffect(() => {
    if (autoStartRef.current) {
      return;
    }
    autoStartRef.current = true;
    void initiateCall('audio');
    // eslint-disable-next-line react-hooks/exhaustive-deps -- démarrage unique à l’entrée écran
  }, []);

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
      setLocalVideoMuted(isLocalCameraOff);
    }
  }, [isLocalCameraOff, callType]);

  useEffect(() => {
    setSpeakerphoneOn(isSpeakerOn);
  }, [isSpeakerOn]);

  const toggleVideoMode = useCallback(async () => {
    if (!mediaReady) {
      return;
    }
    const next = callType !== 'video';
    try {
      await setVideoPublishingEnabled(next);
      setCallType(next ? 'video' : 'audio');
      if (next) {
        setIsLocalCameraOff(false);
        setIsSpeakerOn(true);
        setSpeakerphoneOn(true);
        if (currentCallId) {
          void supabase.from('call_history').update({ has_video: true }).eq('id', currentCallId);
        }
      } else {
        setIsLocalCameraOff(false);
      }
    } catch (e) {
      console.error('[Call] toggle video:', e);
      Alert.alert('Vidéo', e instanceof Error ? e.message : 'Impossible d’activer la vidéo.');
    }
  }, [mediaReady, callType, currentCallId]);

  const headerStatus = () => {
    if (callState === 'connecting') {
      return { dot: '#888', text: 'Connexion…' };
    }
    if (callState === 'calling') {
      return { dot: '#FF9800', text: 'Sonnerie…' };
    }
    return { dot: colors.success, text: 'En ligne' };
  };

  const centerTitle = () => {
    if (callState === 'connecting') {
      return 'Connexion…';
    }
    if (callState === 'calling') {
      return 'Appel en cours…';
    }
    return 'Appel en cours…';
  };

  const st = headerStatus();

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      <StatusBar barStyle="light-content" backgroundColor="#000" />

      <View style={styles.header}>
        <TouchableOpacity
          style={styles.headerIconBtn}
          onPress={() => void endCallLocal()}
          accessibilityLabel="Raccrocher et fermer"
        >
          <MaterialIcons name="expand-more" size={28} color="#FFF" />
        </TouchableOpacity>

        <View style={styles.headerStatus}>
          <View style={[styles.statusDot, { backgroundColor: st.dot }]} />
          <Text style={styles.headerStatusText}>{st.text}</Text>
        </View>

        <View style={styles.headerIconBtn}>
          <MaterialIcons name="wifi" size={22} color="#FFF" />
        </View>
      </View>

      {callState === 'connecting' && (
        <View style={styles.connectingWrap}>
          <ActivityIndicator size="large" color={colors.primary} />
          <Text style={styles.connectingText}>Préparation de l’appel…</Text>
        </View>
      )}

      {(callState === 'calling' || callState === 'active') && (
        <View style={styles.mainStage}>
          {callType === 'video' ? (
            <View style={styles.videoWrap}>
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

                {!isLocalCameraOff && (
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

                {isLocalCameraOff && (
                  <View style={styles.videoOffOverlay}>
                    <Text style={styles.placeholderText}>Caméra désactivée</Text>
                  </View>
                )}
              </View>
              <View style={styles.videoCenterOverlay} pointerEvents="none">
                <Text style={styles.centerTitle}>{centerTitle()}</Text>
                {callState === 'active' && (
                  <Text style={styles.timerLine}>{formatTime(callDuration)}</Text>
                )}
              </View>
            </View>
          ) : (
            <View style={styles.audioCenter}>
              <View style={styles.bigPhoneRing}>
                <MaterialIcons name="phone" size={56} color="#FF3B3B" />
              </View>
              <Text style={styles.centerTitle}>{centerTitle()}</Text>
              {callState === 'active' && (
                <Text style={styles.timerLine}>{formatTime(callDuration)}</Text>
              )}
            </View>
          )}
        </View>
      )}

      {(callState === 'calling' || callState === 'active') && (
        <View style={styles.bottomDock}>
          <View style={styles.bottomBar}>
            <TouchableOpacity
              style={[styles.roundBtn, !isMuted ? styles.roundBtnLight : styles.roundBtnDark]}
              onPress={() => setIsMuted((v) => !v)}
              disabled={!mediaReady}
            >
              <MaterialIcons name={isMuted ? 'mic-off' : 'mic'} size={26} color={isMuted ? '#FFF' : '#111'} />
            </TouchableOpacity>

            <TouchableOpacity
              style={[
                styles.roundBtn,
                callType === 'video' ? styles.roundBtnLight : styles.roundBtnDim,
              ]}
              onPress={() => void toggleVideoMode()}
              disabled={!mediaReady}
            >
              <MaterialIcons
                name={callType === 'video' ? 'videocam' : 'videocam-off'}
                size={26}
                color="#FFF"
              />
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.roundBtn, isSpeakerOn ? styles.roundBtnLight : styles.roundBtnDark]}
              onPress={() => setIsSpeakerOn((v) => !v)}
              disabled={!mediaReady}
            >
              <MaterialIcons
                name={isSpeakerOn ? 'volume-up' : 'volume-down'}
                size={26}
                color={isSpeakerOn ? '#111' : '#FFF'}
              />
            </TouchableOpacity>

            <TouchableOpacity style={styles.roundBtnEnd} onPress={() => void endCallLocal()}>
              <MaterialIcons name="call-end" size={30} color="#FFF" />
            </TouchableOpacity>
          </View>
        </View>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000000',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 12,
  },
  headerIconBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#1A1A1A',
    justifyContent: 'center',
    alignItems: 'center',
  },
  headerStatus: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  statusDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  headerStatusText: {
    color: '#FFF',
    fontSize: 16,
    fontWeight: '600',
  },
  connectingWrap: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    gap: 16,
  },
  connectingText: {
    color: 'rgba(255,255,255,0.6)',
    fontSize: 15,
  },
  mainStage: {
    flex: 1,
  },
  videoWrap: {
    flex: 1,
    position: 'relative',
  },
  audioCenter: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 24,
  },
  bigPhoneRing: {
    width: 160,
    height: 160,
    borderRadius: 80,
    backgroundColor: '#2A0A0A',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 28,
    borderWidth: 2,
    borderColor: '#5C1515',
  },
  centerTitle: {
    color: '#FFF',
    fontSize: 22,
    fontWeight: '700',
    textAlign: 'center',
  },
  timerLine: {
    marginTop: 12,
    color: 'rgba(255,255,255,0.45)',
    fontSize: 18,
    fontWeight: '600',
    letterSpacing: 1,
  },
  videoStage: {
    flex: 1,
    backgroundColor: '#050505',
    position: 'relative',
  },
  remoteVideo: {
    flex: 1,
    width: '100%',
  },
  remotePlaceholder: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  placeholderText: {
    color: 'rgba(255,255,255,0.55)',
    fontSize: 16,
  },
  localVideo: {
    width: '100%',
    height: '100%',
  },
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
  videoCenterOverlay: {
    position: 'absolute',
    top: 56,
    left: 0,
    right: 0,
    alignItems: 'center',
  },
  bottomDock: {
    paddingHorizontal: 16,
    paddingBottom: 8,
  },
  bottomBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#141414',
    borderRadius: 28,
    paddingVertical: 18,
    paddingHorizontal: 14,
  },
  roundBtn: {
    width: 56,
    height: 56,
    borderRadius: 28,
    justifyContent: 'center',
    alignItems: 'center',
  },
  roundBtnLight: {
    backgroundColor: '#F2F2F2',
  },
  roundBtnDark: {
    backgroundColor: '#3A3A3A',
  },
  roundBtnDim: {
    backgroundColor: '#3A3A3A',
  },
  roundBtnEnd: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: '#E53935',
    justifyContent: 'center',
    alignItems: 'center',
  },
});
