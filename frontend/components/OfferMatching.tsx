import React, { useState } from 'react';
import { Mail } from 'lucide-react';
import { setCardIdentity } from '../lib/engine';

interface OfferMatchingProps {
  userId: string;
  cardId: number;
}

/**
 * How forwarded offer mail finds this card.
 *
 * One account often sits over cards registered to different mailboxes, and a
 * wallet can hold two cards from one issuer, so the issuer alone cannot say
 * which card an offer belongs to. Any one of these hints helps; together they
 * make it exact.
 */
export default function OfferMatching({ userId, cardId }: OfferMatchingProps) {
  const [lastFour, setLastFour] = useState('');
  const [cardEmail, setCardEmail] = useState('');
  const [address, setAddress] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);

  async function save(wantOwnAddress = false) {
    try {
      const r = await setCardIdentity({
        userId,
        cardId,
        lastFour: lastFour || undefined,
        cardEmail: cardEmail || undefined,
        wantOwnAddress,
      });
      if (r.address) setAddress(r.address);
      setStatus('Saved');
    } catch {
      setStatus('Could not save that. Try again.');
    }
    setTimeout(() => setStatus(null), 1800);
  }

  return (
    <section className="mt-6">
      <h2 className="mb-1.5 flex items-center gap-1.5 text-[11px] font-extrabold uppercase tracking-[0.12em] text-[#6E637A]">
        <Mail className="h-3 w-3" /> Offer matching
      </h2>
      <p className="mb-3 text-[12.5px] leading-relaxed text-[#9B8FA6]">
        When you forward offer emails, this is how we tell which card they belong to.
      </p>

      <div className="flex flex-col gap-2.5 rounded-2xl border border-white/10 bg-white/[0.04] p-4">
        <label className="flex flex-col gap-1.5">
          <span className="text-[12px] font-semibold text-[#DDD0E6]">Last four digits</span>
          <input
            value={lastFour}
            onChange={(e) => setLastFour(e.target.value.replace(/\D/g, '').slice(0, 4))}
            onBlur={() => lastFour.length === 4 && save()}
            placeholder="1234"
            inputMode="numeric"
            className="rounded-lg border border-white/10 bg-black/40 px-3 py-2.5 font-mono text-[13.5px] text-[#F3EBF8] placeholder:text-[#4A4453] outline-none focus:border-[#E64BD4]/60"
          />
          <span className="text-[11.5px] text-[#6E637A]">Most issuer offer mail prints this. It is the strongest signal.</span>
        </label>

        <label className="mt-1 flex flex-col gap-1.5">
          <span className="text-[12px] font-semibold text-[#DDD0E6]">Email this card is registered to</span>
          <input
            value={cardEmail}
            onChange={(e) => setCardEmail(e.target.value)}
            onBlur={() => cardEmail.includes('@') && save()}
            placeholder="you@example.com"
            inputMode="email"
            className="rounded-lg border border-white/10 bg-black/40 px-3 py-2.5 text-[13.5px] text-[#F3EBF8] placeholder:text-[#4A4453] outline-none focus:border-[#E64BD4]/60"
          />
          <span className="text-[11.5px] text-[#6E637A]">Only needed if this card is on a different mailbox from your others.</span>
        </label>

        {address ? (
          <div className="mt-1 rounded-lg border border-[#E64BD4]/25 bg-[#E64BD4]/[0.07] p-3">
            <p className="mb-1.5 text-[11.5px] font-semibold text-[#F58EE4]">Forward this card's mail here</p>
            <code className="block truncate font-mono text-[12px] text-[#F3EBF8]">{address}</code>
          </div>
        ) : (
          <button
            onClick={() => save(true)}
            className="mt-1 self-start rounded-full border border-white/10 bg-white/[0.05] px-3.5 py-2 text-[12.5px] font-semibold text-[#DDD0E6] hover:border-[#E64BD4]/50"
          >
            Give this card its own address
          </button>
        )}

        {status && <p className="text-[11.5px] font-semibold text-[#4FCE8C]">{status}</p>}
      </div>
    </section>
  );
}
