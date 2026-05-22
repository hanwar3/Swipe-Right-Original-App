import { api, APIError } from "encore.dev/api";
import { secret } from "encore.dev/config";
import { cardsDB } from "./db";
import type { Card, CardCategory } from "./list";

const rewardsApiKey = secret("RewardsApiKey");

export interface AddCardRequest {
  name: string;
  issuer?: string;
  useExternalApi?: boolean;
}

export interface AddCardResponse {
  card: Card;
  isNew: boolean;
  fromExternalApi: boolean;
}

// Adds a card to the database or returns existing card with updated image.
export const addCard = api<AddCardRequest, AddCardResponse>(
  { expose: true, method: "POST", path: "/cards/add" },
  async (req) => {
    const cardName = req.name.trim();
    if (!cardName) {
      throw APIError.invalidArgument("Card name is required");
    }

    // First, try to find existing card by exact name match
    let existingCard = await cardsDB.queryRow`
      SELECT id, name, issuer, image_url, annual_fee, network, type
      FROM cards 
      WHERE LOWER(name) = ${cardName.toLowerCase()}
    `;

    if (existingCard) {
      // Get categories for existing card
      const categoryRows = await cardsDB.queryAll`
        SELECT id, category, cashback_rate, is_rotating, valid_until
        FROM card_categories 
        WHERE card_id = ${existingCard.id}
        ORDER BY cashback_rate DESC
      `;

      const categories: CardCategory[] = categoryRows.map(cat => ({
        id: cat.id,
        category: cat.category,
        cashbackRate: cat.cashback_rate,
        isRotating: cat.is_rotating,
        validUntil: cat.valid_until ? new Date(cat.valid_until).toISOString().split('T')[0] : undefined
      }));

      const card: Card = {
        id: existingCard.id,
        name: existingCard.name,
        issuer: existingCard.issuer,
        imageUrl: existingCard.image_url || generateFallbackImageUrl(existingCard.name, existingCard.issuer, existingCard.network),
        annualFee: existingCard.annual_fee,
        network: existingCard.network || 'Visa',
        type: existingCard.type || 'credit',
        categories
      };

      return { card, isNew: false, fromExternalApi: false };
    }

    let cardData: any = null;
    let fromExternalApi = false;

    // Try to fetch from external API if requested
    if (req.useExternalApi) {
      try {
        const searchResponse = await fetch(`https://rewards-credit-card-api.p.rapidapi.com/creditcard-detail-namesearch/${encodeURIComponent(cardName)}`, {
          method: 'GET',
          headers: {
            'X-RapidAPI-Key': rewardsApiKey(),
            'X-RapidAPI-Host': 'rewards-credit-card-api.p.rapidapi.com'
          }
        });

        if (searchResponse.ok) {
          const searchData = await searchResponse.json() as { cardKey?: string }[];
          if (searchData && searchData.length > 0) {
            const cardKey = searchData[0].cardKey;
            const imageResponse = await fetch(`https://rewards-credit-card-api.p.rapidapi.com/creditcard-card-image/${cardKey}`, {
              method: 'GET',
              headers: {
                'X-RapidAPI-Key': rewardsApiKey(),
                'X-RapidAPI-Host': 'rewards-credit-card-api.p.rapidapi.com'
              }
            });

            if (imageResponse.ok) {
              const imageData = await imageResponse.json() as { cardImageUrl?: string }[];
              if (imageData && imageData.length > 0 && imageData[0].cardImageUrl) {
                const { issuer, network, type } = await inferCardDetails(cardName, req.issuer);
                cardData = {
                  name: cardName,
                  issuer,
                  network,
                  imageUrl: imageData[0].cardImageUrl!,
                  annualFee: 0, // These values would ideally come from the API
                  categories: [],
                  features: [],
                  creditRange: 'Good to Excellent',
                  type
                };
                fromExternalApi = true;
              }
            }
          }
        }
      } catch (error) {
        console.error('Failed to fetch from external API:', error);
      }
    }

    // If no external data, use manual inference
    if (!cardData) {
      const { issuer, network, imageUrl, type } = await inferCardDetails(cardName, req.issuer);
      cardData = {
        name: cardName,
        issuer,
        network,
        imageUrl,
        annualFee: 0,
        categories: [{
          category: 'Other',
          cashbackRate: 1.0,
          isRotating: false
        }],
        features: [],
        creditRange: 'Good to Excellent',
        type
      };
    }

    // Create new card
    const newCard = await cardsDB.queryRow`
      INSERT INTO cards (
        name, issuer, image_url, annual_fee, network, 
        features, welcome_bonus, credit_range, apply_url, type
      )
      VALUES (
        ${cardData.name}, 
        ${cardData.issuer}, 
        ${cardData.imageUrl}, 
        ${cardData.annualFee || 0}, 
        ${cardData.network || 'Visa'},
        ${JSON.stringify(cardData.features || [])},
        ${cardData.welcomeBonus || null},
        ${cardData.creditRange || 'Good to Excellent'},
        ${cardData.applyUrl || null},
        ${cardData.type || 'credit'}
      )
      RETURNING id, name, issuer, image_url, annual_fee, network, type
    `;

    if (!newCard) {
      throw APIError.internal("Failed to create card");
    }

    // Add categories
    const categories: CardCategory[] = [];
    if (cardData.categories && cardData.categories.length > 0) {
      for (const cat of cardData.categories) {
        await cardsDB.exec`
          INSERT INTO card_categories (card_id, category, cashback_rate, is_rotating, valid_until)
          VALUES (
            ${newCard.id}, 
            ${cat.category}, 
            ${cat.cashbackRate || 1.0}, 
            ${cat.isRotating || false},
            ${cat.validUntil ? new Date(cat.validUntil) : null}
          )
        `;
        
        categories.push({
          id: 0, // Will be assigned by database
          category: cat.category,
          cashbackRate: cat.cashbackRate || 1.0,
          isRotating: cat.isRotating || false,
          validUntil: cat.validUntil
        });
      }
    } else {
      // Add default category
      await cardsDB.exec`
        INSERT INTO card_categories (card_id, category, cashback_rate, is_rotating)
        VALUES (${newCard.id}, 'Other', 1.0, FALSE)
      `;
      
      categories.push({
        id: 0,
        category: 'Other',
        cashbackRate: 1.0,
        isRotating: false
      });
    }

    const card: Card = {
      id: newCard.id,
      name: newCard.name,
      issuer: newCard.issuer,
      imageUrl: newCard.image_url || generateFallbackImageUrl(newCard.name, newCard.issuer, newCard.network),
      annualFee: newCard.annual_fee,
      network: newCard.network || 'Visa',
      type: newCard.type || 'credit',
      categories
    };

    return { card, isNew: true, fromExternalApi };
  }
);

async function inferCardDetails(cardName: string, providedIssuer?: string): Promise<{
  issuer: string;
  network: string;
  imageUrl: string;
  type: string;
}> {
  const name = cardName.toLowerCase();
  
  // Infer issuer from card name
  let issuer = providedIssuer || 'Unknown';
  let network = 'Visa'; // Default network
  let type = name.includes('debit') ? 'debit' : 'credit';
  
  if (name.includes('chase')) {
    issuer = 'Chase';
    network = name.includes('freedom flex') ? 'Mastercard' : 'Visa';
  } else if (name.includes('amex') || name.includes('american express')) {
    issuer = 'American Express';
    network = 'American Express';
  } else if (name.includes('capital one')) {
    issuer = 'Capital One';
    network = name.includes('savor') ? 'Mastercard' : 'Visa';
  } else if (name.includes('citi')) {
    issuer = 'Citi';
    network = 'Mastercard';
  } else if (name.includes('discover')) {
    issuer = 'Discover';
    network = 'Discover';
  } else if (name.includes('wells fargo')) {
    issuer = 'Wells Fargo';
    network = 'Visa';
  } else if (name.includes('bank of america') || name.includes('boa')) {
    issuer = 'Bank of America';
    network = 'Visa';
  } else if (name.includes('us bank')) {
    issuer = 'US Bank';
    network = 'Visa';
  }

  // Try to fetch image from web sources
  const imageUrl = await fetchCardImage(cardName, issuer);
  
  return { issuer, network, imageUrl, type };
}

async function fetchCardImage(cardName: string, issuer: string): Promise<string> {
  const name = cardName.toLowerCase();
  
  // Chase cards
  if (issuer === 'Chase') {
    if (name.includes('sapphire reserve')) {
      return 'https://creditcards.chase.com/K-Marketplace/images/cardart/sapphire_reserve_card.png';
    } else if (name.includes('sapphire preferred')) {
      return 'https://creditcards.chase.com/K-Marketplace/images/cardart/sapphire_preferred_card.png';
    } else if (name.includes('freedom unlimited')) {
      return 'https://creditcards.chase.com/K-Marketplace/images/cardart/freedom_unlimited_card.png';
    } else if (name.includes('freedom flex')) {
      return 'https://creditcards.chase.com/K-Marketplace/images/cardart/freedom_flex_card.png';
    }
  }
  
  // American Express cards
  if (issuer === 'American Express') {
    if (name.includes('platinum')) {
      return 'https://icm.aexp-static.com/Internet/Acquisition/US_en/AppContent/OneSite/category/cardarts/platinum-card.png';
    } else if (name.includes('gold')) {
      return 'https://icm.aexp-static.com/Internet/Acquisition/US_en/AppContent/OneSite/category/cardarts/gold-card.png';
    } else if (name.includes('blue cash everyday')) {
      return 'https://icm.aexp-static.com/Internet/Acquisition/US_en/AppContent/OneSite/category/cardarts/blue-cash-everyday-card.png';
    } else if (name.includes('blue cash preferred')) {
      return 'https://icm.aexp-static.com/Internet/Acquisition/US_en/AppContent/OneSite/category/cardarts/blue-cash-preferred-card.png';
    }
  }
  
  // Capital One cards
  if (issuer === 'Capital One') {
    if (name.includes('venture x')) {
      return 'https://ecm.capitalone.com/WCM/card/products/venture-x-card-art.png';
    } else if (name.includes('savor')) {
      return 'https://ecm.capitalone.com/WCM/card/products/savor-one-card-art.png';
    } else if (name.includes('quicksilver')) {
      return 'https://ecm.capitalone.com/WCM/card/products/quicksilver-card-art.png';
    }
  }
  
  // Fallback to placeholder
  return generateFallbackImageUrl(cardName, issuer, 'Visa');
}

function generateFallbackImageUrl(cardName: string, issuer: string, network?: string): string {
  const encodedName = encodeURIComponent(cardName);
  const encodedIssuer = encodeURIComponent(issuer);
  return `https://via.placeholder.com/300x190/1f2937/ffffff?text=${encodedIssuer}+${encodedName}`;
}
