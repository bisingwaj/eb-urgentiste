import React, { useEffect, useRef, useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Modal,
  TouchableOpacity,
  Vibration,
  Platform,
} from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';
import { colors } from '../../theme/colors';
import { navigationRef } from '../../navigation/navigationRef';

type PendingIncoming = {
  id: string;
  channel_name: string | null;
  caller_name: string | null;
  has_video: boolean | null;
};

function isIncomingFromCenter(row: {
  call_type?: string | null;
  status?: string | null;
}): boolean {
  if (row.status !== 'ringing') {
    return false;
  }
  const t = row.call_type ?? '';
  if (t === 'internal') {
    return false;
  }
  return t === 'outgoing' || t === 'incoming';
}

export function IncomingCallSubscriber() {
  const { session, isAuthenticated } = useAuth();
  const [pending, setPending] = useState<PendingIncoming | null>(null);
  const subRef = useRef<ReturnType<typeof supabase.channel> | null>(null);

  const cleanup = useCallback(() => {
    if (subRef.current) {
      supabase.removeChannel(subRef.current);
      subRef.current = null;
    }
  }, []);

  useEffect(() => {
    if (!isAuthenticated || !session?.user?.id) {
      cleanup();
      return;
    }

    const uid = session.user.id;
    cleanup();

    const ch = supabase
      .channel(`incoming-calls-${uid}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'call_history',
          filter: `citizen_id=eq.${uid}`,
        },
        (payload: { new?: Record<string, unknown> }) => {
          const row = payload.new;
          if (!row || typeof row !== 'object') {
            return;
          }
          const typed = row as {
            id?: string;
            channel_name?: string | null;
            caller_name?: string | null;
            has_video?: boolean | null;
            call_type?: string | null;
            status?: string | null;
          };
          if (!typed.id || !isIncomingFromCenter(typed)) {
            return;
          }
          if (Platform.OS === 'android') {
            Vibration.vibrate([0, 400, 200, 400]);
          } else {
            Vibration.vibrate();
          }
          setPending({
            id: typed.id,
            channel_name: typed.channel_name ?? null,
            caller_name: typed.caller_name ?? null,
            has_video: typed.has_video ?? null,
          });
        }
      )
      .subscribe();

    subRef.current = ch;

    return () => {
      cleanup();
    };
  }, [isAuthenticated, session?.user?.id, cleanup]);

  const decline = async () => {
    if (!pending) {
      return;
    }
    const id = pending.id;
    setPending(null);
    try {
      await supabase
        .from('call_history')
        .update({
          status: 'missed',
          ended_at: new Date().toISOString(),
          ended_by: 'rescuer',
        })
        .eq('id', id);
    } catch (e) {
      console.error('[IncomingCall] decline:', e);
    }
  };

  const accept = () => {
    if (!pending) {
      return;
    }
    const { id, channel_name, has_video } = pending;
    if (!channel_name) {
      console.error('[IncomingCall] channel_name manquant');
      setPending(null);
      return;
    }
    setPending(null);
    if (navigationRef.isReady()) {
      navigationRef.navigate('CallCenter', {
        incoming: true,
        callId: id,
        channelName: channel_name,
        hasVideo: !!has_video,
      });
    }
  };

  if (!pending) {
    return null;
  }

  const label = pending.caller_name?.trim() || 'Centrale';

  return (
    <Modal visible animationType="fade" transparent statusBarTranslucent>
      <View style={styles.backdrop}>
        <View style={styles.card}>
          <MaterialIcons name="phone-in-talk" size={48} color={colors.secondary} />
          <Text style={styles.title}>Appel entrant</Text>
          <Text style={styles.subtitle}>{label}</Text>
          <View style={styles.row}>
            <TouchableOpacity style={[styles.btn, styles.btnDecline]} onPress={() => void decline()}>
              <MaterialIcons name="call-end" size={28} color="#FFF" />
              <Text style={styles.btnText}>Refuser</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[styles.btn, styles.btnAccept]} onPress={accept}>
              <MaterialIcons name="call" size={28} color="#FFF" />
              <Text style={styles.btnText}>Accepter</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.92)',
    justifyContent: 'center',
    padding: 24,
  },
  card: {
    backgroundColor: '#141414',
    borderRadius: 24,
    padding: 28,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
  },
  title: {
    color: '#FFF',
    fontSize: 22,
    fontWeight: '700',
    marginTop: 16,
  },
  subtitle: {
    color: 'rgba(255,255,255,0.65)',
    fontSize: 16,
    marginTop: 8,
    marginBottom: 28,
    textAlign: 'center',
  },
  row: {
    flexDirection: 'row',
    gap: 16,
    width: '100%',
    justifyContent: 'center',
  },
  btn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 16,
    borderRadius: 16,
  },
  btnDecline: {
    backgroundColor: '#C62828',
  },
  btnAccept: {
    backgroundColor: colors.success,
  },
  btnText: {
    color: '#FFF',
    fontWeight: '700',
    fontSize: 16,
  },
});
