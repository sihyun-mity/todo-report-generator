'use client';

import { ReactNode, useState } from 'react';
import toast from 'react-hot-toast';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Check, GitBranch, NotebookText, Trash2 } from 'lucide-react';
import { deleteAccountData } from '@/actions';
import { ACCOUNT_DATA_KIND, ACCOUNT_DATA_KIND_VALUES } from '@/enums';
import { useResetOnHide } from '@/hooks';
import { clearLocalCommitImportMemory } from '@/lib/commit-classifier/memory';
import { createClient } from '@/lib/supabase/client';
import { queries } from '@/providers';
import { confirm, useReportHistoryStore } from '@/stores';
import type { AccountDataKind } from '@/types';
import { SettingsSubHeader } from '.';

type KindMeta = {
  icon: ReactNode;
  title: string;
  description: string;
  unit: string;
};

const KIND_META: Record<AccountDataKind, KindMeta> = {
  [ACCOUNT_DATA_KIND.REPORTS]: {
    icon: <NotebookText size={18} />,
    title: '보고서 기록',
    description: '날짜별로 저장된 업무 보고서 전체. 캘린더·기록 목록이 비워져요.',
    unit: '건',
  },
  [ACCOUNT_DATA_KIND.COMMIT_IMPORT_MEMORY]: {
    icon: <GitBranch size={18} />,
    title: '커밋 가져오기 메모리',
    description: '저장소·작업 연결, 세부 항목·진행률 보정, 제외한 저장소. 다음 분류부터 처음 상태로 돌아가요.',
    unit: '개',
  },
};

export function DataManagementSection() {
  const queryClient = useQueryClient();
  const { data, isLoading } = useQuery(queries.accountData.summary());
  const [selected, setSelected] = useState<ReadonlySet<AccountDataKind>>(new Set());
  const [deleting, setDeleting] = useState(false);

  // 고른 항목은 일시적인 선택이라 다른 화면에 다녀오면 비운다
  useResetOnHide(() => setSelected(new Set()));

  const summary = data?.ok ? data.summary : null;

  const toggle = (kind: AccountDataKind) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(kind)) next.delete(kind);
      else next.add(kind);
      return next;
    });
  };

  // 서버에서 지운 뒤, 이 기기에 남아 화면에 계속 보이거나 다시 서버로 올라갈 수 있는 사본을 정리한다
  const cleanUpLocal = async (deleted: ReadonlyArray<AccountDataKind>) => {
    if (deleted.includes(ACCOUNT_DATA_KIND.REPORTS)) {
      // 같은 문서에 머무르므로 모듈 레벨 store 를 직접 비우고 다시 적재한다(작성 중인 폼은 건드리지 않는다)
      useReportHistoryStore.getState().reset();
      void useReportHistoryStore.getState().initialize();
    }
    if (deleted.includes(ACCOUNT_DATA_KIND.COMMIT_IMPORT_MEMORY)) {
      await queryClient.resetQueries({ queryKey: queries.github.memory._def });
    }
  };

  const handleDelete = async () => {
    if (deleting || selected.size === 0) return;
    const kinds = ACCOUNT_DATA_KIND_VALUES.filter((kind) => selected.has(kind));

    const ok = await confirm({
      title: '선택한 데이터를 삭제할까요?',
      description: `${kinds.map((kind) => `· ${KIND_META[kind].title}`).join('\n')}\n\n삭제한 데이터는 되돌릴 수 없어요.`,
      confirmText: '삭제',
      cancelText: '취소',
      variant: 'danger',
    });
    if (!ok) return;

    setDeleting(true);
    try {
      if (kinds.includes(ACCOUNT_DATA_KIND.COMMIT_IMPORT_MEMORY)) {
        // 진행 중인 메모리 쓰기가 서버 삭제 뒤에 행을 되살리지 않도록 먼저 기다리고, 예전 로컬 기록도 지운다
        const { data: userData } = await createClient().auth.getUser();
        if (userData.user) await clearLocalCommitImportMemory(userData.user.id);
      }

      const result = await deleteAccountData(kinds);
      if (!result.ok && result.reason !== 'partial_failure') {
        toast.error(
          result.reason === 'members_only' ? '로그인한 회원만 삭제할 수 있어요.' : '삭제할 항목을 다시 선택해주세요.'
        );
        return;
      }

      await cleanUpLocal(result.deleted);
      setSelected(new Set());

      if (result.ok) {
        toast.success('선택한 데이터를 삭제했어요.');
      } else {
        toast.error(`${result.failed.map((kind) => KIND_META[kind].title).join(', ')} 삭제에 실패했어요.`);
      }
    } catch {
      toast.error('삭제에 실패했어요. 잠시 후 다시 시도해주세요.');
    } finally {
      setDeleting(false);
      void queryClient.invalidateQueries({ queryKey: queries.accountData.summary().queryKey });
    }
  };

  return (
    <div className="mx-auto w-full max-w-2xl p-4 sm:p-6 lg:p-12">
      <SettingsSubHeader
        title="저장된 데이터 관리"
        description="계정에 저장된 데이터 중 지울 항목을 골라 삭제할 수 있어요. 계정과 로그인 수단은 그대로 유지돼요."
      />

      <section className="rounded-2xl border border-zinc-200 bg-white p-2 dark:border-zinc-800 dark:bg-zinc-900">
        {data && !data.ok ? (
          <div className="p-4 text-sm text-zinc-600 dark:text-zinc-300">로그인한 회원만 이용할 수 있어요.</div>
        ) : (
          <ul className="flex flex-col">
            {ACCOUNT_DATA_KIND_VALUES.map((kind) => {
              const meta = KIND_META[kind];
              const count = summary?.[kind];
              const isEmpty = count === 0;
              const checked = selected.has(kind);
              return (
                <li key={kind}>
                  <label
                    className={`flex items-start gap-3 rounded-xl p-4 transition-colors ${
                      isEmpty
                        ? 'cursor-default opacity-60'
                        : 'cursor-pointer hover:bg-zinc-50 dark:hover:bg-zinc-800/50'
                    }`}
                  >
                    <input
                      type="checkbox"
                      className="peer sr-only"
                      checked={checked}
                      disabled={isEmpty || deleting}
                      onChange={() => toggle(kind)}
                    />
                    <span
                      aria-hidden
                      className={`mt-2 flex h-5 w-5 shrink-0 items-center justify-center rounded-md border transition-colors peer-focus-visible:ring-2 peer-focus-visible:ring-zinc-400 ${
                        checked
                          ? 'border-rose-500 bg-rose-500 text-white'
                          : 'border-zinc-300 bg-white dark:border-zinc-600 dark:bg-zinc-800'
                      }`}
                    >
                      {checked && <Check size={14} strokeWidth={3} />}
                    </span>
                    <span className="mt-0.5 rounded-lg bg-zinc-100 p-2 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-200">
                      {meta.icon}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="flex items-center justify-between gap-2">
                        <span className="text-sm font-bold text-zinc-900 dark:text-white">{meta.title}</span>
                        <span className="shrink-0 text-xs font-semibold text-zinc-500 tabular-nums dark:text-zinc-400">
                          {isLoading
                            ? '불러오는 중...'
                            : count === null || count === undefined
                              ? '확인 불가'
                              : isEmpty
                                ? '없음'
                                : `${count.toLocaleString('ko-KR')}${meta.unit}`}
                        </span>
                      </span>
                      <span className="mt-0.5 block text-xs text-zinc-500 dark:text-zinc-400">{meta.description}</span>
                    </span>
                  </label>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <div className="mt-4 flex items-center justify-between gap-3">
        <p className="text-xs text-zinc-500 dark:text-zinc-400">삭제한 데이터는 되돌릴 수 없어요.</p>
        <button
          type="button"
          onClick={handleDelete}
          disabled={selected.size === 0 || deleting}
          className="inline-flex shrink-0 items-center gap-1.5 rounded-lg bg-rose-500 px-4 py-2 text-sm font-bold text-white transition-colors hover:bg-rose-600 disabled:cursor-not-allowed disabled:opacity-40"
        >
          <Trash2 size={14} />
          {deleting ? '삭제하는 중...' : `선택한 데이터 삭제${selected.size > 0 ? ` (${selected.size})` : ''}`}
        </button>
      </div>
    </div>
  );
}
