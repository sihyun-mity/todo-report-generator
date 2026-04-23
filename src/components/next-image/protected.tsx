import { ComponentProps, ReactNode } from 'react';
import { OriginNextImage } from '@/components/next-image/next-image';
import { cn } from '@/utils';

/**
 * A React component that wraps the `NextImage` component,
 * applying copy anti-logic
 */
export function Protected({ imageClass, ...props }: ComponentProps<typeof OriginNextImage>): ReactNode {
  return (
    <OriginNextImage
      {...props}
      imageClass={cn(imageClass, '[-webkit-touch-callout: none] pointer-events-none select-none')}
      draggable={false}
    />
  );
}
