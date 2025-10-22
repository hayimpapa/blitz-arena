'use client';

import { useEffect, useRef } from 'react';

/**
 * AdBanner Component
 *
 * Displays Google AdSense banner ads with responsive sizing and test mode support.
 *
 * Features:
 * - Test mode for development (shows placeholder when AdSense isn't approved yet)
 * - Responsive design (adapts to mobile and desktop)
 * - Lazy loading for better performance
 * - Easy to toggle on/off via environment variables
 */
export default function AdBanner() {
  const adRef = useRef(null);

  // Get environment variables
  const clientId = process.env.NEXT_PUBLIC_ADSENSE_CLIENT_ID;
  const slotId = process.env.NEXT_PUBLIC_ADSENSE_SLOT_ID;
  const adsEnabled = process.env.NEXT_PUBLIC_ADS_ENABLED === 'true';
  const testMode = process.env.NEXT_PUBLIC_ADS_TEST_MODE === 'true';

  useEffect(() => {
    // Only run if ads are enabled and we have the required IDs
    if (!adsEnabled || !clientId || !slotId || testMode) return;

    try {
      // Push ad to AdSense
      if (window.adsbygoogle && adRef.current) {
        (window.adsbygoogle = window.adsbygoogle || []).push({});
      }
    } catch (err) {
      console.error('AdSense error:', err);
    }
  }, [adsEnabled, clientId, slotId, testMode]);

  // Don't render anything if ads are disabled
  if (!adsEnabled) {
    return null;
  }

  // Show test placeholder in test mode
  if (testMode || !clientId || !slotId) {
    return (
      <div className="w-full max-w-4xl mx-auto mt-8 mb-4">
        <div className="bg-gradient-to-r from-purple-900/50 to-blue-900/50 rounded-xl p-4 border-2 border-purple-400/30">
          <p className="text-xs text-purple-300 text-center mb-2 font-medium">
            Advertisement (Test Mode)
          </p>
          <div className="bg-purple-950/50 rounded-lg p-6 flex items-center justify-center min-h-[90px]">
            <div className="text-center">
              <div className="text-4xl mb-2">📢</div>
              <p className="text-purple-300 text-sm">
                Ad Space - 728x90 / 320x50
              </p>
              <p className="text-purple-400 text-xs mt-1">
                Replace with real AdSense when approved
              </p>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Production AdSense ad
  return (
    <div className="w-full max-w-4xl mx-auto mt-8 mb-4">
      <div className="bg-gradient-to-r from-purple-900/30 to-blue-900/30 rounded-xl p-4">
        <p className="text-xs text-purple-300 text-center mb-2 font-medium">
          Advertisement
        </p>
        <div className="flex justify-center items-center min-h-[90px]">
          <ins
            ref={adRef}
            className="adsbygoogle"
            style={{ display: 'block' }}
            data-ad-client={clientId}
            data-ad-slot={slotId}
            data-ad-format="auto"
            data-full-width-responsive="true"
          ></ins>
        </div>
      </div>
    </div>
  );
}
