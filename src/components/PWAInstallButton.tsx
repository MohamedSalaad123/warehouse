import { Download } from 'lucide-react';
import React, { useState } from 'react';
import { usePWAInstall } from '../hooks/usePWAInstall';
import type { LanguageCode } from '../types/wms';
import { Modal } from './ui/Common';

export const PWAInstallButton: React.FC<{ lang: LanguageCode }> = ({ lang }) => {
  const { isInstallable, isInstalled, isIOS, install } = usePWAInstall();
  const [showIOSGuide, setShowIOSGuide] = useState(false);

  if (isInstalled) {
    return null;
  }

  if (isInstallable) {
    return (
      <button
        type="button"
        onClick={install}
        className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-white bg-[#1E4E79] hover:bg-[#163A5C] rounded-md transition-colors whitespace-nowrap shrink-0"
      >
        <Download className="w-3.5 h-3.5" />
        <span>{lang === 'so' ? 'Ku Rakib App-ka' : 'Install App'}</span>
      </button>
    );
  }

  if (isIOS) {
    return (
      <>
        <button
          type="button"
          onClick={() => setShowIOSGuide(true)}
          className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium text-slate-700 bg-white border border-slate-300 hover:bg-slate-50 rounded-md whitespace-nowrap shrink-0"
        >
          <Download className="w-3.5 h-3.5" />
          <span>{lang === 'so' ? 'Ku Rakib iOS' : 'Install on iOS'}</span>
        </button>

        <Modal
          open={showIOSGuide}
          title={lang === 'so' ? 'Ku Rakib iPhone / iPad' : 'Install on iPhone / iPad'}
          onClose={() => setShowIOSGuide(false)}
          maxWidth="max-w-sm"
        >
          <div className="space-y-3 text-sm text-slate-600">
            <p>
              {lang === 'so'
                ? '1. Taabo badhanka Share ee hoose ama sare ku yaal Safari.'
                : '1. Tap the Share button in the Safari toolbar.'}
            </p>
            <p>
              {lang === 'so'
                ? '2. Hoos u soco oo dooro Add to Home Screen.'
                : '2. Scroll down and tap Add to Home Screen.'}
            </p>
            <div className="flex justify-end pt-2">
              <button
                type="button"
                onClick={() => setShowIOSGuide(false)}
                className="px-4 py-2 text-xs font-medium bg-[#1E4E79] text-white rounded-md"
              >
                OK
              </button>
            </div>
          </div>
        </Modal>
      </>
    );
  }

  return null;
};
