'use client';

import { ChangeEvent, useEffect, useRef, useState } from 'react';
import { AlertCircle, CalendarDays, Check, Clipboard, Info } from 'lucide-react';
import toast from 'react-hot-toast';
import { useScrollLock } from 'usehooks-ts';
import type { Project, ReportDate } from '@/types';
import { cn, inferReportYear, parseReportText } from '@/utils';
import { CloseButton, Portal, useDismissOnBack } from '@/components';
import { useDismissLayer } from '@/hooks';
import { DatePicker, ProjectPreview } from '.';

type ImportDate = ReportDate & { year: number };

// 텍스트의 `N월 N일`에는 연도가 없으므로 `inferReportYear`로 추정한 연도를 붙여 기본 날짜를 만든다.
const inferImportDate = (parsed: ReturnType<typeof parseReportText>): ImportDate | null => {
  if (!parsed?.month || !parsed.day) return null;
  const year = inferReportYear(parseInt(parsed.month, 10), parseInt(parsed.day, 10));
  return year === null ? null : { year, month: parsed.month, day: parsed.day };
};

// 텍스트를 고치는 중에도 사용자가 고른 날짜를 유지하되, 텍스트 속 날짜 자체가 바뀌면 다시 추정값을 따른다.
const parsedDateKey = (parsed: ReturnType<typeof parseReportText>) => (parsed ? `${parsed.month}-${parsed.day}` : '');

type ImportModalProps = {
  isOpen: boolean;
  onClose: () => void;
  onApply: (data: {
    year: number;
    month: string;
    day: string;
    todayProjects: ReadonlyArray<Project>;
    tomorrowProjects: ReadonlyArray<Project>;
  }) => void;
};

export function ImportModal({ isOpen, onClose, onApply }: Readonly<ImportModalProps>) {
  const [text, setText] = useState('');
  const [parsedData, setParsedData] = useState<ReturnType<typeof parseReportText>>(null);
  // 사용자가 날짜 선택기로 직접 고친 날짜. 없으면 텍스트에서 추정한 날짜를 쓴다.
  const [dateOverride, setDateOverride] = useState<ImportDate | null>(null);
  const importDate = dateOverride ?? inferImportDate(parsedData);
  const modalRef = useRef<HTMLDivElement | null>(null);
  const { lock, unlock } = useScrollLock({ autoLock: false });

  const handleClose = () => {
    setText('');
    setParsedData(null);
    setDateOverride(null);
    onClose();
  };

  useDismissLayer(modalRef, handleClose, { enabled: isOpen, escape: false });

  // 브라우저 back(안드 하드웨어 back 포함)으로도 모달이 닫히도록 BackStack 에 등록한다.
  useDismissOnBack(isOpen, handleClose);

  const updateParsed = (next: ReturnType<typeof parseReportText>) => {
    if (parsedDateKey(next) !== parsedDateKey(parsedData)) setDateOverride(null);
    setParsedData(next);
  };

  const handleTextChange = (e: ChangeEvent<HTMLTextAreaElement>) => {
    const newText = e.target.value;
    setText(newText);
    updateParsed(newText.trim() ? parseReportText(newText) : null);
  };

  const handlePasteFromClipboard = async () => {
    try {
      const clipboardText = await navigator.clipboard.readText();
      setText(clipboardText);
      const result = parseReportText(clipboardText);
      updateParsed(result);
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
    if (parsedData && importDate) onApply({ ...parsedData, ...importDate });
  };

  // 모달이 열려 있는 동안 배경 스크롤을 잠근다.
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
            <CloseButton onClick={handleClose} />
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
                  <p>
                    메일·메신저에서 복사하다 줄바꿈이 사라졌거나, 불릿 없이 들여쓰기만 있는 텍스트도 최대한 자동으로
                    복원합니다. 결과가 어긋나면 미리보기를 확인한 뒤 적용해주세요.
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
                    <li>
                      세부 내용은 <span className="font-mono text-zinc-700 dark:text-zinc-300">· 세부 내용</span> —
                      진행률 없이 <strong className="font-semibold">작업보다 더 깊게 들여쓰기</strong>. 들여쓰기가
                      작업과 같으면 세부 내용이 아니라 작업으로 인식됩니다.
                    </li>
                    <li>
                      불릿은 <span className="font-mono text-zinc-700 dark:text-zinc-300">* • ●</span>(프로젝트) /{' '}
                      <span className="font-mono text-zinc-700 dark:text-zinc-300">- –</span>(작업) /{' '}
                      <span className="font-mono text-zinc-700 dark:text-zinc-300">· ㆍ ∙</span>(세부 내용) 모두 인식
                    </li>
                    <li>불릿 없이 들여쓰기 깊이만으로 프로젝트 · 작업 · 세부 내용을 구분한 텍스트도 인식합니다.</li>
                  </ul>
                  <pre className="overflow-x-auto rounded-md bg-white p-2 font-mono text-[11px] leading-relaxed text-zinc-700 dark:bg-zinc-950 dark:text-zinc-300">
                    {`2월 24일 일일 업무 보고 드립니다.

금일 업무 진행 현황
    * 프로젝트명
        - 작업 내용 (50%)
            · 세부 내용

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
                      {parsedData.month && parsedData.day
                        ? `${parsedData.month}월 ${parsedData.day}일 보고서 분석 성공`
                        : '보고서 분석 성공 (날짜를 찾지 못해 직접 선택해야 합니다)'}
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

          <div className="space-y-3 border-t border-zinc-100 p-4 sm:p-6 dark:border-zinc-800">
            {parsedData && (
              // 텍스트의 날짜에는 연도가 없어 적용 직전에 확정된 날짜를 보여주고 조정할 수 있게 한다.
              // 본문 스크롤 영역 밖(푸터)에 두어 popover 가 잘리지 않게 위로 연다.
              <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2">
                <div className="min-w-0 flex-1">
                  <p className="flex items-center gap-1.5 text-sm font-medium text-zinc-700 dark:text-zinc-200">
                    <CalendarDays className="h-4 w-4 text-blue-500" />
                    보고서 날짜
                  </p>
                  <p className="mt-0.5 text-[11px] leading-relaxed text-zinc-500 dark:text-zinc-400">
                    {dateOverride
                      ? '직접 선택한 날짜로 적용합니다.'
                      : importDate
                        ? '텍스트에는 연도가 없어 오늘 기준 가장 최근 날짜로 추정했습니다. 다르면 직접 조정해주세요.'
                        : '텍스트에서 날짜를 찾지 못했습니다. 적용하려면 날짜를 선택해주세요.'}
                  </p>
                </div>
                <DatePicker
                  value={importDate ?? { month: '', day: '' }}
                  year={importDate?.year}
                  onChange={(date, year) => setDateOverride({ ...date, year })}
                  side="top"
                  align="end"
                />
              </div>
            )}
            <div className="flex gap-3">
              <button
                onClick={handleClose}
                className="flex-1 rounded-xl bg-zinc-100 px-4 py-3 font-medium transition-colors hover:bg-zinc-200 dark:bg-zinc-800 dark:hover:bg-zinc-700"
              >
                취소
              </button>
              <button
                disabled={!parsedData || !importDate}
                onClick={handleApply}
                className="flex-1 rounded-xl bg-zinc-900 px-4 py-3 font-bold text-white transition-all hover:bg-zinc-800 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-white dark:text-black dark:hover:bg-zinc-200"
              >
                내용 적용하기
              </button>
            </div>
          </div>
        </div>
      </div>
    </Portal>
  );
}
