import { useCallback, useEffect, useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import backend from '~backend/client';
import type { Card } from '~backend/cards/list';
import { useAuth } from '../contexts/AuthContext';
import { SEED_CATALOGUE } from './seedCatalogue';

/**
 * One source for "which cards exist" and "which cards are mine".
 *
 * Wallet writes the portfolio, Insights reads it, and the Ask deck shows it, so
 * all three have to agree. They go through here rather than each fetching on
 * its own.
 *
 * Modes:
 *   account     signed in and the API answers: the server portfolio is the truth
 *   device      the API cannot be reached: the wallet is kept on this device so
 *               the app still works at a register with no signal
 *   signed-out  the API answers but nobody is signed in: browse only
 */

const TIMEOUT_MS = 2500;
const DEVICE_KEY = 'swiperight_device_wallet';
const DEVICE_EVENT = 'swiperight:device-wallet';

/** An unreachable backend hangs instead of failing; a slow answer is no answer. */
function withTimeout<T>(p: Promise<T>): Promise<T | null> {
  const timeout = new Promise<null>((resolve) => setTimeout(() => resolve(null), TIMEOUT_MS));
  return Promise.race([p.catch(() => null), timeout]);
}

export function useCatalogue() {
  const { data, isLoading } = useQuery({
    queryKey: ['cards', 'catalogue'],
    queryFn: () => withTimeout(backend.cards.list()),
    retry: 0,
    staleTime: 5 * 60 * 1000,
  });
  const live = data?.cards ?? [];
  const offline = !isLoading && live.length === 0;
  return {
    cards: (offline ? SEED_CATALOGUE : live) as Card[],
    offline,
    isLoading,
  };
}

export interface WalletCard extends Card {
  /** Server row id, needed to remove a card in account mode. */
  portfolioId?: number;
  nickname?: string;
}

function readDevice(): WalletCard[] {
  try {
    const raw = localStorage.getItem(DEVICE_KEY);
    return raw ? (JSON.parse(raw) as WalletCard[]) : [];
  } catch {
    return [];
  }
}

function writeDevice(cards: WalletCard[]) {
  try {
    localStorage.setItem(DEVICE_KEY, JSON.stringify(cards));
  } catch { /* storage unavailable */ }
  window.dispatchEvent(new Event(DEVICE_EVENT));
}

export type WalletMode = 'account' | 'device' | 'signed-out';

export function useWallet() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const { offline, isLoading: catalogueLoading } = useCatalogue();

  const [device, setDevice] = useState<WalletCard[]>(readDevice);
  useEffect(() => {
    const sync = () => setDevice(readDevice());
    window.addEventListener(DEVICE_EVENT, sync);
    window.addEventListener('storage', sync);
    return () => {
      window.removeEventListener(DEVICE_EVENT, sync);
      window.removeEventListener('storage', sync);
    };
  }, []);

  const mode: WalletMode = offline ? 'device' : user ? 'account' : 'signed-out';

  const { data: server, isLoading: serverLoading } = useQuery({
    queryKey: ['portfolio', user?.userId],
    queryFn: () => withTimeout(backend.cards.getUserPortfolio({ userId: user!.userId })),
    enabled: mode === 'account',
    retry: 0,
  });

  const cards: WalletCard[] = useMemo(() => {
    if (mode === 'device') return device;
    if (mode === 'account') {
      return (server?.cards ?? []).map((uc) => ({
        ...uc.card,
        portfolioId: uc.id,
        nickname: uc.nickname,
      }));
    }
    return [];
  }, [mode, device, server]);

  const ids = useMemo(() => new Set(cards.map((c) => c.id)), [cards]);
  const has = useCallback((cardId: number) => ids.has(cardId), [ids]);

  const [busy, setBusy] = useState<number | null>(null);

  async function add(card: Card): Promise<boolean> {
    if (mode === 'signed-out') return false;
    if (ids.has(card.id)) return true;
    if (mode === 'device') {
      writeDevice([...readDevice(), card]);
      return true;
    }
    setBusy(card.id);
    try {
      await backend.cards.addToPortfolio({ userId: user!.userId, cardId: card.id });
      await queryClient.invalidateQueries({ queryKey: ['portfolio', user!.userId] });
      return true;
    } catch {
      return false;
    } finally {
      setBusy(null);
    }
  }

  async function remove(cardId: number): Promise<boolean> {
    if (mode === 'signed-out') return false;
    if (mode === 'device') {
      writeDevice(readDevice().filter((c) => c.id !== cardId));
      return true;
    }
    const row = cards.find((c) => c.id === cardId);
    if (!row?.portfolioId) return false;
    setBusy(cardId);
    try {
      await backend.cards.removeFromPortfolio({ userId: user!.userId, portfolioId: row.portfolioId });
      await queryClient.invalidateQueries({ queryKey: ['portfolio', user!.userId] });
      return true;
    } catch {
      return false;
    } finally {
      setBusy(null);
    }
  }

  return {
    cards,
    has,
    add,
    remove,
    mode,
    busy,
    isLoading: catalogueLoading || (mode === 'account' && serverLoading),
  };
}
