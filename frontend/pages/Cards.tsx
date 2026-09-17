import React, { useEffect, useMemo, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Navigate, useNavigate, useSearchParams } from 'react-router-dom';
import { Check, Plus, Search, X } from 'lucide-react';
import backend from '~backend/client';
import CardFace from '../components/CardFace';
import { useCatalogue, useWallet } from '../lib/wallet';
import { useToast } from '@/components/ui/use-toast';

/**
 * Wallet: every card, and the place you choose which ones are yours.
 *
 * Browsing and building the portfolio happen here. What your cards are doing
 * for you (credits used, deadlines, offers) lives in Insights, which reads the
 * portfolio this page writes.
 */

type Scope = 'all' | 'mine';

export default function Cards() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { cards: catalogue, offline, isLoading } = useCatalogue();
  const wallet = useWallet();

  const [query, setQuery] = useState('');
  const [issuer, setIssuer] = useState<string | null>(null);
  const [scope, setScope] = useState<Scope>('all');
  const [confirmRemove, setConfirmRemove] = useState<number | null>(null);

  const [newName, setNewName] = useState('');
  const [newIssuer, setNewIssuer] = useState('');

  // Card detail used to live here; it belongs to Insights now. Old links still work.
  const legacyCard = searchParams.get('card');

  // A "Remove?" prompt that nobody answers should not stay armed.
  useEffect(() => {
    if (confirmRemove === null) return;
    const t = setTimeout(() => setConfirmRemove(null), 3500);
    return () => clearTimeout(t);
  }, [confirmRemove]);

  // Issuer filters come from the catalogue itself, never from a fixed list.
  const issuers = useMemo(
    () => Array.from(new Set(catalogue.map((c) => c.issuer))).sort(),
    [catalogue]
  );

  // Cards added to the device wallet stay listed even if the catalogue changes.
  const pool = useMemo(() => {
    const byId = new Map(catalogue.map((c) => [c.id, c]));
    wallet.cards.forEach((c) => { if (!byId.has(c.id)) byId.set(c.id, c); });
    return Array.from(byId.values());
  }, [catalogue, wallet.cards]);

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    return pool
      .filter((c) => (scope === 'mine' ? wallet.has(c.id) : true))
      .filter((c) => (issuer ? c.issuer === issuer : true))
      .filter((c) => !q || c.name.toLowerCase().includes(q) || c.issuer.toLowerCase().includes(q))
      .sort((a, b) => {
        const mine = Number(wallet.has(b.id)) - Number(wallet.has(a.id));
        return mine !== 0 ? mine : a.name.localeCompare(b.name);
      });
  }, [pool, query, issuer, scope, wallet]);

  const addCardMutation = useMutation({
    mutationFn: (data: { name: string; issuer?: string }) =>
      backend.cards.addCard(data),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['cards', 'catalogue'] });
      setNewName('');
      setNewIssuer('');
      toast({
        title: data.isNew ? 'Card added' : 'Already listed',
        description: data.isNew
          ? `${data.card.name} is in the catalogue now.`
          : `${data.card.name} was already in the catalogue.`,
      });
    },
    onError: (error: any) => {
      toast({
        title: 'Could not add that card',
        description: error?.message || 'Check the name and try again.',
        variant: 'destructive',
      });
    },
  });

  async function toggle(card: (typeof pool)[number]) {
    if (wallet.mode === 'signed-out') {
      toast({ title: 'Sign in to build your wallet', description: 'Your cards are saved to your account.' });
      return;
    }
    if (wallet.has(card.id)) {
      if (confirmRemove !== card.id) {
        setConfirmRemove(card.id);
        return;
      }
      setConfirmRemove(null);
      const ok = await wallet.remove(card.id);
      if (!ok) toast({ title: 'Could not remove that card', variant: 'destructive' });
      return;
    }
    const ok = await wallet.add(card);
    if (!ok) toast({ title: 'Could not add that card', variant: 'destructive' });
  }

  if (legacyCard) return <Navigate to={`/recommendations?card=${legacyCard}`} replace />;

  const count = wallet.cards.length;

  return (
    <div className="mx-auto w-full max-w-md px-5 pb-8 pt-4">
      <h1 className="text-[26px] font-extrabold leading-tight tracking-tight text-[#F3EBF8]">Wallet</h1>
      <p className="mt-1.5 text-[13.5px] leading-relaxed text-[#9B8FA6]">
        {wallet.mode === 'signed-out'
          ? 'Browse every card. Sign in to choose the ones you carry.'
          : count > 0
            ? `${count} card${count === 1 ? '' : 's'} in your wallet. Tap a card to add or open it.`
            : 'Tap the cards you carry to add them to your wallet.'}
      </p>
      {wallet.mode === 'device' && (
        <p className="mt-1 text-[11.5px] text-[#6E637A]">
          Offline. Your wallet is saved on this device until the app can reach your account.
        </p>
      )}

      {/* search */}
      <div className="mt-4 flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.05] py-2 pl-3.5 pr-2">
        <Search className="h-4 w-4 shrink-0 text-[#6E637A]" />
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Card or issuer"
          aria-label="Search cards"
          className="min-w-0 flex-1 bg-transparent text-[14.5px] text-[#F3EBF8] placeholder:text-[#5C5468] outline-none"
        />
        {query && (
          <button onClick={() => setQuery('')} aria-label="Clear search" className="shrink-0 rounded-full p-1.5 text-[#6E637A] hover:text-[#F3EBF8]">
            <X className="h-3.5 w-3.5" />
          </button>
        )}
      </div>

      {/* scope */}
      <div className="mt-3 flex rounded-full border border-white/10 bg-white/[0.04] p-1" role="tablist" aria-label="Which cards">
        {([['all', 'All cards'], ['mine', `My wallet${count ? ` (${count})` : ''}`]] as [Scope, string][]).map(([key, label]) => (
          <button
            key={key}
            role="tab"
            aria-selected={scope === key}
            onClick={() => setScope(key)}
            className={`flex-1 rounded-full py-2 text-[13px] font-semibold transition-colors
              ${scope === key ? 'bg-[#E64BD4] text-black' : 'text-[#9B8FA6] hover:text-[#F3EBF8]'}
              focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#E64BD4]`}
          >
            {label}
          </button>
        ))}
      </div>

      {/* issuers, taken from the catalogue */}
      {issuers.length > 1 && (
        <div className="-mx-5 mt-3 flex gap-1.5 overflow-x-auto px-5 pb-1">
          {issuers.map((name) => {
            const on = issuer === name;
            return (
              <button
                key={name}
                onClick={() => setIssuer(on ? null : name)}
                aria-pressed={on}
                className={`shrink-0 rounded-full border px-3 py-1.5 text-[12.5px] font-semibold transition-colors
                  ${on ? 'border-[#E64BD4] text-[#F58EE4]' : 'border-white/10 text-[#DDD0E6] hover:border-[#E64BD4]/40'}
                  focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#E64BD4]`}
              >
                {name}
              </button>
            );
          })}
        </div>
      )}

      {/* the cards */}
      {isLoading ? (
        <div className="mt-4 grid grid-cols-2 gap-3">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="aspect-[1.58/1] animate-pulse rounded-xl bg-white/[0.06]" />
          ))}
        </div>
      ) : shown.length === 0 ? (
        <div className="mt-8 rounded-2xl border border-dashed border-[#E64BD4]/25 px-6 py-10 text-center">
          <p className="text-[14px] leading-relaxed text-[#9B8FA6]">
            {scope === 'mine' && count === 0
              ? 'Your wallet is empty. Switch to All cards and tap the ones you carry.'
              : 'No cards match that search.'}
          </p>
        </div>
      ) : (
        <>
          <p className="mb-2.5 mt-4 text-[11.5px] font-semibold uppercase tracking-wider text-[#6E637A]">
            {shown.length} card{shown.length === 1 ? '' : 's'}
            {offline && <span className="ml-1.5 normal-case tracking-normal text-[#4A4453]">· offline reference, headline rates only</span>}
          </p>
          <div className="grid grid-cols-2 gap-x-3 gap-y-4">
            {shown.map((c) => {
              const mine = wallet.has(c.id);
              const arming = confirmRemove === c.id;
              const working = wallet.busy === c.id;
              return (
                <div key={c.id} className="flex flex-col gap-1.5">
                  <CardFace
                    name={c.name}
                    issuer={c.issuer}
                    network={c.network}
                    type={c.type}
                    annualFeeCents={c.annualFee}
                    categories={c.categories}
                    owned={mine}
                    onClick={() => (mine ? navigate(`/recommendations?card=${c.id}`) : toggle(c))}
                  />
                  <button
                    onClick={() => toggle(c)}
                    disabled={working}
                    aria-label={mine ? `Remove ${c.name} from wallet` : `Add ${c.name} to wallet`}
                    className={`flex items-center justify-center gap-1 rounded-full border py-1.5 text-[12px] font-semibold transition-colors disabled:opacity-50
                      ${arming
                        ? 'border-[#FF6B6B]/60 text-[#FF8A8A]'
                        : mine
                          ? 'border-[#E64BD4]/40 text-[#F58EE4] hover:border-[#E64BD4]'
                          : 'border-white/10 text-[#DDD0E6] hover:border-[#E64BD4]/40'}
                      focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#E64BD4]`}
                  >
                    {arming ? 'Tap to remove' : mine ? <><Check className="h-3.5 w-3.5" /> In wallet</> : <><Plus className="h-3.5 w-3.5" /> Add</>}
                  </button>
                </div>
              );
            })}
          </div>
        </>
      )}

      {/* a card the catalogue does not have yet */}
      <section className="mt-8 rounded-2xl border border-white/10 bg-white/[0.035] p-4">
        <h2 className="text-[15px] font-bold tracking-tight text-[#F3EBF8]">Can't find your card?</h2>
        <p className="mt-1 text-[12.5px] leading-relaxed text-[#9B8FA6]">
          Add it to the catalogue. It starts at a flat 1% until its real rates are added.
        </p>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (!newName.trim()) return;
            addCardMutation.mutate({ name: newName.trim(), issuer: newIssuer.trim() || undefined });
          }}
          className="mt-3 flex flex-col gap-2.5"
        >
          <label className="flex flex-col gap-1.5">
            <span className="text-[12px] font-semibold text-[#DDD0E6]">Card name</span>
            <input
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder="Bilt Mastercard"
              className="rounded-lg border border-white/10 bg-black/40 px-3 py-2.5 text-[13.5px] text-[#F3EBF8] placeholder:text-[#4A4453] outline-none focus:border-[#E64BD4]/60"
            />
          </label>
          <label className="flex flex-col gap-1.5">
            <span className="text-[12px] font-semibold text-[#DDD0E6]">Issuer (optional)</span>
            <input
              value={newIssuer}
              onChange={(e) => setNewIssuer(e.target.value)}
              placeholder="Wells Fargo"
              className="rounded-lg border border-white/10 bg-black/40 px-3 py-2.5 text-[13.5px] text-[#F3EBF8] placeholder:text-[#4A4453] outline-none focus:border-[#E64BD4]/60"
            />
          </label>
          <button
            type="submit"
            disabled={!newName.trim() || addCardMutation.isPending || offline}
            className="mt-1 self-start rounded-full bg-[#E64BD4] px-4 py-2 text-[13px] font-bold text-black transition-colors hover:bg-[#F06BDD] disabled:opacity-40
                       focus-visible:outline focus-visible:outline-2 focus-visible:outline-white"
          >
            {addCardMutation.isPending ? 'Adding…' : 'Add to catalogue'}
          </button>
          {offline && <p className="text-[11.5px] text-[#6E637A]">Needs a connection to the app's server.</p>}
        </form>
      </section>
    </div>
  );
}
