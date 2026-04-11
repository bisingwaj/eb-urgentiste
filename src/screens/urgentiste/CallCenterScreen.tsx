import React, { useState, useEffect, useRef, useCallback, useLayoutEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  StatusBar,
  Alert,
  ActivityIndicator,
  PanResponder,
  Dimensions,
  BackHandler,
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { MaterialIcons } from '@expo/vector-icons';
import { useRoute } from '@react-navigation/native';
import {
  RtcSurfaceView,
  RenderModeType,
  VideoSourceType,
} from 'react-native-agora';

import { colors } from '../../theme/colors';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';
import { useCallSession } from '../../contexts/CallSessionContext';
import { buildInternalChannelName } from '../../lib/callChannel';
import type { CallCenterRouteParams } from '../../navigation/navigationRef';
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

const { width: SCREEN_W, height: SCREEN_H } = Dimensions.get('window');
const PIP_W = 120;
const PIP_H = 180;

export function CallCenterScreen({ navigation }: { navigation: { goBack: () => void; setParams?: (p: object) => void } }) {
  const { profile, session } = useAuth();
  const { minimized: minimizedSnapshot, setMinimized } = useCallSession();
  const route = useRoute();
  const routeParams = (route.params ?? {}) as CallCenterRouteParams;

  const [callState, setCallState] = useState<CallState>('connecting');
  const [callType, setCallType] = useState<CallType>('audio');
  const [currentCallId, setCurrentCallId] = useState<string | null>(null);
  const [mediaReady, setMediaReady] = useState(false);
  const [answeredAtIso, setAnsweredAtIso] = useState<string | null>(null);

  const [isMuted, setIsMuted] = useState(false);
  const [isLocalCameraOff, setIsLocalCameraOff] = useState(false);
  const [isSpeakerOn, setIsSpeakerOn] = useState(false);
  const [callDuration, setCallDuration] = useState(0);
  const [remoteUid, setRemoteUid] = useState<number | null>(null);
  const [swapFeeds, setSwapFeeds] = useState(false);
  const [pipOffset, setPipOffset] = useState({ x: 0, y: 0 });

  const subscriptionRef = useRef<ReturnType<typeof supabase.channel> | null>(null);
  const autoStartRef = useRef(false);
  const incomingJoinCallIdRef = useRef<string | null>(null);
  const activeFallbackStartRef = useRef<number | null>(null);
  const pipDragStart = useRef({ x: 0, y: 0 });
  const skipLeaveChannelRef = useRef(false);
  const resumeAppliedRef = useRef(false);
  const endCallRemotelyRef = useRef<() => Promise<void>>(async () => {});

  const callTypeRef = useRef(callType);
  const mediaReadyRef = useRef(mediaReady);
  useEffect(() => {
    callTypeRef.current = callType;
  }, [callType]);
  useEffect(() => {
    mediaReadyRef.current = mediaReady;
  }, [mediaReady]);

  const cleanupSubscription = useCallback(() => {
    if (subscriptionRef.current) {
      supabase.removeChannel(subscriptionRef.current);
      subscriptionRef.current = null;
    }
  }, []);

  useEffect(() => {
    if (!currentCallId) {
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
        (payload: { new?: Record<string, unknown> }) => {
          const row = payload.new;
          if (!row) {
            return;
          }
          const status = row.status as string | undefined;
          const at = row.answered_at as string | undefined;

          if (status === 'active') {
            setCallState('active');
            if (at) {
              setAnsweredAtIso(at);
            }
          }

          if (row.has_video === true && callTypeRef.current === 'audio' && mediaReadyRef.current) {
            void (async () => {
              try {
                await setVideoPublishingEnabled(true);
                setCallType('video');
                setIsLocalCameraOff(false);
                setIsSpeakerOn(true);
                setSpeakerphoneOn(true);
              } catch (e) {
                console.error('[Call] sync has_video:', e);
              }
            })();
          }

          if (status && ['completed', 'failed', 'missed'].includes(status)) {
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
  }, [currentCallId, cleanupSubscription]);

  useEffect(() => {
    if (callState === 'active' && !answeredAtIso) {
      activeFallbackStartRef.current = Date.now();
    } else if (callState !== 'active') {
      activeFallbackStartRef.current = null;
    }
  }, [callState, answeredAtIso]);

  useEffect(() => {
    if (callState !== 'active') {
      setCallDuration(0);
      return;
    }
    const tick = () => {
      if (answeredAtIso) {
        const secs = Math.floor((Date.now() - new Date(answeredAtIso).getTime()) / 1000);
        setCallDuration(Math.max(0, secs));
      } else if (activeFallbackStartRef.current) {
        const secs = Math.floor((Date.now() - activeFallbackStartRef.current) / 1000);
        setCallDuration(Math.max(0, secs));
      }
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [callState, answeredAtIso]);

  useEffect(() => {
    if (callState === 'active' && callType === 'video') {
      setIsSpeakerOn(true);
      setSpeakerphoneOn(true);
    }
  }, [callState, callType]);

  const cleanupAndGoBack = useCallback(() => {
    setMinimized(null);
    cleanupSubscription();
    setAgoraRtcCallbacks({});
    setMediaReady(false);
    leaveAgoraChannel();
    setCallState('connecting');
    setCurrentCallId(null);
    setAnsweredAtIso(null);
    setCallDuration(0);
    setRemoteUid(null);
    setIsMuted(false);
    setIsLocalCameraOff(false);
    setCallType('audio');
    setSwapFeeds(false);
    setPipOffset({ x: 0, y: 0 });
    incomingJoinCallIdRef.current = null;
    navigation.goBack();
  }, [cleanupSubscription, navigation, setMinimized]);

  const endCallLocal = useCallback(async () => {
    let durationSec = callDuration;
    if (answeredAtIso) {
      durationSec = Math.max(
        0,
        Math.floor((Date.now() - new Date(answeredAtIso).getTime()) / 1000)
      );
    }
    try {
      leaveAgoraChannel();
      if (currentCallId) {
        await supabase
          .from('call_history')
          .update({
            status: 'completed',
            ended_by: 'rescuer',
            ended_at: new Date().toISOString(),
            duration_seconds: durationSec,
          })
          .eq('id', currentCallId);
      }
    } catch (e) {
      console.error('[Call] Erreur endCall:', e);
    }
    cleanupAndGoBack();
  }, [currentCallId, callDuration, answeredAtIso, cleanupAndGoBack]);

  const endCallRemotely = useCallback(async () => {
    leaveAgoraChannel();
    cleanupAndGoBack();
  }, [cleanupAndGoBack]);

  endCallRemotelyRef.current = endCallRemotely;

  const minimizeCall = useCallback(() => {
    if (!currentCallId) {
      navigation.goBack();
      return;
    }
    setMinimized({
      callId: currentCallId,
      callType,
      answeredAtIso,
      callState,
      isMuted,
      isLocalCameraOff,
      isSpeakerOn,
      swapFeeds,
      pipOffset,
      remoteUid,
      mediaReady,
    });
    skipLeaveChannelRef.current = true;
    navigation.goBack();
  }, [
    currentCallId,
    callType,
    answeredAtIso,
    callState,
    isMuted,
    isLocalCameraOff,
    isSpeakerOn,
    swapFeeds,
    pipOffset,
    remoteUid,
    mediaReady,
    setMinimized,
    navigation,
  ]);

  useLayoutEffect(() => {
    if (!routeParams.resume || resumeAppliedRef.current) {
      return;
    }
    const snap = minimizedSnapshot;
    if (!snap) {
      navigation.setParams?.({ resume: undefined } as never);
      return;
    }
    resumeAppliedRef.current = true;
    setMinimized(null);
    setCurrentCallId(snap.callId);
    setCallType(snap.callType);
    setAnsweredAtIso(snap.answeredAtIso);
    setCallState(snap.callState);
    setIsMuted(snap.isMuted);
    setIsLocalCameraOff(snap.isLocalCameraOff);
    setIsSpeakerOn(snap.isSpeakerOn);
    setSwapFeeds(snap.swapFeeds);
    setPipOffset(snap.pipOffset);
    setRemoteUid(snap.remoteUid);
    setMediaReady(snap.mediaReady);
    navigation.setParams?.({ resume: undefined } as never);
    void supabase
      .from('call_history')
      .select('status')
      .eq('id', snap.callId)
      .maybeSingle()
      .then(({ data }) => {
        const st = data?.status as string | undefined;
        if (st && ['completed', 'failed', 'missed'].includes(st)) {
          Alert.alert('Appel terminé', "L'appel n'est plus actif.");
          void endCallRemotelyRef.current();
        }
      });
  }, [routeParams.resume, minimizedSnapshot, navigation, setMinimized]);

  useEffect(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      minimizeCall();
      return true;
    });
    return () => sub.remove();
  }, [minimizeCall]);

  useEffect(() => {
    return () => {
      if (skipLeaveChannelRef.current) {
        skipLeaveChannelRef.current = false;
        return;
      }
      leaveAgoraChannel();
    };
  }, []);

  useEffect(() => {
    setAgoraRtcCallbacks({
      onJoinChannelSuccess: () => {
        setMediaReady(true);
        const incId = incomingJoinCallIdRef.current;
        if (incId) {
          incomingJoinCallIdRef.current = null;
          void (async () => {
            const now = new Date().toISOString();
            const { error } = await supabase
              .from('call_history')
              .update({
                status: 'active',
                answered_at: now,
              })
              .eq('id', incId);
            if (error) {
              console.error('[Call] UPDATE incoming:', error.message);
            }
            setAnsweredAtIso(now);
            setCallState('active');
          })();
        }
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
    const uid = session?.user?.id;
    if (!uid) {
      Alert.alert('Erreur', 'Session invalide.');
      navigation.goBack();
      return;
    }
    const chName = buildInternalChannelName(uid);
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
          citizen_id: uid,
          started_at: new Date().toISOString(),
        })
        .select('id, channel_name')
        .single();

      if (error) {
        console.error('[Call] ❌ Erreur INSERT:', error.message);
        Alert.alert('Erreur', "Impossible de joindre la centrale. réessayez.");
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

  const joinIncomingCall = async (
    callId: string,
    channelName: string,
    isVideo: boolean,
    prefetched?: { token?: string; appId?: string; uid?: number }
  ) => {
    incomingJoinCallIdRef.current = callId;
    setCurrentCallId(callId);
    setCallType(isVideo ? 'video' : 'audio');
    if (!isVideo) {
      setIsLocalCameraOff(true);
    }
    setCallState('calling');
    try {
      await joinAgoraChannel({
        channelId: channelName,
        isVideo,
        appIdOverride: prefetched?.appId,
        rtcToken: prefetched?.token,
        rtcUid: prefetched?.uid,
      });
    } catch (e) {
      console.error('[Call] incoming Agora:', e);
      incomingJoinCallIdRef.current = null;
      Alert.alert('Appel entrant', e instanceof Error ? e.message : 'Connexion impossible.');
      await supabase
        .from('call_history')
        .update({
          status: 'failed',
          ended_at: new Date().toISOString(),
          ended_by: 'rescuer',
        })
        .eq('id', callId);
      leaveAgoraChannel();
      setCallState('connecting');
      setCurrentCallId(null);
      navigation.goBack();
    }
  };

  useEffect(() => {
    if (routeParams.resume) {
      return;
    }

    const incoming =
      routeParams.incoming === true &&
      typeof routeParams.callId === 'string' &&
      typeof routeParams.channelName === 'string';

    if (incoming) {
      const p = routeParams as CallCenterRouteParams;
      const prefetched =
        typeof p.prefetchedToken === 'string' && p.prefetchedToken.length > 0
          ? {
              token: p.prefetchedToken,
              appId: p.prefetchedAppId,
              uid: p.prefetchedRtcUid,
            }
          : undefined;
      void joinIncomingCall(
        routeParams.callId as string,
        routeParams.channelName as string,
        routeParams.hasVideo === true,
        prefetched
      );
      return;
    }

    if (autoStartRef.current) {
      return;
    }
    autoStartRef.current = true;
    void initiateCall('audio');
    // eslint-disable-next-line react-hooks/exhaustive-deps -- entrée écran : entrant vs sortant
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

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onPanResponderGrant: () => {
        pipDragStart.current = { ...pipOffset };
      },
      onPanResponderMove: (_, g) => {
        const nx = pipDragStart.current.x + g.dx;
        const ny = pipDragStart.current.y + g.dy;
        const margin = 16;
        const maxX = SCREEN_W - PIP_W - margin * 2;
        const maxY = SCREEN_H - PIP_H - 220;
        setPipOffset({
          x: Math.max(-maxX, Math.min(maxX, nx)),
          y: Math.max(-maxY, Math.min(maxY, ny)),
        });
      },
    })
  ).current;

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

  const renderLocalPip = () => {
    if (isLocalCameraOff) {
      return null;
    }
    return (
      <View
        style={[
          styles.pipWindow,
          {
            transform: [{ translateX: pipOffset.x }, { translateY: pipOffset.y }],
          },
        ]}
        {...panResponder.panHandlers}
      >
        <RtcSurfaceView
          style={styles.localVideo}
          canvas={{
            uid: 0,
            sourceType: VideoSourceType.VideoSourceCamera,
            renderMode: RenderModeType.RenderModeHidden,
          }}
        />
      </View>
    );
  };

  const renderRemoteMain = () => {
    if (remoteUid == null) {
      return (
        <View style={styles.remotePlaceholder}>
          <Text style={styles.placeholderText}>En attente de la centrale…</Text>
        </View>
      );
    }
    return (
      <RtcSurfaceView
        style={styles.remoteVideo}
        canvas={{
          uid: remoteUid,
          renderMode: RenderModeType.RenderModeHidden,
        }}
      />
    );
  };

  const renderRemotePip = () => {
    if (remoteUid == null) {
      return null;
    }
    return (
      <View
        style={[
          styles.pipWindow,
          {
            transform: [{ translateX: pipOffset.x }, { translateY: pipOffset.y }],
          },
        ]}
        {...panResponder.panHandlers}
      >
        <RtcSurfaceView
          style={styles.localVideo}
          canvas={{
            uid: remoteUid,
            renderMode: RenderModeType.RenderModeHidden,
          }}
        />
      </View>
    );
  };

  const renderLocalMain = () => {
    if (isLocalCameraOff) {
      return (
        <View style={styles.remotePlaceholder}>
          <Text style={styles.placeholderText}>Caméra désactivée</Text>
        </View>
      );
    }
    return (
      <RtcSurfaceView
        style={styles.remoteVideo}
        canvas={{
          uid: 0,
          sourceType: VideoSourceType.VideoSourceCamera,
          renderMode: RenderModeType.RenderModeHidden,
        }}
      />
    );
  };

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      <StatusBar barStyle="light-content" backgroundColor="#000" />

      <View style={styles.header}>
        <TouchableOpacity
          style={styles.headerIconBtn}
          onPress={minimizeCall}
          accessibilityLabel="Réduire l’appel sans raccrocher"
        >
          <MaterialIcons name="keyboard-arrow-down" size={28} color="#FFF" />
        </TouchableOpacity>

        <View style={styles.headerCenter}>
          <Text style={styles.headerBrand}>Centrale</Text>
          <View style={styles.headerStatus}>
            <View style={[styles.statusDot, { backgroundColor: st.dot }]} />
            <Text style={styles.headerStatusText}>{st.text}</Text>
          </View>
        </View>

        <View style={styles.headerIconBtnMuted}>
          <MaterialIcons
            name={callType === 'video' ? 'videocam' : 'call'}
            size={22}
            color="rgba(255,255,255,0.35)"
          />
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
              <View style={styles.videoStageOuter}>
              <View style={styles.videoStage}>
                {!swapFeeds ? (
                  <>
                    {renderRemoteMain()}
                    {renderLocalPip()}
                  </>
                ) : (
                  <>
                    {renderLocalMain()}
                    {renderRemotePip()}
                  </>
                )}

                {isLocalCameraOff && !swapFeeds && (
                  <View style={styles.videoOffOverlay}>
                    <Text style={styles.placeholderText}>Caméra désactivée</Text>
                  </View>
                )}

                <TouchableOpacity
                  style={styles.swapFab}
                  onPress={() => setSwapFeeds((v) => !v)}
                  accessibilityLabel="Inverser les vues"
                >
                  <MaterialIcons name="swap-horiz" size={24} color="#FFF" />
                </TouchableOpacity>
              </View>
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
    backgroundColor: '#030303',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: 'rgba(255,255,255,0.08)',
    backgroundColor: 'rgba(8,8,8,0.98)',
  },
  headerCenter: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 8,
  },
  headerBrand: {
    color: '#FFF',
    fontSize: 17,
    fontWeight: '800',
    letterSpacing: 0.3,
  },
  headerIconBtn: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: 'rgba(255,255,255,0.1)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  headerIconBtnMuted: {
    width: 48,
    height: 48,
    borderRadius: 24,
    justifyContent: 'center',
    alignItems: 'center',
  },
  headerStatus: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 4,
  },
  statusDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  headerStatusText: {
    color: 'rgba(255,255,255,0.72)',
    fontSize: 13,
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
    paddingHorizontal: 12,
    paddingTop: 8,
  },
  videoStageOuter: {
    flex: 1,
    borderRadius: 20,
    overflow: 'hidden',
    backgroundColor: '#0a0a0a',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 8 },
        shadowOpacity: 0.45,
        shadowRadius: 16,
      },
      android: { elevation: 12 },
    }),
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
    backgroundColor: '#080808',
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
    top: 14,
    right: 14,
    width: PIP_W,
    height: PIP_H,
    borderRadius: 18,
    overflow: 'hidden',
    borderWidth: 2,
    borderColor: 'rgba(255,255,255,0.45)',
    backgroundColor: '#111',
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.5,
        shadowRadius: 8,
      },
      android: { elevation: 10 },
    }),
  },
  swapFab: {
    position: 'absolute',
    bottom: 20,
    right: 20,
    width: 50,
    height: 50,
    borderRadius: 25,
    backgroundColor: 'rgba(0,0,0,0.65)',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.28)',
  },
  videoOffOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.65)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  videoCenterOverlay: {
    position: 'absolute',
    top: 20,
    left: 12,
    right: 12,
    alignItems: 'center',
  },
  bottomDock: {
    paddingHorizontal: 14,
    paddingBottom: 10,
    paddingTop: 4,
  },
  bottomBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: 'rgba(22,22,22,0.98)',
    borderRadius: 32,
    paddingVertical: 20,
    paddingHorizontal: 16,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.06)',
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
