import type { Card } from '~backend/cards/list';

/**
 * Offline card reference.
 *
 * Two reasons this exists rather than being a stopgap. The app is used at a
 * register, where signal is often bad and a blank catalogue is useless. And
 * the live catalogue is a database the backend serves; when it cannot be
 * reached, showing nothing tells the user their app is broken when it is not.
 *
 * These are headline earning rates for well known cards, not a complete
 * picture: caps, portal requirements, quarterly rotations and enrolment
 * conditions all live in the database. Treat this as a floor that the live
 * catalogue replaces, never as the source of truth. The UI labels it.
 */

let nextId = -1000;
const cat = (category: string, cashbackRate: number, isRotating = false) => ({
  id: nextId--,
  category,
  cashbackRate,
  isRotating,
});

export const SEED_CATALOGUE: Card[] = [
  {
    id: -101, name: 'Chase Sapphire Preferred', issuer: 'Chase', network: 'Visa',
    type: 'credit', imageUrl: '', annualFee: 9500,
    categories: [cat('Travel', 5), cat('Dining', 3), cat('Streaming', 3), cat('All Purchases', 1)],
  },
  {
    id: -102, name: 'Chase Sapphire Reserve', issuer: 'Chase', network: 'Visa',
    type: 'credit', imageUrl: '', annualFee: 55000,
    categories: [cat('Flights', 5), cat('Hotels', 10), cat('Dining', 3), cat('All Purchases', 1)],
  },
  {
    id: -103, name: 'Chase Freedom Unlimited', issuer: 'Chase', network: 'Visa',
    type: 'credit', imageUrl: '', annualFee: 0,
    categories: [cat('Dining', 3), cat('Drugstores', 3), cat('All Purchases', 1.5)],
  },
  {
    id: -104, name: 'Chase Freedom Flex', issuer: 'Chase', network: 'Mastercard',
    type: 'credit', imageUrl: '', annualFee: 0,
    categories: [cat('Rotating Categories', 5, true), cat('Dining', 3), cat('Drugstores', 3), cat('All Purchases', 1)],
  },
  {
    id: -105, name: 'American Express Gold', issuer: 'American Express', network: 'Amex',
    type: 'credit', imageUrl: '', annualFee: 32500,
    categories: [cat('Dining', 4), cat('Groceries', 4), cat('Flights', 3), cat('All Purchases', 1)],
  },
  {
    id: -106, name: 'American Express Platinum', issuer: 'American Express', network: 'Amex',
    type: 'credit', imageUrl: '', annualFee: 89500,
    categories: [cat('Flights', 5), cat('Hotels', 5), cat('All Purchases', 1)],
  },
  {
    id: -107, name: 'Blue Cash Preferred', issuer: 'American Express', network: 'Amex',
    type: 'credit', imageUrl: '', annualFee: 9500,
    categories: [cat('Groceries', 6), cat('Streaming', 6), cat('Gas', 3), cat('Transit', 3), cat('All Purchases', 1)],
  },
  {
    id: -108, name: 'Citi Double Cash', issuer: 'Citi', network: 'Mastercard',
    type: 'credit', imageUrl: '', annualFee: 0,
    categories: [cat('All Purchases', 2)],
  },
  {
    id: -109, name: 'Citi Custom Cash', issuer: 'Citi', network: 'Mastercard',
    type: 'credit', imageUrl: '', annualFee: 0,
    categories: [cat('Top Category', 5, true), cat('All Purchases', 1)],
  },
  {
    id: -110, name: 'Wells Fargo Active Cash', issuer: 'Wells Fargo', network: 'Visa',
    type: 'credit', imageUrl: '', annualFee: 0,
    categories: [cat('All Purchases', 2)],
  },
  {
    id: -111, name: 'Wells Fargo Autograph', issuer: 'Wells Fargo', network: 'Visa',
    type: 'credit', imageUrl: '', annualFee: 0,
    categories: [cat('Dining', 3), cat('Travel', 3), cat('Gas', 3), cat('Streaming', 3), cat('All Purchases', 1)],
  },
  {
    id: -112, name: 'Discover it Cash Back', issuer: 'Discover', network: 'Discover',
    type: 'credit', imageUrl: '', annualFee: 0,
    categories: [cat('Rotating Categories', 5, true), cat('All Purchases', 1)],
  },
  {
    id: -113, name: 'Capital One Venture X', issuer: 'Capital One', network: 'Visa',
    type: 'credit', imageUrl: '', annualFee: 39500,
    categories: [cat('Hotels', 10), cat('Flights', 5), cat('All Purchases', 2)],
  },
  {
    id: -114, name: 'Capital One Savor', issuer: 'Capital One', network: 'Mastercard',
    type: 'credit', imageUrl: '', annualFee: 0,
    categories: [cat('Dining', 3), cat('Entertainment', 3), cat('Groceries', 3), cat('All Purchases', 1)],
  },
  {
    id: -115, name: 'Bank of America Customized Cash', issuer: 'Bank of America', network: 'Visa',
    type: 'credit', imageUrl: '', annualFee: 0,
    categories: [cat('Choice Category', 3, true), cat('Groceries', 2), cat('All Purchases', 1)],
  },
  {
    id: -116, name: 'Discover Cashback Debit', issuer: 'Discover', network: 'Discover',
    type: 'debit', imageUrl: '', annualFee: 0,
    categories: [cat('All Purchases', 1)],
  },
];
