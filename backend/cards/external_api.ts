import { api, APIError } from "encore.dev/api";
import { secret } from "encore.dev/config";

const rewardsCCApiKey = secret("RewardsCCApiKey");

export interface ExternalCardData {
  id: string;
  name: string;
  issuer: string;
  network: string;
  imageUrl: string;
  annualFee: number;
  categories: {
    category: string;
    cashbackRate: number;
    isRotating: boolean;
    validUntil?: string;
  }[];
  features: string[];
  welcomeBonus?: string;
  creditRange: string;
  applyUrl?: string;
}

export interface FetchCardDataRequest {
  cardName: string;
}

export interface FetchCardDataResponse {
  cardData: ExternalCardData | null;
  found: boolean;
}

// Fetches card data from RewardsCC API.
export const fetchCardData = api<FetchCardDataRequest, FetchCardDataResponse>(
  { expose: true, method: "POST", path: "/cards/fetch-external" },
  async (req) => {
    const { cardName } = req;
    
    try {
      // Search for card using RewardsCC API
      const searchResponse = await fetch(`https://api.rewardscc.com/v1/cards/search?q=${encodeURIComponent(cardName)}`, {
        headers: {
          'Authorization': `Bearer ${rewardsCCApiKey()}`,
          'Content-Type': 'application/json'
        }
      });

      if (!searchResponse.ok) {
        console.error('RewardsCC API search failed:', searchResponse.status);
        return { cardData: null, found: false };
      }

      const searchData = await searchResponse.json();
      
      if (!searchData.cards || searchData.cards.length === 0) {
        return { cardData: null, found: false };
      }

      // Get detailed data for the first matching card
      const cardId = searchData.cards[0].id;
      const detailResponse = await fetch(`https://api.rewardscc.com/v1/cards/${cardId}`, {
        headers: {
          'Authorization': `Bearer ${rewardsCCApiKey()}`,
          'Content-Type': 'application/json'
        }
      });

      if (!detailResponse.ok) {
        console.error('RewardsCC API detail failed:', detailResponse.status);
        return { cardData: null, found: false };
      }

      const cardDetail = await detailResponse.json();
      
      // Transform the API response to our format
      const cardData: ExternalCardData = {
        id: cardDetail.id,
        name: cardDetail.name || cardName,
        issuer: cardDetail.issuer || inferIssuerFromName(cardName),
        network: cardDetail.network || inferNetworkFromName(cardName),
        imageUrl: cardDetail.image_url || cardDetail.imageUrl || generateFallbackImageUrl(cardName),
        annualFee: cardDetail.annual_fee || cardDetail.annualFee || 0,
        categories: (cardDetail.categories || []).map((cat: any) => ({
          category: cat.name || cat.category,
          cashbackRate: cat.rate || cat.cashbackRate || 1.0,
          isRotating: cat.rotating || cat.isRotating || false,
          validUntil: cat.valid_until || cat.validUntil
        })),
        features: cardDetail.features || [],
        welcomeBonus: cardDetail.welcome_bonus || cardDetail.welcomeBonus,
        creditRange: cardDetail.credit_range || cardDetail.creditRange || 'Good to Excellent',
        applyUrl: cardDetail.apply_url || cardDetail.applyUrl
      };

      return { cardData, found: true };
    } catch (error) {
      console.error('Error fetching card data from RewardsCC:', error);
      
      // Fallback to manual data inference
      const fallbackData: ExternalCardData = {
        id: `manual_${Date.now()}`,
        name: cardName,
        issuer: inferIssuerFromName(cardName),
        network: inferNetworkFromName(cardName),
        imageUrl: generateFallbackImageUrl(cardName),
        annualFee: 0,
        categories: [{
          category: 'Other',
          cashbackRate: 1.0,
          isRotating: false
        }],
        features: [],
        creditRange: 'Good to Excellent'
      };

      return { cardData: fallbackData, found: false };
    }
  }
);

function inferIssuerFromName(cardName: string): string {
  const name = cardName.toLowerCase();
  
  if (name.includes('chase')) return 'Chase';
  if (name.includes('amex') || name.includes('american express')) return 'American Express';
  if (name.includes('capital one')) return 'Capital One';
  if (name.includes('citi')) return 'Citi';
  if (name.includes('discover')) return 'Discover';
  if (name.includes('wells fargo')) return 'Wells Fargo';
  if (name.includes('bank of america') || name.includes('boa')) return 'Bank of America';
  if (name.includes('us bank')) return 'US Bank';
  if (name.includes('barclays')) return 'Barclays';
  if (name.includes('synchrony')) return 'Synchrony';
  
  return 'Unknown';
}

function inferNetworkFromName(cardName: string): string {
  const name = cardName.toLowerCase();
  
  if (name.includes('amex') || name.includes('american express')) return 'American Express';
  if (name.includes('discover')) return 'Discover';
  if (name.includes('freedom flex') || name.includes('savor')) return 'Mastercard';
  
  return 'Visa'; // Default
}

function generateFallbackImageUrl(cardName: string): string {
  const encodedName = encodeURIComponent(cardName);
  return `https://via.placeholder.com/300x190/1f2937/ffffff?text=${encodedName}`;
}
