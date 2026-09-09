import { api } from "encore.dev/api";
import { secret } from "encore.dev/config";
import { runDecision, normalizeCategory, type DecideResponse } from "../cards/decide";

const geminiApiKey = secret("GeminiApiKey");

/**
 * The conversational front door.
 *
 * The important thing here is what the model is NOT allowed to do: it never
 * decides which card wins, never computes a rate, and never invents a benefit.
 * runDecision() settles all of that from the database first; the model receives
 * the finished decision and is asked only to say it like a person would.
 *
 * If the model is slow, rate-limited, or misconfigured, decision.spoken is
 * already a correct sentence — so the feature degrades to "less charming"
 * rather than "broken", which is what the old hardcoded-prompt version did.
 */

export interface ChatRequest {
  message: string;
  /** Without this the answer cannot be personal — it falls back to general advice. */
  userId?: string;
  /** Purchase amount in cents. Unlocks the cashback-versus-expiring-credit math. */
  amountCents?: number;
  context?: string;
}

export interface ChatResponse {
  response: string;
  /** The structured decision, so the UI can render cards instead of parsing prose. */
  decision?: DecideResponse;
  /** True when the model was unavailable and the deterministic sentence was used. */
  fallback: boolean;
}

const SYSTEM_RULES = `You are SwipeRight, speaking to someone standing at a checkout counter.

You will be given a DECISION object that has already been computed from the user's
actual card portfolio. It is authoritative.

Hard rules:
- Never contradict the decision. Never change a card, a rate, or a dollar figure.
- Never mention a card that is not in the decision.
- If the decision has no winner, say so plainly. Do not invent a recommendation.
- Lead with the card name. The person is in a hurry.
- One or two short sentences. No markdown, no lists, no preamble.
- If a nudge is present and overridesWinner is true, the nudge IS the recommendation.
- Sound like a knowledgeable friend, not a bank.`;

async function phrase(decision: DecideResponse, message: string): Promise<string | null> {
  let key: string;
  try {
    key = geminiApiKey();
    if (!key) return null;
  } catch {
    return null; // secret not configured — caller falls back
  }

  try {
    const res = await fetch(
      "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent",
      {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-goog-api-key": key },
        body: JSON.stringify({
          contents: [
            {
              parts: [
                { text: SYSTEM_RULES },
                { text: `DECISION:\n${JSON.stringify(decision, null, 2)}` },
                { text: `The user said: "${message}"\n\nSay the answer.` },
              ],
            },
          ],
          generationConfig: { temperature: 0.4, maxOutputTokens: 160 },
        }),
      }
    );

    if (!res.ok) return null;
    const data = (await res.json()) as any;
    const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
    return typeof text === "string" && text.trim() ? text.trim() : null;
  } catch {
    return null;
  }
}

export const chat = api<ChatRequest, ChatResponse>(
  { expose: true, method: "POST", path: "/ai/chat" },
  async (req) => {
    // No user means no portfolio, so there is nothing honest to recommend.
    if (!req.userId) {
      return {
        response:
          "Sign in and add your cards, and I can tell you exactly which one to pull out. Right now I don't know what's in your wallet.",
        fallback: true,
      };
    }

    const decision = await runDecision(req.userId, req.message, req.amountCents);
    const spoken = await phrase(decision, req.message);

    return {
      response: spoken || decision.spoken,
      decision,
      fallback: spoken === null,
    };
  }
);

/**
 * Voice/assistant entry point. Same engine, terser output, and it never waits
 * on the model — a voice answer that arrives late is worse than a plain one
 * that arrives now.
 */
export interface AssistantRequest {
  userId: string;
  query: string;
  amountCents?: number;
}

export interface AssistantResponse {
  response: string;
  decision?: DecideResponse;
}

export const assistantRecommend = api<AssistantRequest, AssistantResponse>(
  { expose: true, method: "GET", path: "/ai/assistant/recommend" },
  async (req) => {
    if (!req.userId || !req.query) {
      return { response: "I need to know who you are and what you're buying." };
    }
    const decision = await runDecision(req.userId, req.query, req.amountCents);
    return { response: decision.spoken, decision };
  }
);

/** Exposed so the frontend can pre-resolve a spoken phrase to a category chip. */
export const categoryOf = api<{ text: string }, { categoryKey: string }>(
  { expose: true, method: "GET", path: "/ai/category" },
  async (req) => ({ categoryKey: normalizeCategory(req.text) })
);
