import React, { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Search, SlidersHorizontal, X } from 'lucide-react';
import backend from '~backend/client';
import CardFace from '../components/CardFace';
import { useAuth } from '../contexts/AuthContext';
import { SEED_CATALOGUE } from '../lib/seedCatalogue';

/**
 * Insights: the card catalogue.
 *
 * The old version rendered nothing until you searched, which meant the tab was
 * blank on arrival and no cards were ever visible. It is a browsable catalogue
 * now, because knowing what every card on the market actually earns is the
 * point of the tab. Ask it a category and the same catalogue reorders itself
 * into a ranking instead of becoming a different screen.
 */

const CATEGORIES = [
  { key: 'gas', label: 'Gas' },
  { key: 'groceries', label: 'Groceries' },
  { key: 'dining', label: 'Dining' },
  { key: 'travel', label: 'Travel' },
  { key: 'online', label: 'Online' },
  { key: 'streaming', label: 'Streaming' },
  { key: 'drugstores', label: 'Pharmacy' },
];

type Sort = 'best' | 'fee' | 'name';

export default function Recommendations() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  const [query, setQuery] = useState('');
  const [category, setCategory] = useState<string | null>(searchParams.get('category'));
  const [sort, setSort] = useState<Sort>('best');
  const [ownedOnly, setOwnedOnly] = useState(false);

  const { data: catalogue, isLoading } = useQuery({
    queryKey: ['cards', 'catalogue'],
    // An unreachable backend hangs rather than failing, so a plain await would
    // leave this tab on skeletons indefinitely. At a register, a slow answer is
    // the same as no answer: give the network a moment, then fall back.
    queryFn: async () => {
      const timeout = new Promise<null>((resolve) => setTimeout(() => resolve(null), 2500));
      return Promise.race([backend.cards.list().catch(() => null), timeout]);
    },
    retry: 0,
    staleTime: 5 * 60 * 1000,
  });

  // The live catalogue is the source of truth. When it cannot be reached the
  // app falls back to a bundled reference rather than showing an empty tab,
  // because this gets used at a register where signal is often poor.
  const live = catalogue?.cards ?? [];
  const usingSeed = !isLoading && live.length === 0;

  const { data: portfolio } = useQuery({
    queryKey: ['portfolio', user?.userId],
    queryFn: () => (user ? backend.cards.getUserPortfolio({ userId: user.userId }) : null),
    enabled: !!user,
  });

  const owned = useMemo(
    () => new Set((portfolio?.cards ?? []).map((c: any) => c.card.id)),
    [portfolio]
  );

  const cards = usingSeed ? SEED_CATALOGUE : live;

  const shown = useMemo(() => {
    let list = [...cards];

    if (ownedOnly) list = list.filter((c) => owned.has(c.id));

    const q = query.trim().toLowerCase();
    if (q) {
      list = list.filter(
        (c) =>
          c.name.toLowerCase().includes(q) ||
          c.issuer.toLowerCase().includes(q) ||
          (c.categories || []).some((cat) => cat.category.toLowerCase().includes(q))
      );
    }

    // A category turns the catalogue into a ranking: best rate for that spend
    // first, everything that does not earn on it after.
    if (category) {
      const rateFor = (c: (typeof list)[number]) => {
        const match = (c.categories || []).filter((cat) => {
          const k = cat.category.toLowerCase();
          if (category === 'dining') return k.includes('dining') || k.includes('restaurant');
          if (category === 'groceries') return k.includes('grocer') || k.includes('supermarket');
          if (category === 'drugstores') return k.includes('drug');
          if (category === 'online') return k.includes('online') || k.includes('amazon');
          return k.includes(category);
        });
        const flat = (c.categories || []).find((cat) =>
          cat.category.toLowerCase().includes('all purchases')
        );
        return Math.max(
          ...match.map((m) => m.cashbackRate || 0),
          flat?.cashbackRate || 0,
          0
        );
      };
      return list
        .map((c) => ({ card: c, rate: rateFor(c) }))
        .sort((a, b) => b.rate - a.rate)
        .map((x) => x.card);
    }

    if (sort === 'fee') return list.sort((a, b) => a.annualFee - b.annualFee);
    if (sort === 'name') return list.sort((a, b) => a.name.localeCompare(b.name));
    return list.sort((a, b) => {
      const best = (c: (typeof list)[number]) =>
        Math.max(0, ...(c.categories || []).map((x) => x.cashbackRate || 0));
      return best(b) - best(a);
    });
  }, [cards, query, category, sort, ownedOnly, owned]);

  const activeLabel = CATEGORIES.find((c) => c.key === category)?.label;

  return (
    <div className="mx-auto w-full max-w-md px-5 pb-8 pt-4">
      <h1 className="text-[26px] font-extrabold leading-tight tracking-tight text-[#F3EBF8]">
        Every card, and what it earns
      </h1>
      <p className="mt-1.5 text-[13.5px] leading-relaxed text-[#9B8FA6]">
        {activeLabel
          ? `Ranked for ${activeLabel.toLowerCase()}, best rate first.`
          : 'Browse the catalogue, or pick what you are buying to rank it.'}
      </p>

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
          <button
            onClick={() => setQuery('')}
            aria-label="Clear search"
            className="shrink-0 rounded-full p-1.5 text-[#6E637A] hover:text-[#F3EBF8]"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        )}
      </div>

      {/* rank by what you are buying */}
      <div className="mt-3 flex flex-wrap gap-1.5">
        {CATEGORIES.map((c) => {
          const on = category === c.key;
          return (
            <button
              key={c.key}
              onClick={() => setCategory(on ? null : c.key)}
              aria-pressed={on}
              className={`rounded-full border px-3 py-1.5 text-[12.5px] font-semibold transition-colors
                ${on
                  ? 'border-[#E64BD4] bg-[#E64BD4] text-black'
                  : 'border-white/10 bg-white/[0.05] text-[#DDD0E6] hover:border-[#E64BD4]/40'}
                focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#E64BD4]`}
            >
              {c.label}
            </button>
          );
        })}
      </div>

      {/* sort and scope */}
      <div className="mt-3 flex items-center justify-between gap-3 border-b border-white/[0.07] pb-3">
        <div className="flex items-center gap-1.5 text-[#6E637A]">
          <SlidersHorizontal className="h-3.5 w-3.5" />
          <select
            value={sort}
            onChange={(e) => setSort(e.target.value as Sort)}
            disabled={!!category}
            aria-label="Sort cards"
            className="bg-transparent text-[12.5px] font-semibold text-[#DDD0E6] outline-none disabled:opacity-40"
          >
            <option value="best">Best rate</option>
            <option value="fee">Lowest fee</option>
            <option value="name">Name</option>
          </select>
        </div>
        {user && (
          <button
            onClick={() => setOwnedOnly((v) => !v)}
            aria-pressed={ownedOnly}
            className={`rounded-full border px-3 py-1 text-[12px] font-semibold transition-colors
              ${ownedOnly
                ? 'border-[#E64BD4] text-[#F58EE4]'
                : 'border-white/10 text-[#6E637A] hover:text-[#DDD0E6]'}`}
          >
            My cards only
          </button>
        )}
      </div>

      {/* the catalogue */}
      {isLoading ? (
        <div className="mt-4 grid grid-cols-2 gap-3">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="aspect-[1.58/1] animate-pulse rounded-xl bg-white/[0.06]" />
          ))}
        </div>
      ) : shown.length === 0 ? (
        <div className="mt-8 rounded-2xl border border-dashed border-[#E64BD4]/25 px-6 py-10 text-center">
          <p className="text-[14px] leading-relaxed text-[#9B8FA6]">
            No cards match that. Try a different search.
          </p>
        </div>
      ) : (
        <>
          <p className="mt-4 mb-2.5 text-[11.5px] font-semibold uppercase tracking-wider text-[#6E637A]">
            {shown.length} card{shown.length === 1 ? '' : 's'}
            {usingSeed && (
              <span className="ml-1.5 normal-case tracking-normal text-[#4A4453]">
                · offline reference, headline rates only
              </span>
            )}
          </p>
          <div className="grid grid-cols-2 gap-3">
            {shown.map((c) => (
              <CardFace
                key={c.id}
                name={c.name}
                issuer={c.issuer}
                network={c.network}
                type={c.type}
                annualFeeCents={c.annualFee}
                categories={c.categories}
                owned={owned.has(c.id)}
                onClick={() => navigate(`/cards?card=${c.id}`)}
              />
            ))}
          </div>
        </>
      )}
    </div>
  );
}
