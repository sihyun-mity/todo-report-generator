import type { GithubImportIntent } from '@/types';

// 커밋 가져오기 연결 의도 쿠키(`GITHUB_IMPORT_INTENT_COOKIE`) 값을 읽는다. 형식이 어긋나면 null.
export function parseGithubImportIntent(raw: string | undefined): GithubImportIntent | null {
  if (!raw) return null;
  try {
    const intent = JSON.parse(decodeURIComponent(raw)) as Partial<GithubImportIntent>;
    if (typeof intent.userId !== 'string' || !intent.userId) return null;
    const next =
      typeof intent.next === 'string' && intent.next.startsWith('/') && !intent.next.startsWith('//')
        ? intent.next
        : '/';
    return { userId: intent.userId, next };
  } catch {
    return null;
  }
}
