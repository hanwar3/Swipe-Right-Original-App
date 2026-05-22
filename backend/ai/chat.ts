import { api, APIError } from "encore.dev/api";
import { secret } from "encore.dev/config";
import { cards } from "~encore/clients";

const geminiApiKey = secret("GeminiApiKey");
const elevenLabsApiKey = secret("ElevenLabsApiKey");

const ELEVENLABS_VOICE_ID = "EXAVITQu4vr4xnSDxMaL";

export interface ChatRequest {
  message: string;
  context?: string;
  userId?: string;
}

export interface ChatResponse {
  response: string;
}

export interface TTSRequest {
  text: string;
}

export interface TTSResponse {
  audioBase64: string;
  mimeType: string;
}

export interface STTRequest {
  audioBase64: string;
  mimeType: string;
}

export interface STTResponse {
  transcript: string;
}

export const chat = api<ChatRequest, ChatResponse>(
  { expose: true, method: "POST", path: "/ai/chat" },
  async (req) => {
    let userPortfolioContext = "The user has not provided their portfolio, or they are not signed in.";
    
    if (req.userId) {
      try {
        const portfolio = await cards.getUserPortfolio({ userId: req.userId });
        if (portfolio.cards.length > 0) {
          const cardDescriptions = portfolio.cards.map((userCard: any) => {
            const categories = userCard.card.categories
              .map((cat: any) => `${cat.category} at ${cat.cashbackRate}%`)
              .join(', ');
            return `- ${userCard.nickname || userCard.card.name} (${userCard.card.issuer}): Offers ${categories}.`;
          }).join('\n');
          userPortfolioContext = `Here is the user's current credit card portfolio:\n${cardDescriptions}`;
          
          // Inject active merchant offers
          try {
            const offersResponse = await cards.getUserMerchantOffers({ userId: req.userId });
            const activeOffers = offersResponse.offers;
            if (activeOffers.length > 0) {
              const offerDescriptions = activeOffers.map((offer: any) => {
                const expiryText = offer.endDate ? `, expiring on ${offer.endDate}` : '';
                return `- ${offer.merchantName}: ${offer.offerDescription} on your ${offer.cardName}${expiryText}. (Special Cashback Rate: ${offer.cashbackRate || 0}%)`;
              }).join('\n');
              userPortfolioContext += `\n\nHere are the user's active and expiring merchant-specific offers:\n${offerDescriptions}`;
            }
          } catch (offerErr) {
            console.error("Failed to fetch user merchant offers for AI context:", offerErr);
          }
        } else {
          userPortfolioContext = "The user has an empty portfolio.";
        }
      } catch (error) {
        console.error("Failed to fetch user portfolio for AI context:", error);
        userPortfolioContext = "There was an error fetching the user's portfolio.";
      }
    }

    const systemPrompt = `You are SwipeRight AI, an expert credit card advisor. Your primary goal is to help users maximize their cashback and rewards by recommending the best card *from their portfolio* for a specific purchase.

    ${userPortfolioContext}

    When the user asks for a recommendation (e.g., "what card for groceries?" or "what card for Best Buy?"), first check their portfolio and active/expiring merchant offers. If a card has an active merchant offer (e.g. 5% back at Best Buy) or high category cashback rate, recommend it immediately. Make sure to call out active merchant offers and mention if they are expiring soon to urge the user to utilize them.

    If no card in their portfolio has a relevant category or offer, you can suggest other cards from the general database, but make it clear that these are not in the user's wallet.

    If the user asks a general question, you can answer more broadly using your general knowledge.

    Keep responses concise, helpful, and focused on maximizing rewards. Always prioritize the user's existing cards for spending recommendations. Keep answers brief and conversational since they may be spoken aloud.`;

    const response = await fetch('https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-goog-api-key': geminiApiKey()
      },
      body: JSON.stringify({
        contents: [
          {
            parts: [
              { text: systemPrompt },
              { text: req.message }
            ]
          }
        ]
      })
    });

    if (!response.ok) {
      const errorBody = await response.text();
      console.error(`Gemini API error: ${response.status}`, errorBody);
      throw APIError.internal("AI service error");
    }

    const data = await response.json() as { candidates?: { content?: { parts?: { text?: string }[] } }[] };
    const aiResponse = data.candidates?.[0]?.content?.parts?.[0]?.text || "I'm sorry, I couldn't process your request. Please try again.";

    return { response: aiResponse };
  }
);

export const textToSpeech = api<TTSRequest, TTSResponse>(
  { expose: true, method: "POST", path: "/ai/tts" },
  async (req) => {
    const response = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${ELEVENLABS_VOICE_ID}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'xi-api-key': elevenLabsApiKey(),
      },
      body: JSON.stringify({
        text: req.text,
        model_id: "eleven_turbo_v2_5",
        voice_settings: {
          stability: 0.5,
          similarity_boost: 0.75,
          style: 0.0,
          use_speaker_boost: true,
        },
      }),
    });

    if (!response.ok) {
      const err = await response.text();
      console.error("ElevenLabs TTS error:", err);
      throw APIError.internal("Text-to-speech service error");
    }

    const audioBuffer = await response.arrayBuffer();
    const audioBase64 = Buffer.from(audioBuffer).toString('base64');

    return { audioBase64, mimeType: "audio/mpeg" };
  }
);

export const speechToText = api<STTRequest, STTResponse>(
  { expose: true, method: "POST", path: "/ai/stt" },
  async (req) => {
    const audioBuffer = Buffer.from(req.audioBase64, 'base64');
    const blob = new Blob([audioBuffer], { type: req.mimeType });

    const formData = new FormData();
    formData.append('file', blob, 'audio.webm');
    formData.append('model_id', 'scribe_v1');

    const response = await fetch('https://api.elevenlabs.io/v1/speech-to-text', {
      method: 'POST',
      headers: {
        'xi-api-key': elevenLabsApiKey(),
      },
      body: formData,
    });

    if (!response.ok) {
      const err = await response.text();
      console.error("ElevenLabs STT error:", err);
      throw APIError.internal("Speech-to-text service error");
    }

    const data = await response.json() as { text?: string };
    const transcript = data.text || "";

    return { transcript };
  }
);