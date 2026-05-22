declare module "~encore/clients" {
  export const cards: {
    getUserPortfolio(params: { userId: string }): Promise<{
      cards: Array<{
        id: number;
        card: {
          id: number;
          name: string;
          issuer: string;
          imageUrl: string;
          annualFee: number;
          network: string;
          type: string;
          categories: Array<{
            id: number;
            category: string;
            cashbackRate: number;
            isRotating: boolean;
            validUntil?: string;
          }>;
        };
        nickname?: string;
        creditLimit?: number;
        currentBalance: number;
        isActive: boolean;
        addedAt: string;
      }>;
    }>;
    getUserMerchantOffers(params: { userId: string }): Promise<{
      offers: Array<{
        id: number;
        cardId: number;
        cardName: string;
        merchantName: string;
        offerDescription: string;
        cashbackRate?: number;
        cashbackAmount?: number;
        minimumSpend?: number;
        maximumCashback?: number;
        offerType: string;
        startDate?: string;
        endDate?: string;
        isActivated: boolean;
        isUsed: boolean;
        usageCount: number;
        maxUsage: number;
      }>;
    }>;
  };
}
