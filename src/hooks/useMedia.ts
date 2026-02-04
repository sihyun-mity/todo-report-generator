'use client';

import { useMediaQuery } from 'usehooks-ts';
import { useCallback, useLayoutEffect } from 'react';
import { useMediaStore } from '@/stores';

const useMedia = () => {
  const smQuery = useMediaQuery('(min-width: 640px)');
  const mdQuery = useMediaQuery('(min-width: 768px)');
  const lgQuery = useMediaQuery('(min-width: 1024px');
  const xlQuery = useMediaQuery('(min-width: 1280px)');
  const { sm, md, lg, xl, setMedia } = useMediaStore();

  const updateMediaState = useCallback(
    () => setMedia({ sm: smQuery, md: mdQuery, lg: lgQuery, xl: xlQuery }),
    [setMedia, smQuery, mdQuery, lgQuery, xlQuery],
  );

  useLayoutEffect(updateMediaState, [updateMediaState]);

  return { sm, md, lg, xl };
};

export default useMedia;
