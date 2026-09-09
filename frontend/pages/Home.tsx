import React from 'react';
import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Target, CreditCard, Bot, ArrowRight, AlertTriangle, Sparkles } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { useQuery } from '@tanstack/react-query';
import backend from '~backend/client';
import { InteractiveCardWave } from '../components/InteractiveCardWave';
import { CreditCardDisplay, type CardData } from '../components/CreditCardDisplay';

const demoCards: CardData[] = [
  { id: 'demo-1', issuer: 'Chase', name: 'Freedom Flex', network: 'Visa', cashbackRate: 5, cashbackCategory: 'Rotating' },
  { id: 'demo-2', issuer: 'American Express', name: 'Gold Card', network: 'Amex', cashbackRate: 4, cashbackCategory: 'Dining' },
  { id: 'demo-3', issuer: 'Citi', name: 'Double Cash', network: 'Mastercard', cashbackRate: 2, cashbackCategory: 'All Purchases' },
  { id: 'demo-4', issuer: 'Capital One', name: 'SavorOne', network: 'Visa', cashbackRate: 3, cashbackCategory: 'Dining' },
  { id: 'demo-5', issuer: 'Discover', name: 'it Cash Back', network: 'Discover', cashbackRate: 5, cashbackCategory: 'Rotating' },
];

const ease = [0.22, 1, 0.36, 1] as const;

export default function Home() {
  const { user } = useAuth();

  const { data: portfolioData } = useQuery({
    queryKey: ['portfolio', user?.userId],
    queryFn: () => user ? backend.cards.getUserPortfolio({ userId: user.userId }) : null,
    enabled: !!user,
  });
  const portfolioCards = portfolioData?.cards || [];

  const { data: offersData } = useQuery({
    queryKey: ['merchant-offers', user?.userId],
    queryFn: () => user ? backend.cards.getUserMerchantOffers({ userId: user.userId }) : null,
    enabled: !!user,
  });
  const merchantOffers = offersData?.offers || [];

  const expiringOffers = merchantOffers
    .filter((o) => o.endDate && !o.isUsed)
    .map((o) => ({
      offer: o,
      daysLeft: Math.ceil((new Date(o.endDate!).getTime() - new Date().setHours(0, 0, 0, 0)) / 86400000),
    }))
    .filter(({ daysLeft }) => daysLeft >= 0 && daysLeft <= 30)
    .sort((a, b) => a.daysLeft - b.daysLeft);

  const waveCards: CardData[] = user && portfolioCards.length > 0
    ? portfolioCards.slice(0, 6).map((uc: any) => ({
        id: uc.id,
        issuer: uc.card.issuer,
        name: uc.nickname || uc.card.name,
        network: uc.card.network,
        cashbackRate: uc.card.categories?.[0]?.cashbackRate,
        cashbackCategory: uc.card.categories?.[0]?.category,
      }))
    : demoCards;

  const stackCards: CardData[] = user && portfolioCards.length > 0
    ? portfolioCards.slice(0, 3).map((uc: any) => ({
        id: uc.id,
        issuer: uc.card.issuer,
        name: uc.nickname || uc.card.name,
        network: uc.card.network,
        cashbackRate: uc.card.categories?.[0]?.cashbackRate,
        cashbackCategory: uc.card.categories?.[0]?.category,
      }))
    : demoCards.slice(0, 3);

  return (
    <div className="min-h-screen bg-[#0a0a0b] text-white">
      {/* ── Hero ── */}
      <section className="relative overflow-hidden px-6 pt-16 pb-8">
        <div className="absolute -top-32 left-1/2 h-72 w-72 -translate-x-1/2 rounded-full bg-teal-500/10 blur-[100px] pointer-events-none" />
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, ease }}
          className="relative z-10 mx-auto max-w-md space-y-5 text-center"
        >
          <div className="inline-flex items-center gap-1.5 rounded-full border border-white/10 bg-white/5 px-3.5 py-1.5 backdrop-blur-sm">
            <Sparkles className="h-3 w-3 text-teal-400" />
            <span className="text-[11px] font-medium tracking-wide text-white/60">
              Max out cashback, not credit limits
            </span>
          </div>

          <h1 className="text-[2.5rem] font-bold leading-[1.05] tracking-tight">
            Swipe smart.
            <br />
            <span className="bg-gradient-to-r from-teal-400 to-emerald-400 bg-clip-text text-transparent">
              Earn more.
            </span>
          </h1>

          <p className="mx-auto max-w-sm text-[15px] leading-relaxed text-white/45">
            SwipeRight scans your cards and tells you which one to use for every
            purchase — so you never leave money on the table.
          </p>

          {!user && (
            <div className="flex items-center justify-center gap-3 pt-2">
              <Link
                to="/cards"
                className="rounded-full bg-white px-6 py-3 text-sm font-semibold text-black transition-transform active:scale-95"
              >
                Get Started
              </Link>
              <Link
                to="/recommendations"
                className="rounded-full border border-white/15 px-6 py-3 text-sm font-semibold text-white/80 transition-colors hover:bg-white/5"
              >
                Try it
              </Link>
            </div>
          )}
        </motion.div>
      </section>

      {/* ── Interactive Card Wave ── */}
      <section className="py-6">
        <motion.div
          initial={{ opacity: 0 }}
          whileInView={{ opacity: 1 }}
          viewport={{ once: true }}
          transition={{ duration: 0.5 }}
          className="px-6"
        >
          <h2 className="text-xl font-bold tracking-tight text-white">
            Your wallet, in motion
          </h2>
          <p className="mt-1 text-sm text-white/40">
            Scroll to see your cards come alive.
          </p>
        </motion.div>

        <InteractiveCardWave cards={waveCards} />
      </section>

      {/* ── Features ── */}
      <section className="px-6 py-10 space-y-3">
        {[
          { icon: Target, title: 'Optimize Purchase', desc: 'Find the best card for every transaction instantly.', to: '/recommendations' },
          { icon: CreditCard, title: 'Manage Wallet', desc: 'Track all your cards, benefits, and deadlines.', to: '/cards' },
          { icon: Bot, title: 'AI Assistant', desc: 'Get personalized cashback advice on demand.', to: '/ai-chat' },
        ].map(({ icon: Icon, title, desc, to }, i) => (
          <motion.div
            key={title}
            initial={{ opacity: 0, x: -20 }}
            whileInView={{ opacity: 1, x: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.4, ease, delay: i * 0.08 }}
          >
            <Link
              to={to}
              className="group flex items-center gap-4 rounded-2xl border border-white/[0.06] bg-white/[0.03] p-4 transition-colors hover:border-white/15 hover:bg-white/[0.06]"
            >
              <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-teal-500/20 to-emerald-500/10 ring-1 ring-white/10">
                <Icon className="h-5 w-5 text-teal-400" />
              </div>
              <div className="flex-1">
                <h3 className="text-sm font-semibold text-white">{title}</h3>
                <p className="mt-0.5 text-xs text-white/40">{desc}</p>
              </div>
              <ArrowRight className="h-4 w-4 text-white/20 transition-transform group-hover:translate-x-1 group-hover:text-white/40" />
            </Link>
          </motion.div>
        ))}
      </section>

      {/* ── Portfolio Card Stack (logged in) ── */}
      {user && stackCards.length > 0 && (
        <section className="px-6 py-10">
          <h2 className="text-xl font-bold tracking-tight text-white">Your cards</h2>
          <p className="mt-1 text-sm text-white/40">Tap to manage benefits and deadlines.</p>

          <div className="relative mt-6 h-[280px]">
            {stackCards.map((card, i) => (
              <motion.div
                key={card.id}
                initial={{ y: 60, opacity: 0, rotateZ: -8 + i * 4 }}
                whileInView={{ y: i * 28, opacity: 1, rotateZ: -6 + i * 3 }}
                viewport={{ once: true }}
                transition={{ duration: 0.6, ease, delay: i * 0.1 }}
                className="absolute left-1/2 top-0 -translate-x-1/2"
                style={{ zIndex: stackCards.length - i }}
              >
                <Link to="/cards">
                  <CreditCardDisplay card={card} />
                </Link>
              </motion.div>
            ))}
          </div>
        </section>
      )}

      {/* ── Expiring Deals (logged in) ── */}
      {user && expiringOffers.length > 0 && (
        <section className="px-6 pb-10">
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.4, ease }}
            className="rounded-2xl border border-red-500/20 bg-red-500/[0.04] p-5"
          >
            <div className="flex items-center gap-2.5">
              <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-red-500/15">
                <AlertTriangle className="h-4 w-4 text-red-400" />
              </div>
              <div>
                <h3 className="text-sm font-bold text-red-300">Rewards expiring soon</h3>
                <p className="text-xs text-red-400/60">Don't leave money on the table.</p>
              </div>
            </div>

            <div className="mt-4 space-y-2">
              {expiringOffers.slice(0, 3).map(({ offer, daysLeft }) => (
                <Link
                  key={offer.id}
                  to={`/recommendations?cat=${encodeURIComponent(offer.merchantName)}`}
                  className="flex items-center justify-between rounded-xl border border-white/[0.06] bg-white/[0.02] p-3 transition-colors hover:border-red-400/20 hover:bg-red-500/[0.03]"
                >
                  <div>
                    <p className="text-[10px] font-medium uppercase tracking-wider text-white/30">
                      {offer.cardName}
                    </p>
                    <p className="mt-0.5 text-sm font-semibold text-white">
                      {offer.merchantName}
                    </p>
                  </div>
                  <span
                    className={`rounded-full px-2.5 py-1 text-[10px] font-bold ${
                      daysLeft <= 3
                        ? 'bg-red-500/20 text-red-300'
                        : daysLeft <= 7
                        ? 'bg-orange-500/20 text-orange-300'
                        : 'bg-yellow-500/15 text-yellow-300'
                    }`}
                  >
                    {daysLeft === 0 ? 'Today' : daysLeft === 1 ? 'Tomorrow' : `${daysLeft}d`}
                  </span>
                </Link>
              ))}
            </div>
          </motion.div>
        </section>
      )}

      {/* ── Footer spacer for bottom nav ── */}
      <div className="h-24" />
    </div>
  );
}
