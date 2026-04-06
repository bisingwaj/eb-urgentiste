import React, { createContext, useContext, useMemo, useState } from 'react';

export type MinimizedCallSnapshot = {
  callId: string;
  callType: 'audio' | 'video';
  answeredAtIso: string | null;
  callState: 'connecting' | 'calling' | 'active';
  isMuted: boolean;
  isLocalCameraOff: boolean;
  isSpeakerOn: boolean;
  swapFeeds: boolean;
  pipOffset: { x: number; y: number };
  remoteUid: number | null;
  mediaReady: boolean;
};

type CallSessionContextValue = {
  minimized: MinimizedCallSnapshot | null;
  setMinimized: (s: MinimizedCallSnapshot | null) => void;
};

const CallSessionContext = createContext<CallSessionContextValue | null>(null);

export function CallSessionProvider({ children }: { children: React.ReactNode }) {
  const [minimized, setMinimized] = useState<MinimizedCallSnapshot | null>(null);

  const value = useMemo(
    () => ({
      minimized,
      setMinimized,
    }),
    [minimized]
  );

  return <CallSessionContext.Provider value={value}>{children}</CallSessionContext.Provider>;
}

export function useCallSession(): CallSessionContextValue {
  const ctx = useContext(CallSessionContext);
  if (!ctx) {
    throw new Error('useCallSession doit être utilisé dans un CallSessionProvider');
  }
  return ctx;
}

