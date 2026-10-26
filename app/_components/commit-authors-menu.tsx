'use client';

import { useEffect, useId, useRef, useState } from 'react';
import { AtSign, Check, Loader2, Mail, Plus, Search, UserPlus, X } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import type { GithubCommitAuthor } from '@/types';
import { GITHUB_COMMIT_AUTHOR_LOOKBACK_DAYS, GITHUB_COMMIT_EXTRA_AUTHORS_LIMIT } from '@/constants';
import { CloseButton, useDismissOnBack } from '@/components';
import { useDismissLayer, useResetOnHide } from '@/hooks';
import { queries } from '@/providers';
import { cn, isCommitAuthorEmail, normalizeCommitAuthor, sameCommitAuthor } from '@/utils';

type CommitAuthorsMenuProps = {
  // 연결한 GitHub 계정 login — 이미 조회하므로 추가하지 않는다
  login: string;
  authors: ReadonlyArray<string>;
  // 자동완성 후보를 모을 범위 끝(null 이면 지금)과 후보에서 뺄 저장소
  untilMs: number | null;
  excludedRepos: ReadonlyArray<string>;
  onAdd: (author: string) => void;
  onRemove: (author: string) => void;
};

// 목록에 보여 줄 저장소 수(나머지는 "외 N개")
const VISIBLE_REPOS = 2;

const matches = (candidate: GithubCommitAuthor, query: string) => {
  const q = query.trim().replace(/^@/, '').toLowerCase();
  if (!q) return true;
  return [candidate.author, candidate.name, ...candidate.repos].some((v) => v.toLowerCase().includes(q));
};

const repoLabel = (repos: ReadonlyArray<string>) =>
  repos.length > VISIBLE_REPOS
    ? `${repos.slice(0, VISIBLE_REPOS).join(', ')} 외 ${repos.length - VISIBLE_REPOS}개`
    : repos.join(', ');

// GitHub 커밋 가져오기에서 연결한 계정 외에 커밋을 함께 가져올 작성자(GitHub 사용자 이름·이메일).
// 커밋 작성 이메일이 GitHub 계정에 연결돼 있지 않아(예: GitLab 에서 옮겨 온 저장소) 잡히지 않는 커밋을 가져올 때 쓴다.
// 열면 연결한 계정이 볼 수 있는 저장소의 최근 커밋 작성자를 불러와 입력값으로 거르는 드롭다운으로 보여 준다.
// 목록에 없는 값(형식이 맞으면)도 직접 넣을 수 있다. 팝오버는 하단 줄(부모, `relative`) 폭에 맞춰 위로 연다.
export function CommitAuthorsMenu({
  login,
  authors,
  untilMs,
  excludedRepos,
  onAdd,
  onRemove,
}: Readonly<CommitAuthorsMenuProps>) {
  const [isOpen, setIsOpen] = useState(false);
  const [value, setValue] = useState('');
  const [error, setError] = useState<string | null>(null);
  // 키보드로 고른 드롭다운 항목(-1 이면 없음)
  const [activeIndex, setActiveIndex] = useState(-1);
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const inputId = useId();
  const listId = useId();

  const close = () => {
    setIsOpen(false);
    setValue('');
    setError(null);
    setActiveIndex(-1);
  };

  useDismissLayer(containerRef, close, { enabled: isOpen });
  useResetOnHide(close);
  useDismissOnBack(isOpen, close);

  useEffect(() => {
    if (isOpen) inputRef.current?.focus();
  }, [isOpen]);

  // 처음 열 때 불러오고, 다이얼로그가 열려 있는 동안은 다시 열어도 받아 둔 목록을 쓴다
  const candidates = useQuery({
    ...queries.github.commitAuthors(untilMs, excludedRepos),
    enabled: isOpen,
    staleTime: Infinity,
    refetchOnWindowFocus: false,
    retry: false,
  });
  const list = candidates.data?.ok ? candidates.data.authors.filter((c) => matches(c, value)) : [];
  const isFull = authors.length >= GITHUB_COMMIT_EXTRA_AUTHORS_LIMIT;
  const isAdded = (author: string) => authors.some((a) => sameCommitAuthor(a, author));
  // 목록에 없는 값을 그대로 넣을 수 있게 맨 위에 둔다(형식이 맞을 때만)
  const typed = normalizeCommitAuthor(value);
  const showTyped =
    typed !== null &&
    !sameCommitAuthor(typed, login) &&
    !(candidates.data?.ok && candidates.data.authors.some((c) => sameCommitAuthor(c.author, typed)));
  const options: Array<string> = [...(showTyped ? [typed] : []), ...list.map((c) => c.author)];

  const add = (raw: string) => {
    const author = normalizeCommitAuthor(raw);
    if (!author) {
      setError('GitHub 사용자 이름이나 이메일 주소를 입력해 주세요.');
      return;
    }
    if (sameCommitAuthor(author, login)) {
      setError('연결한 계정의 커밋은 이미 가져와요.');
      return;
    }
    if (isAdded(author)) {
      setError('이미 추가한 작성자예요.');
      return;
    }
    if (isFull) return;
    setValue('');
    setError(null);
    setActiveIndex(-1);
    onAdd(author);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      if (options.length === 0) return;
      const step = e.key === 'ArrowDown' ? 1 : -1;
      setActiveIndex((i) => (i + step + options.length) % options.length);
      return;
    }
    if (e.key === 'Enter') {
      e.preventDefault();
      const picked = options[activeIndex];
      add(picked ?? value);
    }
  };

  const activeOptionId = activeIndex >= 0 ? `${listId}-${activeIndex}` : undefined;

  return (
    <div ref={containerRef} className="shrink-0">
      <button
        type="button"
        onClick={() => (isOpen ? close() : setIsOpen(true))}
        aria-haspopup="dialog"
        aria-expanded={isOpen}
        className={cn(
          'flex items-center gap-1 rounded-md px-1.5 py-1 transition-colors hover:bg-zinc-100 hover:text-zinc-700 dark:hover:bg-zinc-800 dark:hover:text-zinc-200',
          isOpen && 'bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-200',
          authors.length > 0 && 'text-blue-600 dark:text-blue-400'
        )}
      >
        <UserPlus size={12} aria-hidden />
        {authors.length > 0 ? `추가 작성자 ${authors.length}명` : '작성자 추가'}
      </button>

      {isOpen && (
        <div
          role="dialog"
          aria-label="추가 작성자"
          className="absolute inset-x-0 bottom-full z-20 mb-1 flex flex-col gap-2 rounded-xl border border-zinc-200 bg-white p-3 text-xs shadow-lg dark:border-zinc-700 dark:bg-zinc-900"
        >
          <div className="flex items-start gap-2">
            <div className="min-w-0 flex-1">
              <p className="text-xs font-semibold text-zinc-700 dark:text-zinc-200">추가 작성자</p>
              <p className="mt-0.5 text-[11px] leading-relaxed text-zinc-500 dark:text-zinc-400">
                @{login} 계정이 볼 수 있는 저장소에서 이 작성자의 커밋도 함께 가져와요. 바꾸면 다시 불러와
                분류해요(미리보기에서 고친 내용은 초기화돼요).
              </p>
            </div>
            <CloseButton size="sm" onClick={close} className="-mt-1 -mr-1" />
          </div>

          {authors.length > 0 && (
            <ul className="flex flex-wrap gap-1.5" aria-label="추가한 작성자">
              {authors.map((author) => {
                const Icon = isCommitAuthorEmail(author) ? Mail : AtSign;
                return (
                  <li
                    key={author}
                    className="flex max-w-full items-center gap-1 rounded-full bg-blue-50 py-0.5 pr-0.5 pl-2 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300"
                  >
                    <Icon size={11} className="shrink-0" aria-hidden />
                    <span className="truncate font-mono text-[11px]" title={author}>
                      {author}
                    </span>
                    <button
                      type="button"
                      onClick={() => onRemove(author)}
                      aria-label={`${author} 작성자 빼기`}
                      className="shrink-0 rounded-full p-0.5 transition-colors hover:bg-blue-100 hover:text-red-600 dark:hover:bg-blue-900/60 dark:hover:text-red-400"
                    >
                      <X size={11} aria-hidden />
                    </button>
                  </li>
                );
              })}
            </ul>
          )}

          <div>
            <label htmlFor={inputId} className="sr-only">
              GitHub 사용자 이름 또는 이메일
            </label>
            <div className="flex items-center gap-1.5">
              <div className="relative min-w-0 flex-1">
                <Search
                  size={13}
                  className="pointer-events-none absolute top-1/2 left-2 -translate-y-1/2 text-zinc-400"
                  aria-hidden
                />
                <input
                  ref={inputRef}
                  id={inputId}
                  role="combobox"
                  aria-expanded
                  aria-controls={listId}
                  aria-autocomplete="list"
                  aria-activedescendant={activeOptionId}
                  value={value}
                  onChange={(e) => {
                    setValue(e.target.value);
                    setError(null);
                    setActiveIndex(-1);
                  }}
                  onKeyDown={handleKeyDown}
                  disabled={isFull}
                  placeholder={
                    isFull
                      ? `작성자는 ${GITHUB_COMMIT_EXTRA_AUTHORS_LIMIT}명까지 추가할 수 있어요`
                      : '사용자 이름·이름·이메일·저장소로 찾거나 직접 입력'
                  }
                  autoComplete="off"
                  autoCapitalize="off"
                  spellCheck={false}
                  aria-invalid={error !== null}
                  className="w-full rounded-md border border-zinc-200 bg-white py-1.5 pr-2 pl-7 text-xs text-zinc-800 outline-none focus:border-blue-400 disabled:opacity-60 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100"
                />
              </div>
              <button
                type="button"
                onClick={() => add(value)}
                disabled={isFull || value.trim() === ''}
                className="flex shrink-0 items-center gap-1 rounded-md bg-blue-600 px-2.5 py-1.5 text-[11px] font-semibold text-white transition-colors hover:bg-blue-700 disabled:opacity-50"
              >
                <Plus size={11} aria-hidden />
                추가
              </button>
            </div>
            {error && <p className="mt-1 text-[11px] text-red-500">{error}</p>}
          </div>

          <ul
            id={listId}
            role="listbox"
            aria-label="작성자 후보"
            className="max-h-64 overflow-y-auto rounded-md border border-zinc-100 dark:border-zinc-800"
          >
            {showTyped && (
              <li
                id={`${listId}-0`}
                role="option"
                aria-selected={activeIndex === 0}
                aria-disabled={isFull || isAdded(typed)}
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => add(typed)}
                className={cn(
                  'flex cursor-pointer items-center gap-2 border-b border-zinc-100 px-3 py-2 dark:border-zinc-800',
                  activeIndex === 0 ? 'bg-blue-50 dark:bg-blue-900/30' : 'hover:bg-zinc-50 dark:hover:bg-zinc-800/60'
                )}
              >
                <Plus size={13} className="shrink-0 text-blue-500" aria-hidden />
                <span className="min-w-0 flex-1 truncate">
                  <span className="font-mono text-zinc-800 dark:text-zinc-100">{typed}</span>
                  <span className="text-zinc-500 dark:text-zinc-400"> 직접 추가</span>
                </span>
              </li>
            )}
            {candidates.isPending ? (
              <li className="flex items-center justify-center gap-2 px-3 py-4 text-zinc-500 dark:text-zinc-400">
                <Loader2 size={13} className="animate-spin" aria-hidden />
                최근 {GITHUB_COMMIT_AUTHOR_LOOKBACK_DAYS}일 커밋 작성자를 불러오고 있어요
              </li>
            ) : candidates.data && !candidates.data.ok ? (
              <li className="px-3 py-4 text-center text-red-500">
                {candidates.data.message} 직접 입력해 추가할 수 있어요.
              </li>
            ) : candidates.isError ? (
              <li className="px-3 py-4 text-center text-red-500">
                작성자 목록을 불러오지 못했어요. 직접 입력해 추가할 수 있어요.
              </li>
            ) : list.length === 0 ? (
              !showTyped && (
                <li className="px-3 py-4 text-center text-zinc-500 dark:text-zinc-400">
                  {value.trim()
                    ? '일치하는 작성자가 없어요.'
                    : `최근 ${GITHUB_COMMIT_AUTHOR_LOOKBACK_DAYS}일 동안 다른 작성자의 커밋이 없어요.`}
                </li>
              )
            ) : (
              list.map((candidate, i) => {
                const index = i + (showTyped ? 1 : 0);
                const added = isAdded(candidate.author);
                const disabled = added || isFull;
                const Icon = candidate.kind === 'email' ? Mail : AtSign;
                return (
                  <li
                    key={candidate.author}
                    id={`${listId}-${index}`}
                    role="option"
                    aria-selected={activeIndex === index}
                    aria-disabled={disabled}
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => !disabled && add(candidate.author)}
                    onMouseEnter={() => setActiveIndex(index)}
                    className={cn(
                      'flex items-center gap-2 px-3 py-2',
                      disabled ? 'cursor-default opacity-60' : 'cursor-pointer',
                      activeIndex === index && !disabled && 'bg-blue-50 dark:bg-blue-900/30'
                    )}
                  >
                    <Icon size={13} className="shrink-0 text-zinc-400" aria-hidden />
                    <div className="min-w-0 flex-1">
                      <p className="flex min-w-0 items-baseline gap-1.5">
                        <span className="truncate font-mono text-zinc-800 dark:text-zinc-100" title={candidate.author}>
                          {candidate.author}
                        </span>
                        {candidate.name && (
                          <span className="shrink-0 truncate text-zinc-500 dark:text-zinc-400">{candidate.name}</span>
                        )}
                      </p>
                      <p className="truncate text-[11px] text-zinc-400" title={candidate.repos.join(', ')}>
                        커밋 {candidate.commits}건 · {repoLabel(candidate.repos)}
                      </p>
                    </div>
                    {added ? (
                      <span className="flex shrink-0 items-center gap-0.5 text-[11px] font-semibold text-blue-600 dark:text-blue-400">
                        <Check size={11} aria-hidden />
                        추가됨
                      </span>
                    ) : (
                      !isFull && (
                        <span className="shrink-0 text-[11px] font-semibold text-blue-600 dark:text-blue-400">
                          추가
                        </span>
                      )
                    )}
                  </li>
                );
              })
            )}
          </ul>
        </div>
      )}
    </div>
  );
}
