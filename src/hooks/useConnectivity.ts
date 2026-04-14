import { useState, useEffect } from 'react';
import NetInfo from '@react-native-community/netinfo';

export function useConnectivity() {
  const [isConnected, setIsConnected] = useState<boolean>(true);

  useEffect(() => {
    // NetInfo returns a subscription cleanup function
    const unsubscribe = NetInfo.addEventListener(state => {
      // isConnected can be null if status is unknown, treat as true initially to avoid flicker
      setIsConnected(state.isConnected !== false);
    });

    return () => unsubscribe();
  }, []);

  return { isConnected };
}
