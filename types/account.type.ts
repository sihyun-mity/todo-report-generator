export type WithdrawAccountResult = { ok: true } | { ok: false; reason: 'invalid_confirm' | 'members_only' | 'failed' };
