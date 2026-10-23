// 스트리밍 중인(아직 닫히지 않은) JSON 응답에서 화면에 보여 줄 값만 읽어 낸다.
// 전체를 파싱하지 않고 키 단위로 훑으므로, 마지막 문자열 값은 지금까지 생성된 만큼만 돌려준다.

// 문자열 조각을 풀어 쓴다. 이스케이프가 중간에 잘렸으면 그 앞까지만 쓴다.
const decode = (raw: string) => {
  try {
    return JSON.parse(`"${raw}"`) as string;
  } catch {
    try {
      return JSON.parse(`"${raw.replace(/\\(u[0-9a-fA-F]{0,3})?$/, '')}"`) as string;
    } catch {
      return raw;
    }
  }
};

const escapeKey = (key: string) => key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

// `"key": "..."` 의 값들(배열 안 객체마다 나오는 키 포함)
export const readStringValues = (text: string, key: string): Array<string> =>
  [...text.matchAll(new RegExp(`"${escapeKey(key)}"\\s*:\\s*"((?:[^"\\\\]|\\\\.)*)`, 'g'))].map((m) => decode(m[1]));

// `"key": ["...", "..."]` 의 원소들
export const readStringArray = (text: string, key: string): Array<string> => {
  const start = text.search(new RegExp(`"${escapeKey(key)}"\\s*:\\s*\\[`));
  if (start < 0) return [];
  const items: Array<string> = [];
  let current: string | null = null;
  let escaped = false;
  for (const char of text.slice(text.indexOf('[', start) + 1)) {
    if (current === null) {
      if (char === ']') break;
      if (char === '"') current = '';
      continue;
    }
    if (escaped) {
      current += char;
      escaped = false;
    } else if (char === '\\') {
      current += char;
      escaped = true;
    } else if (char === '"') {
      items.push(decode(current));
      current = null;
    } else {
      current += char;
    }
  }
  if (current !== null) items.push(decode(current));
  return items;
};

// `{"<idKey>": "...", "score": n}` 쌍. 숫자가 아직 생성 중이면(10 의 1 까지만 나온 경우 등) 건너뛴다.
export const readScores = (text: string, idKey: string): Array<{ id: string; score: number }> =>
  [
    ...text.matchAll(
      new RegExp(`"${escapeKey(idKey)}"\\s*:\\s*"([^"]*)"\\s*,\\s*"score"\\s*:\\s*(\\d+)(?=\\s*[,}])`, 'g')
    ),
  ].map((m) => ({ id: m[1], score: Number(m[2]) }));
