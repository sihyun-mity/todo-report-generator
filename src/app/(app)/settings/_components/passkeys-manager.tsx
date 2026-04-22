'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import toast from 'react-hot-toast';
import { ArrowLeft, KeyRound, Pencil, Plus, Trash2 } from 'lucide-react';
import { isWebAuthnSupported, registerPasskey } from '@/lib/webauthn/client';

interface Passkey {
  id: string;
  device_name: string | null;
  transports: string[] | null;
  aaguid: string | null;
  device_type: 'single_device' | 'multi_device' | null;
  backed_up: boolean;
  created_at: string;
  last_used_at: string | null;
}

const dateFormatter = new Intl.DateTimeFormat('ko-KR', {
  year: 'numeric',
  month: 'numeric',
  day: 'numeric',
  hour: 'numeric',
  minute: 'numeric',
});

export default function PasskeysManager() {
  const [passkeys, setPasskeys] = useState<Passkey[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [registering, setRegistering] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState('');
  const [deletingId, setDeletingId] = useState<string | null>(null);
  // SSR 단계에서는 null(확인 전), mount 직후 true/false로 확정 → hydration mismatch + 경고 깜빡임 둘 다 회피
  const [supported, setSupported] = useState<boolean | null>(null);

  useEffect(() => {
    setSupported(isWebAuthnSupported());
  }, []);

  const fetchList = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/passkeys', { cache: 'no-store' });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        toast.error(body.error ?? '패스키 목록을 불러오지 못했습니다.');
        setPasskeys([]);
        return;
      }
      const body = (await res.json()) as { passkeys: Passkey[] };
      setPasskeys(body.passkeys ?? []);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchList();
  }, [fetchList]);

  const handleAdd = async () => {
    if (registering) return;
    setRegistering(true);
    try {
      await registerPasskey();
      toast.success('패스키가 등록되었습니다.');
      await fetchList();
    } catch (e) {
      const msg = (e as Error).message;
      if (!/NotAllowedError|cancel|timed out/i.test(msg)) {
        toast.error(msg);
      }
    } finally {
      setRegistering(false);
    }
  };

  const startEdit = (pk: Passkey) => {
    setEditingId(pk.id);
    setEditingName(pk.device_name ?? '');
  };

  const cancelEdit = () => {
    setEditingId(null);
    setEditingName('');
  };

  const saveEdit = async () => {
    if (!editingId) return;
    const id = editingId;
    const name = editingName.trim();
    try {
      const res = await fetch(`/api/passkeys/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ device_name: name }),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        toast.error(body.error ?? '이름 변경 실패');
        return;
      }
      toast.success('이름을 변경했습니다.');
      cancelEdit();
      await fetchList();
    } catch (e) {
      toast.error((e as Error).message);
    }
  };

  const handleDelete = async (pk: Passkey) => {
    const label = pk.device_name || defaultLabel(pk);
    if (!window.confirm(`"${label}" 패스키를 삭제합니다. 삭제 후에는 이 패스키로 로그인할 수 없습니다.\n\n계속할까요?`))
      return;
    setDeletingId(pk.id);
    try {
      const res = await fetch(`/api/passkeys/${pk.id}`, { method: 'DELETE' });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        toast.error(body.error ?? '삭제 실패');
        return;
      }
      toast.success('패스키를 삭제했습니다.');
      await fetchList();
    } finally {
      setDeletingId(null);
    }
  };

  return (
    <div className="mx-auto w-full max-w-2xl p-4 sm:p-6 lg:p-12">
      <header className="mb-8">
        <Link
          href="/settings"
          className="mb-3 inline-flex items-center gap-1 text-xs font-semibold text-zinc-500 hover:text-zinc-700 dark:text-zinc-400 dark:hover:text-zinc-200"
        >
          <ArrowLeft size={12} />
          계정 설정
        </Link>
        <h1 className="text-2xl font-extrabold tracking-tight text-zinc-900 sm:text-3xl dark:text-white">
          패스키 관리
        </h1>
        <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
          Face ID / 지문 / Windows Hello 등 기기의 생체 인증으로 비밀번호 없이 로그인할 수 있어요. 기기별로 따로
          등록하는 걸 권장합니다.
        </p>
      </header>

      <section className="rounded-2xl border border-zinc-200 bg-white p-6 dark:border-zinc-800 dark:bg-zinc-900">
        <div className="mb-5 flex items-center justify-between">
          <h2 className="text-lg font-bold text-zinc-900 dark:text-white">등록된 패스키</h2>
          {supported === true && (
            <button
              type="button"
              onClick={handleAdd}
              disabled={registering}
              className="flex items-center gap-1.5 rounded-lg bg-zinc-900 px-3 py-1.5 text-xs font-bold text-white transition-all hover:bg-zinc-800 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-white dark:text-black dark:hover:bg-zinc-200"
            >
              <Plus size={12} />
              {registering ? '등록 중...' : '패스키 추가'}
            </button>
          )}
        </div>

        {supported === false && (
          <p className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800 dark:border-amber-900/50 dark:bg-amber-950/30 dark:text-amber-300">
            이 브라우저는 패스키(WebAuthn)를 지원하지 않아 추가·사용이 불가능합니다.
          </p>
        )}

        {loading && <div className="py-6 text-center text-xs text-zinc-500 dark:text-zinc-400">불러오는 중...</div>}

        {!loading && passkeys && passkeys.length === 0 && (
          <div className="py-6 text-center text-xs text-zinc-500 dark:text-zinc-400">
            아직 등록된 패스키가 없습니다. {supported === true && '"패스키 추가" 버튼으로 등록해보세요.'}
          </div>
        )}

        {!loading && passkeys && passkeys.length > 0 && (
          <ul className="flex flex-col gap-2">
            {passkeys.map((pk) => {
              const label = pk.device_name || defaultLabel(pk);
              const isEditing = editingId === pk.id;
              return (
                <li
                  key={pk.id}
                  className="rounded-xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-950/40"
                >
                  <div className="flex items-start gap-3">
                    <div className="mt-0.5 rounded-lg bg-zinc-100 p-2 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-200">
                      <KeyRound size={16} />
                    </div>
                    <div className="flex-1">
                      {isEditing ? (
                        <div className="flex flex-col gap-2">
                          <input
                            autoFocus
                            value={editingName}
                            onChange={(e) => setEditingName(e.target.value)}
                            maxLength={80}
                            placeholder="기기 이름 (예: 아이폰 15)"
                            className="w-full rounded-lg border border-zinc-200 bg-white px-3 py-1.5 text-sm outline-none focus:ring-2 focus:ring-blue-500/50 dark:border-zinc-700 dark:bg-zinc-950"
                          />
                          <div className="flex gap-2">
                            <button
                              type="button"
                              onClick={saveEdit}
                              className="rounded-lg bg-zinc-900 px-3 py-1 text-xs font-bold text-white hover:bg-zinc-800 dark:bg-white dark:text-black dark:hover:bg-zinc-200"
                            >
                              저장
                            </button>
                            <button
                              type="button"
                              onClick={cancelEdit}
                              className="rounded-lg border border-zinc-200 bg-white px-3 py-1 text-xs font-semibold text-zinc-700 hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-200 dark:hover:bg-zinc-800"
                            >
                              취소
                            </button>
                          </div>
                        </div>
                      ) : (
                        <>
                          <div className="flex items-center gap-2">
                            <div className="text-sm font-semibold text-zinc-900 dark:text-white">{label}</div>
                            {pk.backed_up && (
                              <span className="rounded-md bg-emerald-100 px-1.5 py-0.5 text-[10px] font-bold text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300">
                                동기화
                              </span>
                            )}
                          </div>
                          <div className="mt-1 text-[11px] text-zinc-500 dark:text-zinc-400">
                            등록 {dateFormatter.format(new Date(pk.created_at))}
                            {pk.last_used_at && ` · 마지막 사용 ${dateFormatter.format(new Date(pk.last_used_at))}`}
                          </div>
                        </>
                      )}
                    </div>
                    {!isEditing && (
                      <div className="flex gap-1">
                        <button
                          type="button"
                          onClick={() => startEdit(pk)}
                          aria-label="이름 변경"
                          className="rounded-lg p-1.5 text-zinc-500 transition-colors hover:bg-zinc-100 hover:text-zinc-700 dark:text-zinc-400 dark:hover:bg-zinc-800 dark:hover:text-zinc-200"
                        >
                          <Pencil size={14} />
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDelete(pk)}
                          disabled={deletingId === pk.id}
                          aria-label="삭제"
                          className="rounded-lg p-1.5 text-zinc-500 transition-colors hover:bg-red-50 hover:text-red-600 disabled:opacity-50 dark:text-zinc-400 dark:hover:bg-red-950/40 dark:hover:text-red-400"
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}

function defaultLabel(pk: Passkey): string {
  // 기기 이름이 없을 때의 임시 라벨
  const kind = pk.device_type === 'multi_device' ? '동기화 패스키' : '하드웨어 패스키';
  const tail = pk.transports?.includes('internal') ? ' · 내장 인증기' : '';
  return `${kind}${tail}`;
}
