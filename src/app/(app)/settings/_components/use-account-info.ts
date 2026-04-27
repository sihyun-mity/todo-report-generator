'use client';

import { useCallback, useEffect, useState } from 'react';
import type { UserIdentity } from '@supabase/supabase-js';
import { createClient } from '@/lib/supabase/client';

// settings 하위 페이지 공통: 현재 이메일·연결된 identity 목록을 불러오고 갱신 함수를 노출한다.
export function useAccountInfo() {
  const [currentEmail, setCurrentEmail] = useState<string>('');
  const [identities, setIdentities] = useState<ReadonlyArray<UserIdentity>>([]);
  const [isLoaded, setIsLoaded] = useState(false);

  const refresh = useCallback(async () => {
    const supabase = createClient();
    const { data } = await supabase.auth.getUser();
    setCurrentEmail(data.user?.email ?? '');
    setIdentities(data.user?.identities ?? []);
    setIsLoaded(true);
  }, []);

  useEffect(() => {
    // refresh는 비동기 fetch 후 setState를 호출하므로 cascading 렌더 위험은 없다 — 동기 호출 룰 예외 처리.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    refresh();
  }, [refresh]);

  return { currentEmail, identities, isLoaded, setCurrentEmail, refresh };
}
