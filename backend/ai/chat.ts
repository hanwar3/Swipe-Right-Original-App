import { api } from "encore.dev/api";
import { secret } from "encore.dev/config";

const openAIApiKey = secret("OpenAIApiKey");

export interface ChatRequest {
  message: string;
  context?: string;
}

export interface ChatResponse {
  response: string;
}

// Processes user queries about credit card optimization and cashback strategies.
export const chat = api<ChatRequest, ChatResponse>(
  { expose: true, method: "POST", path: "/ai/chat" },
  async (req) => {
    const systemPrompt = `You are SwipeRight AI, an expert credit card advisor. Help users maximize their cashback and rewards by:

1. Recommending the best cards for specific purchases (groceries, gas, dining, etc.)
2. Explaining how to track rotating category benefits and annual limits
3. Providing strategies to optimize credit card usage
4. Answering questions about credit card features and benefits

Keep responses concise, helpful, and focused on maximizing rewards. Always consider the user's spending patterns and suggest practical advice.

Context about available cards: Chase Freedom Flex (5% rotating categories), Chase Sapphire Reserve (3% travel/dining), Amex Gold (4% dining/groceries), Citi Double Cash (2% everything), Discover it (5% rotating), and many others.`;

    try {
      const response = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${openAIApiKey()}`
        },
        body: JSON.stringify({
          model: 'gpt-4o-mini',
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: req.message }
          ],
          max_tokens: 500,
          temperature: 0.7
        })
      });

      if (!response.ok) {
        throw new Error(`OpenAI API error: ${response.status}`);
      }

      const data = await response.json();
      const aiResponse = data.choices?.[0]?.message?.content || "I'm sorry, I couldn't process your request. Please try again.";

      return { response: aiResponse };
    } catch (error) {
      console.error('AI chat error:', error);
      return { 
        response: "I'm experiencing technical difficulties. Please try asking your question again in a moment." 
      };
    }
  }
);
