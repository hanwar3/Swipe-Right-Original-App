import React, { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useAuth } from '../contexts/AuthContext';
import { createPairingCode, listExtensions, revokeExtension } from '../lib/engine';

interface AccountSheetProps {
  open: boolean;
  onClose: () => void;
}

const section = 'space-y-2.5 rounded-2xl border border-white/[0.07] bg-white/[0.02] p-4';
const heading = 'text-[13px] font-semibold uppercase tracking-[0.08em] text-[#A99DB3]';
const body = 'text-[13.5px] leading-relaxed text-[#DDD0E6]';
const quiet =
  'h-10 rounded-full border border-white/[0.12] bg-transparent px-4 text-[13.5px] font-semibold text-[#F3EBF8] hover:bg-white/[0.06]';

function useCountdown(until?: string) {
  const [left, setLeft] = useState(0);
  useEffect(() => {
    if (!until) return;
    const tick = () => setLeft(Math.max(0, Math.round((new Date(until).getTime() - Date.now()) / 1000)));
    tick();
    const id = window.setInterval(tick, 1000);
    return () => window.clearInterval(id);
  }, [until]);
  return left;
}

/**
 * Account and security: connect the browser extension, sign out on every
 * device, delete the account. Nothing here is a new product feature; it is
 * the plumbing that keeps a wallet's data in its owner's hands.
 */
export default function AccountSheet({ open, onClose }: AccountSheetProps) {
  const { user, logoutEverywhere, deleteAccount } = useAuth();
  const queryClient = useQueryClient();
  const [pairing, setPairing] = useState<{ code: string; expiresAt: string } | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const left = useCountdown(pairing?.expiresAt);

  const devices = useQuery({
    queryKey: ['extensions', user?.userId],
    queryFn: listExtensions,
    enabled: open && !!user,
    refetchInterval: pairing && left > 0 ? 3000 : false,
  });

  const pair = useMutation({
    mutationFn: createPairingCode,
    onSuccess: (r) => setPairing(r),
    onError: (e: Error) => setError(e.message),
  });

  const revoke = useMutation({
    mutationFn: revokeExtension,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['extensions', user?.userId] }),
  });

  // Once the extension uses the code it shows up in the list; hide the code.
  const count = devices.data?.devices.length ?? 0;
  const [seen, setSeen] = useState(0);
  useEffect(() => {
    if (pairing && count > seen) setPairing(null);
    setSeen(count);
  }, [count]); // eslint-disable-line react-hooks/exhaustive-deps

  async function remove() {
    setError(null);
    try {
      await deleteAccount(password);
      onClose();
    } catch (e) {
      setError((e as Error).message);
    }
  }

  function close() {
    setPairing(null);
    setConfirming(false);
    setPassword('');
    setError(null);
    onClose();
  }

  const needsPassword = user?.authProvider === 'email';

  return (
    <Dialog open={open} onOpenChange={(o) => !o && close()}>
      <DialogContent className="max-h-[88vh] gap-4 overflow-y-auto rounded-3xl border-white/[0.08] bg-[#0E0A11] p-6 sm:max-w-md">
        <DialogHeader className="text-left">
          <DialogTitle className="text-[22px] font-bold leading-tight tracking-[-0.01em] text-[#F3EBF8]">
            Account &amp; security
          </DialogTitle>
          <DialogDescription className="text-[13.5px] text-[#A99DB3]">{user?.email}</DialogDescription>
        </DialogHeader>

        <section className={section} aria-labelledby="ext-h">
          <h3 id="ext-h" className={heading}>Browser extension</h3>
          <p className={body}>
            The extension reads your offers and credits while you're signed in to Chase or Amex, adds
            every offer with one tap, and syncs them here. It never sees your bank password.
          </p>
          {pairing && left > 0 ? (
            <div className="rounded-xl bg-white/[0.04] p-3 text-center">
              <p className="text-[12px] text-[#A99DB3]">Type this into the extension</p>
              <p className="mt-1 font-mono text-[26px] font-bold tracking-[0.18em] text-[#F3EBF8]" aria-live="polite">
                {pairing.code}
              </p>
              <p className="mt-1 text-[12px] text-[#8A7E95]">
                Works once, for {Math.floor(left / 60)}:{String(left % 60).padStart(2, '0')}
              </p>
            </div>
          ) : (
            <Button className={quiet} onClick={() => pair.mutate()} disabled={pair.isPending}>
              {pair.isPending ? 'Getting a code…' : 'Connect a browser'}
            </Button>
          )}
          {count > 0 && (
            <ul className="divide-y divide-white/[0.06]">
              {devices.data!.devices.map((d) => (
                <li key={d.id} className="flex items-center justify-between gap-3 py-2">
                  <span className="min-w-0">
                    <span className="block truncate text-[13.5px] font-semibold text-[#F3EBF8]">{d.label}</span>
                    <span className="block text-[12px] text-[#8A7E95]">
                      {d.lastUsedAt
                        ? `Last synced ${new Date(d.lastUsedAt).toLocaleDateString()}`
                        : 'Connected, not used yet'}
                    </span>
                  </span>
                  <button
                    type="button"
                    onClick={() => revoke.mutate(d.id)}
                    className="shrink-0 text-[12.5px] font-semibold text-[#E64BD4] hover:text-[#F06BDD]"
                  >
                    Disconnect
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className={section} aria-labelledby="sec-h">
          <h3 id="sec-h" className={heading}>Sessions</h3>
          <p className={body}>Lost a phone, or signed in somewhere you shouldn't have? This signs you out everywhere.</p>
          <Button
            className={quiet}
            onClick={async () => {
              await logoutEverywhere();
              close();
            }}
          >
            Sign out on all devices
          </Button>
        </section>

        <section className={section} aria-labelledby="del-h">
          <h3 id="del-h" className={heading}>Delete account</h3>
          {!confirming ? (
            <>
              <p className={body}>Removes your account, wallet, offers, credit usage and forwarding address. This can't be undone.</p>
              <Button className={quiet} onClick={() => setConfirming(true)}>
                Delete my account
              </Button>
            </>
          ) : (
            <form
              className="space-y-2.5"
              onSubmit={(e) => {
                e.preventDefault();
                remove();
              }}
            >
              <p className={body}>
                {needsPassword ? 'Enter your password to confirm.' : 'Confirm to delete everything.'}
              </p>
              {needsPassword && (
                <Input
                  type="password"
                  autoComplete="current-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  aria-label="Password"
                  className="h-11 rounded-xl border-white/[0.1] bg-white/[0.03] text-[15px] text-[#F3EBF8]"
                  required
                />
              )}
              <div className="flex gap-2">
                <Button type="button" className={quiet} onClick={() => setConfirming(false)}>
                  Keep it
                </Button>
                <Button
                  type="submit"
                  className="h-10 rounded-full bg-[#E5484D] px-4 text-[13.5px] font-semibold text-white hover:bg-[#F2555A]"
                >
                  Delete forever
                </Button>
              </div>
            </form>
          )}
        </section>

        {error && (
          <p role="alert" className="text-[13px] text-[#FF8A8E]">
            {error}
          </p>
        )}
      </DialogContent>
    </Dialog>
  );
}
