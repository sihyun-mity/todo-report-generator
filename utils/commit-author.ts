// GitHub login(영숫자와 하이픈, 39자 이하, 하이픈으로 시작·끝나지 않음)
const GITHUB_LOGIN_PATTERN = /^[a-z\d](?:[a-z\d]|-(?=[a-z\d])){0,38}$/i;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * 커밋 작성자 필터로 받을 값(GitHub 사용자 이름 또는 이메일)을 다듬는다. 둘 다 아니면 null.
 * 앞의 `@` 는 떼어 `@octocat` 처럼 적어도 받는다. GitHub `author` 필터는 대소문자를 가리지 않는다.
 */
export const normalizeCommitAuthor = (value: string): string | null => {
  const trimmed = value.trim();
  if (trimmed.includes('@') && !trimmed.startsWith('@')) {
    return trimmed.length <= 254 && EMAIL_PATTERN.test(trimmed) ? trimmed.toLowerCase() : null;
  }
  const login = trimmed.replace(/^@/, '');
  return GITHUB_LOGIN_PATTERN.test(login) ? login : null;
};

export const isCommitAuthorEmail = (author: string) => author.includes('@');

// 같은 작성자인지(대소문자 무시)
export const sameCommitAuthor = (a: string, b: string) => a.toLowerCase() === b.toLowerCase();
