import { api, APIError } from "encore.dev/api";
import { secret } from "encore.dev/config";
import { cardsDB } from "../cards/db";

const geminiApiKey = secret("GeminiApiKey");

export interface AssistantRequest {
  userId: string;
  query: string; // e.g., "groceries", "gas", "dining"
}

export interface AssistantResponse {
  response: string;
}

// Endpoint for Siri/Google Assistant integration.
// Receives a category/query, finds the best card in the user's portfolio,
// and returns a natural language string.
export const assistantRecommend = api<AssistantRequest, AssistantResponse>(
  { expose: true, method: "GET", path: "/ai/assistant/recommend" },
  async (req) => {
    const { userId, query } = req;

    if (!userId || !query) {
      throw APIError.invalidArgument("userId and query are required");
    }

    try {
      // Find cards in user's portfolio
      const portfolioRows = await cardsDB.queryAll`
        SELECT up.id, up.card_id, up.nickname, c.name, c.issuer
        FROM user_portfolios up
        JOIN cards c ON up.card_id = c.id
        WHERE up.user_id = ${userId} AND up.is_active = TRUE
      `;

      if (portfolioRows.length === 0) {
        return { response: "You don't have any cards in your portfolio yet." };
      }

      // Format portfolio for Gemini
      let portfolioContext = "The user has the following cards in their portfolio:\n";
      for (const row of portfolioRows) {
        // Find categories for this card
        const categoryRows = await cardsDB.queryAll`
          SELECT category, cashback_rate
          FROM card_categories
          WHERE card_id = ${row.card_id}
          ORDER BY cashback_rate DESC
        `;

        const categoriesText = categoryRows.map(c => `${c.cashback_rate}% on ${c.category}`).join(", ");
        const cardName = row.nickname || row.name;
        portfolioContext += `- ${cardName} (${row.issuer}): ${categoriesText}\n`;
      }

      const systemPrompt = `You are SwipeRight AI Assistant, responding directly to Siri or Google Assistant voice queries.

Your task is to recommend the best credit card from the user's portfolio for their specific purchase: "${query}".

${portfolioContext}

Guidelines:
1. State the best card from their portfolio to use for this purchase category.
2. Mention the cashback rate or reward they will get.
3. Keep it extremely concise, conversational, and direct, as it will be spoken out loud by a voice assistant. Limit your response to 1-2 short sentences.
4. If multiple cards tie, just mention one or briefly mention both if they are identical in rewards.
5. Do not use markdown or complex formatting. Just plain text.`;

      const geminiResponse = await fetch('https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent', {
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
                { text: `What is the best card for ${query}?` }
              ]
            }
          ]
        })
      });

      if (!geminiResponse.ok) {
        throw new Error(`Gemini API error: ${geminiResponse.status}`);
      }

      const data = await geminiResponse.json() as any;
      const aiResponseText = data.candidates?.[0]?.content?.parts?.[0]?.text || "I couldn't determine the best card right now.";

      return { response: aiResponseText.trim() };

    } catch (error) {
      console.error('Assistant AI error:', error);
      return {
        response: "Sorry, I'm having trouble accessing your portfolio right now."
      };
    }
  }
);
