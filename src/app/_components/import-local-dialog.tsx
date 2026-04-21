'use client';

import { HardDriveDownload } from 'lucide-react';
import { Portal } from '@/components';

interface Props {
  isOpen: boolean;
  onConfirm: () => void;
  onDismiss: () => void;
}

// 최초 접속 시, 로컬스토리지에만 존재하는 기존 기록을 계정으로 이전할지 묻는 다이얼로그
export default function ImportLocalDialog({ isOpen, onConfirm, onDismiss }: Props) {
  if (!isOpen) return null;

  return (
    <Portal>
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm sm:p-6">
        <div className="flex w-full max-w-md flex-col rounded-2xl border border-zinc-200 bg-white shadow-2xl dark:border-zinc-800 dark:bg-zinc-900">
          <div className="flex items-center gap-2 border-b border-zinc-100 p-5 dark:border-zinc-800">
            <HardDriveDownload className="h-5 w-5 text-blue-500" />
            <h2 className="text-base font-bold sm:text-lg">기존 로컬 기록을 가져올까요?</h2>
          </div>

          <div className="space-y-2 p-5 text-sm text-zinc-600 dark:text-zinc-300">
            <p>이 브라우저에 저장된 이전 보고서 기록이 있지만, 현재 계정에는 기록이 없습니다.</p>
            <p>지금 계정으로 이전하면 여러 기기에서 동일한 기록을 확인할 수 있습니다.</p>
            <p className="text-xs text-zinc-500 dark:text-zinc-400">
              나중에 상단의 &quot;로컬 기록 이전&quot; 버튼으로도 진행할 수 있어요.
            </p>
          </div>

          <div className="flex gap-3 border-t border-zinc-100 p-4 dark:border-zinc-800">
            <button
              onClick={onDismiss}
              className="flex-1 rounded-xl bg-zinc-100 px-4 py-3 text-sm font-medium transition-colors hover:bg-zinc-200 dark:bg-zinc-800 dark:hover:bg-zinc-700"
            >
              나중에
            </button>
            <button
              onClick={onConfirm}
              className="flex-1 rounded-xl bg-zinc-900 px-4 py-3 text-sm font-bold text-white transition-all hover:bg-zinc-800 dark:bg-white dark:text-black dark:hover:bg-zinc-200"
            >
              이전하기
            </button>
          </div>
        </div>
      </div>
    </Portal>
  );
}
