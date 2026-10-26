import { ComponentProps } from 'react';
import { X } from 'lucide-react';
import { cn } from '@/utils';

type CloseButtonSize = 'sm' | 'md';

// sm: 팝오버·배너·인라인 패널, md: 모달 다이얼로그 머리줄
const SIZE_CLASS: Record<CloseButtonSize, string> = { sm: 'p-1.5', md: 'p-2' };
const ICON_SIZE: Record<CloseButtonSize, number> = { sm: 14, md: 20 };

// 버튼이 아닌 요소(예: 홈으로 가는 Link)도 같은 모양을 쓰도록 클래스만 따로 내보낸다.
export function closeButtonClassName(size: CloseButtonSize = 'md', className?: string) {
  return cn(
    'inline-flex shrink-0 items-center justify-center rounded-full text-zinc-400 transition-colors hover:bg-zinc-100 hover:text-zinc-700 dark:text-zinc-500 dark:hover:bg-zinc-800 dark:hover:text-zinc-200',
    SIZE_CLASS[size],
    className
  );
}

export function CloseIcon({ size = 'md' }: Readonly<{ size?: CloseButtonSize }>) {
  return <X size={ICON_SIZE[size]} aria-hidden />;
}

type CloseButtonProps = Omit<ComponentProps<'button'>, 'children'> & {
  size?: CloseButtonSize;
};

// 창·팝오버의 X 닫기 버튼. 모든 닫기 버튼이 같은 모양을 갖도록 이 컴포넌트를 쓴다.
export function CloseButton({
  size = 'md',
  className,
  'aria-label': ariaLabel = '닫기',
  ...props
}: Readonly<CloseButtonProps>) {
  return (
    <button type="button" aria-label={ariaLabel} className={closeButtonClassName(size, className)} {...props}>
      <CloseIcon size={size} />
    </button>
  );
}
