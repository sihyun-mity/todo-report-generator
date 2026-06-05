'use client';

import { ChevronLeft, ChevronRight, Copy, History, RotateCcw, Trash2, X } from 'lucide-react';
import toast from 'react-hot-toast';
import { MouseEvent, useEffect, useMemo, useState } from 'react';
import type { ReportHistoryItem, ReportHistoryMode } from '@/types';
import { MAX_HISTORY_ITEMS } from '@/constants';
import { ReportCalendar, getItemDateKey } from '.';
import { getChunkedArray } from '@/utils';

type Props = {
  history: ReadonlyArray<ReportHistoryItem>;
  allDateKeys: ReadonlyArray<string>;
  // 서버(page.tsx)가 계산한 KST 오늘 날짜 키('YYYY-MM-DD'). 캘린더 초기 뷰 월의 결정적 기준값.
  serverDateKey: string;
  mode: ReportHistoryMode;
  isLoaded: boolean;
  loadingMonths: ReadonlySet<string>;
  // 외부에서 변경(추가/실행취소 등)이 발생했을 때 캘린더를 해당 날짜의 월로 이동시키는 요청.
  // nonce는 같은 dateKey라도 재발화시키기 위한 단조 증가값.
  focusRequest: { dateKey: string; nonce: number } | null;
  loadMonth: (year: number, month: number) => Promise<void>;
  loadHistoryAction: (item: ReportHistoryItem, e: MouseEvent<HTMLDivElement | HTMLButtonElement>) => void;
  deleteHistoryAction: (id: string, e: MouseEvent<HTMLButtonElement>) => void;
};

const ITEMS_PER_PAGE = 3;
const SKELETON_COUNT = 3;

const monthKeyOf = (year: number, month: number) => `${year}-${String(month).padStart(2, '0')}`;

// 기록이 존재하는 월 목록을 내림차순으로 반환 ('YYYY-MM')
const collectRecordMonths = (dateKeys: ReadonlyArray<string>): Array<string> => {
  const seen = new Set<string>();
  const result: Array<string> = [];
  for (const d of dateKeys) {
    const mk = d.slice(0, 7);
    if (seen.has(mk)) continue;
    seen.add(mk);
    result.push(mk);
  }
  return result;
};

// 카드 모양 placeholder — 실제 항목과 동일한 외곽/패딩/행 높이를 유지해 레이아웃 점프를 막는다.
// 실제 카드 측정값(브라우저 107.33px) 매칭:
//   p-3 + mb-1 + 22px 상단 행(hover 액션 버튼 자리 포함) + text-[11px] 2줄(33px) + mt-2.5 + text-[10px] timestamp(15px)
function HistoryCardSkeleton() {
  return (
    <div className="flex animate-pulse flex-col rounded-lg border border-zinc-100 bg-zinc-50 p-3 dark:border-zinc-800 dark:bg-[#25262b]/20">
      <div className="mb-1 flex h-[22px] items-center">
        <div className="h-3.5 w-24 rounded bg-zinc-200 dark:bg-zinc-700" />
      </div>
      <div className="h-3.5 w-full rounded bg-zinc-200 dark:bg-zinc-700" />
      <div className="mt-1.5 h-3.5 w-3/4 rounded bg-zinc-200 dark:bg-zinc-700" />
      <div className="mt-2.5 h-3 w-32 rounded bg-zinc-200 dark:bg-zinc-700" />
    </div>
  );
}

export function ReportHistory({
  history,
  allDateKeys,
  serverDateKey,
  mode,
  isLoaded,
  loadingMonths,
  focusRequest,
  loadMonth,
  loadHistoryAction,
  deleteHistoryAction,
}: Readonly<Props>) {
  const [selectedDateKey, setSelectedDateKey] = useState<string | null>(null);

  const recordMonths = useMemo(() => collectRecordMonths(allDateKeys), [allDateKeys]);

  // 초기 캘린더 뷰는 서버(page.tsx)가 내려준 KST 오늘(serverDateKey)의 월로 시작한다.
  // SSR/하이드레이션이 같은 값을 쓰므로 첫 페인트부터 실제 현재 월을 그려 placeholder 점프가 없다.
  // syncStage: 'today'(초기 — 오늘 월) → 'records'(기록 수신 후 최신 기록월로 1회 점프 후 고정)
  const [syncStage, setSyncStage] = useState<'today' | 'records'>('today');
  const [viewYear, setViewYear] = useState(() => Number(serverDateKey.slice(0, 4)));
  const [viewMonth, setViewMonth] = useState(() => Number(serverDateKey.slice(5, 7)));

  // 렌더 중 1회성 보정 (effect 대신 권장 패턴): 기록 데이터가 도착하면 최신 기록월로 점프한다.
  // 단, 최신 기록월이 오늘 월보다 미래면(예: 4월에 5월 기록이 존재) 오늘 월로 클램프한다.
  // 기준 "오늘"은 항상 serverDateKey 라 SSR/클라 어디서 실행돼도 결정적 — 별도 isClient 가드가 필요 없다.
  // (SSR 시점엔 store가 비어 recordMonths가 0건 → 보정이 돌지 않으므로 서버 HTML과 그대로 일치한다)
  if (recordMonths.length > 0 && syncStage !== 'records') {
    const [latestY, latestM] = recordMonths[0].split('-').map((s) => parseInt(s, 10));
    let nextY = latestY;
    let nextM = latestM;
    const todayY = Number(serverDateKey.slice(0, 4));
    const todayM = Number(serverDateKey.slice(5, 7));
    if (nextY > todayY || (nextY === todayY && nextM > todayM)) {
      nextY = todayY;
      nextM = todayM;
    }
    setViewYear(nextY);
    setViewMonth(nextM);
    setSyncStage('records');
  }

  // 외부 focus 요청(기록 추가/삭제 실행취소 등) — 같은 nonce가 처리되었는지를 anchor로 추적해 1회성 보정한다.
  // syncStage 보정 이후에 위치시켜 초기 렌더와 충돌하지 않도록 한다.
  const [focusAnchor, setFocusAnchor] = useState(0);
  if (focusRequest && focusRequest.nonce !== focusAnchor) {
    setFocusAnchor(focusRequest.nonce);
    const [fy, fm] = focusRequest.dateKey
      .split('-')
      .slice(0, 2)
      .map((s) => parseInt(s, 10));
    setViewYear(fy);
    setViewMonth(fm);
    setSelectedDateKey(null);
    // 외부 요청으로 특정 월에 고정 — 이후 자동 보정(records 점프)이 덮어쓰지 않도록 고정 상태로 둔다.
    if (syncStage !== 'records') setSyncStage('records');
  }

  // 캘린더가 표시 중인 월의 데이터를 자동 로드 (로그인 사용자: lazy fetch).
  // 초기 월도 서버가 내려준 실제 현재 월이라 곧바로 로드한다 (store가 동일 월 중복 호출은 합친다).
  useEffect(() => {
    void loadMonth(viewYear, viewMonth);
  }, [viewYear, viewMonth, loadMonth]);

  const itemsByDateKey = useMemo(() => {
    const map = new Map<string, ReportHistoryItem>();
    for (const item of history) {
      const key = getItemDateKey(item);
      const existing = map.get(key);
      if (!existing || existing.timestamp < item.timestamp) map.set(key, item);
    }
    return map;
  }, [history]);

  const selectedItem = selectedDateKey ? (itemsByDateKey.get(selectedDateKey) ?? null) : null;

  // 현재 뷰 월의 기록만 노출 (Supabase order desc 결과 그대로)
  const currentMonthKey = monthKeyOf(viewYear, viewMonth);
  const currentMonthItems = useMemo(
    () => history.filter((item) => getItemDateKey(item).slice(0, 7) === currentMonthKey),
    [history, currentMonthKey]
  );

  // 3개씩 로컬 페이지 (서버에서 받아온 한 달 안에서)
  const pages = useMemo(
    () => getChunkedArray<Array<ReportHistoryItem>>({ data: currentMonthItems, size: ITEMS_PER_PAGE }),
    [currentMonthItems]
  );
  const totalPages = pages.length;

  // 월이 바뀌면 로컬 페이지를 1로 초기화 — render 중 prop 변화 감지 패턴 (effect setState 대신)
  const [localPage, setLocalPage] = useState(1);
  const [pageMonthAnchor, setPageMonthAnchor] = useState(currentMonthKey);
  if (pageMonthAnchor !== currentMonthKey) {
    setPageMonthAnchor(currentMonthKey);
    setLocalPage(1);
  }
  const safeLocalPage = totalPages === 0 ? 1 : Math.min(localPage, totalPages);
  const currentPageItems = pages[safeLocalPage - 1] ?? [];

  // 초기 데이터 적재 중이거나 현재 월이 로딩 중이면 스켈레톤 노출
  const isShowingSkeleton = !isLoaded || loadingMonths.has(currentMonthKey);
  const monthHasRecords = useMemo(
    () => allDateKeys.some((d) => d.slice(0, 7) === currentMonthKey),
    [allDateKeys, currentMonthKey]
  );

  const handleChangeMonth = (year: number, month: number) => {
    setViewYear(year);
    setViewMonth(month);
    setSelectedDateKey(null);
  };

  const handleSelectDate = (key: string | null) => {
    setSelectedDateKey(key);
  };

  const handlePrevPage = () => setLocalPage((p) => Math.max(p - 1, 1));
  const handleNextPage = () => setLocalPage((p) => Math.min(p + 1, totalPages));

  const handleCopySelected = () => {
    if (!selectedItem) return;
    navigator.clipboard.writeText(selectedItem.content);
    toast.success('내용이 클립보드에 복사되었습니다.');
  };

  return (
    <div className="mt-6 rounded-xl border border-zinc-200 bg-white p-6 dark:border-zinc-800 dark:bg-zinc-900/50">
      <div className="mb-4 flex items-center gap-2">
        <History size={18} className="text-zinc-500" />
        <h2 className="text-sm font-semibold tracking-wider text-zinc-500 uppercase">이전 기록</h2>
      </div>

      {mode === 'guest' && (
        <p className="mb-3 text-[11px] text-zinc-400 dark:text-zinc-500">
          게스트 모드에서는 최대 {MAX_HISTORY_ITEMS}개까지만 브라우저에 보관되며, 그 이상은 가장 오래된 기록부터
          삭제됩니다.
        </p>
      )}

      <ReportCalendar
        dateKeys={allDateKeys}
        selectedDateKey={selectedDateKey}
        todayDateKey={serverDateKey}
        viewYear={viewYear}
        viewMonth={viewMonth}
        // 월은 서버 날짜로 첫 렌더부터 확정 — 헤더 라벨/이동 버튼을 곧바로 활성화한다.
        isReady
        onChangeMonth={handleChangeMonth}
        onSelectDate={handleSelectDate}
      />

      {selectedItem ? (
        <div className="mt-4 rounded-lg border border-blue-200 bg-blue-50/40 p-4 dark:border-blue-900/50 dark:bg-blue-900/10">
          <div className="mb-2 flex items-center justify-between">
            <span className="text-xs font-bold text-zinc-900 dark:text-zinc-100">
              {selectedItem.month}월 {selectedItem.day}일 보고서
            </span>
            <button
              type="button"
              onClick={() => setSelectedDateKey(null)}
              className="rounded p-1 text-zinc-400 hover:bg-white hover:text-zinc-600 dark:hover:bg-zinc-800"
              title="닫기"
              aria-label="닫기"
            >
              <X size={14} />
            </button>
          </div>
          <pre className="mb-3 max-h-60 overflow-auto rounded-md border border-blue-100 bg-white p-3 text-[11px] whitespace-pre-wrap text-zinc-700 dark:border-blue-900/40 dark:bg-background/50 dark:text-zinc-200">
            {selectedItem.content}
          </pre>
          <span className="mb-3 block text-[10px] text-zinc-400">
            {new Date(selectedItem.timestamp).toLocaleString()}
          </span>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={(e) => loadHistoryAction(selectedItem, e)}
              className="flex flex-1 items-center justify-center gap-1 rounded-md bg-zinc-900 px-3 py-2 text-xs font-semibold text-white transition-colors hover:bg-zinc-800 dark:bg-zinc-100 dark:text-background dark:hover:bg-zinc-200"
            >
              <RotateCcw size={14} />
              불러오기
            </button>
            <button
              type="button"
              onClick={handleCopySelected}
              className="flex items-center justify-center gap-1 rounded-md border border-zinc-200 px-3 py-2 text-xs font-medium text-zinc-700 transition-colors hover:border-blue-200 hover:bg-blue-50 hover:text-blue-600 dark:border-zinc-700 dark:text-zinc-200 dark:hover:border-blue-900/50 dark:hover:bg-blue-900/10"
            >
              <Copy size={14} />
              복사
            </button>
            <button
              type="button"
              onClick={(e) => deleteHistoryAction(selectedItem.id, e)}
              className="flex items-center justify-center gap-1 rounded-md border border-zinc-200 px-3 py-2 text-xs font-medium text-zinc-600 transition-colors hover:border-red-200 hover:bg-red-50 hover:text-red-600 dark:border-zinc-700 dark:text-zinc-300 dark:hover:border-red-900/50 dark:hover:bg-red-900/10"
            >
              <Trash2 size={14} />
              삭제
            </button>
          </div>
        </div>
      ) : (
        <>
          <div className="mt-4 flex flex-col gap-3">
            {isShowingSkeleton && currentPageItems.length === 0 ? (
              Array.from({ length: SKELETON_COUNT }).map((_, idx) => <HistoryCardSkeleton key={`sk-${idx}`} />)
            ) : currentMonthItems.length === 0 ? (
              <p className="rounded-lg border border-dashed border-zinc-200 py-6 text-center text-xs text-zinc-400 dark:border-zinc-700 dark:text-zinc-500">
                {monthHasRecords ? '기록을 불러오는 중입니다.' : '이 달에는 기록이 없습니다.'}
              </p>
            ) : (
              currentPageItems.map((item) => (
                <div
                  key={item.id}
                  onClick={(e) => loadHistoryAction(item, e)}
                  className="group relative flex cursor-pointer flex-col rounded-lg border border-zinc-100 bg-zinc-50 p-3 transition-all hover:border-blue-200 hover:bg-blue-50 dark:border-zinc-800 dark:bg-[#25262b]/20 dark:hover:border-blue-900/50 dark:hover:bg-blue-900/10"
                >
                  <div className="mb-1 flex items-center justify-between">
                    <span className="text-xs font-bold text-zinc-900 dark:text-zinc-100">
                      {item.month}월 {item.day}일 보고서
                    </span>
                    <div className="flex items-center gap-1 opacity-0 transition-opacity group-hover:opacity-100">
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          navigator.clipboard.writeText(item.content);
                          toast.success('내용이 클립보드에 복사되었습니다.');
                        }}
                        className="rounded p-1 text-zinc-400 hover:bg-white hover:text-blue-600 dark:hover:bg-zinc-800"
                        title="다시 복사"
                      >
                        <Copy size={14} />
                      </button>
                      <button
                        onClick={(e) => loadHistoryAction(item, e)}
                        className="rounded p-1 text-zinc-400 hover:bg-white hover:text-blue-600 dark:hover:bg-zinc-800"
                        title="불러오기"
                      >
                        <RotateCcw size={14} />
                      </button>
                      <button
                        onClick={(e) => deleteHistoryAction(item.id, e)}
                        className="rounded p-1 text-zinc-400 hover:bg-white hover:text-red-600 dark:hover:bg-zinc-800"
                        title="삭제"
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </div>
                  <p className="line-clamp-2 text-[11px] text-zinc-500 dark:text-zinc-400">
                    {item.content.split('\n').slice(2).join(' ').trim()}
                  </p>
                  <span className="mt-2 text-[10px] text-zinc-400">{new Date(item.timestamp).toLocaleString()}</span>
                </div>
              ))
            )}
          </div>

          {totalPages > 1 && (
            <div className="mt-6 flex items-center justify-between border-t border-zinc-100 pt-4 dark:border-zinc-800">
              <button
                onClick={handlePrevPage}
                disabled={safeLocalPage === 1}
                className="flex items-center gap-1 rounded-lg px-3 py-1.5 text-xs font-medium text-zinc-600 transition-colors hover:bg-zinc-100 disabled:cursor-not-allowed disabled:text-zinc-300 disabled:hover:bg-transparent dark:text-zinc-400 dark:hover:bg-zinc-800 dark:disabled:text-zinc-600"
              >
                <ChevronLeft size={14} />
                이전
              </button>
              <span className="text-xs text-zinc-400">
                {safeLocalPage} / {totalPages}
              </span>
              <button
                onClick={handleNextPage}
                disabled={safeLocalPage === totalPages}
                className="flex items-center gap-1 rounded-lg px-3 py-1.5 text-xs font-medium text-zinc-600 transition-colors hover:bg-zinc-100 disabled:cursor-not-allowed disabled:text-zinc-300 disabled:hover:bg-transparent dark:text-zinc-400 dark:hover:bg-zinc-800 dark:disabled:text-zinc-600"
              >
                다음
                <ChevronRight size={14} />
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
