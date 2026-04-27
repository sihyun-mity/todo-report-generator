import { ReactNode } from 'react';
import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';

type Props = {
  title: string;
  description?: ReactNode;
};

export function SettingsSubHeader({ title, description }: Readonly<Props>) {
  return (
    <header className="mb-8">
      <Link
        href="/settings"
        className="mb-3 inline-flex items-center gap-1 text-xs font-semibold text-zinc-500 hover:text-zinc-700 dark:text-zinc-400 dark:hover:text-zinc-200"
      >
        <ArrowLeft size={12} />
        계정 설정
      </Link>
      <h1 className="text-2xl font-extrabold tracking-tight text-zinc-900 sm:text-3xl dark:text-white">{title}</h1>
      {description && <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">{description}</p>}
    </header>
  );
}
