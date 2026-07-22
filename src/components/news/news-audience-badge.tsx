import { LockKeyhole, UserRound } from 'lucide-react';
import { NEWS_AUDIENCE_LABEL } from '@/constants';
import { NEWS_AUDIENCE } from '@/enums';
import type { NewsAudience } from '@/types';

type Props = {
  audience: NewsAudience;
};

// `all` 은 모두에게 보이는 기본값이라 배지를 달지 않는다 — 전용 소식만 표시해 대비를 만든다.
const STYLE: Readonly<Record<Exclude<NewsAudience, typeof NEWS_AUDIENCE.ALL>, string>> = {
  [NEWS_AUDIENCE.MEMBER]:
    'border-blue-200 bg-blue-50 text-blue-600 dark:border-blue-900 dark:bg-blue-950/50 dark:text-blue-300',
  [NEWS_AUDIENCE.GUEST]:
    'border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-900 dark:bg-amber-950/50 dark:text-amber-300',
};

export function NewsAudienceBadge({ audience }: Readonly<Props>) {
  if (audience === NEWS_AUDIENCE.ALL) return null;

  const Icon = audience === NEWS_AUDIENCE.MEMBER ? LockKeyhole : UserRound;

  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-semibold ${STYLE[audience]}`}
    >
      <Icon className="h-3 w-3" aria-hidden />
      {NEWS_AUDIENCE_LABEL[audience]}
    </span>
  );
}
