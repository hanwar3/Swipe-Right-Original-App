import type { DecideResponse } from '~backend/cards/decide';
import type { ChatResponse } from '~backend/ai/chat';
import type { CardProfileResponse } from '~backend/cards/profile';
import { authHeaders, notifySessionEnded } from './session';
import { API_BASE } from './api';

/**
 * Thin typed access to the decision engine and the per-user endpoints.
 *
 * Types come straight from the backend source, so this stays honest without
 * codegen. Every call sends the session token; the backend reads who you are
 * from it, so no call here passes a user id.
 */

const BASE = API_BASE;

export type { DecideResponse };
export type Decision = DecideResponse;

/** An error carrying the backend's own sentence, safe to show as-is. */
export class EngineError extends Error {
  constructor(message: string, readonly status: number, readonly code?: string) {
    super(message);
  }
}

async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    method,
    credentials: 'omit',
    headers: {
      ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
      ...authHeaders(),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  if (!res.ok) {
    if (res.status === 401) notifySessionEnded();
    let message = `Something went wrong (${res.status})`;
    let code: string | undefined;
    try {
      const err = await res.json();
      if (typeof err?.message === 'string' && err.message) message = err.message;
      code = err?.code;
    } catch {
      /* not JSON */
    }
    throw new EngineError(message, res.status, code);
  }
  return (await res.json()) as T;
}

function query(path: string, params: Record<string, string | number | undefined>): string {
  const q = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== null && v !== '') q.set(k, String(v));
  }
  const s = q.toString();
  return s ? `${path}?${s}` : path;
}

const getJSON = <T>(path: string, params: Record<string, string | number | undefined> = {}) =>
  request<T>('GET', query(path, params));
const postJSON = <T>(path: string, body: unknown = {}) => request<T>('POST', path, body);

/** Deterministic. No model involved, so this is the fast path. */
export function decide(category: string, amountCents?: number) {
  return getJSON<DecideResponse>('/cards/decide', { category, amountCents });
}

/** Same decision, phrased by the model, with the deterministic sentence as fallback. */
export function ask(message: string, amountCents?: number) {
  return postJSON<ChatResponse>('/ai/chat', { message, amountCents });
}

/** Everything about one card: rates, caps left, benefits used, live offers. */
export function cardProfile(cardId: number) {
  return getJSON<CardProfileResponse>('/cards/profile', { cardId });
}

export type { CardProfileResponse };
export type CardProfile = CardProfileResponse;

// ---------------------------------------------------------------------------
// Offers by forwarded email
// ---------------------------------------------------------------------------

export interface OfferInbox {
  address: string;
  receivedCount: number;
  lastReceivedAt?: string;
  recent: {
    id: number;
    issuer?: string;
    subject?: string;
    offersFound: number;
    offersWritten: number;
    status: string;
    createdAt: string;
  }[];
}

export interface PendingOffer {
  id: number;
  merchantName: string;
  offerDescription: string;
  issuer?: string;
  lastFour?: string;
  endDate?: string;
}

/** The user's forwarding address, created on first ask. */
export function offerInbox() {
  return getJSON<OfferInbox>('/offers/inbox');
}

/** Offers we held because we could not tell which card they belong to. */
export function pendingOffers() {
  return getJSON<{ offers: PendingOffer[] }>('/offers/pending');
}

/** Place a held offer on a card. Teaches the card's last four for next time. */
export function attributeOffer(offerId: number, cardId: number) {
  return postJSON<{ ok: boolean }>('/offers/attribute', { offerId, cardId });
}

export interface CardIdentity {
  lastFour?: string;
  cardEmail?: string;
  address?: string;
}

/**
 * Teach the app to recognise one card in forwarded mail. Last four is read
 * straight out of most issuer offer mail; the registered mailbox survives
 * forwarding in the headers; a dedicated address removes the guessing entirely.
 */
export function setCardIdentity(input: {
  cardId: number;
  lastFour?: string;
  cardEmail?: string;
  wantOwnAddress?: boolean;
}) {
  return postJSON<CardIdentity>('/offers/card-identity', input);
}

export function rotateOfferInbox() {
  return postJSON<{ address: string }>('/offers/inbox/rotate');
}

// ---------------------------------------------------------------------------
// Offers and credits from the issuer's own portal
// ---------------------------------------------------------------------------

export type { PasteResponse as PortalPasteResult, StatusResponse as PortalStatus } from '~backend/offers/portal';
import type { PasteResponse, StatusResponse } from '~backend/offers/portal';

/**
 * Hand the backend a portal page the cardholder copied. Targeted offers and
 * credit usage exist only behind the issuer's login, so the user copies the
 * page they are already looking at, and the parser reads it.
 */
export function portalPaste(cardId: number, text: string) {
  return postJSON<PasteResponse>('/portal/paste', { cardId, text });
}

/** When this card last told us anything, and how many offers still need adding. */
export function portalStatus(cardId: number) {
  return getJSON<StatusResponse>('/portal/status', { cardId });
}

// ---------------------------------------------------------------------------
// Account
// ---------------------------------------------------------------------------

/** Voids every session token for this account, this device included. */
export function logoutEverywhere() {
  return postJSON<{ message: string }>('/auth/logout-all');
}

/** Permanently deletes the account and all of its data. */
export function deleteAccount(password: string) {
  return postJSON<{ message: string }>('/auth/account/delete', { password });
}

export interface ExtensionDevice {
  id: string;
  label: string;
  createdAt: string;
  lastUsedAt?: string;
  expiresAt: string;
}

/** A one-time code to type into the browser extension. Valid 10 minutes. */
export function createPairingCode() {
  return postJSON<{ code: string; expiresAt: string }>('/auth/extension/pairing-code');
}

export function listExtensions() {
  return getJSON<{ devices: ExtensionDevice[] }>('/auth/extension/devices');
}

export function revokeExtension(id: string) {
  return postJSON<{ revoked: boolean }>(`/auth/extension/devices/${encodeURIComponent(id)}/revoke`);
}

export function formatMoney(cents: number): string {
  return '$' + (cents / 100).toFixed(cents % 100 === 0 ? 0 : 2);
}
