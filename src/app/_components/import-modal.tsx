'use client';

import { ChangeEvent, useEffect, useRef, useState } from 'react';
import { AlertCircle, Check, Clipboard, Info, X } from 'lucide-react';
import toast from 'react-hot-toast';
import { useScrollLock } from 'usehooks-ts';
import type { Project } from '@/types';
import { cn, parseReportText } from '@/utils';
import { Portal } from '@/components';
import { useOnClickOutside } from '@/hooks';
import { ProjectPreview } from '.';

type ImportModalProps = {
  isOpen: boolean;
  onClose: () => void;
  onApply: (data: {
    month: string;
    day: string;
    todayProjects: ReadonlyArray<Project>;
    tomorrowProjects: ReadonlyArray<Project>;
  }) => void;
};

export function ImportModal({ isOpen, onClose, onApply }: Readonly<ImportModalProps>) {
  const [text, setText] = useState('');
  const [parsedData, setParsedData] = useState<ReturnType<typeof parseReportText>>(null);
  const modalRef = useRef<HTMLDivElement | null>(null);
  const { lock, unlock } = useScrollLock({ autoLock: false });

  const handleClose = () => {
    setText('');
    setParsedData(null);
    onClose();
  };

  useOnClickOutside(modalRef, handleClose);

  const handleTextChange = (e: ChangeEvent<HTMLTextAreaElement>) => {
    const newText = e.target.value;
    setText(newText);
    setParsedData(newText.trim() ? parseReportText(newText) : null);
  };

  const handlePasteFromClipboard = async () => {
    try {
      const clipboardText = await navigator.clipboard.readText();
      setText(clipboardText);
      const result = parseReportText(clipboardText);
      setParsedData(result);
      if (result) {
        toast.success('클립보드에서 텍스트를 가져왔습니다.');
      } else {
        toast.error('분석할 수 있는 텍스트 형식이 아닙니다.');
      }
    } catch {
      toast.error('클립보드 접근 권한이 없거나 지원하지 않는 브라우저입니다.');
    }
  };

  const handleApply = () => {
    if (parsedData) onApply(parsedData);
  };

  // 모달이 열려 있는 동안 배경 스크롤을 잠근다
  useEffect(() => {
    if (isOpen) lock();
    else unlock();
    return () => unlock();
  }, [isOpen, lock, unlock]);

  if (!isOpen) return null;

  return (
    <Portal>
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm sm:p-6">
        <div
          ref={modalRef}
          className="flex max-h-[90%] w-full max-w-2xl flex-col rounded-2xl border border-zinc-200 bg-white shadow-2xl dark:border-zinc-800 dark:bg-zinc-900"
        >
          <div className="flex items-center justify-between border-b border-zinc-100 p-4 sm:p-6 dark:border-zinc-800">
            <h2 className="flex items-center gap-2 text-lg font-bold sm:text-xl">
              <Clipboard className="h-5 w-5 text-blue-500" />
              텍스트로 가져오기
            </h2>
            <button
              onClick={handleClose}
              className="rounded-full p-2 transition-colors hover:bg-zinc-100 dark:hover:bg-zinc-800"
            >
              <X className="h-5 w-5" />
            </button>
          </div>

          <div className="flex-1 space-y-6 overflow-y-auto p-4 sm:p-6">
            <div className="space-y-2">
              <div className="flex items-end justify-between">
                <label className="text-sm font-medium text-zinc-500 dark:text-zinc-400">보고서 텍스트 입력</label>
                <button
                  onClick={handlePasteFromClipboard}
                  className="flex items-center gap-1 rounded bg-zinc-100 px-2 py-1 text-xs transition-colors hover:bg-zinc-200 dark:bg-zinc-800 dark:hover:bg-zinc-700"
                >
                  <Clipboard className="h-3 w-3" />
                  클립보드에서 붙여넣기
                </button>
              </div>
              <textarea
                className="h-32 w-full resize-none rounded-xl border border-zinc-200 bg-zinc-50 p-4 font-mono text-sm focus:ring-2 focus:ring-blue-500/50 focus:outline-none sm:h-40 dark:border-zinc-800 dark:bg-zinc-950"
                placeholder="여기에 보고서 내용을 붙여넣으세요..."
                value={text}
                onChange={handleTextChange}
              />
              <details className="group rounded-lg border border-zinc-200 bg-zinc-50/50 px-3 py-2 text-xs dark:border-zinc-800 dark:bg-zinc-900/30">
                <summary className="flex cursor-pointer list-none items-center gap-1.5 font-medium text-zinc-600 select-none dark:text-zinc-400">
                  <Info className="h-3.5 w-3.5" />
                  지원 형식 안내
                  <span className="ml-auto text-[11px] text-zinc-400 group-open:hidden dark:text-zinc-500">펼치기</span>
                  <span className="ml-auto hidden text-[11px] text-zinc-400 group-open:inline dark:text-zinc-500">
                    접기
                  </span>
                </summary>
                <div className="mt-2 space-y-2 text-zinc-500 dark:text-zinc-400">
                  <p>
                    이 생성기로 만든 보고서를 그대로 붙여넣으면 분석됩니다. 직접 작성할 때는 아래 규칙을 지켜주세요.
                  </p>
                  <ul className="list-disc space-y-0.5 pl-4">
                    <li>
                      어딘가에 <span className="font-mono text-zinc-700 dark:text-zinc-300">N월 N일</span> 형식의 날짜
                    </li>
                    <li>
                      섹션 제목은{' '}
                      <span className="font-mono text-zinc-700 dark:text-zinc-300">금일 업무 진행 현황</span> /{' '}
                      <span className="font-mono text-zinc-700 dark:text-zinc-300">익일 업무 진행 예정</span> 그대로
                    </li>
                    <li>
                      프로젝트는 <span className="font-mono text-zinc-700 dark:text-zinc-300">* 프로젝트명</span>
                    </li>
                    <li>
                      작업은 <span className="font-mono text-zinc-700 dark:text-zinc-300">- 작업 내용 (50%)</span> —
                      진행률 <span className="font-mono text-zinc-700 dark:text-zinc-300">(NN%)</span>은 생략
                      가능(미입력 시 0%)
                    </li>
                  </ul>
                  <pre className="overflow-x-auto rounded-md bg-white p-2 font-mono text-[11px] leading-relaxed text-zinc-700 dark:bg-zinc-950 dark:text-zinc-300">
                    {`2월 24일 일일 업무 보고 드립니다.

금일 업무 진행 현황
    * 프로젝트명
        - 작업 내용 (50%)

익일 업무 진행 예정
    * 프로젝트명
        - 작업 내용`}
                  </pre>
                </div>
              </details>
            </div>

            <div className="space-y-3">
              <label className="text-sm font-medium text-zinc-500 dark:text-zinc-400">미리보기</label>
              {parsedData ? (
                <div className="space-y-4 rounded-xl border border-blue-200 bg-blue-50/50 p-4 dark:border-blue-800/50 dark:bg-blue-900/10">
                  <div className="flex items-center gap-2 font-bold text-blue-600 dark:text-blue-400">
                    <Check className="h-4 w-4" />
                    <span>
                      {parsedData.month}월 {parsedData.day}일 보고서 분석 성공
                    </span>
                  </div>

                  <div className="grid grid-cols-1 gap-6 text-xs md:grid-cols-2">
                    <ProjectPreview title="금일 업무" dotClassName="bg-blue-500" projects={parsedData.todayProjects} />
                    <ProjectPreview
                      title="익일 업무"
                      dotClassName="bg-green-500"
                      projects={parsedData.tomorrowProjects}
                    />
                  </div>
                </div>
              ) : (
                <div
                  className={cn(
                    'flex flex-col items-center justify-center gap-2 rounded-xl border border-dashed p-8 text-center',
                    text.trim()
                      ? 'border-red-200 bg-red-50/50 dark:border-red-900/30 dark:bg-red-900/10'
                      : 'border-zinc-200 bg-zinc-50/50 dark:border-zinc-800 dark:bg-zinc-900/30'
                  )}
                >
                  {text.trim() ? (
                    <>
                      <AlertCircle className="h-8 w-8 text-red-400" />
                      <p className="text-sm font-medium text-red-600 dark:text-red-400">텍스트 분석에 실패했습니다.</p>
                      <p className="text-xs text-zinc-500 dark:text-zinc-400">올바른 양식인지 확인해주세요.</p>
                    </>
                  ) : (
                    <>
                      <Clipboard className="h-8 w-8 text-zinc-300 dark:text-zinc-700" />
                      <p className="text-sm text-zinc-500 dark:text-zinc-400">
                        텍스트를 입력하면 분석 결과가 여기에 표시됩니다.
                      </p>
                    </>
                  )}
                </div>
              )}
            </div>
          </div>

          <div className="flex gap-3 border-t border-zinc-100 p-4 sm:p-6 dark:border-zinc-800">
            <button
              onClick={handleClose}
              className="flex-1 rounded-xl bg-zinc-100 px-4 py-3 font-medium transition-colors hover:bg-zinc-200 dark:bg-zinc-800 dark:hover:bg-zinc-700"
            >
              취소
            </button>
            <button
              disabled={!parsedData}
              onClick={handleApply}
              className="flex-1 rounded-xl bg-zinc-900 px-4 py-3 font-bold text-white transition-all hover:bg-zinc-800 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-white dark:text-black dark:hover:bg-zinc-200"
            >
              내용 적용하기
            </button>
          </div>
        </div>
      </div>
    </Portal>
  );
}
