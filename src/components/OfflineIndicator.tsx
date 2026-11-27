import { RefreshCw, WifiOff } from 'lucide-react';
import React from 'react';
import { useOnlineStatus } from '../hooks/useOnlineStatus';
import type { LanguageCode } from '../types/wms';

export const OfflineIndicator: React.FC<{ lang: LanguageCode }> = ({ lang }) => {
  const { isOnline, usingCachedData, lastSyncedAt } = useOnlineStatus();

  if (isOnline && !usingCachedData) return null;

  const formattedTime = lastSyncedAt
    ? new Date(lastSyncedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    : null;

  return (
    <div
      role="status"
      className="mb-4 px-4 py-2.5 bg-amber-50 border border-amber-200 rounded-md flex flex-wrap items-center justify-between gap-3 text-xs text-amber-900 no-print"
    >
      <div className="flex items-center gap-2.5">
        <WifiOff className="w-4 h-4 text-amber-700 shrink-0" />
        <div>
          <span className="font-semibold">
            {lang === 'so'
              ? 'Xiriirka internetka ma xasilloona (Offline)'
              : 'Offline / Unstable Connection'}
          </span>
          <span className="mx-1.5" aria-hidden="true">
            ·
          </span>
          <span>
            {lang === 'so'
              ? 'Xogta kaydka ee la keydiyay ayaa la soo bandhigayaa. Isbeddelada cusub waxay u baahan yihiin internet.'
              : 'Displaying cached warehouse inventory data. Saving new changes requires an active connection.'}
          </span>
          {formattedTime && (
            <span className="ml-2 font-mono text-amber-800">
              ({lang === 'so' ? 'La cusboonaysiiyay:' : 'Last synced:'} {formattedTime})
            </span>
          )}
        </div>
      </div>

      <button
        type="button"
        onClick={() => window.location.reload()}
        className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-white border border-amber-300 rounded text-amber-900 hover:bg-amber-100/60 font-medium whitespace-nowrap shrink-0"
      >
        <RefreshCw className="w-3.5 h-3.5" />
        {lang === 'so' ? 'Isku Day Mar Kale' : 'Retry'}
      </button>
    </div>
  );
};
