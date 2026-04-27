import ReactLoadingSkeleton from 'react-loading-skeleton';
import { ComponentProps } from 'react';
import { cn } from '@/utils';

type Props = ComponentProps<typeof ReactLoadingSkeleton>;

export function Skeleton({ containerClassName, ...props }: Readonly<Props>) {
  return <ReactLoadingSkeleton containerClassName={cn('flex', containerClassName)} {...props} />;
}
