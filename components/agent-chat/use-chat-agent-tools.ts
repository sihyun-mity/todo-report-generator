'use client';

import { useEffect, useRef } from 'react';
import type { AgentChatMessage, AgentNotesDraft, AgentTool } from '@/types';
import { AGENT_CHAT_FEATURE_TOOLS } from '@/constants';
import { useAgentTools } from '@/hooks';
import { toolError, toolText, toolUnavailable } from '@/lib/webmcp';
import { useAgentChatStore, useAgentToolsStore, useAgentUndoStore } from '@/stores';

// 되돌려 달라는 말 — 의도 분류가 어느 쪽으로 가도 되돌리기 도구만 후보로 남긴다.
// 되돌리는 도구가 없던 때는 "되돌려줘"에 비슷한 수정 도구(중복 작업 정리)를 골라 "바뀐 것은 없어요"로 끝났다
const UNDO_REQUEST =
  /되돌|돌려\s*놔|돌려놓|원래대로|원상\s*(복구|태)|실행\s*취소|undo|(방금|아까|조금\s*전)[^.?!]{0,12}(취소|무르|물러)|^\s*(취소|취소해|무르|물러)[^.?!]{0,8}$/i;
// 초안을 넣거나 버려 달라는 말 — 폼에 넣지 않은 초안이 있을 때만 본다
const DRAFT_ADD_REQUEST = /추가|넣어|넣자|반영|적용|채워|그대로|좋아|응|네|그래/;
const DRAFT_DISCARD_REQUEST = /버려|버리|취소|안\s*넣|넣지\s*마|필요\s*없|됐어|지워|삭제|빼/;
const DRAFT_WORDS = /초안|메모|정리한|방금\s*(거|것)|그거|이거/;
// 새 대화·패널 닫기
const NEW_CHAT_REQUEST =
  /(새|처음부터)\s*(대화|채팅)|대화[^.?!]{0,8}(지워|비워|초기화|새로|리셋|정리)|채팅[^.?!]{0,8}(지워|비워|초기화|새로)/;
const CLOSE_REQUEST = /(나노|nano|패널|채팅|대화\s*창|창)[^.?!]{0,8}(닫|접|숨겨|꺼|치워)/i;

// 사용자가 어느 변경을 가리켰는지 — 변경(도구 이름)의 동작 낱말이 요청에 있는지 본다. 모델이 변경을 고르지 않아
// "아까 내일로 옮긴 거 원래대로"에 가장 최근 변경(진행률 바꾸기)을 되돌렸다
const CHANGE_WORDS: ReadonlyArray<[RegExp, RegExp]> = [
  [/옮기|이동/, /옮기|옮긴|옮겨|이동/],
  [/진행률/, /진행률|%/],
  [/이름|내용 고치기/, /이름|고친|고쳐/],
  [/추가|넣|가져/, /추가|넣은|넣었|넣어|가져온/],
  [/삭제|지우|정리/, /삭제|지운|지웠|뺀|정리/],
  [/목표/, /목표/],
  [/세부/, /세부|하위/],
  [/화면 모드/, /모드|다크|라이트|어둡|밝/],
  [/날짜/, /날짜/],
  [/초기화|비우/, /초기화|비운|비웠/],
];
const changePointedBy = <T extends { title: string }>(entries: ReadonlyArray<T>, request: string) => {
  const matched = entries.filter((e) =>
    CHANGE_WORDS.some(([inTitle, inRequest]) => inTitle.test(e.title) && inRequest.test(request))
  );
  return matched.length === 1 ? matched[0] : undefined;
};

// 뒤의 변경까지 함께 되돌리라는 말 · "함께 되돌릴까요?"에 받아들이는 말 · 앞의 변경을 가리키는 말
const INCLUDE_LATER = /같이|함께|전부|모두|다\s*(되돌|돌려|취소)/;
const ACCEPT_UNDO = /^(응|어|네|넵|예|좋아|그래|ㅇㅇ|ㅇㅋ|오케이|ok|부탁|그렇게)/i;
const EARLIER = /아까|전에|처음|앞에서|그\s*전/;
// 되돌리라는 말이거나, 함께 되돌릴지 물은 뒤 받아들이는 말
const asksUndo = (request: string) =>
  UNDO_REQUEST.test(request) || (useAgentUndoStore.getState().offered !== null && ACCEPT_UNDO.test(request.trim()));

const pendingDraft = (messages: ReadonlyArray<AgentChatMessage>) =>
  messages.findLast(
    (m): m is Extract<AgentChatMessage, { role: 'draft' }> => m.role === 'draft' && m.status === 'pending'
  );

const draftLines = (draft: AgentNotesDraft) =>
  (['today', 'tomorrow'] as const).flatMap((section) =>
    draft[section].flatMap((p) =>
      p.tasks.map((t) => `${section === 'today' ? '금일' : '익일'} · ${p.name} · ${t.content} ${t.progress}%`)
    )
  );

type Options = {
  // 지금 대화 — 도구는 한 번 만들어지므로 ref 로 최신 값을 읽는다
  messages: ReadonlyArray<AgentChatMessage>;
  patchMessage: (id: string, patch: Partial<AgentChatMessage>) => void;
  // 대화를 비운다 — 처리 중인 요청이 있으면 끝난 뒤에(처리 중에 비우면 답할 곳이 없다)
  onNewChat: () => void;
};

// 채팅 패널에서 버튼으로만 하던 일(변경 되돌리기·초안 추가/취소·새 대화·패널 닫기)을 Nano가 말로도 하게 하는 도구.
// 채팅에서만 쓴다 — WebMCP 로 부르는 에이전트에게는 변경 카드·초안·패널이 없다.
// 화면에 버튼을 더하면 AGENT_CHAT_FEATURE_TOOLS 에 함께 넣는다.
export function useChatAgentTools({ messages, patchMessage, onNewChat }: Readonly<Options>) {
  const latest = useRef({ messages, patchMessage, onNewChat });
  useEffect(() => {
    latest.current = { messages, patchMessage, onNewChat };
  });

  useAgentTools(
    (): ReadonlyArray<AgentTool> => [
      {
        name: 'undo_change',
        title: '바꾼 내용 되돌리기',
        kind: 'edit',
        // 되돌릴 변경은 추가·교체·초기화·화면 모드 어느 것이든 될 수 있다 — 의도가 그쪽으로 갈라져도 후보로 둔다
        extraKinds: ['add', 'replace', 'reset', 'setting'],
        surfaces: ['chat'],
        // 되돌리라는 말이 있거나, 함께 되돌릴지 물은 뒤 받아들이는 말일 때만 후보다 —
        // "방금 고친 세부 항목 지워줘"에 이 도구를 골라 고친 것을 되돌렸다(지우지 않았다)
        requires: (request) => asksUndo(request),
        preferredWhen: (request) => asksUndo(request),
        // 입력은 없다 — 대상은 요청의 낱말·앞에서 물은 변경으로 정하고(규칙), 정해지지 않으면 되묻는다.
        // 모델에 고르게 하던 때는 되돌리기 하나만 후보인데 "할 수 없음"을 고르거나, 어느 것인지 말해도 가장 최근 것을 골랐다
        unavailable: (request) =>
          asksUndo(request) &&
          useAgentUndoStore.getState().pending().length === 0 &&
          pendingDraft(latest.current.messages) === undefined
            ? {
                reason: '이 대화에서 Nano가 바꾼 것 중 되돌릴 수 있는 변경이 없어요.',
                offer: '어떻게 바꾸면 될지 직접 말씀해 주시겠어요?',
              }
            : null,
        description:
          'Undo a change Nano made earlier in this conversation, exactly like the 되돌리기 button on its change card (되돌려줘, 취소해줘, 원래대로 해줘, 방금 거 무르자, 아까 옮긴 거 다시 돌려놔). It restores the report form (or the color mode) to how it was right before that change. Use it whenever the user wants a previous change reverted — never redo it by hand with other tools.',
        inputSchema: { type: 'object', properties: {} },
        execute: async (_input, context) => {
          const store = useAgentUndoStore.getState();
          const pending = store.pending();
          const request = context.request ?? '';
          if (pending.length === 0)
            return toolError('되돌릴 수 있는 변경이 없습니다. 이 대화에서 Nano가 바꾼 것만 되돌릴 수 있어요.');
          // 앞에서 "함께 되돌릴까요?"라고 물은 변경 → 요청 낱말이 가리키는 변경 → 가장 최근 변경
          const offered = store.offered ? pending.find((e) => e.id === store.offered) : undefined;
          const accepted = offered && (ACCEPT_UNDO.test(request) || INCLUDE_LATER.test(request)) ? offered : undefined;
          const pointed = pending.length > 1 ? changePointedBy(pending, request) : undefined;
          // 앞의 것을 가리키는데 어느 것인지 모르면 짐작하지 않고 묻는다(가장 최근 것을 되돌리면 다른 변경이 사라진다)
          if (!accepted && !pointed && pending.length > 1 && EARLIER.test(request) && !/방금/.test(request))
            return toolUnavailable({
              reason: '어느 변경을 되돌릴지 모르겠어요.',
              offer: `${pending.map((e) => `'${e.title}'`).join(', ')} 중 어느 것을 되돌릴까요?`,
            });
          const target = accepted ?? pointed ?? pending.at(-1)!;
          const later = pending.slice(pending.indexOf(target) + 1);
          store.offer(null);
          if (!(target.canUndo?.() ?? true)) {
            // 뒤의 변경도 그대로라 차례로 되돌릴 수 있을 때만 함께 되돌리기를 권한다(그사이 사용자가 고쳤으면 어느 것도 되돌릴 수 없다)
            const cascade = later.length > 0 && (later.at(-1)!.canUndo?.() ?? true);
            if (!cascade)
              return toolError(
                `'${target.title}' 변경은 그사이 내용이 바뀌어 되돌리지 않았어요. 바꿀 내용을 직접 말씀해 주시면 고칠게요.`
              );
            if (!accepted && !INCLUDE_LATER.test(request)) {
              store.offer(target.id);
              return toolUnavailable({
                reason: `'${target.title}' 뒤에 ${later.map((e) => `'${e.title}'`).join(', ')}도 바뀌어서 그것만 따로 되돌릴 수 없어요.`,
                offer: `${later.map((e) => `'${e.title}'`).join(', ')}까지 함께 되돌릴까요?`,
              });
            }
            const undone = store.undoThrough(target.id);
            if (undone.length < later.length + 1)
              return toolError('일부만 되돌렸어요. 그사이 내용이 바뀌어 나머지는 되돌리지 않았어요.');
            return toolText({
              changed: true,
              message: `${[...undone]
                .reverse()
                .map((e) => `'${e.title}'`)
                .join(', ')}에서 바꾼 내용을 되돌렸어요`,
            });
          }
          const undone = store.undo(target.id);
          if (undone?.status !== 'done')
            return toolError(
              `'${target.title}' 변경은 그사이 내용이 바뀌어 되돌리지 않았어요. 바꿀 내용을 직접 말씀해 주시면 고칠게요.`
            );
          return toolText({ changed: true, message: `'${target.title}'에서 바꾼 내용을 되돌렸어요` });
        },
      },
      {
        name: 'add_notes_draft',
        title: '보고서 초안 추가',
        kind: 'add',
        surfaces: ['chat'],
        // 넣지 않은 초안이 있을 때 "추가해줘"·"그대로 넣어줘"는 초안을 가리킨다 — 없으면 모델이 초안 내용을 다시 지어 넣었다
        requires: () => pendingDraft(latest.current.messages) !== undefined,
        preferredWhen: (request) =>
          DRAFT_ADD_REQUEST.test(request) &&
          !DRAFT_DISCARD_REQUEST.test(request) &&
          (DRAFT_WORDS.test(request) || request.trim().length <= 12),
        inputContext: () => {
          const draft = pendingDraft(latest.current.messages);
          return draft ? { pendingDraft: draftLines(draft.draft) } : null;
        },
        description:
          "Add the pending report draft (the one Nano made from the user's work notes, shown as a card) to the form, exactly like the card's 추가 button (추가해줘, 그대로 넣어줘, 초안 반영해줘).",
        inputSchema: { type: 'object', properties: {} },
        execute: async (_input, context) => {
          const draft = pendingDraft(latest.current.messages);
          if (!draft) return toolError('폼에 넣지 않은 초안이 없습니다.');
          const fill = useAgentToolsStore.getState().tools.find((t) => t.name === 'fill_report');
          if (!fill) return toolError('초안은 보고서 작성 화면에서만 추가할 수 있어요.');
          const result = await fill.execute(
            { today: draft.draft.today, tomorrow: draft.draft.tomorrow, mode: 'append' },
            context
          );
          if (!result.isError) latest.current.patchMessage(draft.id, { status: 'applied' });
          return result;
        },
      },
      {
        name: 'discard_notes_draft',
        title: '보고서 초안 취소',
        kind: 'edit',
        extraKinds: ['add', 'reset'],
        surfaces: ['chat'],
        requires: () => pendingDraft(latest.current.messages) !== undefined,
        preferredWhen: (request) =>
          DRAFT_DISCARD_REQUEST.test(request) && (DRAFT_WORDS.test(request) || request.trim().length <= 12),
        description:
          'Discard the pending report draft card without adding it to the form, exactly like its 취소 button (초안 버려줘, 그거 안 넣을래, 취소해줘). Nothing in the form changes.',
        inputSchema: { type: 'object', properties: {} },
        execute: async () => {
          const draft = pendingDraft(latest.current.messages);
          if (!draft) return toolError('취소할 초안이 없습니다.');
          latest.current.patchMessage(draft.id, { status: 'discarded' });
          return toolText({ changed: true, message: '초안을 폼에 넣지 않고 닫았어요' });
        },
      },
      {
        name: 'start_new_chat',
        title: '새 대화 시작',
        kind: 'navigate',
        surfaces: ['chat'],
        preferredWhen: (request) => NEW_CHAT_REQUEST.test(request),
        description:
          'Clear this conversation and start a new one, exactly like the 새 대화 button in the panel header (새 대화 시작해줘, 대화 지워줘, 처음부터 다시 얘기하자). The report form does not change.',
        inputSchema: { type: 'object', properties: {} },
        execute: async () => {
          latest.current.onNewChat();
          return toolText({ message: '새 대화를 시작할게요.' });
        },
      },
      {
        name: 'close_nano',
        title: 'Nano 닫기',
        kind: 'navigate',
        surfaces: ['chat'],
        preferredWhen: (request) => CLOSE_REQUEST.test(request),
        description:
          'Close (collapse) the Nano panel, exactly like its close button (Nano 닫아줘, 패널 접어줘, 채팅창 숨겨줘). The conversation is kept; ⌘K opens it again.',
        inputSchema: { type: 'object', properties: {} },
        execute: async () => {
          const store = useAgentChatStore.getState();
          store.setExpanded(false);
          store.setOpen(false);
          return toolText({
            message: 'Nano를 닫았어요. 다시 부를 때는 ⌘K 나 상단의 "Nano에게 요청하기"를 눌러 주세요.',
          });
        },
      },
    ],
    true
  );

  // 개발 모드에서 대응표가 가리키는 도구가 실제로 있는지 확인한다(이름 오타·삭제는 실행해 봐야 안다)
  useEffect(() => {
    if (process.env.NODE_ENV !== 'development') return;
    const names = new Set(useAgentToolsStore.getState().tools.map((t) => t.name));
    const missing = Object.values(AGENT_CHAT_FEATURE_TOOLS)
      .flatMap((entry) => ('tools' in entry ? entry.tools : []))
      .filter((name) => !names.has(name));
    if (missing.length > 0) console.error('[agent-tools] 채팅 대응표에 있지만 등록되지 않은 도구:', missing);
  }, []);
}
