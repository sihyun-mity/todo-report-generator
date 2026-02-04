'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';

import type { Property } from 'csstype';

import { useMedia } from './index';

export default function useContainer() {
  const calculateOverflowPadding = useCallback(() => {
    const { clientWidth } = document.documentElement;

    if (clientWidth <= 1920) {
      return 0;
    } else {
      return (clientWidth - 1920) / 2;
    }
  }, []);

  const [overflowPadding, setOverflowPadding] = useState<number>(calculateOverflowPadding);
  const { lg } = useMedia();
  const padding: Property.Padding = useMemo(
    () => (lg ? `0 calc(32px + ${overflowPadding}px)` : `0 20px`),
    [overflowPadding, lg],
  );

  const onResize = useCallback(() => setOverflowPadding(calculateOverflowPadding), [calculateOverflowPadding]);

  useEffect(() => {
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, [onResize]);

  return { padding };
}
