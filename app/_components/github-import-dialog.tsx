'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  AlertCircle,
  ArrowDown,
  Building2,
  CalendarClock,
  Check,
  CircleCheck,
  CircleDashed,
  CircleMinus,
  Cpu,
  Database,
  Download,
  EyeOff,
  FolderGit2,
  Github,
  Inbox,
  Info,
  Loader2,
  LoaderCircle,
  Lock,
  LogIn,
  type LucideIcon,
  RefreshCw,
  ShieldCheck,
  Sparkles,
  Unplug,
} from 'lucide-react';
import toast from 'react-hot-toast';
import { useScrollLock } from 'usehooks-ts';
import type {
  ClassifyProgress,
  ClassifyThought,
  CommitClassifyStage,
  CommitImportPlan,
  GithubImportIntent,
  PlannedTask,
  Project,
  ReportHistoryItem,
  ReportHistoryMode,
} from '@/types';
import { disconnectGithub } from '@/actions';
import {
  COMMIT_CLASSIFY_COMPLETE_HOLD_MS,
  GITHUB_IMPORT_INTENT_COOKIE,
  GITHUB_IMPORT_INTENT_MAX_AGE_SECONDS,
  GITHUB_COMMITS_CLASSIFY_LIMIT,
  GITHUB_COMMITS_MAX_LOOKBACK_DAYS,
  GITHUB_IMPORT_OAUTH_SCOPES,
  GITHUB_MAX_REPOS,
  GITHUB_TOKEN_TTL_DAYS,
} from '@/constants';
import { CloseButton, Portal, useDismissOnBack } from '@/components';
import { COMMIT_CLASSIFY_STAGE, COMMIT_CLASSIFY_STAGE_VALUES } from '@/enums';
import { useDismissLayer, useFollowScroll } from '@/hooks';
import { classifyCommits } from '@/lib/commit-classifier/classify-commits';
import {
  readCommitImportMemory,
  repoExcludeSuggestions,
  setCommitAuthor,
  setRepoExcluded,
  toggleCommitAuthors,
  toggleExcludedRepo,
} from '@/lib/commit-classifier/memory';
import { downloadPromptModel, getPromptApiAvailability } from '@/lib/prompt-api';
import {
  hasSeenPromptAiNotice,
  markPromptAiNoticeSeen,
  type PromptAiNoticeKind,
  promptAiNoticeKind,
} from '@/lib/commit-classifier/prompt-api';
import { createClient } from '@/lib/supabase/client';
import { queries } from '@/providers';
import { addsToExistingTask, cn } from '@/utils';
import { CommitAuthorsMenu, ExcludedReposMenu, GithubImportPreview, GithubRepoGaps } from '.';

type GithubImportDialogProps = {
  // 커밋 가져오기는 로그인 회원 전용 — 게스트에게는 로그인 안내만 보여주고 조회·분류를 시작하지 않는다
  viewerMode: ReportHistoryMode;
  // 보정 메모리 주인(회원 id)
  userId: string | null;
  // 분류 후보 — 금일 폼 + 오늘의 목표(`withTodayGoalCandidates`)
  todayProjects: ReadonlyArray<Project>;
  // todayProjects 중 오늘의 목표 작업 id — 커밋이 붙으면 적용할 때 금일 업무로 옮긴다
  goalTaskIds: ReadonlySet<string>;
  // 가져오는 보고서 날짜('YYYY-MM-DD') — 이 날짜에 이미 넣은 작업과 비슷한 작업은 해제해 둔다
  reportDateKey: string;
  history: ReadonlyArray<ReportHistoryItem>;
  // 이 범위의 커밋을 가져온다 (`commitImportRange` — 직전 보고서 작성 시각부터, untilMs 가 null 이면 지금까지)
  sinceMs: number;
  untilMs: number | null;
  onClose: () => void;
  // original 은 사용자가 고치기 전의 분류 결과 — 보정 메모리는 둘을 비교해 사용자가 실제로 고친 것만 배운다
  onApply: (plan: CommitImportPlan, original: CommitImportPlan) => void;
};

const timeLabel = (iso: string) =>
  new Intl.DateTimeFormat('ko-KR', { month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit' }).format(
    new Date(iso)
  );

// 저장소 상한에 걸려 찾아보지 않은 저장소가 있을 때의 안내 — 미리보기와 빈 화면이 같이 쓴다.
// 제외한 저장소는 상한을 세기 전에 빠지므로, 업무와 무관한 저장소를 제외하면 남은 저장소가 그 자리에 들어온다.
const reposCappedNotice = (reposCapped: number) =>
  `최근 작업한 저장소 ${GITHUB_MAX_REPOS}개만 찾아봤어요(${reposCapped}개 더 있어요). 업무와 상관없는 저장소를 제외하면 나머지도 찾아봐요.`;

// 범위가 잘렸거나(최대 조회 기간·저장소 상한) 분류 상한을 넘어 빠진 커밋이 있을 때 미리보기에 보여 줄 안내. 없으면 null.
// 순서: 기간 → 저장소 수 → 건수 → 날짜 바꾸기. 저장소마다의 사정(SSO·브랜치 등)은 `GithubRepoGaps` 가 따로 보인다.
// 빠진 커밋이 범위 안의 이전 날짜에 있을 수 있으면, 지난 날짜 보고서는 그날 커밋만 가져온다는 점을 함께 알린다.
const omissionNotice = (result: {
  since: string;
  until: string | null;
  clipped: boolean;
  omitted: number;
  pageCapped: boolean;
  reposCapped: number;
  commits: ReadonlyArray<unknown>;
}) => {
  if (!result.clipped && result.omitted === 0 && result.reposCapped === 0) return null;
  const lines: Array<string> = [];
  if (result.clipped) {
    lines.push(
      `마지막 보고 후 ${GITHUB_COMMITS_MAX_LOOKBACK_DAYS}일이 넘어 최근 ${GITHUB_COMMITS_MAX_LOOKBACK_DAYS}일 커밋만 가져왔어요.`
    );
  }
  if (result.reposCapped > 0) lines.push(reposCappedNotice(result.reposCapped));
  if (result.omitted > 0) {
    // 한 페이지가 꽉 찬 조회가 있으면 실제 커밋은 더 많을 수 있다
    const total = `${result.commits.length + result.omitted}건${result.pageCapped ? ' 이상' : ''}`;
    lines.push(`커밋이 ${total}이라 최근 ${GITHUB_COMMITS_CLASSIFY_LIMIT}건만 분류했어요.`);
  }
  if (result.omitted === 0 && !result.clipped) return lines.join(' ');
  const end = result.until ? new Date(new Date(result.until).getTime() - 1) : new Date();
  if (result.clipped || new Date(result.since).toDateString() !== end.toDateString()) {
    lines.push('빠진 커밋은 보고서 날짜를 그날로 바꿔 가져올 수 있어요.');
  }
  return lines.join(' ');
};

// "10월 20일 오후 06:00 이후" / 지난 날짜 보고서면 "10월 20일 오후 06:00부터 10월 21일 오전 12:00까지"
const rangeLabel = ({ since, until }: { since: string; until: string | null }) =>
  until ? `${timeLabel(since)}부터 ${timeLabel(until)}까지` : `${timeLabel(since)} 이후`;

// "@login" / 추가 작성자가 있으면 "@login 외 2명"
const authorsLabel = ({ login, extraAuthors }: { login: string; extraAuthors: ReadonlyArray<string> }) =>
  extraAuthors.length ? `@${login} 외 ${extraAuthors.length}명` : `@${login}`;

// 미리보기에서 저장소를 제외하면 그 저장소 커밋을 빼고, 커밋이 남지 않은 작업·프로젝트는 지운다
const removeRepoFromPlan = (plan: CommitImportPlan, repo: string): CommitImportPlan => ({
  ...plan,
  projects: plan.projects
    .map((p) => ({
      ...p,
      repos: p.repos.filter((r) => r !== repo),
      tasks: p.tasks
        .map((t) => ({ ...t, commits: t.commits.filter((c) => c.repo !== repo) }))
        .filter((t) => t.commits.length > 0),
    }))
    .filter((p) => p.tasks.length > 0),
});

// 폼의 작업 — 기존 작업에 붙은 계획 작업이 더하는 게 있는지 견줄 때 쓴다
const findFormTask = (projects: ReadonlyArray<Project>, taskId: string | null) =>
  taskId === null ? undefined : projects.flatMap((p) => p.tasks).find((t) => t.id === taskId);

// 체크했고, 폼에 실제로 더하는 게 있는 작업만 센다 — 작업명이 같은 기존 작업에서 세부 항목을 모두 지우면(진행률도 그대로면)
// 넣을 게 없어 "기존 작업에 추가"로 세지 않는다
const isApplicable = (task: PlannedTask, projects: ReadonlyArray<Project>) =>
  task.included && task.content.trim() !== '' && addsToExistingTask(task, findFormTask(projects, task.existingTaskId));

// 미리보기 상단 요약 — 체크한 작업 기준으로 센다
const summarize = (plan: CommitImportPlan, projects: ReadonlyArray<Project>) => {
  const tasks = plan.projects.flatMap((p) => p.tasks.filter((t) => isApplicable(t, projects)));
  return {
    linkedTasks: tasks.filter((t) => t.existingTaskId !== null).length,
    newTasks: tasks.filter((t) => t.existingTaskId === null).length,
    newProjects: plan.projects.filter(
      (p) => p.existingProjectId === null && p.tasks.some((t) => isApplicable(t, projects))
    ).length,
    repos: new Set(plan.projects.flatMap((p) => p.repos)).size,
    // 미리보기에서 저장소를 제외하면 줄어든다
    commits: plan.projects.reduce((sum, p) => sum + p.tasks.reduce((s, t) => s + t.commits.length, 0), 0),
  };
};

const countIncluded = (plan: CommitImportPlan, projects: ReadonlyArray<Project>) =>
  plan.projects.reduce((sum, p) => sum + p.tasks.filter((t) => isApplicable(t, projects)).length, 0);

// 열려 있는 동안만 마운트된다(부모가 조건부 렌더). 닫으면 state 가 통째로 사라져 다음에 새로 조회한다.
// 흐름: 연결 확인 → (미연결이면 OAuth 안내) → 커밋 조회(Server Action) → 온디바이스 분류 → 미리보기 편집 → 적용
export function GithubImportDialog({
  viewerMode,
  userId,
  todayProjects,
  goalTaskIds,
  reportDateKey,
  history,
  sinceMs,
  untilMs,
  onClose,
  onApply,
}: Readonly<GithubImportDialogProps>) {
  const modalRef = useRef<HTMLDivElement | null>(null);
  const queryClient = useQueryClient();
  const { lock, unlock } = useScrollLock({ autoLock: false });
  const [progress, setProgress] = useState<ClassifyProgress | null>(null);
  // 분류 중 보여 줄 온디바이스 AI 의 판단 과정(최근 몇 단계)
  const [thoughts, setThoughts] = useState<ReadonlyArray<ClassifyThought>>([]);
  // 미리보기를 고친 뒤 "다시 분류"를 한 번 눌러 확인을 기다리는 중
  const [retryArmed, setRetryArmed] = useState(false);
  const [draft, setDraft] = useState<CommitImportPlan | null>(null);
  const [draftSource, setDraftSource] = useState<CommitImportPlan | null>(null);
  const [isDisconnecting, setIsDisconnecting] = useState(false);
  const [isConnecting, setIsConnecting] = useState(false);
  // 온디바이스 AI 모델 내려받기 진행률(0~1). null 이면 내려받는 중이 아님.
  const [modelDownload, setModelDownload] = useState<number | null>(null);
  // 아래 세 값은 보정 메모리(DB)를 처음 받아 왔을 때 채운다(memoryReady). 커밋 조회는 그 뒤에 시작한다.
  const [memoryReady, setMemoryReady] = useState(false);
  // 분류에서 뺀 저장소(회원별 메모리)
  const [excludedRepos, setExcludedRepos] = useState<ReadonlyArray<string>>([]);
  // 매번 작업을 넣지 않고 적용해 온 저장소 — 미리보기 저장소 칩에서 제외를 권한다(누를 때만 제외)
  const [suggestedExcludes, setSuggestedExcludes] = useState<ReadonlyArray<string>>([]);
  // 커밋 조회에 쓴 제외 목록 — 미리보기에서 제외할 때는 다시 조회하지 않고 그 저장소만 빼고,
  // 제외를 해제할 때만 그 저장소의 커밋을 불러오려고 다시 조회·분류한다.
  const [fetchExcludedRepos, setFetchExcludedRepos] = useState<ReadonlyArray<string>>([]);
  // 연결한 계정 외에 커밋을 함께 가져올 작성자(회원별 메모리). 바꾸면 다시 조회·분류한다.
  const [commitAuthors, setCommitAuthors] = useState<ReadonlyArray<string>>([]);
  // 이번에 분류 전 AI 안내를 넘겼는지(모델을 받았거나 저장소 기준 분류로 계속)
  const [aiNoticeConfirmed, setAiNoticeConfirmed] = useState(false);
  // 분류(queryFn)가 실행 시점의 제외 목록을 보도록 ref 로도 들고 있는다. 조회 때 뺀 저장소는 커밋에 없으므로
  // 이번 미리보기에서 바꾼 것만 담기면 된다(핸들러에서 갱신).
  const excludedRef = useRef<ReadonlyArray<string>>([]);

  // Esc 로는 닫지 않는다(분류·편집 중 실수로 닫히지 않게). 층은 차지해 Esc 가 아래로 내려가지 않는다.
  useDismissLayer(modalRef, onClose, { escape: false });
  useDismissOnBack(true, onClose);

  useEffect(() => {
    lock();
    return () => unlock();
  }, [lock, unlock]);

  const isMember = viewerMode === 'user';
  const connection = useQuery({
    ...queries.github.connection(),
    enabled: isMember,
    staleTime: 0,
    refetchOnWindowFocus: false,
  });
  const isConnected = connection.data?.connected === true;
  const login = connection.data?.connected ? connection.data.login : '';

  // 읽기 실패는 빈 메모리로 돌아온다 — 기억하지 못해도 가져오기는 동작한다
  const memory = useQuery({
    ...queries.github.memory(userId),
    queryFn: () => readCommitImportMemory(userId),
    enabled: isMember,
    staleTime: 0,
    gcTime: 0,
    refetchOnWindowFocus: false,
  });
  if (memory.data && !memoryReady) {
    setMemoryReady(true);
    setExcludedRepos(memory.data.excludedRepos);
    setFetchExcludedRepos(memory.data.excludedRepos);
    setCommitAuthors(memory.data.commitAuthors);
    setSuggestedExcludes(repoExcludeSuggestions(memory.data));
  }

  const commits = useQuery({
    ...queries.github.commits(sinceMs, untilMs, fetchExcludedRepos, commitAuthors),
    enabled: isConnected && memoryReady,
    staleTime: 0,
    gcTime: 0,
    refetchOnWindowFocus: false,
    retry: false,
  });
  const commitsResult = commits.data;
  const hasCommits = commitsResult?.ok === true && commitsResult.commits.length > 0;
  const notice = commitsResult?.ok ? omissionNotice(commitsResult) : null;
  // 상한·오류로 일부 저장소를 다 찾아보지 못했는지
  const isSearchPartial =
    commitsResult?.ok === true && (commitsResult.reposCapped > 0 || commitsResult.repoGaps.length > 0);

  // 온디바이스 AI 를 쓸 수 없으면(모델 미설치·미지원 브라우저) 분류 전에 이 기기에서 한 번 안내한다 —
  // 모델을 받거나 브라우저를 바꿔 AI 로 분류할지, 저장소 기준 분류로 계속할지 알고 고르게 한다.
  const aiAvailability = useQuery({
    ...queries.github.aiAvailability(),
    queryFn: async () => {
      const kind = promptAiNoticeKind(await getPromptApiAvailability());
      return { kind, seen: kind !== null && hasSeenPromptAiNotice(kind) };
    },
    enabled: isMember,
    staleTime: 0,
    gcTime: 0,
    refetchOnWindowFocus: false,
  });
  const aiNotice: PromptAiNoticeKind | null =
    aiAvailability.data?.kind && !aiAvailability.data.seen && !aiNoticeConfirmed ? aiAvailability.data.kind : null;
  const isAiChecked = aiAvailability.isSuccess && aiNotice === null;

  // 분류는 같은 커밋 조회 결과(조회 시각)마다 한 번만 돌린다.
  // signal 을 넘겨 두면 react-query 가 이전 분류를 취소한다 — 작성자·제외 목록이 바뀌어 다시 조회하면(키가 바뀌어
  // 관찰자가 없어지면) 또는 같은 키로 refetch 하면(다시 분류·제외 해제·모델 받은 뒤). 온디바이스 모델은 동시에
  // 호출하면 뒤 요청이 수 분간 멈추므로 이전 분류를 끝까지 돌리지 않는다.
  const plan = useQuery({
    ...queries.github.plan(commits.dataUpdatedAt),
    queryFn: async ({ signal }) => {
      setProgress(null);
      setThoughts([]);
      const result = await classifyCommits({
        userId,
        // 이번에 미리보기에서 뺀 저장소는 이미 받아 둔 커밋에도 들어 있어 여기서 거른다
        commits: commitsResult?.ok ? commitsResult.commits.filter((c) => !excludedRef.current.includes(c.repo)) : [],
        todayProjects,
        goalTaskIds,
        reportDateKey,
        history,
        signal,
        onProgress: setProgress,
        onThinking: (thought) =>
          setThoughts((current) =>
            current.some((t) => t.id === thought.id)
              ? current.map((t) => (t.id === thought.id ? thought : t))
              : [...current, thought]
          ),
      });
      // AI 분류는 모든 단계가 완료된 모습을 잠깐 보여 준 뒤 결과로 넘어간다. 규칙 분류는 기다림 없이 바로 끝나 그대로 보여 준다.
      if (result.classifier === 'ai')
        await new Promise((resolve) => setTimeout(resolve, COMMIT_CLASSIFY_COMPLETE_HOLD_MS));
      return result;
    },
    enabled: hasCommits && isAiChecked,
    staleTime: Infinity,
    gcTime: 0,
    refetchOnWindowFocus: false,
    retry: false,
  });

  // 분류 결과가 새로 오면 편집용 사본을 만든다 (effect 대신 렌더 중 비교)
  if (plan.data && plan.data !== draftSource) {
    setDraftSource(plan.data);
    setDraft(plan.data);
  }

  // 로그인에 쓰는 Supabase GitHub OAuth App 을 `repo` 스코프로 다시 거친다. GitHub 계정이 연동돼 있으면
  // 같은 계정으로 다시 로그인하고, 아니면 계정에 GitHub 를 연동한다. `/auth/callback` 이 provider token 을 받아 둔다.
  const handleConnect = async () => {
    setIsConnecting(true);
    try {
      const supabase = createClient();
      const { data: userData } = await supabase.auth.getUser();
      if (!userData.user) throw new Error('not_member');
      // 연결을 시작한 회원 id 와 복귀 경로를 단기 쿠키로 넘긴다. 콜백은 교환 결과가 같은 회원일 때만 토큰을 받는다
      // (브라우저의 다른 GitHub 계정으로 승인해 다른 회원으로 로그인된 경우 제외).
      const intent: GithubImportIntent = { userId: userData.user.id, next: window.location.pathname };
      document.cookie = `${GITHUB_IMPORT_INTENT_COOKIE}=${encodeURIComponent(JSON.stringify(intent))}; path=/; max-age=${GITHUB_IMPORT_INTENT_MAX_AGE_SECONDS}; samesite=lax`;
      const options = { scopes: GITHUB_IMPORT_OAUTH_SCOPES, redirectTo: `${window.location.origin}/auth/callback` };
      const { data } = await supabase.auth.getUserIdentities();
      const isLinked = data?.identities.some((identity) => identity.provider === 'github') ?? false;
      const { error } = isLinked
        ? await supabase.auth.signInWithOAuth({ provider: 'github', options })
        : await supabase.auth.linkIdentity({ provider: 'github', options });
      // 성공하면 GitHub 로 이동하므로 페이지가 떠난다
      if (error) {
        toast.error('GitHub 연결을 시작하지 못했습니다. 잠시 후 다시 시도해 주세요.');
        setIsConnecting(false);
      }
    } catch {
      toast.error('GitHub 연결을 시작하지 못했습니다. 잠시 후 다시 시도해 주세요.');
      setIsConnecting(false);
    }
  };

  const handleExcludeRepo = (repo: string) => {
    const next = toggleExcludedRepo(excludedRepos, repo, true);
    void setRepoExcluded(userId, repo, true);
    excludedRef.current = next;
    setExcludedRepos(next);
    setDraft((current) => (current ? removeRepoFromPlan(current, repo) : current));
    toast.success(`${repo} 저장소를 분류에서 뺐어요.`);
  };

  const handleIncludeRepo = (repo: string) => {
    const next = toggleExcludedRepo(excludedRepos, repo, false);
    void setRepoExcluded(userId, repo, false);
    excludedRef.current = next;
    setExcludedRepos(next);
    if (fetchExcludedRepos.includes(repo)) {
      // 조회 때부터 뺐던 저장소 — 그 저장소 커밋을 받아 오도록 다시 조회한다(새 조회 결과로 다시 분류된다).
      // 새 분류가 끝날 때까지 그 저장소가 빠진 이전 결과가 남아 있지 않도록 미리보기를 비운다.
      setDraft(null);
      setFetchExcludedRepos(next);
    } else {
      // 이번에 미리보기에서 뺐던 저장소 — 커밋은 이미 있으니 다시 분류만 한다
      setDraft(null);
      void plan.refetch();
    }
  };

  // 작성자를 바꾸면 받아 둔 커밋이 달라지므로 다시 조회한다(새 조회 결과로 다시 분류된다).
  // 새 분류가 끝날 때까지 이전 결과가 남아 있지 않도록 미리보기를 비운다.
  const handleChangeAuthor = (author: string, added: boolean) => {
    void setCommitAuthor(userId, author, added);
    setDraft(null);
    setRetryArmed(false);
    setCommitAuthors((current) => toggleCommitAuthors(current, [author], added));
  };

  // AI 응답은 실행마다 달라, 결과가 마음에 들지 않으면 같은 커밋으로 다시 분류한다(커밋은 다시 조회하지 않는다).
  // 미리보기를 고쳤다면 그 편집이 사라지므로 버튼을 한 번 더 눌러 확인받는다.
  const handleRetry = () => {
    if (draft !== draftSource && !retryArmed) {
      setRetryArmed(true);
      return;
    }
    setRetryArmed(false);
    setDraft(null);
    void plan.refetch();
  };

  const handleDisconnect = async () => {
    setIsDisconnecting(true);
    try {
      await disconnectGithub();
      // 받아 둔 분류 결과는 연결이 끊기면 더 이상 쓰지 않는다 — 연결 안내와 함께 적용 버튼이 남지 않게 비운다
      setDraft(null);
      setRetryArmed(false);
      await queryClient.invalidateQueries({ queryKey: queries.github.connection().queryKey });
      toast.success('GitHub 연결을 해제했습니다.');
    } finally {
      setIsDisconnecting(false);
    }
  };

  // 분류 전 안내에서 AI 없이 계속한다. 이 기기에서는 같은 상태로 다시 묻지 않는다.
  const handleContinueWithoutAi = (kind: PromptAiNoticeKind) => {
    markPromptAiNoticeSeen(kind);
    setAiNoticeConfirmed(true);
  };

  // 클릭 핸들러에서만 호출한다 — Chrome 이 모델 다운로드 시작에 사용자 활성화를 요구한다.
  // 분류 전 안내에서 받았으면 안내를 넘겨 분류를 시작하고, 미리보기(규칙 분류)에서 받았으면 다시 분류한다.
  const handleDownloadModel = async () => {
    const isBeforeClassify = aiNotice !== null;
    setModelDownload(0);
    try {
      await downloadPromptModel(setModelDownload);
      if (isBeforeClassify) {
        setAiNoticeConfirmed(true);
        return;
      }
      setDraft(null);
      await plan.refetch();
    } catch {
      toast.error('온디바이스 AI 모델을 내려받지 못했습니다.');
    } finally {
      setModelDownload(null);
    }
  };

  // 더할 게 있는지는 폼에 실제로 있는 작업과만 견준다 — 오늘의 목표는 아직 폼에 없어 옮기는 것만으로 더하는 게 된다
  const formProjects = todayProjects.map((p) => ({ ...p, tasks: p.tasks.filter((t) => !goalTaskIds.has(t.id)) }));
  const included = draft ? countIncluded(draft, formProjects) : 0;
  // 체크는 했지만 모두 폼에 이미 있는 그대로인 작업이면 고를 게 아니라 넣을 게 없다고 알린다
  const hasChecked = draft?.projects.some((p) => p.tasks.some((t) => t.included && t.content.trim())) ?? false;
  const canDownloadModel = draft?.aiAvailability === 'downloadable' || draft?.aiAvailability === 'downloading';

  const summary = draft ? summarize(draft, formProjects) : null;
  const isClassifyDone = progress?.current === null;
  // 본문이 미리보기를 보여 주는 동안에만 하단에 적용 버튼을 둔다(연결 안내·오류·내려받기 화면에서는 닫기만)
  const preview = isMember && isConnected && hasCommits && !plan.isError && modelDownload === null ? draft : null;

  return (
    <Portal>
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm sm:p-6">
        <div
          ref={modalRef}
          className="flex max-h-[90%] w-full max-w-2xl flex-col rounded-2xl border border-zinc-200 bg-white shadow-2xl dark:border-zinc-800 dark:bg-zinc-900"
        >
          <div className="flex items-start justify-between gap-3 border-b border-zinc-100 p-4 sm:p-6 dark:border-zinc-800">
            <div className="min-w-0">
              <h2 className="flex items-center gap-2 text-lg font-bold sm:text-xl">
                <Github className="h-5 w-5 text-blue-500" />
                GitHub 커밋 가져오기
              </h2>
              <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
                마지막 보고서 이후 작성한 커밋을 금일 업무 진행 현황에 정리해요.
              </p>
            </div>
            <CloseButton onClick={onClose} />
          </div>

          {/* flex 열: 자식은 기본적으로 내용 높이를 지키고(넘치면 본문이 스크롤), min-h-0 을 준 자식만 남은 높이에 맞춰 줄어든다 */}
          <div className="flex min-h-0 flex-1 flex-col overflow-y-auto p-4 sm:p-6">
            {viewerMode === 'guest' ? (
              <MembersOnlyGuide />
            ) : viewerMode === 'loading' || connection.isPending || (isConnected && !memoryReady) ? (
              <StatusPanel icon={Loader2} spin title="GitHub 연결 상태를 확인하고 있어요" />
            ) : !isConnected ? (
              <ConnectGuide onConnect={handleConnect} isConnecting={isConnecting} />
            ) : commits.isPending ? (
              <StatusPanel
                icon={Loader2}
                spin
                title="커밋을 불러오고 있어요"
                description={`@${login} 계정에서 활동한 저장소를 살펴보는 중이에요.${commitAuthors.length ? ` 추가 작성자 ${commitAuthors.length}명의 커밋도 함께 찾아요.` : ''}`}
              />
            ) : commitsResult && !commitsResult.ok ? (
              <StatusPanel
                icon={AlertCircle}
                tone="error"
                title="커밋을 불러오지 못했어요"
                description={commitsResult.message}
              >
                {commitsResult.reason === 'unauthorized' && (
                  <SecondaryButton icon={RefreshCw} onClick={handleConnect} disabled={isConnecting}>
                    다시 연결
                  </SecondaryButton>
                )}
              </StatusPanel>
            ) : commits.isError || !commitsResult?.ok ? (
              <StatusPanel
                icon={AlertCircle}
                tone="error"
                title="커밋을 불러오지 못했어요"
                description="잠시 후 다시 시도해 주세요."
              />
            ) : !hasCommits ? (
              // 다 찾아보지 못한 곳이 있으면 "커밋이 없다"고 단정하지 않는다 — 제목을 바꾸고 빠진 저장소를 펼쳐 보인다
              <div className="space-y-3">
                <StatusPanel
                  icon={Inbox}
                  title={isSearchPartial ? '찾은 커밋이 없어요' : '가져올 커밋이 없어요'}
                  description={`${rangeLabel(commitsResult)} ${authorsLabel(commitsResult)}${commitsResult.extraAuthors.length ? '이' : ' 계정으로'} 작성한 커밋을 찾지 못했어요.${commitsResult.clipped ? ` 마지막 보고 후 ${GITHUB_COMMITS_MAX_LOOKBACK_DAYS}일이 넘어 최근 ${GITHUB_COMMITS_MAX_LOOKBACK_DAYS}일만 찾아봤어요.` : ''}${commitsResult.reposCapped > 0 ? ` ${reposCappedNotice(commitsResult.reposCapped)}` : ''}${commitsResult.repoGaps.length ? ' 다만 아래 저장소는 다 찾아보지 못했어요.' : ''}${fetchExcludedRepos.length ? ` 제외한 저장소 ${fetchExcludedRepos.length}개는 불러오지 않았어요.` : ''}`}
                />
                <GithubRepoGaps gaps={commitsResult.repoGaps} defaultOpen />
              </div>
            ) : plan.isError ? (
              <StatusPanel
                icon={AlertCircle}
                tone="error"
                title="커밋을 분류하지 못했어요"
                description="창을 닫았다가 다시 열어 시도해 주세요."
              />
            ) : modelDownload !== null ? (
              <StatusPanel
                icon={Download}
                title="온디바이스 AI 모델을 내려받고 있어요"
                description="처음 한 번만 내려받아요. 용량이 커서 몇 분 걸릴 수 있어요."
              >
                <ProgressBar ratio={modelDownload} />
              </StatusPanel>
            ) : aiNotice ? (
              <AiUnavailableNotice
                kind={aiNotice}
                onDownload={handleDownloadModel}
                onContinue={() => handleContinueWithoutAi(aiNotice)}
              />
            ) : !draft ? (
              // 대화창이 최대 높이에 닿기 전까지는 내용만큼 커지고, 닿으면 AI 생각 로그만 줄어들어 그 안에서 스크롤된다
              <div className="flex min-h-0 flex-col gap-3">
                <StatusPanel
                  icon={isClassifyDone ? Check : Sparkles}
                  twinkle={!isClassifyDone}
                  tone={isClassifyDone ? 'success' : 'default'}
                  title={
                    isClassifyDone
                      ? `커밋 ${commitsResult.commits.length}건을 모두 분류했어요`
                      : `커밋 ${commitsResult.commits.length}건을 분류하고 있어요`
                  }
                  description={
                    isClassifyDone
                      ? '정리한 결과를 보여 드릴게요.'
                      : '이 기기의 AI가 프로젝트와 작업을 하나씩 판단하고 있어요.'
                  }
                >
                  <ClassifyStageList progress={progress} />
                </StatusPanel>
                {thoughts.length > 0 && <ThinkingLog thoughts={thoughts} />}
              </div>
            ) : draft.projects.length === 0 ? (
              <StatusPanel
                icon={EyeOff}
                title="분류할 커밋이 남지 않았어요"
                description="모든 저장소를 제외했어요. 아래 '제외한 저장소'에서 해제하면 다시 불러와요."
              />
            ) : (
              <div className="space-y-4">
                <div className="space-y-3 rounded-xl border border-blue-200 bg-blue-50/50 p-4 dark:border-blue-800/50 dark:bg-blue-900/10">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="flex items-center gap-2 font-bold text-blue-600 dark:text-blue-400">
                      <Check className="h-4 w-4" />
                      커밋 {summary?.commits ?? 0}건을 분류했어요
                    </p>
                    {draft.classifier === 'ai' ? (
                      <div className="flex items-center gap-1.5">
                        <span className="flex items-center gap-1 rounded-md bg-emerald-50 px-1.5 py-0.5 text-[11px] font-semibold text-emerald-600 dark:bg-emerald-900/30 dark:text-emerald-400">
                          <Sparkles size={11} /> 온디바이스 AI 분류
                        </span>
                        <button
                          onClick={handleRetry}
                          className={cn(
                            'flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[11px] font-semibold transition-colors',
                            retryArmed
                              ? 'bg-red-50 text-red-600 hover:bg-red-100 dark:bg-red-900/30 dark:text-red-400 dark:hover:bg-red-900/50'
                              : 'text-zinc-500 hover:bg-white hover:text-zinc-700 dark:text-zinc-400 dark:hover:bg-zinc-800 dark:hover:text-zinc-200'
                          )}
                        >
                          <RefreshCw size={11} />
                          {retryArmed ? '고친 내용을 버리고 다시 분류' : '다시 분류'}
                        </button>
                      </div>
                    ) : (
                      <span className="rounded-md bg-zinc-100 px-1.5 py-0.5 text-[11px] font-semibold text-zinc-500 dark:bg-zinc-800 dark:text-zinc-400">
                        저장소 기준 분류
                      </span>
                    )}
                  </div>
                  <div className="flex flex-wrap gap-x-4 gap-y-1.5 text-xs text-zinc-600 dark:text-zinc-300">
                    <SummaryItem icon={CalendarClock}>{rangeLabel(commitsResult)}</SummaryItem>
                    <SummaryItem icon={Github}>{authorsLabel(commitsResult)}</SummaryItem>
                    <SummaryItem icon={FolderGit2}>저장소 {summary?.repos}개</SummaryItem>
                  </div>
                  {notice && (
                    <div className="flex items-start gap-2 rounded-lg bg-white/70 px-3 py-2 text-xs text-zinc-600 dark:bg-zinc-900/50 dark:text-zinc-300">
                      <Info size={14} className="mt-px shrink-0 text-zinc-400" />
                      <span className="min-w-0 flex-1">{notice}</span>
                    </div>
                  )}
                  <GithubRepoGaps gaps={commitsResult.repoGaps} />
                  <div className="grid grid-cols-3 gap-2">
                    <SummaryStat label="기존 작업에 추가" value={summary?.linkedTasks ?? 0} />
                    <SummaryStat label="새 작업" value={summary?.newTasks ?? 0} />
                    <SummaryStat label="새 프로젝트" value={summary?.newProjects ?? 0} />
                  </div>
                  {draft.classifier === 'rule' && (
                    <div className="flex flex-wrap items-center gap-2 rounded-lg bg-white/70 px-3 py-2 text-xs text-zinc-600 dark:bg-zinc-900/50 dark:text-zinc-300">
                      <Info size={14} className="shrink-0 text-zinc-400" />
                      <span className="min-w-0 flex-1">
                        {canDownloadModel
                          ? '이 기기에 AI 모델이 아직 없어 저장소 이름으로만 나눴어요.'
                          : '이 브라우저는 온디바이스 AI를 지원하지 않아 저장소 이름으로만 나눴어요. Chrome 데스크톱에서 더 정확하게 분류돼요.'}
                      </span>
                      {canDownloadModel && (
                        <button
                          onClick={handleDownloadModel}
                          className="flex items-center gap-1 rounded-md bg-blue-600 px-2 py-1 font-semibold text-white transition-colors hover:bg-blue-700"
                        >
                          <Download size={12} /> AI 모델 받고 다시 분류
                        </button>
                      )}
                    </div>
                  )}
                </div>
                <GithubImportPreview
                  plan={draft}
                  todayProjects={todayProjects}
                  goalTaskIds={goalTaskIds}
                  onChange={setDraft}
                  onExcludeRepo={handleExcludeRepo}
                  suggestedExcludes={suggestedExcludes}
                />
              </div>
            )}
          </div>

          <div className="space-y-3 border-t border-zinc-100 p-4 sm:p-6 dark:border-zinc-800">
            {isConnected && (
              // relative: 작성자 추가 팝오버가 이 줄 폭에 맞춰 열린다
              <div className="relative flex items-center gap-2 text-[11px] text-zinc-500 dark:text-zinc-400">
                <span className="flex min-w-0 items-center gap-1.5 truncate">
                  <Github size={12} className="shrink-0" />
                  <span className="truncate">@{login} 계정과 연결됨</span>
                </span>
                <CommitAuthorsMenu
                  login={login}
                  authors={commitAuthors}
                  untilMs={untilMs}
                  excludedRepos={excludedRepos}
                  onAdd={(author) => handleChangeAuthor(author, true)}
                  onRemove={(author) => handleChangeAuthor(author, false)}
                />
                <ExcludedReposMenu repos={excludedRepos} onInclude={handleIncludeRepo} />
                <button
                  onClick={handleDisconnect}
                  disabled={isDisconnecting}
                  className="ml-auto flex shrink-0 items-center gap-1 rounded-md px-1.5 py-1 transition-colors hover:bg-zinc-100 hover:text-red-500 disabled:opacity-50 dark:hover:bg-zinc-800"
                >
                  <Unplug size={12} /> 연결 해제
                </button>
              </div>
            )}
            <div className="flex gap-3">
              <button
                onClick={onClose}
                className="flex-1 rounded-xl bg-zinc-100 px-4 py-3 font-medium transition-colors hover:bg-zinc-200 dark:bg-zinc-800 dark:hover:bg-zinc-700"
              >
                {preview ? '취소' : '닫기'}
              </button>
              {preview && draftSource && (
                <button
                  disabled={included === 0}
                  onClick={() => onApply(preview, draftSource)}
                  className="flex-1 rounded-xl bg-zinc-900 px-4 py-3 font-bold text-white transition-all hover:bg-zinc-800 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-white dark:text-black dark:hover:bg-zinc-200"
                >
                  {included > 0
                    ? '작업 추가'
                    : hasChecked
                      ? '이미 등록된 작업이라 추가할 내용이 없어요'
                      : '추가할 작업을 선택해 주세요'}
                </button>
              )}
            </div>
          </div>
        </div>
      </div>
    </Portal>
  );
}

type StatusPanelProps = {
  icon: LucideIcon;
  title: string;
  description?: string;
  spin?: boolean;
  // 회전 로더가 어색한 아이콘(Sparkles)을 반짝이게 해 기다리는 중임을 알린다
  twinkle?: boolean;
  tone?: 'default' | 'success' | 'error';
  children?: React.ReactNode;
};

// 텍스트 복원 모달의 빈/오류 상태와 같은 점선 패널
function StatusPanel({
  icon: Icon,
  title,
  description,
  spin,
  twinkle,
  tone = 'default',
  children,
}: Readonly<StatusPanelProps>) {
  const isError = tone === 'error';
  const isActive = spin || twinkle;
  return (
    <div
      className={cn(
        'flex shrink-0 flex-col items-center justify-center gap-2 rounded-xl border border-dashed p-8 text-center',
        isError
          ? 'border-red-200 bg-red-50/50 dark:border-red-900/30 dark:bg-red-900/10'
          : 'border-zinc-200 bg-zinc-50/50 dark:border-zinc-800 dark:bg-zinc-900/30'
      )}
    >
      <Icon
        className={cn(
          'h-8 w-8',
          spin && 'animate-spin',
          twinkle && 'animate-twinkle motion-reduce:animate-none',
          isError
            ? 'text-red-400'
            : tone === 'success'
              ? 'text-emerald-500'
              : isActive
                ? 'text-blue-500'
                : 'text-zinc-300 dark:text-zinc-600'
        )}
      />
      <p
        className={cn(
          'text-sm font-medium',
          isError ? 'text-red-600 dark:text-red-400' : 'text-zinc-600 dark:text-zinc-300'
        )}
      >
        {title}
      </p>
      {description && <p className="max-w-sm text-xs text-zinc-500 dark:text-zinc-400">{description}</p>}
      {children && <div className="mt-2 flex w-full max-w-xs flex-col items-center gap-2">{children}</div>}
    </div>
  );
}

const CLASSIFY_STAGE_LABELS: Record<CommitClassifyStage, string> = {
  [COMMIT_CLASSIFY_STAGE.PREPARE]: 'AI 모델 준비',
  [COMMIT_CLASSIFY_STAGE.REPO]: '저장소별 프로젝트 판단',
  [COMMIT_CLASSIFY_STAGE.TASK]: '기존 작업 연결',
  [COMMIT_CLASSIFY_STAGE.NAMING]: '새 작업 정리',
  [COMMIT_CLASSIFY_STAGE.PROGRESS]: '진행률 계산',
  [COMMIT_CLASSIFY_STAGE.DETAIL]: '세부 항목 제안',
};

type StageStatus = 'done' | 'skipped' | 'active' | 'pending';

const STAGE_ICONS: Record<StageStatus, { icon: LucideIcon; className: string }> = {
  done: { icon: CircleCheck, className: 'text-emerald-500' },
  skipped: { icon: CircleMinus, className: 'text-zinc-300 dark:text-zinc-600' },
  active: { icon: LoaderCircle, className: 'animate-spin text-blue-500' },
  pending: { icon: CircleDashed, className: 'text-zinc-300 dark:text-zinc-600' },
};

const STAGE_STATUS_LABELS: Record<StageStatus, string> = {
  done: '완료',
  skipped: '건너뜀',
  active: '진행 중',
  pending: '대기',
};

// 분류 단계 스테퍼. 전체 호출 수는 앞 단계 판정에 따라 달라져 미리 알 수 없으므로 단계 단위로 보여 주고,
// 진행 중인 단계의 이름과 그 단계 안의 개수만 아래에 가운데 정렬로 붙인다. 할 일이 없던 단계는 "건너뜀" 아이콘으로 둔다.
// 상태 패널이 가운데 정렬이라 세로 목록(왼쪽 정렬 라벨 + 오른쪽 끝 개수)으로 두면 한쪽으로 치우쳐 보인다.
function ClassifyStageList({ progress }: Readonly<{ progress: ClassifyProgress | null }>) {
  // 첫 진행 보고 전에는 준비 단계가 진행 중이다. current 가 null 이면 모든 단계가 끝났다.
  const currentIndex =
    progress === null
      ? 0
      : progress.current === null
        ? COMMIT_CLASSIFY_STAGE_VALUES.length
        : COMMIT_CLASSIFY_STAGE_VALUES.indexOf(progress.current);
  const currentStage = COMMIT_CLASSIFY_STAGE_VALUES[currentIndex];
  const currentProgress = currentStage ? progress?.stages[currentStage] : undefined;
  return (
    <div className="flex w-full flex-col items-center gap-2.5">
      <ol className="flex w-full items-center">
        {COMMIT_CLASSIFY_STAGE_VALUES.map((stage, index) => {
          const status: StageStatus =
            index > currentIndex
              ? 'pending'
              : index === currentIndex
                ? 'active'
                : stage !== COMMIT_CLASSIFY_STAGE.PREPARE && progress?.stages[stage]?.total === 0
                  ? 'skipped'
                  : 'done';
          const { icon: Icon, className } = STAGE_ICONS[status];
          const label = `${CLASSIFY_STAGE_LABELS[stage]} (${STAGE_STATUS_LABELS[status]})`;
          return (
            <li
              key={stage}
              title={label}
              aria-current={status === 'active' ? 'step' : undefined}
              className={cn('flex items-center', index > 0 && 'flex-1')}
            >
              {index > 0 && (
                <span
                  aria-hidden
                  className={cn(
                    'mx-1 h-0.5 flex-1 rounded-full transition-colors',
                    index <= currentIndex ? 'bg-emerald-400/70 dark:bg-emerald-500/50' : 'bg-zinc-200 dark:bg-zinc-700'
                  )}
                />
              )}
              <Icon size={16} aria-hidden className={cn('shrink-0', className)} />
              <span className="sr-only">{label}</span>
            </li>
          );
        })}
      </ol>
      <p aria-live="polite" className="flex items-center gap-1.5 text-xs">
        {currentStage ? (
          <>
            <span className="text-zinc-400 tabular-nums dark:text-zinc-500">
              {currentIndex + 1}/{COMMIT_CLASSIFY_STAGE_VALUES.length}
            </span>
            <span className="font-semibold text-zinc-800 dark:text-zinc-100">
              {CLASSIFY_STAGE_LABELS[currentStage]}
            </span>
            {currentProgress && currentProgress.total > 0 && (
              <span className="rounded-full bg-blue-50 px-1.5 py-px text-[11px] font-medium text-blue-600 tabular-nums dark:bg-blue-900/30 dark:text-blue-400">
                {Math.min(currentProgress.done, currentProgress.total)}/{currentProgress.total}
              </span>
            )}
          </>
        ) : (
          <span className="font-semibold text-emerald-600 dark:text-emerald-400">모든 단계를 마쳤어요</span>
        )}
      </p>
    </div>
  );
}

// 첫 단계가 끝나기 전(0%)에는 진행률을 알 수 없어 막대 위를 오가는 구간을 보여 주고, 그 뒤로는 채운 부분에
// 광택을 흘려 단계 사이 대기가 길어도 멈춘 것처럼 보이지 않게 한다.
function ProgressBar({ ratio, label }: Readonly<{ ratio: number; label?: string }>) {
  const percent = Math.round(Math.min(1, Math.max(0, ratio)) * 100);
  const isIndeterminate = percent === 0;
  return (
    <div className="w-full">
      <div className="relative h-1.5 w-full overflow-hidden rounded-full bg-zinc-200 dark:bg-zinc-800">
        {isIndeterminate ? (
          <div className="absolute inset-y-0 left-0 w-2/5 animate-indeterminate rounded-full bg-blue-500 motion-reduce:animate-none" />
        ) : (
          <div
            className="relative h-full overflow-hidden rounded-full bg-blue-500 transition-[width] duration-300"
            style={{ width: `${percent}%` }}
          >
            {percent < 100 && (
              <div className="absolute inset-0 animate-shimmer bg-linear-to-r from-transparent via-white/45 to-transparent motion-reduce:hidden" />
            )}
          </div>
        )}
      </div>
      <p className="mt-1.5 text-[11px] text-zinc-400 tabular-nums dark:text-zinc-500">
        {isIndeterminate ? '준비하고 있어요…' : (label ?? `${percent}%`)}
      </p>
    </div>
  );
}

// 온디바이스 AI 가 지금 무엇을 판단하는지와, 생성 중인 응답에서 읽어 낸 점수·요약을 실시간으로 보여 준다.
// 끝난 단계는 결과 한 줄로 접는다. 대화창 높이를 다 쓰면 목록이 스크롤되고, 사용자가 맨 아래를 보고 있을 때만
// 새로 생성되는 내용을 따라 내려간다. 위로 올려 읽는 중이면 맨 아래로 돌아가는 버튼을 띄운다.
function ThinkingLog({ thoughts }: Readonly<{ thoughts: ReadonlyArray<ClassifyThought> }>) {
  // 내용 높이가 바뀌면(줄 추가·줄바꿈 변화·끝난 단계 접힘) 목록 높이를 그 값으로 옮겨 transition 으로 부드럽게 늘고 준다.
  // 대화창이 최대 높이에 닿으면 flex 가 이 높이보다 작게 줄이고, 그때부터는 목록 안에서 스크롤된다.
  // 최소 높이는 min(내용, 5rem) — 고정 최소 높이를 두면 내용이 적을 때 아래가 비고, 없으면 좁은 화면에서 0 까지 짓눌린다.
  const { listRef, contentRef, isFollowing, handleScroll, scrollToBottom } = useFollowScroll<
    HTMLDivElement,
    HTMLOListElement
  >({
    onResize: (list, content) => {
      list.style.height = `${content.offsetHeight}px`;
      list.style.minHeight = `min(${content.offsetHeight}px, 5rem)`;
    },
  });

  return (
    <section
      aria-live="polite"
      className="flex min-h-0 flex-col rounded-xl border border-zinc-200 bg-white py-3 dark:border-zinc-800 dark:bg-zinc-900/50"
    >
      <p className="mb-2 flex shrink-0 items-center gap-1.5 px-3 text-[11px] font-semibold text-zinc-500 dark:text-zinc-400">
        <Cpu size={12} /> AI가 생각하는 과정
      </p>
      <div className="relative flex min-h-0 flex-col">
        <div
          ref={listRef}
          onScroll={handleScroll}
          className="scrollbar-hidden min-h-0 overflow-y-auto px-3 transition-[height,min-height] duration-300 ease-out motion-reduce:transition-none"
        >
          <ol ref={contentRef} className="space-y-2.5">
            {thoughts.map((thought) => {
              const isDone = thought.conclusion !== null;
              return (
                <li key={thought.id} className="flex gap-2 text-xs">
                  {isDone ? (
                    <Check size={14} className="mt-0.5 shrink-0 text-emerald-500" />
                  ) : (
                    <Sparkles size={14} className="mt-0.5 shrink-0 animate-pulse text-blue-500" />
                  )}
                  <div className="min-w-0 flex-1">
                    <p
                      className={cn(
                        'break-words',
                        isDone ? 'text-zinc-400 dark:text-zinc-500' : 'font-medium text-zinc-700 dark:text-zinc-200'
                      )}
                    >
                      {thought.title}
                    </p>
                    {isDone ? (
                      <p className="mt-0.5 break-words text-zinc-600 dark:text-zinc-300">→ {thought.conclusion}</p>
                    ) : (
                      <div className="mt-1 space-y-0.5 border-l-2 border-blue-100 pl-2 text-zinc-500 dark:border-blue-900/50 dark:text-zinc-400">
                        {thought.lines.length ? (
                          thought.lines.map((line, index) => (
                            <p key={index} className="break-words">
                              {line}
                              {index === thought.lines.length - 1 && (
                                <span className="ml-0.5 inline-block h-3 w-1 translate-y-0.5 animate-pulse bg-blue-400" />
                              )}
                            </p>
                          ))
                        ) : (
                          <p className="animate-pulse">생각하는 중…</p>
                        )}
                      </div>
                    )}
                  </div>
                </li>
              );
            })}
          </ol>
        </div>
        {!isFollowing && (
          <button
            type="button"
            onClick={scrollToBottom}
            aria-label="최신 내용 보기"
            title="최신 내용 보기"
            className="absolute bottom-1 left-1/2 flex size-7 -translate-x-1/2 items-center justify-center rounded-full border border-zinc-200 bg-white/95 text-zinc-600 shadow-md backdrop-blur hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-800/95 dark:text-zinc-300 dark:hover:bg-zinc-700"
          >
            <ArrowDown size={14} />
          </button>
        )}
      </div>
    </section>
  );
}

function SummaryItem({ icon: Icon, children }: Readonly<{ icon: LucideIcon; children: React.ReactNode }>) {
  return (
    <span className="flex items-center gap-1.5">
      <Icon size={13} className="shrink-0 text-blue-500/70" />
      {children}
    </span>
  );
}

function SummaryStat({ label, value }: Readonly<{ label: string; value: number }>) {
  return (
    <div className="rounded-lg bg-white/70 px-3 py-2 dark:bg-zinc-900/50">
      <p className="text-[11px] text-zinc-500 dark:text-zinc-400">{label}</p>
      <p className="text-lg font-bold text-zinc-800 tabular-nums dark:text-zinc-100">{value}</p>
    </div>
  );
}

type SecondaryButtonProps = {
  icon: LucideIcon;
  onClick: () => void;
  disabled?: boolean;
  children: React.ReactNode;
};

function SecondaryButton({ icon: Icon, onClick, disabled, children }: Readonly<SecondaryButtonProps>) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className="flex items-center gap-1.5 rounded-lg bg-zinc-900 px-3 py-2 text-xs font-semibold text-white transition-colors hover:bg-zinc-800 disabled:opacity-50 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-white"
    >
      <Icon size={14} />
      {children}
    </button>
  );
}

const primaryCtaClass =
  'flex w-full items-center justify-center gap-2 rounded-xl bg-zinc-900 px-4 py-3 text-sm font-semibold text-white transition-colors hover:bg-zinc-800 disabled:opacity-50 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-white';

function MembersOnlyGuide() {
  return (
    <div className="space-y-4">
      <StatusPanel
        icon={Lock}
        title="로그인한 회원만 사용할 수 있어요"
        description="로그인하면 GitHub 계정을 연결해 마지막 보고서 이후 작성한 커밋을 금일 업무에 정리할 수 있어요."
      />
      <Link href="/login" className={primaryCtaClass}>
        <LogIn size={16} />
        로그인하기
      </Link>
    </div>
  );
}

type AiUnavailableNoticeProps = {
  kind: PromptAiNoticeKind;
  onDownload: () => void;
  onContinue: () => void;
};

// 분류 전 한 번만 보여 주는 안내. AI 를 쓰는 방법(모델 내려받기·지원 브라우저)과, 그대로 계속하면 저장소 기준으로만
// 나눈다는 점을 알리고 고르게 한다.
function AiUnavailableNotice({ kind, onDownload, onContinue }: Readonly<AiUnavailableNoticeProps>) {
  const canDownload = kind === 'downloadable';
  return (
    <div className="space-y-4">
      <StatusPanel
        icon={Cpu}
        title={
          canDownload ? '이 기기에 온디바이스 AI 모델이 아직 없어요' : '이 브라우저에서는 온디바이스 AI를 쓸 수 없어요'
        }
        description={
          canDownload
            ? 'AI 모델을 내려받으면 커밋 내용을 읽고 프로젝트·작업·진행률까지 정리해 드려요. 처음 한 번만 받으며, 용량이 커서 몇 분 걸릴 수 있어요.'
            : 'Chrome 데스크톱 최신 버전에서 열면 이 기기의 AI가 커밋 내용을 읽고 프로젝트·작업·진행률까지 정리해 드려요. 기기 사양에 따라 쓸 수 없을 수도 있어요.'
        }
      />
      <ul className="space-y-2">
        <GuideItem icon={Sparkles} title="온디바이스 AI 분류">
          커밋 제목으로 기존 작업에 이어 붙일지, 새 작업으로 만들지 판단하고 작업명·세부 항목을 제안해요.
        </GuideItem>
        <GuideItem icon={FolderGit2} title="저장소 기준 분류">
          AI 없이 저장소 이름으로 프로젝트를 나누고, 커밋 제목을 작업으로 옮겨요. 미리보기에서 직접 다듬을 수 있어요.
        </GuideItem>
      </ul>
      <div className="space-y-2">
        {canDownload && (
          <button onClick={onDownload} className={primaryCtaClass}>
            <Download size={16} />
            AI 모델 받고 분류하기
          </button>
        )}
        <button
          onClick={onContinue}
          className={cn(
            canDownload
              ? 'flex w-full items-center justify-center gap-2 rounded-xl bg-zinc-100 px-4 py-3 text-sm font-semibold text-zinc-700 transition-colors hover:bg-zinc-200 dark:bg-zinc-800 dark:text-zinc-200 dark:hover:bg-zinc-700'
              : primaryCtaClass
          )}
        >
          <FolderGit2 size={16} />
          저장소 기준으로 분류하기
        </button>
        <p className="text-center text-[11px] text-zinc-400 dark:text-zinc-500">
          {canDownload
            ? '이 안내는 한 번만 보여 드려요. 나중에 미리보기에서도 AI 모델을 받을 수 있어요.'
            : '이 안내는 한 번만 보여 드려요.'}
        </p>
      </div>
    </div>
  );
}

type GuideItemProps = { icon: LucideIcon; title: string; children: React.ReactNode };

function GuideItem({ icon: Icon, title, children }: Readonly<GuideItemProps>) {
  return (
    <li className="flex gap-3 rounded-xl border border-zinc-200 p-3 dark:border-zinc-800">
      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-blue-50 text-blue-600 dark:bg-blue-900/30 dark:text-blue-400">
        <Icon size={16} />
      </span>
      <div className="min-w-0">
        <p className="text-sm font-semibold text-zinc-800 dark:text-zinc-100">{title}</p>
        <p className="mt-0.5 text-xs leading-relaxed text-zinc-500 dark:text-zinc-400">{children}</p>
      </div>
    </li>
  );
}

type ConnectGuideProps = { onConnect: () => void; isConnecting: boolean };

function ConnectGuide({ onConnect, isConnecting }: Readonly<ConnectGuideProps>) {
  return (
    <div className="space-y-4">
      <p className="text-sm text-zinc-600 dark:text-zinc-300">
        GitHub 계정을 연결하면 본인이 작성한 커밋만 골라 프로젝트·작업별로 정리해 드려요.
      </p>
      <ul className="space-y-2">
        <GuideItem icon={ShieldCheck} title="저장소 읽기 권한(repo)을 요청해요">
          로그인에 쓰는 GitHub 앱으로 연결해요. 조직의 비공개 저장소까지 읽으려면{' '}
          <span className="font-mono">repo</span> 권한이 필요해요. 저장소에 쓰지는 않아요.
        </GuideItem>
        <GuideItem icon={Building2} title="조직 저장소는 조직 접근을 요청하세요">
          승인 화면의 Organization access 에서 조직 옆 Request(소유자는 Grant)를 눌러 주세요. 승인 화면이 바로
          넘어갔다면 GitHub Settings → Applications → Authorized OAuth Apps 에서 요청할 수 있어요.
        </GuideItem>
        <GuideItem icon={Lock} title="토큰은 서버에 저장하지 않아요">
          이 브라우저의 보안 쿠키에만 {GITHUB_TOKEN_TTL_DAYS}일간 보관되고, 언제든 연결을 해제할 수 있어요.
        </GuideItem>
        <GuideItem icon={Cpu} title="분류는 이 기기 안에서 이뤄져요">
          Chrome 내장 온디바이스 AI가 커밋을 프로젝트와 작업에 나눠요. 커밋 내용을 외부 AI로 보내지 않아요.
        </GuideItem>
        <GuideItem icon={Database} title="고친 내용은 내 계정에 기억해요">
          다음 분류를 내 방식에 맞추려고 직접 고친 프로젝트·작업명, 세부 항목·진행률 보정(관련 커밋 제목 포함)과 제외한
          저장소를 회원 계정에 저장해요. 본인만 볼 수 있고, 탈퇴하면 함께 지워져요.
        </GuideItem>
      </ul>
      <button onClick={onConnect} disabled={isConnecting} className={primaryCtaClass}>
        {isConnecting ? <Loader2 size={16} className="animate-spin" /> : <Github size={16} />}
        {isConnecting ? 'GitHub로 이동하는 중...' : 'GitHub 연결하기'}
      </button>
    </div>
  );
}
