'use client';

import { useLayoutEffect } from 'react';
import MobileDetect from 'mobile-detect';
import { useMobileStore } from '@/stores';

export default function MobileDetector() {
  const { setIsMobile, setIsAndroid, setIsIOS, setIsReady } = useMobileStore();

  useLayoutEffect(() => {
    const userAgent = new MobileDetect(window.navigator.userAgent);
    setIsMobile(!!userAgent.mobile());
    setIsAndroid(userAgent.os() === 'AndroidOS');
    setIsIOS(userAgent.os() === 'iOS' || userAgent.os() === 'iPadOS');
    setIsReady(true);
  }, [setIsMobile, setIsAndroid, setIsIOS, setIsReady]);

  return null;
}
