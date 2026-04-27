import type { ReactNode } from 'react';

export type ConfirmOptions = {
  title: string;
  description?: ReactNode;
  confirmText?: string;
  cancelText?: string;
  variant?: 'default' | 'danger';
};

export type ConfirmEntry = ConfirmOptions & {
  id: string;
  resolve: (value: boolean) => void;
};

export type ConfirmStore = {
  stack: ReadonlyArray<ConfirmEntry>;
  push: (entry: ConfirmEntry) => void;
  resolve: (id: string, value: boolean) => void;
};
