/* eslint-disable @typescript-eslint/no-explicit-any */

export const shuffle = (list: any[]) => {
  for (let i = list.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [list[i], list[j]] = [list[j], list[i]];
  }
};

export const getChunkedArray = <T>({ data, size }: { data: T; size: number }): T[] => {
  if (!Array.isArray(data)) {
    throw ReferenceError('data is not array.');
  }

  const result: T[] = [];

  for (let i = 0; i < data.length; i += size) {
    const chunk = data.slice(i, i + size);
    result.push(chunk as T);
  }

  return result;
};

export const filterDuplicateItem = <T extends { [key: string]: unknown }>({
  items,
  key,
}: {
  items: T[];
  key: string;
}) => {
  const uniqueKeys = new Map();
  return items.filter((v) => !uniqueKeys.has(v[key]) && uniqueKeys.set(v[key], true));
};

export const deepCopy = <T extends unknown[]>(data: T): T => JSON.parse(JSON.stringify(data ?? '[]'));
