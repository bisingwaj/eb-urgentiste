import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { readNotificationsCache, writeNotificationsCache } from '../lib/localAppCache';

export interface Notification {
  id: string;
  user_id: string;
  title: string;
  body: string | null;
  type: string; // 'dispatch', 'alert', 'system', 'field_report'
  reference_id: string | null;
  is_read: boolean;
  created_at: string;
}

export function useNotifications() {
  const { session } = useAuth();
  const userId = session?.user?.id;
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [isLoading, setIsLoading] = useState(false);

  const fetchNotifications = useCallback(async () => {
    if (!userId) {
      setIsLoading(false);
      return;
    }

    try {
      const { data, error } = await supabase
        .from('notifications')
        .select('*')
        .eq('user_id', userId)
        .order('created_at', { ascending: false })
        .limit(50);

      if (error) {
        console.error('[Notifications] Fetch error:', error.message);
        return;
      }

      const list = data || [];
      setNotifications(list);
      setUnreadCount(list.filter((n) => !n.is_read).length);
      void writeNotificationsCache(userId, list);
    } catch (err: any) {
      console.error('[Notifications] Error:', err.message);
    } finally {
      setIsLoading(false);
    }
  }, [userId]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!userId) {
        setNotifications([]);
        setUnreadCount(0);
        return;
      }
      const cached = await readNotificationsCache(userId);
      if (cancelled) return;
      if (cached) {
        setNotifications(cached.notifications);
        setUnreadCount(cached.unreadCount);
      }
      await fetchNotifications();
    })();
    return () => {
      cancelled = true;
    };
  }, [userId, fetchNotifications]);

  // Realtime subscription — separate effect, only depends on userId
  useEffect(() => {
    if (!userId) return;

    // Remove any existing channel with this name first
    const channelName = `notifs-${userId}`;
    const existingChannel = supabase.channel(channelName);
    supabase.removeChannel(existingChannel);

    // Create fresh channel
    const channel = supabase
      .channel(channelName)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'notifications',
          filter: `user_id=eq.${userId}`,
        },
        (payload: any) => {
          const newNotif = payload.new as Notification;
          console.log('[Notifications] 🔔 New:', newNotif.title);
          setNotifications((prev) => {
            const next = [newNotif, ...prev];
            void writeNotificationsCache(userId, next);
            return next;
          });
          setUnreadCount((prev) => prev + 1);
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [userId]);

  const markAsRead = async (notifId: string) => {
    const { error } = await supabase
      .from('notifications')
      .update({ is_read: true })
      .eq('id', notifId);

    if (!error) {
      setNotifications((prev) => {
        const next = prev.map((n) => (n.id === notifId ? { ...n, is_read: true } : n));
        if (userId) void writeNotificationsCache(userId, next);
        return next;
      });
      setUnreadCount((prev) => Math.max(0, prev - 1));
    }
  };

  const markAllAsRead = async () => {
    if (!userId) return;
    const { error } = await supabase
      .from('notifications')
      .update({ is_read: true })
      .eq('user_id', userId)
      .eq('is_read', false);

    if (!error) {
      setNotifications((prev) => {
        const next = prev.map((n) => ({ ...n, is_read: true }));
        if (userId) void writeNotificationsCache(userId, next);
        return next;
      });
      setUnreadCount(0);
    }
  };

  return { notifications, unreadCount, isLoading, markAsRead, markAllAsRead, refresh: fetchNotifications };
}
