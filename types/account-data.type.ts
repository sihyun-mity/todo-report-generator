import type { ACCOUNT_DATA_KIND_VALUES } from '@/enums';

export type AccountDataKind = (typeof ACCOUNT_DATA_KIND_VALUES)[number];

/** 종류별로 서버에 남아 있는 행 수. 조회하지 못한 종류는 null. */
export type AccountDataSummary = Record<AccountDataKind, number | null>;

export type AccountDataSummaryResult =
  | { ok: true; summary: AccountDataSummary }
  | { ok: false; reason: 'members_only' };

export type DeleteAccountDataResult =
  | { ok: true; deleted: ReadonlyArray<AccountDataKind> }
  | { ok: false; reason: 'members_only' | 'invalid_request' }
  | {
      ok: false;
      reason: 'partial_failure';
      deleted: ReadonlyArray<AccountDataKind>;
      failed: ReadonlyArray<AccountDataKind>;
    };
