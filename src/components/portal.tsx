'use client';

import type { ReactNode } from 'react';
import { createPortal } from 'react-dom';
import dynamic from 'next/dynamic';

type Props = {
  children: ReactNode;
};

export default dynamic(
  () =>
    Promise.resolve(({ children }: Props) => {
      const node = document.querySelector('#next-app-portal');

      if (node) return createPortal(children, node);

      return null;
    }),
  { ssr: false },
);
