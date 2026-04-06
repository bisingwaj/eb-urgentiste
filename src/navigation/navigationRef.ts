import { createNavigationContainerRef, type ParamListBase } from '@react-navigation/native';

export type CallCenterRouteParams = {
  incoming?: boolean;
  callId?: string;
  channelName?: string;
  hasVideo?: boolean;
  /** Reprise après réduction (appel toujours actif côté Agora). */
  resume?: boolean;
};

export type RootStackParamList = ParamListBase & {
  CallCenter: CallCenterRouteParams | undefined;
};

export const navigationRef = createNavigationContainerRef<RootStackParamList>();
