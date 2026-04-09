import { createNavigationContainerRef, type ParamListBase } from '@react-navigation/native';

export type CallCenterRouteParams = {
  incoming?: boolean;
  callId?: string;
  channelName?: string;
  hasVideo?: boolean;
  /** Reprise après réduction (appel toujours actif côté Agora). */
  resume?: boolean;
  /** Token RTC déjà fourni par `rescuer-call-citizen` (ne pas rappeler `agora-token`). */
  prefetchedToken?: string;
  prefetchedAppId?: string;
  /** UID Agora côté secouriste si le serveur le fixe (sinon 0). */
  prefetchedRtcUid?: number;
};

export type RootStackParamList = ParamListBase & {
  CallCenter: CallCenterRouteParams | undefined;
};

export const navigationRef = createNavigationContainerRef<RootStackParamList>();
