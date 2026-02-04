'use client';

import { useMemo } from 'react';

import { useSearchParams } from 'next/navigation';
import { isValidQuery } from '@/utils';

export default function useAllSearchParams() {
  const searchParams = useSearchParams();
  return useMemo(() => {
    const obj: ParsedUrlQuery = {};
    searchParams?.forEach((value, key) => {
      if (value) {
        if (isValidQuery(obj[key])) {
          obj[key] = [...[obj[key] ?? []].flat(), value];
        } else {
          obj[key] = value;
        }
      }
    });
    return obj;
  }, [searchParams]);
}
