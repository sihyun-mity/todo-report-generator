'use client';

import { useEffect, useRef } from 'react';
import toast from 'react-hot-toast';
import { useQueryClient } from '@tanstack/react-query';
import type { AgentTool, Theme } from '@/types';
import { AGENT_NAVIGATE_WAIT_MS, AGENT_NEWS_CONTENT_MAX_CHARS, AGENT_NEWS_LIST_LIMIT, AGENT_PAGES } from '@/constants';
import { useAgentTools, useRouter } from '@/hooks';
import { isGuestMode } from '@/lib/guest';
import { createClient } from '@/lib/supabase/client';
import { toolError, toolText } from '@/lib/webmcp';
import { queries } from '@/providers';
import { useTheme } from '..';

type PageKey = keyof typeof AGENT_PAGES;
type PageEntry = { path: string; label: string; memberOnly?: boolean; guestOnly?: boolean };

const PAGE_KEYS = Object.keys(AGENT_PAGES) as Array<PageKey>;
const NEWS_ID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

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
        // 지금 화면을 알아야 "이미 이 화면"·"뒤로" 같은 요청을 판단한다
        inputContext: () => ({ currentPath: window.location.pathname }),
        description: `Go to another screen in the app. page is one of ${PAGE_KEYS.join(', ')}, news_detail. news_detail needs newsId (an id from list_news). settings* screens are for members only; login is for guests only. After moving, that screen's tools appear and the previous screen's tools disappear.`,
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
            if (typeof input.newsId !== 'string' || !NEWS_ID_REGEX.test(input.newsId))
              return toolError('news_detail 로 이동하려면 list_news 결과의 id 를 newsId 로 주세요.');
            path = `/whats-new/${input.newsId}`;
          } else {
            if (typeof input.page !== 'string' || !(input.page in AGENT_PAGES))
              return toolError(`page 는 ${PAGE_KEYS.join(', ')}, news_detail 중 하나여야 합니다.`);
            const page: PageEntry = AGENT_PAGES[input.page as PageKey];
            if (page.memberOnly && !viewer.isMember)
              return toolError('로그인 회원만 쓸 수 있는 화면입니다. 먼저 로그인하도록 안내하세요(page: login).');
            if (page.guestOnly && viewer.isMember) return toolError('이미 로그인되어 있습니다.');
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
          if (prev === next) return toolText({ changed: false, theme: next });
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
        inputSchema: { type: 'object', properties: {} },
        annotations: { readOnlyHint: true },
        execute: async () => {
          const { isMember, items } = await queryClient.fetchQuery(queries.news.list());
          return toolText({
            viewer: isMember ? 'member' : 'guest',
            total: items.length,
            news: items.slice(0, AGENT_NEWS_LIST_LIMIT).map((n) => ({
              id: n.id,
              title: n.title,
              publishedAt: n.published_at.slice(0, 10),
            })),
          });
        },
      },
      {
        name: 'get_news',
        title: '새소식 읽기',
        kind: 'read',
        description:
          'Return the body (markdown) of one news item. id comes from list_news, or currentNewsId when the user is reading one (이 소식).',
        // 새소식 상세 화면에서 "이거 요약해줘" — 보고 있는 소식의 id 를 넘겨 목록 조회 없이 바로 읽게 한다
        inputContext: () => {
          const id = /^\/whats-new\/([^/]+)$/.exec(window.location.pathname)?.[1];
          return id && NEWS_ID_REGEX.test(id) ? { currentNewsId: id } : { currentPath: window.location.pathname };
        },
        inputSchema: {
          type: 'object',
          properties: { id: { type: 'string', description: 'News id' } },
          required: ['id'],
        },
        annotations: { readOnlyHint: true },
        execute: async (input) => {
          if (typeof input.id !== 'string' || !NEWS_ID_REGEX.test(input.id))
            return toolError('id 는 list_news 결과의 소식 id 여야 합니다.');
          const item = await queryClient.fetchQuery(queries.news.detail(input.id));
          if (!item) return toolError('볼 수 있는 소식이 아닙니다. list_news 로 id 를 다시 확인하세요.');
          return toolText({
            id: item.id,
            title: item.title,
            publishedAt: item.published_at.slice(0, 10),
            content: item.content.slice(0, AGENT_NEWS_CONTENT_MAX_CHARS),
          });
        },
      },
    ],
    true
  );
}
