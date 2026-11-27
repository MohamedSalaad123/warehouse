import { useEffect, useState } from 'react';

export function useOnlineStatus() {
  const [isOnline, setIsOnline] = useState(
    typeof navigator !== 'undefined' ? navigator.onLine : true
  );
  const [usingCachedData, setUsingCachedData] = useState(false);
  const [lastSyncedAt, setLastSyncedAt] = useState<string | null>(null);

  useEffect(() => {
    const handleOnline = () => {
      setIsOnline(true);
      setUsingCachedData(false);
    };
    const handleOffline = () => {
      setIsOnline(false);
    };
    const handleDataSynced = (e: Event) => {
      const detail = (e as CustomEvent<{ timestamp: string }>).detail;
      setIsOnline(true);
      setUsingCachedData(false);
      if (detail?.timestamp) setLastSyncedAt(detail.timestamp);
    };
    const handleCachedFallback = () => {
      setUsingCachedData(true);
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    window.addEventListener('wms:data-synced', handleDataSynced);
    window.addEventListener('wms:cached-fallback', handleCachedFallback);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
      window.removeEventListener('wms:data-synced', handleDataSynced);
      window.removeEventListener('wms:cached-fallback', handleCachedFallback);
    };
  }, []);

  return { isOnline, usingCachedData, lastSyncedAt };
}
