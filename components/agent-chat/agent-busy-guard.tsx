'use client';

import type { ReactNode } from 'react';
import { Loader2 } from 'lucide-react';
import { useAgentChatStore } from '@/stores';
import { cn } from '@/utils';

// Nano가 **작성 중인 폼을 바꾸는 요청**을 처리하는 동안만 페이지 본문을 조작하지 못하게 막는다(formLocked).
// 도구는 실행 시점의 store 를 읽고 쓰지만, 모델이 판단에 쓴 폼 스냅샷은 몇 초 전 것이라 그사이 사용자가 고친 내용을
// 교체 도구(구역 바꾸기·기록 불러오기 등)가 덮을 수 있다. inert 로 클릭·입력·포커스를 막고(스크롤은 된다),
// 상단바와 채팅 패널(멈추기·확인 카드)은 이 바깥이라 그대로 쓸 수 있다.
// 조회·요약("지난주 보고서 요약해줘")·대화·저장·이동은 폼과 관계가 없어 잠그지 않는다 — 모든 응답에 잠그던 때는 기다리는 동안
// 보고서를 쓸 수 없었다. 잠글지는 의도 분류가 끝난 뒤 정해진다(runAgentChatTurn 의 onFormLock).
export function AgentBusyGuard({ children }: Readonly<{ children: ReactNode }>) {
  const locked = useAgentChatStore((s) => s.formLocked);
  const expanded = useAgentChatStore((s) => s.expanded);
  // 확인 카드처럼 사용자가 눌러야 진행되는 단계면, 기다리는 이유와 그 카드로 가는 길을 알린다
  // (모바일에서 시트를 닫아 두면 잠긴 이유를 모를 수 있다)
  const followUpCount = useAgentChatStore((s) => s.followUpCount);

  return (
    <>
      <div inert={locked} aria-busy={locked} className={cn('transition-opacity', locked && 'opacity-60')}>
        {children}
      </div>
      {locked && (
        // 상단바(h-14 = 56px)에서 16px 띄운다(top-18 = 72px) — 붙어 있으면 상단바 일부처럼 보였다
        <div
          role="status"
          className={cn(
            'pointer-events-none fixed inset-x-0 top-18 z-40 flex justify-center px-4',
            // 펼친 패널(400px)을 뺀 본문 가운데에 둔다
            expanded && 'lg:pr-[400px]'
          )}
        >
          {followUpCount > 0 ? (
            <button
              type="button"
              onClick={() => useAgentChatStore.getState().showFollowUp()}
              className="pointer-events-auto flex items-center gap-2 rounded-full bg-amber-500 px-4 py-2 text-xs font-semibold text-white shadow-lg transition-colors hover:bg-amber-600"
            >
              <span className="h-2 w-2 animate-pulse rounded-full bg-white" aria-hidden />
              Nano가 확인을 기다리고 있어요
              <span className="underline underline-offset-2">보기</span>
            </button>
          ) : (
            <p className="flex items-center gap-2 rounded-full bg-zinc-900/90 px-4 py-2 text-xs font-semibold text-white shadow-lg dark:bg-zinc-100/90 dark:text-zinc-900">
              <Loader2 size={14} className="animate-spin" aria-hidden />
              Nano가 작업하는 동안 화면 편집을 잠시 멈춰요
            </p>
          )}
        </div>
      )}
    </>
  );
}
