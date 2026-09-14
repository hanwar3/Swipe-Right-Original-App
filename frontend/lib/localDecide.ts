import type { DecideResponse, Contender } from '~backend/cards/decide';
import type { WalletCard } from './wallet';

/**
 * The decision engine's fallback, for when the server cannot be reached.
 *
 * The real engine weighs caps, merchant offers and expiring credits. This one
 * only has what is saved on the device, which is each card's headline rates,
 * so it says so in the answer. It exists because the app is used at a register
 * where signal is poor, and "sign in" is not an answer to someone holding two
 * cards and a queue behind them.
 */

/** Spoken or typed phrases to a category key. First match wins, specific first. */
const PHRASES: [RegExp, string, string][] = [
  [/\b(gas|fuel|petrol|shell|chevron|exxon|mobil|sunoco|wawa|sheetz|bp)\b/, 'gas', 'gas'],
  [/(grocer|supermarket|trader joe|whole foods|safeway|kroger|aldi|publix|wegmans|harris teeter)/, 'groceries', 'groceries'],
  [/\b(flight|flights|airline|airfare|plane|delta|united|southwest|jetblue)\b/, 'flights', 'flights'],
  [/\b(hotel|hotels|marriott|hilton|hyatt|airbnb|motel|resort)\b/, 'hotels', 'hotels'],
  [/\b(uber|lyft|taxi|cab|transit|subway|metro|train|bus|parking|toll)\b/, 'transit', 'rides and transit'],
  [/\b(netflix|spotify|hulu|disney|streaming|youtube|peacock)\b/, 'streaming', 'streaming'],
  [/\b(pharmacy|drugstore|cvs|walgreens|rite aid)\b/, 'drugstores', 'the pharmacy'],
  [/\b(costco|wholesale|sam'?s club|bj'?s)\b/, 'wholesale', 'wholesale clubs'],
  [/\b(amazon|online|etsy|ebay)\b/, 'online', 'online shopping'],
  [/\b(dining|restaurant|dinner|lunch|breakfast|brunch|food|coffee|starbucks|cafe|sushi|pizza|takeout|delivery|doordash|grubhub|bar)\b/, 'dining', 'dining'],
  [/\b(travel|trip|vacation|expedia|rental car|car rental)\b/, 'travel', 'travel'],
];

const PARENT: Record<string, string> = { flights: 'travel', hotels: 'travel', transit: 'travel' };

/** Same normalisation the card faces use, so the ranking matches what is drawn. */
function keyOf(category: string): string {
  const c = (category || '').toLowerCase();
  if (c.includes('all purchase')) return 'all';
  if (c.includes('restaurant') || c.includes('dining')) return 'dining';
  if (c.includes('gas')) return 'gas';
  if (c.includes('grocer') || c.includes('supermarket')) return 'groceries';
  if (c.includes('flight')) return 'flights';
  if (c.includes('hotel')) return 'hotels';
  if (c.includes('transit')) return 'transit';
  if (c.includes('travel')) return 'travel';
  if (c.includes('stream')) return 'streaming';
  if (c.includes('drug') || c.includes('pharmac')) return 'drugstores';
  if (c.includes('wholesale')) return 'wholesale';
  if (c.includes('online') || c.includes('amazon')) return 'online';
  return c;
}

export function localDecide(cards: WalletCard[], question: string): DecideResponse {
  const q = question.toLowerCase();
  const hit = PHRASES.find(([re]) => re.test(q));
  const key = hit?.[1] ?? 'all';
  const label = hit?.[2] ?? 'this purchase';
  const accepted = [key, PARENT[key]].filter(Boolean) as string[];

  const contenders: Contender[] = cards
    .map((card) => {
      const cats = card.categories || [];
      // Rotating and choice categories are not assumed active: the device
      // cannot know this quarter's pick, and guessing 5% would be wrong often.
      const matching = cats.filter((c) => !c.isRotating && accepted.includes(keyOf(c.category)));
      const flat = cats.find((c) => keyOf(c.category) === 'all');
      const bestMatch = Math.max(0, ...matching.map((c) => c.cashbackRate || 0));
      const flatRate = flat?.cashbackRate ?? 1;
      const rate = key === 'all' ? flatRate : Math.max(bestMatch, flatRate);
      const reason =
        key !== 'all' && bestMatch >= flatRate && bestMatch > 0
          ? `${bestMatch}% on ${label}`
          : `Flat ${flatRate}% on everything`;
      return {
        cardId: card.id,
        cardName: card.name,
        displayName: card.nickname || card.name,
        issuer: card.issuer,
        network: card.network || 'Visa',
        effectiveRate: rate,
        baseRate: rate,
        reasons: [reason, 'Headline rate saved on this device. Caps and offers need a connection.'],
        capExhausted: false,
      } as Contender;
    })
    .sort((a, b) => b.effectiveRate - a.effectiveRate);

  const winner = contenders[0];
  const runnerUp = contenders[1];

  let spoken: string;
  if (!winner) {
    spoken = 'Add your cards in Wallet and I can pick one for you.';
  } else if (runnerUp && runnerUp.effectiveRate === winner.effectiveRate) {
    spoken = `${winner.displayName} or ${runnerUp.displayName}, both ${winner.effectiveRate}% back on ${label}.`;
  } else {
    spoken = `Use ${winner.displayName}, ${winner.effectiveRate}% back on ${label}.`;
  }

  return { categoryKey: key, winner, runnerUp, contenders, expiring: [], spoken };
}
