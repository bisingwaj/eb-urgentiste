import { PermissionsAndroid, Platform } from 'react-native';
import {
  ChannelMediaOptions,
  ChannelProfileType,
  ClientRoleType,
  createAgoraRtcEngine,
  ErrorCodeType,
  IRtcEngine,
  IRtcEngineEventHandler,
  RtcConnection,
  RtcEngineContext,
  UserOfflineReasonType,
} from 'react-native-agora';

import { fetchAgoraToken, getAgoraAppIdFromEnv } from '../lib/agoraToken';

export type AgoraRtcCallbacks = {
  onRemoteUserJoined?: (uid: number) => void;
  onRemoteUserOffline?: (uid: number, reason: UserOfflineReasonType) => void;
  onJoinChannelSuccess?: () => void;
  onError?: (code: ErrorCodeType, msg: string) => void;
};

const callbackRef: { current: AgoraRtcCallbacks } = { current: {} };

let engine: IRtcEngine | null = null;
let initialized = false;
let inChannel = false;

function getEngine(): IRtcEngine {
  if (!engine) {
    engine = createAgoraRtcEngine();
  }
  return engine;
}

const eventHandler: IRtcEngineEventHandler = {
  onJoinChannelSuccess(_connection: RtcConnection, _elapsed: number) {
    inChannel = true;
    callbackRef.current.onJoinChannelSuccess?.();
  },
  onUserJoined(_connection: RtcConnection, remoteUid: number, _elapsed: number) {
    callbackRef.current.onRemoteUserJoined?.(remoteUid);
  },
  onUserOffline(
    _connection: RtcConnection,
    remoteUid: number,
    reason: UserOfflineReasonType
  ) {
    callbackRef.current.onRemoteUserOffline?.(remoteUid, reason);
  },
  onError(err: ErrorCodeType, msg: string) {
    console.error('[Agora] onError', err, msg);
    callbackRef.current.onError?.(err, msg);
  },
};

function ensureEngineInitialized(appId: string): IRtcEngine {
  const eng = getEngine();
  if (!initialized) {
    eng.registerEventHandler(eventHandler);
    const ctx = new RtcEngineContext();
    ctx.appId = appId;
    const ret = eng.initialize(ctx);
    if (ret !== 0) {
      console.warn('[Agora] initialize ret non nul:', ret);
    }
    eng.setDefaultAudioRouteToSpeakerphone(true);
    initialized = true;
  }
  return eng;
}

export async function ensureCallPermissions(includeCamera: boolean): Promise<void> {
  if (Platform.OS !== 'android') {
    return;
  }
  const audio = PermissionsAndroid.PERMISSIONS.RECORD_AUDIO;
  const camera = PermissionsAndroid.PERMISSIONS.CAMERA;
  const toRequest = includeCamera ? [audio, camera] : [audio];
  const result = await PermissionsAndroid.requestMultiple(toRequest);
  for (const p of toRequest) {
    if (result[p] !== PermissionsAndroid.RESULTS.GRANTED) {
      throw new Error('Permissions microphone/caméra refusées');
    }
  }
}

export function setAgoraRtcCallbacks(cb: AgoraRtcCallbacks): void {
  callbackRef.current = cb;
}

/**
 * Rejoint le canal Agora avec token serveur (communication 1:1 / N:N).
 */
export async function joinAgoraChannel(params: {
  channelId: string;
  isVideo: boolean;
  appIdOverride?: string;
}): Promise<void> {
  const { channelId, isVideo, appIdOverride } = params;
  await ensureCallPermissions(isVideo);

  const { token, appId: tokenAppId } = await fetchAgoraToken({
    channelName: channelId,
    uid: 0,
    role: 'publisher',
  });

  const appId = appIdOverride?.trim() || tokenAppId?.trim() || getAgoraAppIdFromEnv();
  const eng = ensureEngineInitialized(appId);

  if (inChannel) {
    eng.leaveChannel();
    inChannel = false;
  }

  eng.enableAudio();

  if (isVideo) {
    eng.enableVideo();
    eng.startPreview();
  } else {
    eng.disableVideo();
    eng.stopPreview();
  }

  const options = new ChannelMediaOptions();
  options.channelProfile = ChannelProfileType.ChannelProfileCommunication;
  options.clientRoleType = ClientRoleType.ClientRoleBroadcaster;
  options.publishMicrophoneTrack = true;
  options.publishCameraTrack = isVideo;
  options.autoSubscribeAudio = true;
  options.autoSubscribeVideo = isVideo;

  const code = eng.joinChannel(token, channelId, 0, options);
  if (code !== 0) {
    throw new Error(`joinChannel a échoué (code ${code})`);
  }
}

export function leaveAgoraChannel(): void {
  if (!engine) {
    return;
  }
  engine.stopPreview();
  engine.leaveChannel();
  inChannel = false;
}

export function setLocalAudioMuted(muted: boolean): void {
  engine?.muteLocalAudioStream(muted);
}

export function setLocalVideoMuted(muted: boolean): void {
  engine?.muteLocalVideoStream(muted);
}

export function setSpeakerphoneOn(on: boolean): void {
  engine?.setEnableSpeakerphone(on);
}

/** Active ou désactive la caméra pendant un appel (après join en audio). */
export async function setVideoPublishingEnabled(enabled: boolean): Promise<void> {
  const eng = getEngine();
  if (!eng || !inChannel) {
    return;
  }
  if (enabled) {
    await ensureCallPermissions(true);
    eng.enableVideo();
    eng.startPreview();
    eng.muteLocalVideoStream(false);
    const options = new ChannelMediaOptions();
    options.publishCameraTrack = true;
    options.autoSubscribeVideo = true;
    eng.updateChannelMediaOptions(options);
  } else {
    eng.muteLocalVideoStream(true);
    eng.stopPreview();
    eng.disableVideo();
    const options = new ChannelMediaOptions();
    options.publishCameraTrack = false;
    eng.updateChannelMediaOptions(options);
  }
}

export function getAgoraEngine(): IRtcEngine | null {
  return engine;
}
