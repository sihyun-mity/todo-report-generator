// 받침 여부로 조사를 고른다(괄호·따옴표 등 끝 기호는 건너뛴다). 한글이 아니면 숫자만 읽고, 나머지는 둘 다 적는다.
const DIGIT_BATCHIM = { '0': 1, '1': 8, '2': 0, '3': 1, '4': 0, '5': 0, '6': 1, '7': 8, '8': 8, '9': 0 } as const;
const josa = (word: string, withBatchim: string, without: string, rieulTakesWithout = false) => {
  const last = word.replace(/[^\p{L}\p{N}]+$/u, '').at(-1) ?? '';
  const code = last.charCodeAt(0) - 0xac00;
  const batchim =
    code >= 0 && code <= 11171
      ? code % 28
      : last in DIGIT_BATCHIM
        ? DIGIT_BATCHIM[last as keyof typeof DIGIT_BATCHIM]
        : null;
  if (batchim === null) return `${withBatchim}(${without})`;
  return batchim === 0 || (rieulTakesWithout && batchim === 8) ? without : withBatchim;
};
export const eul = (word: string) => `${word}${josa(word, '을', '를')}`;
export const euro = (word: string) => `${word}${josa(word, '으로', '로', true)}`;
