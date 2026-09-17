import log from "encore.dev/log";

/**
 * The one place the Gemini model is named.
 *
 * Google retires models: gemini-2.0-flash disappeared and every call here
 * quietly fell back for months, because failures were swallowed. Failures are
 * now logged, and a reply cut off by the token limit is treated as no reply,
 * since the engine's own sentence beats half of a better one.
 */
export const GEMINI_MODEL = "gemini-3.6-flash";

export interface GenerateOptions {
  temperature: number;
  maxOutputTokens: number;
  /**
   * Thinking tokens count against maxOutputTokens. "minimal" for phrasing, where
   * the engine has already decided everything; "low" for extraction from mail.
   */
  thinkingLevel: "minimal" | "low";
}

export async function generateText(
  apiKey: string,
  parts: { text: string }[],
  opts: GenerateOptions
): Promise<string | null> {
  try {
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-goog-api-key": apiKey },
        body: JSON.stringify({
          contents: [{ parts }],
          generationConfig: {
            temperature: opts.temperature,
            maxOutputTokens: opts.maxOutputTokens,
            thinkingConfig: { thinkingLevel: opts.thinkingLevel },
          },
        }),
      }
    );

    if (!res.ok) {
      log.warn("gemini call failed", {
        model: GEMINI_MODEL,
        status: res.status,
        detail: (await res.text()).slice(0, 300),
      });
      return null;
    }

    const data = (await res.json()) as any;
    const candidate = data.candidates?.[0];
    if (candidate?.finishReason && candidate.finishReason !== "STOP") {
      log.warn("gemini reply incomplete", { model: GEMINI_MODEL, finishReason: candidate.finishReason });
      return null;
    }

    const text = (candidate?.content?.parts ?? [])
      .filter((p: any) => !p.thought && typeof p.text === "string")
      .map((p: any) => p.text)
      .join("")
      .trim();
    return text || null;
  } catch (err) {
    log.warn("gemini call threw", { model: GEMINI_MODEL, error: String(err) });
    return null;
  }
}
