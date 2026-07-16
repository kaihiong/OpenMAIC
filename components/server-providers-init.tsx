'use client';

import { useEffect } from 'react';
import { usePathname } from 'next/navigation';
import { useSettingsStore } from '@/lib/store/settings';

/**
 * Fetches server-configured providers after authenticated navigation and merges
 * them into the settings store.
 * Renders nothing — purely a side-effect component.
 */
export function ServerProvidersInit() {
  const pathname = usePathname();
  const fetchServerProviders = useSettingsStore((state) => state.fetchServerProviders);

  useEffect(() => {
    if (pathname.startsWith('/login')) return;
    fetchServerProviders();
  }, [fetchServerProviders, pathname]);

  return null;
}
