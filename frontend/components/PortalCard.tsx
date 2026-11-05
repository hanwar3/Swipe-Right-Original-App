import React, { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowUpRight, Check, ClipboardPaste, RefreshCw } from 'lucide-react';
import { cardProfile, formatMoney, portalPaste, portalStatus } from '../lib/engine';
import { useToast } from '@/components/ui/use-toast';

/**
 * What the issuer's portal says about this card.
 *
 * Two things live only behind the cardholder's login: the offers targeted at
 * them, and how much of a credit they have spent. Nobody sells either. So the
 * user copies the page they are already looking at and pastes it here, and the
 * same rows arrive that the browser extension will write later.
 *
 * The important word on this screen is "add": an offer that was never added in
 * the portal pays nothing, which makes it worse than useless to recommend.
 */

interface Props {
  userId: string;
  cardId: number;
  cardName: string;
  issuer: string;
}

function ago(iso?: string): string | undefined {
  if (!iso) return undefined;
  const days = Math.floor((Date.now() - new Date(iso).getTime()) / 86400000);
  if (days <= 0) return 'today';
  if (days === 1) return 'yesterday';
  if (days < 30) return `${days} days ago`;
  return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

/**
 * A date with no time is midnight UTC, which renders as the day before in any
 * western timezone. Read it at midday so the date shown is the date meant.
 */
const shortDate = (iso: string) =>
  new Date(`${iso.slice(0, 10)}T12:00:00`).toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });

export default function PortalCard({ userId, cardId, cardName, issuer }: Props) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [pasting, setPasting] = useState(false);
  const [text, setText] = useState('');

  const { data: profile } = useQuery({
    queryKey: ['card-profile', userId, cardId],
    queryFn: () => cardProfile(cardId),
    retry: 0,
  });

  const { data: status } = useQuery({
    queryKey: ['portal-status', userId, cardId],
    queryFn: () => portalStatus(cardId),
    retry: 0,
  });

  const save = useMutation({
    mutationFn: () => portalPaste(cardId, text),
    onSuccess: (result) => {
      toast({
        title: result.kind === 'none' ? 'Nothing to read in that' : `Updated ${cardName}`,
        description: result.message,
        variant: result.kind === 'none' ? 'destructive' : undefined,
      });
      if (result.kind !== 'none') {
        setPasting(false);
        setText('');
      }
      queryClient.invalidateQueries({ queryKey: ['card-profile', userId, cardId] });
      queryClient.invalidateQueries({ queryKey: ['portal-status', userId, cardId] });
    },
    onError: (error: any) =>
      toast({
        title: 'Could not save that',
        description: error?.message ?? 'Try copying the page again.',
        variant: 'destructive',
      }),
  });

  const offers = profile?.offers ?? [];
  const credits = (profile?.benefits ?? []).filter((b) => b.fromPortal);
  const needAdding = offers.filter((o) => !o.isActivated);
  const checked = ago(status?.lastSyncedAt);
  const portalUrl = status?.portalUrl;

  return (
    <div className="rounded-xl border border-white/10 bg-white/[0.03] p-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[12px] font-bold tracking-tight text-[#F3EBF8]">From your {issuer} portal</p>
          <p className="mt-0.5 text-[11px] text-[#6E637A]">
            {checked ? `Checked ${checked}` : 'Not checked yet'}
            {offers.length > 0 && ` · ${offers.length} offer${offers.length === 1 ? '' : 's'}`}
            {credits.length > 0 && ` · ${credits.length} credit${credits.length === 1 ? '' : 's'}`}
          </p>
        </div>
        <button
          onClick={() => setPasting((p) => !p)}
          className="flex shrink-0 items-center gap-1.5 rounded-full border border-white/15 px-2.5 py-1 text-[11.5px] font-semibold text-[#DDD0E6] hover:border-[#E64BD4]/50 hover:text-[#F3EBF8]"
        >
          {checked ? <RefreshCw className="h-3 w-3" /> : <ClipboardPaste className="h-3 w-3" />}
          {checked ? 'Update' : 'Add data'}
        </button>
      </div>

      {needAdding.length > 0 && (
        <p className="mt-2 rounded-lg bg-[#E64BD4]/10 px-2.5 py-1.5 text-[11.5px] font-semibold text-[#F58EE4]">
          {needAdding.length} offer{needAdding.length === 1 ? '' : 's'} pay nothing until you add{' '}
          {needAdding.length === 1 ? 'it' : 'them'} in {issuer}.
        </p>
      )}

      {offers.length > 0 && (
        <ul className="mt-2.5 flex flex-col gap-1.5">
          {offers.slice(0, 8).map((o) => (
            <li key={o.id} className="flex items-baseline justify-between gap-3">
              <span className="min-w-0">
                <span className="block truncate text-[12.5px] font-semibold text-[#F3EBF8]">{o.merchantName}</span>
                <span className="block text-[11px] text-[#9B8FA6]">
                  {o.offerDescription}
                  {o.daysLeft !== undefined && o.daysLeft <= 30 && (
                    <span className={o.daysLeft <= 7 ? 'text-[#F58EE4]' : ''}>
                      {' · '}
                      {o.daysLeft === 0 ? 'ends today' : `${o.daysLeft} day${o.daysLeft === 1 ? '' : 's'} left`}
                    </span>
                  )}
                </span>
              </span>
              {o.isActivated ? (
                <span className="flex shrink-0 items-center gap-1 text-[11px] font-semibold text-[#4FCE8C]">
                  <Check className="h-3 w-3" /> Added
                </span>
              ) : portalUrl ? (
                <a
                  href={portalUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="flex shrink-0 items-center gap-0.5 text-[11px] font-semibold text-[#E64BD4] hover:text-[#F58EE4]"
                >
                  Add in {issuer} <ArrowUpRight className="h-3 w-3" />
                </a>
              ) : (
                <span className="shrink-0 text-[11px] font-semibold text-[#E64BD4]">Needs adding</span>
              )}
            </li>
          ))}
          {offers.length > 8 && (
            <li className="text-[11px] text-[#6E637A]">and {offers.length - 8} more</li>
          )}
        </ul>
      )}

      {credits.length > 0 && (
        <ul className="mt-3 flex flex-col gap-2 border-t border-white/[0.07] pt-2.5">
          {credits.map((b) => {
            const pct = b.valueCents > 0 ? Math.min(100, Math.round((b.usedCents / b.valueCents) * 100)) : 0;
            return (
              <li key={b.benefitId}>
                <div className="flex items-baseline justify-between gap-3">
                  <span className="truncate text-[12.5px] font-semibold text-[#F3EBF8]">{b.name}</span>
                  <span className="shrink-0 font-mono text-[11.5px] text-[#DDD0E6]">
                    {formatMoney(b.usedCents)} of {formatMoney(b.valueCents)}
                  </span>
                </div>
                <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-white/10">
                  <div className="h-full rounded-full bg-[#E64BD4]" style={{ width: `${pct}%` }} />
                </div>
                <p className="mt-1 text-[11px] text-[#6E637A]">
                  {formatMoney(b.remainingCents)} left
                  {b.resetsOn && ` · resets ${shortDate(b.resetsOn)}`}
                </p>
              </li>
            );
          })}
        </ul>
      )}

      {offers.length === 0 && credits.length === 0 && !pasting && (
        <p className="mt-2 text-[11.5px] leading-relaxed text-[#6E637A]">
          Your {issuer} offers and credits are only visible when you are signed in to {issuer}. Copy that page and
          paste it here to track them.
        </p>
      )}

      {pasting && (
        <div className="mt-3 border-t border-white/[0.07] pt-3">
          <ol className="mb-2 list-decimal pl-4 text-[11.5px] leading-relaxed text-[#9B8FA6]">
            <li>
              Open your {issuer} offers page
              {portalUrl && (
                <>
                  {' '}
                  <a href={portalUrl} target="_blank" rel="noreferrer" className="font-semibold text-[#E64BD4] hover:text-[#F58EE4]">
                    here
                  </a>
                </>
              )}
              , or a single benefit page.
            </li>
            <li>Select all of it and copy.</li>
            <li>Paste below. Nothing leaves your account but the offer text.</li>
          </ol>
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            rows={5}
            placeholder="Paste the page here"
            aria-label={`Paste your ${issuer} page`}
            className="w-full rounded-lg border border-white/10 bg-black/40 px-3 py-2 text-[12.5px] text-[#F3EBF8] placeholder:text-[#4A4453] outline-none focus:border-[#E64BD4]/60"
          />
          <div className="mt-2 flex items-center gap-2">
            <button
              onClick={() => save.mutate()}
              disabled={text.trim().length < 20 || save.isPending}
              className="rounded-full bg-[#E64BD4] px-3.5 py-1.5 text-[12px] font-bold text-black hover:bg-[#F06BDD] disabled:opacity-40"
            >
              {save.isPending ? 'Reading' : 'Save'}
            </button>
            <button
              onClick={() => { setPasting(false); setText(''); }}
              className="text-[12px] font-semibold text-[#9B8FA6] hover:text-[#F3EBF8]"
            >
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
