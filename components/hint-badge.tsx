'use client';

import { type ReactNode, useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import { CircleHelp, type LucideIcon } from 'lucide-react';
import { useDismissLayer, useResetOnHide } from '@/hooks';
import { cn } from '@/utils';

type HintBadgeProps = {
  icon: LucideIcon;
  label: string;
  // 배지 색(배경·글자)
  className: string;
  // 툴팁 본문 — 이 배지가 무엇을 뜻하는지
  description: ReactNode;
  // 이 배지를 다는 기준(한 줄씩)
  criteria?: ReadonlyArray<ReactNode>;
};

// 툴팁과 배지 사이·화면 가장자리 여백(px)
const GAP = 6;
const MARGIN = 8;
// 배지에서 툴팁으로 마우스를 옮기는 사이(GAP)에 닫히지 않게 조금 기다린다
const CLOSE_DELAY_MS = 120;

// 배지 아래(자리가 없으면 위)에 두고 화면 밖으로 나가지 않게 좌우를 맞춘다
const place = (trigger: HTMLElement, tip: HTMLElement) => {
  const rect = trigger.getBoundingClientRect();
  const width = tip.offsetWidth;
  const height = tip.offsetHeight;
  const viewportWidth = document.documentElement.clientWidth;
  const left = Math.max(MARGIN, Math.min(rect.left, viewportWidth - width - MARGIN));
  const below = rect.bottom + GAP;
  const above = rect.top - GAP - height;
  const top = below + height <= window.innerHeight - MARGIN || above < MARGIN ? below : above;
  tip.style.left = `${left}px`;
  tip.style.top = `${top}px`;
};

/**
 * 설명이 딸린 배지. 물음표 아이콘으로 더 볼 내용이 있음을 알리고, 마우스를 올리거나(데스크톱) 누르면(터치) 기준과 설명을 띄운다.
 * 키보드는 포커스하면 열린다. 바깥 클릭·Esc 는 `useDismissLayer` 로 닫는다(모달 안에서 Esc 를 누르면 툴팁만 닫힌다).
 *
 * 툴팁은 popover(top layer)로 띄운다 — 모달의 스크롤 영역(overflow) 안에 두면 가장자리에서 잘려서다. DOM 으로는 배지 안에
 * 남아 있어 마우스가 툴팁으로 옮겨 가도 벗어난 것으로 보지 않는다.
 */
export function HintBadge({ icon: Icon, label, className, description, criteria }: Readonly<HintBadgeProps>) {
  const [isOpen, setIsOpen] = useState(false);
  const wrapperRef = useRef<HTMLSpanElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const tipRef = useRef<HTMLDivElement>(null);
  // 마지막으로 누른 포인터 종류 — 마우스는 올리면 이미 열려 있으므로 클릭으로 닫지 않는다
  const pointerTypeRef = useRef('');
  const closeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const tipId = useId();

  const cancelClose = () => {
    if (closeTimerRef.current) clearTimeout(closeTimerRef.current);
    closeTimerRef.current = null;
  };
  const open = () => {
    cancelClose();
    setIsOpen(true);
  };
  const close = () => {
    cancelClose();
    setIsOpen(false);
  };

  useDismissLayer(wrapperRef, close, { enabled: isOpen });
  useResetOnHide(close);
  useEffect(() => cancelClose, []);

  useLayoutEffect(() => {
    const tip = tipRef.current;
    const trigger = triggerRef.current;
    if (!isOpen || !tip || !trigger) return;
    tip.showPopover();
    place(trigger, tip);
    // 모달 본문을 스크롤해도 배지를 따라간다
    const follow = () => place(trigger, tip);
    window.addEventListener('scroll', follow, true);
    window.addEventListener('resize', follow);
    return () => {
      window.removeEventListener('scroll', follow, true);
      window.removeEventListener('resize', follow);
      if (tip.matches(':popover-open')) tip.hidePopover();
    };
  }, [isOpen]);

  return (
    <span
      ref={wrapperRef}
      className="inline-flex shrink-0"
      onPointerEnter={(e) => e.pointerType === 'mouse' && open()}
      onPointerLeave={(e) => {
        if (e.pointerType !== 'mouse') return;
        cancelClose();
        closeTimerRef.current = setTimeout(close, CLOSE_DELAY_MS);
      }}
    >
      <button
        ref={triggerRef}
        type="button"
        aria-expanded={isOpen}
        aria-describedby={isOpen ? tipId : undefined}
        onPointerDown={(e) => {
          pointerTypeRef.current = e.pointerType;
        }}
        onClick={() => {
          if (pointerTypeRef.current === 'mouse') open();
          else setIsOpen((v) => !v);
          pointerTypeRef.current = '';
        }}
        onFocus={(e) => e.currentTarget.matches(':focus-visible') && open()}
        onBlur={close}
        className={cn(
          'inline-flex cursor-help items-center gap-1 rounded-md px-1.5 py-0.5 text-[11px] font-semibold transition-shadow focus-visible:ring-2 focus-visible:ring-blue-400 focus-visible:outline-none',
          isOpen && 'ring-1 ring-current/30',
          className
        )}
      >
        <Icon size={11} aria-hidden />
        {label}
        <CircleHelp size={11} className="opacity-60" aria-hidden />
      </button>
      {isOpen && (
        <div
          ref={tipRef}
          id={tipId}
          role="tooltip"
          popover="manual"
          className="fixed inset-auto m-0 w-72 max-w-[calc(100vw-16px)] overflow-visible rounded-lg border border-zinc-200 bg-white p-3 text-left text-xs leading-relaxed font-normal text-zinc-600 shadow-lg dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-300"
        >
          <p className="mb-1 flex items-center gap-1 font-semibold text-zinc-800 dark:text-zinc-100">
            <Icon size={12} aria-hidden />
            {label}
          </p>
          <div>{description}</div>
          {criteria && criteria.length > 0 && (
            <>
              <p className="mt-2 mb-0.5 text-[11px] font-semibold text-zinc-500 dark:text-zinc-400">기준</p>
              <ul className="space-y-0.5">
                {criteria.map((item, i) => (
                  <li key={i} className="flex gap-1.5">
                    <span aria-hidden className="text-zinc-400">
                      ·
                    </span>
                    <span>{item}</span>
                  </li>
                ))}
              </ul>
            </>
          )}
        </div>
      )}
    </span>
  );
}
