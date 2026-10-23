'use client';

import { useId, useState } from 'react';
import toast from 'react-hot-toast';
import { UserX } from 'lucide-react';
import { withdrawAccount } from '@/actions';
import { WITHDRAW_CONFIRM_PHRASE } from '@/constants';
import { useResetOnHide } from '@/hooks';
import { clearLocalCommitImportMemory } from '@/lib/commit-classifier/memory';
import { getExistingSubscription } from '@/lib/push/push-client';
import { createClient } from '@/lib/supabase/client';
import { confirm } from '@/stores';
import { hardNavigate } from '@/utils';
import { SettingsSubHeader } from '.';

const DELETED_ITEMS: ReadonlyArray<string> = [
  '계정 정보와 모든 로그인 수단(이메일·비밀번호, 연결된 외부 계정, 패스키)',
  '저장된 보고서 기록 전체',
  '커밋 가져오기 메모리, GitHub 연결',
  '작성 알림 구독, 새소식 읽음 기록',
  '모든 기기의 로그인 상태',
];

export function WithdrawSection() {
  const inputId = useId();
  const [phrase, setPhrase] = useState('');
  const [withdrawing, setWithdrawing] = useState(false);

  // 확인 문구는 일시적인 입력이라 다른 화면에 다녀오면 비운다
  useResetOnHide(() => setPhrase(''));

  const canSubmit = phrase.trim() === WITHDRAW_CONFIRM_PHRASE && !withdrawing;

  const handleWithdraw = async () => {
    if (!canSubmit) return;

    const ok = await confirm({
      title: '정말 탈퇴할까요?',
      description: '계정과 저장된 모든 데이터가 바로 삭제되고, 되돌릴 수 없어요.',
      confirmText: '탈퇴',
      cancelText: '취소',
      variant: 'danger',
    });
    if (!ok) return;

    setWithdrawing(true);
    try {
      // 진행 중인 커밋 보정 메모리 쓰기가 계정 삭제 뒤에 실패하거나, 예전 로컬 기록이 이 기기에 남지 않게 먼저 정리한다
      const { data } = await createClient().auth.getUser();
      if (data.user) await clearLocalCommitImportMemory(data.user.id);

      const result = await withdrawAccount(phrase);
      if (!result.ok) {
        toast.error(
          result.reason === 'invalid_confirm'
            ? `확인 문구를 "${WITHDRAW_CONFIRM_PHRASE}" 로 정확히 입력해주세요.`
            : result.reason === 'members_only'
              ? '로그인한 회원만 탈퇴할 수 있어요.'
              : '탈퇴에 실패했어요. 잠시 후 다시 시도해주세요.'
        );
        setWithdrawing(false);
        return;
      }

      // 서버 구독 행은 계정과 함께 지워졌으니 이 기기의 브라우저 푸시 구독만 해제한다
      try {
        await (await getExistingSubscription())?.unsubscribe();
      } catch {
        // 해제 실패는 무시 — 서버에 구독이 없어 더는 알림이 오지 않는다
      }

      // 인증 주체가 바뀌므로 문서를 새로 받는다. 뒤로 가기로 탈퇴 전 화면에 돌아오지 않게 history 를 대체한다.
      hardNavigate('/', {
        replace: true,
        flash: { type: 'success', message: '탈퇴가 완료됐어요. 이용해주셔서 감사합니다.' },
      });
    } catch {
      toast.error('탈퇴에 실패했어요. 잠시 후 다시 시도해주세요.');
      setWithdrawing(false);
    }
  };

  return (
    <div className="mx-auto w-full max-w-2xl p-4 sm:p-6 lg:p-12">
      <SettingsSubHeader title="회원 탈퇴" description="탈퇴하면 계정과 계정에 저장된 데이터가 모두 삭제돼요." />

      <section className="rounded-2xl border border-rose-200 bg-rose-50/60 p-5 dark:border-rose-900/60 dark:bg-rose-950/20">
        <h2 className="text-sm font-bold text-rose-700 dark:text-rose-300">탈퇴 시 삭제되는 항목</h2>
        <ul className="mt-2 flex list-disc flex-col gap-1 pl-5 text-xs text-zinc-700 dark:text-zinc-300">
          {DELETED_ITEMS.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
        <p className="mt-3 text-xs text-zinc-500 dark:text-zinc-400">
          삭제한 데이터는 되돌릴 수 없어요. 같은 이메일로 다시 가입해도 이전 기록은 복구되지 않아요. GitHub 쪽 앱 승인은
          GitHub 설정에서 직접 철회할 수 있어요.
        </p>
      </section>

      <section className="mt-4 rounded-2xl border border-zinc-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-900">
        <label htmlFor={inputId} className="block text-sm font-bold text-zinc-900 dark:text-white">
          계속하려면 <span className="text-rose-600 dark:text-rose-400">{WITHDRAW_CONFIRM_PHRASE}</span> 를 입력해주세요
        </label>
        <input
          id={inputId}
          type="text"
          value={phrase}
          onChange={(e) => setPhrase(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.nativeEvent.isComposing) void handleWithdraw();
          }}
          disabled={withdrawing}
          autoComplete="off"
          placeholder={WITHDRAW_CONFIRM_PHRASE}
          className="mt-2 w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 placeholder:text-zinc-400 focus:border-rose-400 focus:ring-2 focus:ring-rose-200 focus:outline-none disabled:opacity-60 dark:border-zinc-700 dark:bg-zinc-800 dark:text-white dark:focus:ring-rose-900/50"
        />
        <div className="mt-4 flex justify-end">
          <button
            type="button"
            onClick={handleWithdraw}
            disabled={!canSubmit}
            className="inline-flex shrink-0 items-center gap-1.5 rounded-lg bg-rose-500 px-4 py-2 text-sm font-bold text-white transition-colors hover:bg-rose-600 disabled:cursor-not-allowed disabled:opacity-40"
          >
            <UserX size={14} />
            {withdrawing ? '탈퇴하는 중...' : '회원 탈퇴'}
          </button>
        </div>
      </section>
    </div>
  );
}
