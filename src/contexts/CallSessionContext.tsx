import React, { createContext, useContext, useMemo, useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { leaveAgoraChannel } from '../services/agoraRtc';
import { endSipCall } from '../lib/sipCall';

export type MinimizedCallSnapshot = {
  callId: string;
  callType: 'audio' | 'video';
  provider: 'agora' | 'pbx';
  phoneNumber?: string;
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

  useEffect(() => {
    if (!minimized?.callId) return;

    const currentId = minimized.callId;
    const channel = supabase
      .channel(`call-sync-${currentId}`)
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'call_history',
          filter: `id=eq.${currentId}`,
        },
        (payload) => {
          const status = payload.new?.status as string | undefined;
          if (status && ['completed', 'failed', 'missed'].includes(status)) {
            // Call ended remotely while minimized
            if (minimized?.provider === 'pbx') {
              void endSipCall();
            } else {
              leaveAgoraChannel();
            }
            setMinimized(null);
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [minimized?.callId]);

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

