'use client';

import type { AgentAction } from '@/types';
import { useAgentChatStore } from '@/stores';
import { AgentActionChip, AgentInputBox, useAgentSuggestions } from '.';

// 보고서 작성 화면 맨 위의 AI 입력창(GitHub 대시보드의 "Ask anything" 처럼) — 이 서비스의 첫 진입점.
// 입력창은 하나다: 부탁("지난주 요약해줘")이면 Nano가 대화로 처리하고, 오늘 한 일을 적은 메모면 보고서 초안으로 정리한다 —
// 어느 쪽인지는 Nano가 가른다(규칙 + 의도 분류). 입력 상자는 패널과 같은 AgentInputBox 를 쓰고,
// 바로 할 수 있는 작업 칩은 상자 밖 아래에 둔다(상자 안에 함께 두면 입력 영역이 좁아 보였다). 가장 많이 쓰는 GitHub 가져오기를
// 맨 앞에 무지개 빛으로 둔다. 도구 칩은 Nano를 열지 않고 바로 실행한다.
// AI 를 쓸 수 없는 브라우저에서는 입력 상자 없이 칩만 남는다(칩은 모델 없이 동작한다).
export function AgentComposer() {
  const availability = useAgentChatStore((s) => s.availability);
  const isRunning = useAgentChatStore((s) => s.isRunning);
  const { quickActions } = useAgentSuggestions();
  const isReady = availability === 'available';

  const runAction = (action: AgentAction) =>
    useAgentChatStore.getState().submit(action, { reveal: action.type !== 'tool' });

  return (
    <section aria-label="Nano에게 부탁하기" className="mb-8 space-y-3">
      {isReady && (
        <AgentInputBox
          placeholder="요청하거나 오늘 한 일을 적어 보세요"
          hint="예: 지난주 보고서 요약해줘 · 로그인 오류 고쳤고 결제 리팩터링 절반 했어"
          isRunning={isRunning}
          onSubmit={(text) => useAgentChatStore.getState().submit({ type: 'prompt', text })}
          className="shadow-sm"
        />
      )}
      {quickActions.length > 0 && (
        // 넘치면 줄을 바꾼다 — 가로 스크롤(overflow)로 두면 GitHub 칩의 무지개 빛(blur 10px)이 스크롤 영역 경계에서 사각형으로 잘린다
        <div className="flex flex-wrap gap-2">
          {quickActions.map((action) => (
            <AgentActionChip key={action.id} action={action} busy={isRunning} onRun={runAction} />
          ))}
        </div>
      )}
    </section>
  );
}
