import { useState, useEffect, useRef } from 'react';
import { Animated } from 'react-native';
import { supabase } from '../../../lib/supabase';
import type { UserProfile } from '../../../types/userProfile';

export function useHomeDuty(
  profile: UserProfile | null,
  isConnected: boolean,
  showDialog: any,
  refreshProfile: () => void
) {
  const [isDutyActive, setIsDutyActive] = useState(profile?.available ?? false);
  const [unitName, setUnitName] = useState<string | null>(null);
  
  const holdProgress = useRef(new Animated.Value(0)).current;
  const progressValueRef = useRef(0);
  const [isHolding, setIsHolding] = useState(false);

  useEffect(() => {
    const listenerId = holdProgress.addListener(({ value }) => {
      progressValueRef.current = value;
    });
    return () => {
      holdProgress.removeListener(listenerId);
    };
  }, [holdProgress]);

  useEffect(() => {
    if (profile) setIsDutyActive(profile.available);
  }, [profile?.available]);

  useEffect(() => {
    let cancelled = false;
    async function loadUnitName() {
      if (!profile?.assigned_unit_id) {
        setUnitName('Non assignée');
        return;
      }
      const { data, error } = await supabase
        .from('units')
        .select('callsign, vehicle_type, type')
        .eq('id', profile.assigned_unit_id)
        .maybeSingle();

      if (cancelled) return;
      if (error || !data) {
        setUnitName('Non assignée');
        return;
      }
      setUnitName(data.callsign || data.vehicle_type || data.type || 'Unité');
    }
    void loadUnitName();
    return () => { cancelled = true; };
  }, [profile?.assigned_unit_id]);

  const toggleDuty = async (newVal: boolean) => {
    if (!isConnected) {
      showDialog({
        title: 'Connexion requise',
        message: 'Veuillez activer votre connexion internet (Wi-Fi ou données mobiles) pour modifier votre statut de service.',
        icon: 'cloud-off-outline',
        iconType: 'community',
        isError: true,
        confirmText: 'COMPRIS'
      });
      return;
    }

    setIsDutyActive(newVal);
    if (profile?.id) {
      const { error } = await supabase
        .from('users_directory')
        .update({ available: newVal, status: newVal ? 'active' : 'offline' })
        .eq('id', profile.id);

      if (error) {
        showDialog({
          title: 'Erreur réseau',
          message: 'Impossible de modifier le statut de service. Vérifiez votre connexion.',
          icon: 'wifi-off',
          isError: true,
          confirmText: 'RÉESSAYER'
        });
        setIsDutyActive(!newVal);
      } else {
        refreshProfile();
      }
    }
  };

  const isResettingRef = useRef(false);

  const handlePressIn = () => {
    if (isResettingRef.current) return;
    setIsHolding(true);
    holdProgress.setValue(0);
    Animated.timing(holdProgress, {
      toValue: 1,
      duration: 1000,
      useNativeDriver: true
    }).start();
  };

  const handlePressOut = () => {
    if (isResettingRef.current) return;
    setIsHolding(false);
    
    const val = progressValueRef.current;
    
    if (val >= 0.98) {
      toggleDuty(!isDutyActive);
      holdProgress.setValue(0);
    } else if (val > 0) {
      isResettingRef.current = true;
      Animated.timing(holdProgress, {
        toValue: 0,
        duration: val * 1000,
        useNativeDriver: true
      }).start(() => {
        isResettingRef.current = false;
      });
    } else {
      holdProgress.setValue(0);
    }
  };

  return {
    isDutyActive,
    unitName,
    isHolding,
    holdProgress,
    handlePressIn,
    handlePressOut
  };
}
