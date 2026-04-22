import 'server-only';

/**
 * Supabase `bytea` 컬럼은 PostgREST 기본 설정에서 `\x<hex>` 문자열로 오간다.
 * WebAuthn의 publicKey 등 Uint8Array 데이터를 이 컬럼에 저장/조회할 때 사용한다.
 */

export function bytesToBytea(bytes: Uint8Array): string {
  let hex = '\\x';
  for (const b of bytes) {
    hex += b.toString(16).padStart(2, '0');
  }
  return hex;
}

export function byteaToBytes(input: unknown): Uint8Array<ArrayBuffer> {
  if (typeof input !== 'string') {
    throw new Error('bytea 값이 문자열이 아닙니다.');
  }
  const stripped = input.startsWith('\\x') ? input.slice(2) : input;
  if (stripped.length % 2 !== 0) {
    throw new Error('bytea hex 길이가 잘못되었습니다.');
  }
  const out = new Uint8Array(stripped.length / 2);
  for (let i = 0; i < out.length; i++) {
    out[i] = parseInt(stripped.substring(i * 2, i * 2 + 2), 16);
  }
  return out;
}
