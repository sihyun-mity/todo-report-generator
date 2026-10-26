'use client';

import { useEffect, useRef } from 'react';
import toast from 'react-hot-toast';
import { useQueryClient } from '@tanstack/react-query';
import type { AgentQuickAction, AgentTool, News, Theme, WebMcpToolResult } from '@/types';
import { AGENT_NAVIGATE_WAIT_MS, AGENT_NEWS_CONTENT_MAX_CHARS, AGENT_NEWS_LIST_LIMIT, AGENT_PAGES } from '@/constants';
import { useAgentTools, useRouter } from '@/hooks';
import { isGuestMode } from '@/lib/guest';
import { createClient } from '@/lib/supabase/client';
import { toolError, toolText, toolUnavailable } from '@/lib/webmcp';
import { queries } from '@/providers';
import { useAgentChatStore } from '@/stores';
import { dayLabel, isNewsId, kstDateKey, newsIdFromPath } from '@/utils';
import { useTheme } from '..';

type PageKey = keyof typeof AGENT_PAGES;
type NewsDetail = News | null;
type NewsList = { isMember: boolean; items: Array<News> };
type PageEntry = { path: string; label: string; memberOnly?: boolean; guestOnly?: boolean };

const PAGE_KEYS = Object.keys(AGENT_PAGES) as Array<PageKey>;

// 상세 화면에서 보고 있는(또는 방금 본) 소식을 가리키는 요청 — 목록을 후보로 두면 "지금 보고 있는 새소식 요약해줘"에 목록을 골라 최근 소식 여럿을 요약했다.
// 반대로 목록이 있어야 하는 요청("다음 소식 열어줘" — 이동할 id 가 목록에 있다)까지 막지 않게, 가리키는 말이 있을 때만 뺀다.
const CURRENT_NEWS_REQUEST =
  /지금|현재|보고\s*있|보는|보던|봤던|아까|방금|여기|이거|그거|[이그]\s*(새\s*소식|소식|글|공지|내용)/;
const NEWS_LIST_REQUEST = /목록|최근|다른|다음|이전|전체|모든|모두|지난|여러|\d+\s*개/;
// 상세 화면 밖에서는 "지금 작성 중인 내용"과 헷갈리지 않게 소식이라는 말이 있어야 소식 하나를 가리킨다고 본다
const pointsAtOneNews = (request: string) =>
  /새\s*소식|소식|공지/.test(request) && CURRENT_NEWS_REQUEST.test(request) && !NEWS_LIST_REQUEST.test(request);
// 방금 본 소식을 분명히 가리키는 말 — 이때는 되묻지 않고 그 소식을 읽는다
const LAST_NEWS_REQUEST = /아까|방금|보던|봤던|본\s*(새\s*소식|소식|공지)/;
// 소식 하나를 순서로 집어 화면으로 열어 달라는 요청("가장 최근 새소식 보여줘") — 목록 조회를 후보로 두면 목록을 읽고
// "새 소식 11가지가 있어요"로 답했다. 이때는 목록·본문 조회를 빼고 상세 화면을 여는 open_news 만 남긴다.
// 요약·질문("최근 새소식 알려줘", "무슨 내용이야?")은 채팅 답변이 맞으므로 열지 않는다.
const ONE_NEWS_BY_ORDER =
  /가장|제일|최신|마지막|맨\s*(위|처음|앞)|첫\s*번째|첫\s*(새\s*소식|소식|공지)|\d+\s*번째|(두|세|네|다섯)\s*번째|새로\s*(나온|올라온|올린)/;
const OPEN_REQUEST = /보여|열어|띄워|가\s*줘|가자|이동|들어가|보고\s*싶|볼래|읽을래|읽고\s*싶/;
const NOT_OPEN_REQUEST = /요약|정리|알려|몇|무슨|뭐|어떤|설명|목록|전체|모든|여러|\d+\s*개/;
const opensOneNews = (request: string) =>
  /새\s*소식|소식|공지/.test(request) &&
  ONE_NEWS_BY_ORDER.test(request) &&
  OPEN_REQUEST.test(request) &&
  !NOT_OPEN_REQUEST.test(request);
const ORDINALS: Record<string, number> = { 첫: 1, 두: 2, 세: 3, 네: 4, 다섯: 5 };
const rankFromRequest = (request: string) => {
  const digits = /(\d+)\s*번째/.exec(request);
  if (digits) return Number(digits[1]);
  const word = /(첫|두|세|네|다섯)\s*번째/.exec(request) ?? /(첫)\s*(새\s*소식|소식|공지)/.exec(request);
  return word ? ORDINALS[word[1]] : null;
};
// 대화에서 방금 다룬 소식을 가리켜 열어 달라는 요청("그거 보여줘") — 본문을 읽어 채팅으로 늘어놓지 않고 그 소식 화면을 연다.
// 대화에서 가장 최근에 다룬 것이 새소식일 때만(focus.latest) 소식으로 본다 — 보고서 얘기 뒤의 "그거 보여줘"까지 소식으로 열지 않게
const POINTING_REQUEST =
  /그거|그것|그걸|이거|이것|이걸|저거|[이그저]\s*(새\s*소식|소식|공지|글)|방금\s*(말한|그|본)|말한\s*(거|것|소식)/;
const opensMentionedNews = (request: string) =>
  useAgentChatStore.getState().focus.latest === 'news' &&
  POINTING_REQUEST.test(request) &&
  OPEN_REQUEST.test(request) &&
  !NOT_OPEN_REQUEST.test(request) &&
  rankFromRequest(request) === null;
const opensNews = (request: string) => opensOneNews(request) || opensMentionedNews(request);

// 답변 뒤 버튼 — 소식 하나를 상세 화면으로 연다
const openNewsAction = (id: string, label: string): AgentQuickAction => ({
  id: `open-news-${id}`,
  label,
  action: { type: 'tool', tool: 'open_news', title: '새소식 열기', input: { id } },
  needsAi: false,
});
const resultJson = (result: WebMcpToolResult) => {
  try {
    return JSON.parse(result.content.map((c) => c.text).join('')) as Record<string, unknown>;
  } catch {
    return null;
  }
};

// 소식 발행일 — KST 날짜에 요일을 붙인다("2026-10-26 10/26(월)"). 요일이 없으면 모델이 지어냈다(월요일을 화요일로)
const newsDate = (publishedAt: string) => {
  const key = kstDateKey(new Date(publishedAt));
  return `${key} ${dayLabel(key)}`;
};

type NewsRef = { id: string; title: string };
const newestOf = (result: WebMcpToolResult) => (resultJson(result)?.news as Array<NewsRef> | undefined)?.[0] ?? null;
// 결과에 담긴 소식(id·title)을 대화의 대상으로
const newsFocus = (news: Partial<NewsRef> | null) =>
  news && typeof news.id === 'string' && typeof news.title === 'string'
    ? { news: { id: news.id, title: news.title } }
    : null;

const THEME_LABELS: Record<Theme, string> = { light: '라이트 모드', dark: '다크 모드', system: '시스템 설정' };

// 세 가지 인증 상태 중 회원인지. 게스트 쿠키가 있으면 Supabase 호출을 건너뛴다(stale refresh token 회피).
// 비인증은 미들웨어가 게스트로 승격시키므로 회원이 아니면 모두 비회원으로 본다.
const resolveViewer = async (): Promise<{ isMember: boolean; email: string | null }> => {
  if (isGuestMode()) return { isMember: false, email: null };
  try {
    const { data } = await createClient().auth.getUser();
    return { isMember: !!data.user, email: data.user?.email ?? null };
  } catch {
    return { isMember: false, email: null };
  }
};

// 클라이언트 이동은 비동기라, 주소가 바뀔 때까지 잠시 기다려 다음 도구가 새 화면 기준으로 돌게 한다
const waitForPath = (path: string) =>
  new Promise<boolean>((resolve) => {
    const startedAt = Date.now();
    const check = () => {
      if (window.location.pathname === path) resolve(true);
      else if (Date.now() - startedAt > AGENT_NAVIGATE_WAIT_MS) resolve(false);
      else setTimeout(check, 100);
    };
    check();
  });

// (app) 그룹 어느 화면에서나 쓰는 도구 — 현재 화면 정보, 화면 이동, 화면 모드, 새소식 조회.
// 계정·인증·로그인 수단·데이터 삭제는 도구로 노출하지 않는다(설정 화면으로 이동만 돕는다).
export function useGlobalAgentTools() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { theme, setTheme } = useTheme();
  // 도구는 등록 시점에 한 번 만들어지므로, 실행 시점의 최신 값을 ref 로 읽는다
  const latest = useRef({ theme, setTheme, router });
  useEffect(() => {
    latest.current = { theme, setTheme, router };
  });

  // 받아 둔 소식 제목(AgentPathTracker 가 상세 화면을 열 때 미리 받는다) — 모델과 되묻는 문장이 어느 소식인지 이름으로 말하게
  const cachedNewsTitle = (id: string) =>
    queryClient.getQueryData<NewsDetail>(queries.news.detail(id).queryKey)?.title ??
    queryClient.getQueryData<NewsList>(queries.news.list().queryKey)?.items.find((n) => n.id === id)?.title ??
    null;

  // id 없이 가리킨 소식 하나 — 요청의 순서("가장 최근"·"두 번째"), "이거·그거"(보고 있는 소식 → 대화에서 다룬 소식 → 마지막으로 본 소식).
  // 채팅 밖(WebMCP)에서는 rank 로만 찾는다
  const newsIdFor = async (request: string | undefined, rankInput: unknown) => {
    const { items } = await queryClient.fetchQuery(queries.news.list());
    if (!request) {
      const rank = Number(rankInput);
      return Number.isInteger(rank) && rank >= 1 ? (items[rank - 1]?.id ?? null) : null;
    }
    const rank = rankFromRequest(request) ?? (ONE_NEWS_BY_ORDER.test(request) || /최근|새로/.test(request) ? 1 : null);
    if (rank) return items[rank - 1]?.id ?? null;
    const viewing = newsIdFromPath(window.location.pathname);
    const { focus, lastNewsId } = useAgentChatStore.getState();
    return viewing ?? (focus.latest === 'news' ? focus.news?.id : undefined) ?? lastNewsId ?? null;
  };

  useAgentTools(
    (): Array<AgentTool> => [
      {
        name: 'get_app_context',
        title: '현재 화면 확인',
        kind: 'read',
        description:
          'Return the current screen (path, title), the user state (member = logged in / guest), the color theme and the screens you can navigate to. Call it first when unsure what is possible.',
        inputSchema: { type: 'object', properties: {} },
        annotations: { readOnlyHint: true },
        execute: async () => {
          const viewer = await resolveViewer();
          return toolText({
            path: window.location.pathname,
            title: document.title,
            viewer: viewer.isMember ? 'member' : 'guest',
            email: viewer.email,
            theme: latest.current.theme,
            pages: PAGE_KEYS.filter((key) => {
              const page: PageEntry = AGENT_PAGES[key];
              return viewer.isMember ? !page.guestOnly : !page.memberOnly;
            }).map((key) => ({ page: key, label: AGENT_PAGES[key].label })),
          });
        },
      },
      {
        name: 'navigate',
        title: '화면 이동',
        kind: 'navigate',
        // 소식 하나를 열어 달라는 요청은 open_news 가 연다 — 함께 두면 "그거 보여줘"에 새소식 목록 화면으로 옮겼다
        requires: (request) => !opensNews(request),
        // 지금 화면을 알아야 "이미 이 화면"·"뒤로" 같은 요청을 판단한다
        inputContext: () => ({ currentPath: window.location.pathname }),
        description: `Go to another screen in the app. page is one of ${PAGE_KEYS.join(', ')}, news_detail. news_detail needs newsId (an id from list_news); to open the newest or the n-th news use open_news instead. settings* screens are for members only; login is for guests only. After moving, that screen's tools appear and the previous screen's tools disappear.`,
        inputSchema: {
          type: 'object',
          properties: {
            page: { type: 'string', enum: [...PAGE_KEYS, 'news_detail'], description: 'Screen to go to' },
            newsId: { type: 'string', description: 'News id when page is news_detail' },
          },
          required: ['page'],
        },
        execute: async (input) => {
          const viewer = await resolveViewer();
          let path: string;
          if (input.page === 'news_detail') {
            if (typeof input.newsId !== 'string' || !isNewsId(input.newsId))
              return toolError('news_detail 로 이동하려면 list_news 결과의 id 를 newsId 로 주세요.');
            path = `/whats-new/${input.newsId}`;
          } else {
            if (typeof input.page !== 'string' || !(input.page in AGENT_PAGES))
              return toolError(`page 는 ${PAGE_KEYS.join(', ')}, news_detail 중 하나여야 합니다.`);
            const page: PageEntry = AGENT_PAGES[input.page as PageKey];
            // 로그인 화면으로 대신 옮기지 않고 묻는다 — 오류에 "로그인하도록 안내하세요"를 적었더니 채팅이 바로 로그인 화면으로 옮겼다
            if (page.memberOnly && !viewer.isMember)
              return toolUnavailable({
                reason: `${page.label.split(' — ')[0]} 화면은 로그인한 회원만 쓸 수 있어요.`,
                offer: '로그인 화면으로 갈까요?',
              });
            if (page.guestOnly && viewer.isMember)
              return toolText({ moved: false, path: window.location.pathname, message: '이미 로그인되어 있어요.' });
            path = page.path;
          }

          if (window.location.pathname === path)
            return toolText({ moved: false, path, message: '이미 이 화면입니다.' });
          latest.current.router.push(path);
          const arrived = await waitForPath(path);
          const label =
            input.page === 'news_detail' ? '새소식' : AGENT_PAGES[input.page as PageKey].label.split(' — ')[0];
          return toolText({ moved: true, path, arrived, message: `${label} 화면으로 이동했어요.` });
        },
      },
      {
        name: 'set_theme',
        title: '화면 모드 바꾸기',
        kind: 'setting',
        description: 'Change the color theme: light, dark, or system (follow the device). Saved on this device.',
        // "반대로 바꿔줘"·"원래대로" 같은 요청은 지금 모드를 알아야 채울 수 있다
        inputContext: () => ({ currentTheme: latest.current.theme }),
        inputSchema: {
          type: 'object',
          properties: { theme: { type: 'string', enum: ['light', 'dark', 'system'], description: 'Color theme' } },
          required: ['theme'],
        },
        execute: async (input, context) => {
          const next = input.theme;
          if (next !== 'light' && next !== 'dark' && next !== 'system')
            return toolError('theme 은 "light", "dark", "system" 중 하나여야 합니다.');
          const prev = latest.current.theme;
          // 바뀐 게 없으면 이유를 알린다 — 없을 때 "바뀐 것은 없어요."로만 끝났다
          if (prev === next)
            return toolText({
              changed: false,
              theme: next,
              message: `이미 ${THEME_LABELS[next]}${next === 'system' ? '이에요' : '예요'}.`,
            });
          latest.current.setTheme(next);
          toast.success(`${THEME_LABELS[next]}로 변경되었습니다.`);
          context.reportChange?.({
            lines: [`화면 모드 ${THEME_LABELS[prev]} → ${THEME_LABELS[next]}`],
            // 그사이 사용자가 직접 바꿨으면 되돌리지 않는다
            undo: () => {
              if (latest.current.theme !== next) return false;
              latest.current.setTheme(prev);
              return true;
            },
          });
          return toolText({ changed: true, theme: next });
        },
      },
      {
        name: 'list_news',
        title: '새소식 목록 조회',
        kind: 'read',
        description: `Return up to ${AGENT_NEWS_LIST_LIMIT} service news/updates (새소식), newest first (id, title, date). Members and guests see different news. Read the body with get_news.`,
        // 보고 있는(방금 본) 소식을 가리키면 get_news 가 그 소식을 바로 읽는다 — 목록도 함께 가리킬 때만 남긴다.
        // 가리킬 소식이 없으면 get_news 의 unavailable 이 되묻는다(목록으로 조용히 대신하지 않는다)
        requires: (request, scope) =>
          !opensNews(request) &&
          (newsIdFromPath(scope.path)
            ? !CURRENT_NEWS_REQUEST.test(request) || NEWS_LIST_REQUEST.test(request)
            : !pointsAtOneNews(request)),
        inputSchema: { type: 'object', properties: {} },
        annotations: { readOnlyHint: true },
        // 목록을 읽으면 Nano는 가장 새 소식부터 말한다 — 이어지는 "그거 보여줘"는 그 소식이다
        focus: (_input, result) => newsFocus(newestOf(result)),
        // 목록을 답한 뒤 가장 새 소식을 바로 열 수 있게 묻고 버튼을 둔다
        followUp: (_input, result, scope) => {
          const newest = newestOf(result);
          if (!newest) return null;
          return {
            ask: `'${newest.title}' 소식을 자세히 보시겠어요?`,
            actions: [
              openNewsAction(newest.id, '가장 최근 소식 열기'),
              ...(scope.path === AGENT_PAGES.whats_new.path
                ? []
                : [
                    {
                      id: 'go-whats-new',
                      label: '새소식 목록 보기',
                      action: { type: 'tool', tool: 'navigate', title: '화면 이동', input: { page: 'whats_new' } },
                      needsAi: false,
                    } satisfies AgentQuickAction,
                  ]),
            ],
          };
        },
        execute: async () => {
          const { isMember, items } = await queryClient.fetchQuery(queries.news.list());
          return toolText({
            viewer: isMember ? 'member' : 'guest',
            total: items.length,
            news: items.slice(0, AGENT_NEWS_LIST_LIMIT).map((n) => ({
              id: n.id,
              title: n.title,
              publishedAt: newsDate(n.published_at),
            })),
          });
        },
      },
      {
        name: 'get_news',
        title: '새소식 읽기',
        kind: 'read',
        description:
          'Return the body (markdown) of one news item. id comes from list_news, currentNewsId when the user is reading one (이 소식), or lastViewedNewsId for the news the user just read (아까 본 소식). Without an id, give rank (1 = newest).',
        // "가장 최근 새소식 보여줘"는 화면으로 연다(open_news) — 본문을 읽어 채팅으로 답하지 않는다
        requires: (request) => !opensNews(request),
        // 새소식 상세 화면에서 "이거 요약해줘" — 보고 있는 소식의 id 를 넘겨 목록 조회 없이 바로 읽게 한다.
        // 요청할 때의 화면 기준이라 응답을 기다리는 사이 화면을 옮겨도 그 소식을 읽는다. 상세 화면 밖이면 마지막으로 본 소식을 넘긴다.
        inputContext: (scope) => {
          const viewing = newsIdFromPath(scope.path);
          if (viewing) return { currentNewsId: viewing, currentNewsTitle: cachedNewsTitle(viewing) };
          const last = useAgentChatStore.getState().lastNewsId;
          return last
            ? { viewingNews: false, lastViewedNewsId: last, lastViewedNewsTitle: cachedNewsTitle(last) }
            : { viewingNews: false };
        },
        // 소식 하나를 가리켰는데 요청할 때 상세 화면이 아니었으면, 목록 전체로 대신하지 않고 못 찾은 사실과 대안을 묻는다
        unavailable: (request, scope) => {
          if (newsIdFromPath(scope.path) || !pointsAtOneNews(request)) return null;
          const last = useAgentChatStore.getState().lastNewsId;
          if (last && LAST_NEWS_REQUEST.test(request)) return null;
          if (last) {
            const title = cachedNewsTitle(last);
            return {
              reason: '지금은 새소식을 보고 있지 않아 어느 소식인지 찾지 못했어요.',
              offer: `방금 보신 ${title ? `'${title}' ` : ''}소식으로 할까요?`,
            };
          }
          return {
            reason: '지금 보고 계신 새소식을 찾지 못했어요.',
            offer: '대신 최근 새소식을 살펴볼까요?',
          };
        },
        inputSchema: {
          type: 'object',
          properties: {
            id: { type: 'string', description: 'News id. Omit it if you do not have a real id.' },
            rank: { type: 'integer', minimum: 1, description: '1 = newest, when there is no id' },
          },
        },
        focus: (_input, result) => newsFocus(resultJson(result)),
        annotations: { readOnlyHint: true },
        // 본문을 채팅으로 읽어 준 뒤, 그 소식 화면이 아니면 화면에서 열 수 있게 묻는다
        followUp: (_input, result, scope) => {
          const read = resultJson(result);
          if (typeof read?.id !== 'string' || newsIdFromPath(scope.path) === read.id) return null;
          return { ask: '화면에서 자세히 보시겠어요?', actions: [openNewsAction(read.id, '이 소식 열기')] };
        },
        execute: async (input, context) => {
          // 모델이 id 를 지어내곤 해("가장 최근 새소식 알려줘"에 없는 id 로 불러 매번 실패했다) 받은 id 로 못 찾으면
          // 요청의 순서("가장 최근"·"두 번째")나 대화에서 다룬 소식으로 찾는다
          const byId =
            typeof input.id === 'string' && isNewsId(input.id)
              ? await queryClient.fetchQuery(queries.news.detail(input.id))
              : null;
          const fallbackId = byId ? null : await newsIdFor(context.request, input.rank);
          const item = byId ?? (fallbackId ? await queryClient.fetchQuery(queries.news.detail(fallbackId)) : null);
          if (!item)
            return toolUnavailable({
              reason: '그 새소식은 찾을 수 없거나 지금 볼 수 없는 소식이에요.',
              offer: '대신 최근 새소식 목록을 살펴볼까요?',
            });
          return toolText({
            id: item.id,
            title: item.title,
            publishedAt: newsDate(item.published_at),
            content: item.content.slice(0, AGENT_NEWS_CONTENT_MAX_CHARS),
          });
        },
      },
      {
        name: 'open_news',
        title: '새소식 열기',
        kind: 'navigate',
        // "보여줘"는 조회로 분류되곤 해서 조회 의도에도 둔다 — 소식 하나를 순서로 집거나 방금 다룬 소식을 가리켜 열어 달라고 할 때만 후보다
        extraKinds: ['read'],
        requires: (request) => opensNews(request),
        focus: (_input, result) => newsFocus(resultJson(result)),
        description:
          'Open the detail screen of one news item (새소식) so the user can read it. rank 1 = the newest (가장 최근·최신), 2 = the second newest. Also opens the news just talked about in the conversation (그거 보여줘). Use this for 보여줘/열어줘 on one news item.',
        inputSchema: {
          type: 'object',
          properties: {
            rank: { type: 'integer', minimum: 1, description: '1 = newest, 2 = second newest' },
            id: { type: 'string', description: 'News id from list_news, instead of rank' },
          },
        },
        execute: async (input, context) => {
          // 채팅에서는 순서를 요청 문장에서 읽는다 — 모델이 채운 값보다 정확하다. "가장 최근"·"최신"·"마지막"은 가장 새 소식이다
          const rank = context.request ? (rankFromRequest(context.request) ?? 1) : Number(input.rank ?? 1);
          if (!Number.isInteger(rank) || rank < 1) return toolError('rank 는 1 이상의 정수여야 합니다.');
          const { items } = await queryClient.fetchQuery(queries.news.list());
          if (items.length === 0) return toolText({ moved: false, message: '지금 볼 수 있는 새소식이 없어요.' });
          if (rank > items.length)
            return toolUnavailable({
              reason: `지금 볼 수 있는 새소식은 ${items.length}개예요.`,
              offer: '대신 가장 최근 새소식을 열까요?',
            });
          // "그거 보여줘" — 방금 대화에서 다룬 소식(볼 수 있는 소식일 때만)
          const mentionedId = useAgentChatStore.getState().focus.news?.id;
          const mentioned =
            context.request && opensMentionedNews(context.request)
              ? items.find((n) => n.id === mentionedId)
              : undefined;
          // 채팅 밖(답변 뒤 버튼·WebMCP)에서는 id 로 집을 수 있다 — 채팅에서는 모델이 지어낸 id 일 수 있어 쓰지 않는다
          const byId = context.request ? undefined : items.find((n) => n.id === input.id);
          const item = mentioned ?? byId ?? items[rank - 1];
          const path = `/whats-new/${item.id}`;
          const opened = { path, id: item.id, title: item.title };
          if (window.location.pathname === path)
            return toolText({ moved: false, ...opened, message: `이미 '${item.title}' 새소식을 보고 있어요.` });
          latest.current.router.push(path);
          const arrived = await waitForPath(path);
          return toolText({ moved: true, arrived, ...opened, message: `'${item.title}' 새소식을 열었어요.` });
        },
      },
    ],
    true
  );
}
