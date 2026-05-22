import React, { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { 
  Search, Target, TrendingUp, Star, Gift, ExternalLink, 
  Shield, CheckCircle, Info, RefreshCw, Smartphone, Chrome, 
  AlertTriangle, ArrowRight, Zap, Check, Wallet, Award
} from 'lucide-react';
import backend from '~backend/client';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useToast } from '@/components/ui/use-toast';
import { useAuth } from '../contexts/AuthContext';
import type { CardRecommendation } from '~backend/cards/recommend';


const popularCategories = [
  'Groceries', 'Gas', 'Dining', 'Travel', 'Shopping', 'Streaming'
];

export default function Recommendations() {
  const [searchParams] = useSearchParams();
  const catParam = searchParams.get('cat') || '';
  const [category, setCategory] = useState(catParam);
  const [searchTriggered, setSearchTriggered] = useState(!!catParam);
  
  useEffect(() => {
    if (catParam) {
      setCategory(catParam);
      setSearchTriggered(true);
    }
  }, [catParam]);

  const { user } = useAuth();
  const queryClient = useQueryClient();
  const { toast } = useToast();

  // Load user's portfolio cards to distribute synced offers
  const { data: portfolioData } = useQuery({
    queryKey: ['portfolio', user?.userId],
    queryFn: () => user ? backend.cards.getUserPortfolio({ userId: user.userId }) : null,
    enabled: !!user,
  });

  const portfolioCards = portfolioData?.cards || [];

  // Browser Extension Sync simulator mutation
  const syncMutation = useMutation({
    mutationFn: async () => {
      if (!user) throw new Error('Not authenticated');
      if (portfolioCards.length === 0) {
        throw new Error('Please add at least one card to your portfolio in the "Credit Cards" tab first so we can sync offers to it.');
      }
      
      const mockOffers = [
        {
          merchantName: "Amazon Fresh",
          offerDescription: "10% back on groceries at Amazon Fresh",
          cashbackRate: 10.0,
          offerType: "cashback",
          endDate: new Date(Date.now() + 5 * 24 * 60 * 60 * 1000).toISOString().split('T')[0], // expiring in 5 days
          isActivated: true
        },
        {
          merchantName: "Food Lion",
          offerDescription: "7% back on standard groceries",
          cashbackRate: 7.0,
          offerType: "cashback",
          endDate: new Date(Date.now() + 15 * 24 * 60 * 60 * 1000).toISOString().split('T')[0], // expiring in 15 days
          isActivated: true
        },
        {
          merchantName: "Nike",
          offerDescription: "Spend $150 get $25 statement credit back",
          cashbackAmount: 2500, // $25 in cents
          minimumSpend: 15000, // $150 in cents
          offerType: "cashback",
          endDate: new Date(Date.now() + 2 * 24 * 60 * 60 * 1000).toISOString().split('T')[0], // expiring in 2 days
          isActivated: true
        },
        {
          merchantName: "Rayban",
          offerDescription: "Spend $50 get $25 back on Rayban Glasses",
          cashbackAmount: 2500,
          minimumSpend: 5000,
          offerType: "cashback",
          endDate: new Date(Date.now() + 45 * 24 * 60 * 60 * 1000).toISOString().split('T')[0], // expiring in 45 days
          isActivated: true
        },
        {
          merchantName: "Uber",
          offerDescription: "5% back on rides and Uber Eats",
          cashbackRate: 5.0,
          offerType: "cashback",
          endDate: new Date(Date.now() + 28 * 24 * 60 * 60 * 1000).toISOString().split('T')[0], // expiring in 28 days
          isActivated: true
        }
      ];

      // Distribute mock offers across portfolio cards
      const offersWithCardIds = mockOffers.map((o, idx) => {
        const targetCard = portfolioCards[idx % portfolioCards.length];
        return {
          ...o,
          cardId: targetCard.card.id
        };
      });

      return backend.cards.syncMerchantOffers({
        userId: user.userId,
        offers: offersWithCardIds
      });
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['recommendations'] });
      queryClient.invalidateQueries({ queryKey: ['merchant-offers'] });
      queryClient.invalidateQueries({ queryKey: ['portfolio', user?.userId] });
      toast({
        title: "Simulator Extension Sync Successful!",
        description: `Synced ${data.synced} new offers and updated ${data.updated} offers across your portfolio cards!`,
      });
    },
    onError: (error: any) => {
      toast({
        title: "Sync Error",
        description: error.message || "Failed to sync offers.",
        variant: "destructive"
      });
    }
  });

  const { data: recommendationsData, isLoading } = useQuery({
    queryKey: ['recommendations', category, user?.userId],
    queryFn: () => backend.cards.recommend({ 
      category, 
      userId: user?.userId 
    }),
    enabled: searchTriggered && category.length > 0,
  });

  const { data: merchantOffersData } = useQuery({
    queryKey: ['merchant-offers', user?.userId, category],
    queryFn: () => user ? backend.cards.getRelevantOffers({ 
      userId: user.userId, 
      category 
    }) : null,
    enabled: !!user && searchTriggered && category.length > 0,
  });

  const handleSearch = () => {
    if (category.trim()) {
      setSearchTriggered(true);
    }
  };

  const handleCategoryClick = (cat: string) => {
    setCategory(cat);
    setSearchTriggered(true);
  };

  const allRecommendations = recommendationsData?.cards || [];
  const portfolioRecommendations = recommendationsData?.portfolioRecommendations || [];
  const merchantOffers = merchantOffersData?.offers || [];

  return (
    <div className="max-w-4xl mx-auto px-4 py-8 space-y-8">
      {/* Header */}
      <div className="text-center space-y-4">
        <div className="inline-flex items-center space-x-2 bg-gradient-to-r from-teal-500 to-green-500 text-white px-4 py-2 rounded-full text-sm font-medium">
          <Target className="h-4 w-4" />
          <span>Smart Recommendations</span>
        </div>
        
        <h1 className="text-3xl font-bold text-gray-900">
          Find Your Perfect
          <span className="block bg-gradient-to-r from-teal-600 to-green-600 bg-clip-text text-transparent">
            Cashback Card
          </span>
        </h1>
        
        <p className="text-gray-600 max-w-2xl mx-auto">
          Tell us what you're buying and we'll recommend the best credit cards to maximize your rewards.
        </p>
      </div>

      {/* Search */}
      <div className="space-y-4">
        <div className="flex space-x-2">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 h-4 w-4" />
            <Input
              placeholder="What are you buying? (e.g., groceries, gas, dining)"
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              onKeyPress={(e) => e.key === 'Enter' && handleSearch()}
              className="pl-10 border-gray-200 focus:border-teal-500 focus:ring-teal-500"
            />
          </div>
          <Button 
            onClick={handleSearch}
            disabled={!category.trim()}
            className="bg-teal-500 hover:bg-teal-600"
          >
            Find Cards
          </Button>
        </div>

        {/* Popular Categories */}
        <div className="space-y-2">
          <p className="text-sm text-gray-600">Popular categories:</p>
          <div className="flex flex-wrap gap-2">
            {popularCategories.map((cat) => (
              <Button
                key={cat}
                variant="outline"
                size="sm"
                onClick={() => handleCategoryClick(cat)}
                className="hover:bg-teal-50 hover:border-teal-300"
              >
                {cat}
              </Button>
            ))}
          </div>
        </div>
      </div>

      {/* Browser Extension Sync Simulator Widget */}
      {user && (
        <Card className="border border-slate-100 shadow-[0_8px_30px_rgb(0,0,0,0.04)] rounded-3xl overflow-hidden bg-white">
          <CardHeader className="pb-3 border-b border-slate-50">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
              <div className="flex items-center space-x-3">
                <div className="p-2 bg-teal-50 text-teal-600 rounded-xl">
                  <Chrome className="h-5 w-5" />
                </div>
                <div>
                  <CardTitle className="text-base font-bold text-slate-800">Browser Extension Connector</CardTitle>
                  <CardDescription className="text-xs">Synchronize Chase, Amex, and Capital One active merchant deals securely</CardDescription>
                </div>
              </div>
              <Button 
                onClick={() => syncMutation.mutate()} 
                disabled={syncMutation.isPending || portfolioCards.length === 0}
                className="bg-teal-500 hover:bg-teal-600 text-white font-bold rounded-xl text-xs px-4 py-2 self-start sm:self-auto shadow-md border-0"
              >
                {syncMutation.isPending ? (
                  <>
                    <RefreshCw className="h-3.5 w-3.5 mr-2 animate-spin" />
                    Syncing Wallet...
                  </>
                ) : (
                  <>
                    <RefreshCw className="h-3.5 w-3.5 mr-2" />
                    Simulate Sync
                  </>
                )}
              </Button>
            </div>
          </CardHeader>
          <CardContent className="pt-4 space-y-4">
            {/* Quick Status */}
            <div className="flex flex-wrap items-center gap-4 text-xs font-semibold">
              <div className="flex items-center space-x-1.5 text-slate-600">
                <CheckCircle className="h-4 w-4 text-emerald-500" />
                <span>Parser Status: <span className="text-emerald-600 font-bold">Connected & Safe</span></span>
              </div>
              <div className="flex items-center space-x-1.5 text-slate-600">
                <Gift className="h-4 w-4 text-orange-500" />
                <span>Active synced offers: <span className="text-orange-600 font-bold">{syncMutation.isSuccess ? '5 Hot Deals Synced' : '0 Synced'}</span></span>
              </div>
            </div>

            {/* Architecture / Security Breakdown Accordion */}
            <div className="bg-slate-50 border border-slate-100 p-3.5 rounded-2xl space-y-3 text-left">
              <div className="flex items-center space-x-1.5 text-slate-800 font-bold text-xs">
                <Shield className="h-4 w-4 text-teal-600" />
                <span>SwipeRight Security & Architectural Strategy</span>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-[11px] leading-relaxed">
                <div className="space-y-1.5 bg-red-50/50 border border-red-100 p-3 rounded-xl">
                  <div className="flex items-center space-x-1 text-red-800 font-bold">
                    <AlertTriangle className="h-3.5 w-3.5" />
                    <span>Native App Screen-Mining (RISKY)</span>
                  </div>
                  <p className="text-red-700 font-medium text-[11px]">
                    Scraping bank mobile apps using on-device accessibility tools or screen-recording violates Apple App Store security policies and Bank Terms of Service. It risks leaking credentials, account numbers, and triggers firewalls (ThreatMetrix/Arkose Labs).
                  </p>
                </div>
                <div className="space-y-1.5 bg-emerald-50/50 border border-emerald-100 p-3 rounded-xl">
                  <div className="flex items-center space-x-1 text-emerald-800 font-bold">
                    <Zap className="h-3.5 w-3.5" />
                    <span>SwipeRight Parser Sync (OPTIMAL)</span>
                  </div>
                  <p className="text-emerald-700 font-medium text-[11px]">
                    Our Chrome extension operates client-side inside your logged-in session. It parses plain HTML tables on your Chase/Amex deals tab, triggers bank activations, and pushes clean merchant offer metadata without touching credentials or account numbers.
                  </p>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Loading */}
      {isLoading && (
        <div className="space-y-4">
          <div className="text-center">
            <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-teal-500"></div>
            <p className="mt-2 text-gray-600">Finding the best cards for you...</p>
          </div>
        </div>
      )}

      {/* Results */}
      {searchTriggered && !isLoading && allRecommendations.length > 0 && (
        <div className="space-y-6">
          <div className="text-center">
            <h2 className="text-xl font-semibold text-gray-900 mb-2">
              Best Cards for {recommendationsData?.category}
            </h2>
            <p className="text-gray-600">Ranked by cashback rate and value</p>
          </div>

          {/* Decision Panel */}
          {user && portfolioRecommendations.length > 0 && (
            (() => {
              const topChoiceOverall = allRecommendations[0];
              const topChoicePortfolio = portfolioRecommendations[0];
              
              const isAligned = topChoiceOverall.card.id === topChoicePortfolio.card.id;
              const rateDiff = parseFloat(((topChoiceOverall.effectiveRate || 0) - (topChoicePortfolio.effectiveRate || 0)).toFixed(2));
              
              return (
                <Card className="border border-slate-100 shadow-[0_12px_40px_rgba(0,0,0,0.05)] rounded-3xl overflow-hidden bg-gradient-to-b from-slate-50 to-white text-left">
                  <CardHeader className="pb-3 bg-slate-50/60 border-b border-slate-100">
                    <div className="flex items-center space-x-2">
                      <Award className="h-5 w-5 text-teal-600" />
                      <CardTitle className="text-base font-extrabold text-slate-800">SwipeRight Decision Verdict</CardTitle>
                    </div>
                  </CardHeader>
                  <CardContent className="pt-6 space-y-6">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                      {/* Left: Portfolio Choice */}
                      <div className="p-4 bg-gradient-to-br from-blue-500/10 via-indigo-500/5 to-white border border-blue-150 rounded-2xl flex flex-col justify-between space-y-4">
                        <div className="space-y-1">
                          <span className="text-[10px] font-bold text-blue-600 uppercase tracking-widest bg-blue-50 px-2 py-0.5 rounded-full border border-blue-100">Pocket Swipe</span>
                          <h4 className="font-extrabold text-slate-800 text-sm mt-2">{topChoicePortfolio.portfolioNickname || topChoicePortfolio.card.name}</h4>
                          <span className="text-xs text-slate-500 font-semibold">{topChoicePortfolio.card.issuer} • {topChoicePortfolio.card.network}</span>
                        </div>
                        
                        <div className="space-y-1">
                          <div className="text-3xl font-black text-indigo-600">{topChoicePortfolio.effectiveRate || topChoicePortfolio.relevantCategory.cashbackRate}%</div>
                          <span className="text-[10px] font-bold text-indigo-500 block uppercase">{topChoicePortfolio.offerAppliedText ? "Merchant Promo Applied" : "Base Category Rate"}</span>
                          {topChoicePortfolio.offerAppliedText && (
                            <p className="text-[11px] text-emerald-700 bg-emerald-50 border border-emerald-100 p-2.5 rounded-xl font-bold leading-tight mt-1.5">{topChoicePortfolio.offerAppliedText}</p>
                          )}
                        </div>
                      </div>

                      {/* Right: Overall Choice */}
                      <div className="p-4 bg-gradient-to-br from-teal-500/10 via-emerald-500/5 to-white border border-teal-150 rounded-2xl flex flex-col justify-between space-y-4">
                        <div className="space-y-1">
                          <span className="text-[10px] font-bold text-teal-600 uppercase tracking-widest bg-teal-50 px-2 py-0.5 rounded-full border border-teal-100">Best in World</span>
                          <h4 className="font-extrabold text-slate-800 text-sm mt-2">{topChoiceOverall.card.name}</h4>
                          <span className="text-xs text-slate-500 font-semibold">{topChoiceOverall.card.issuer} • {topChoiceOverall.card.network}</span>
                        </div>
                        
                        <div className="space-y-1">
                          <div className="text-3xl font-black text-teal-600">{topChoiceOverall.effectiveRate || topChoiceOverall.relevantCategory.cashbackRate}%</div>
                          <span className="text-[10px] font-bold text-teal-500 block uppercase">Max Reward Rate</span>
                          {isAligned ? (
                            <p className="text-[11px] text-teal-700 bg-teal-50 border border-teal-100 p-2.5 rounded-xl font-bold leading-tight mt-1.5">You own the best card in the world!</p>
                          ) : (
                            <p className="text-[11px] text-slate-600 bg-slate-50 border border-slate-150 p-2.5 rounded-xl font-bold leading-tight mt-1.5">Available in database</p>
                          )}
                        </div>
                      </div>
                    </div>

                    {/* Wingman's Verdict Alert Box */}
                    {isAligned ? (
                      <div className="bg-emerald-50 border border-emerald-250 p-4 rounded-2xl flex items-start space-x-3 shadow-inner">
                        <CheckCircle className="h-5 w-5 text-emerald-600 mt-0.5 flex-shrink-0" />
                        <div>
                          <strong className="text-emerald-950 font-black text-sm block font-extrabold">Wallet Alignment: 100%</strong>
                          <p className="text-emerald-800 text-xs font-semibold leading-relaxed mt-0.5">
                            You're a master optimizer! You already have the absolute best card in the world for this purchase in your wallet. Swipe your <strong>{topChoicePortfolio.portfolioNickname || topChoicePortfolio.card.name}</strong> to capture the full <strong>{topChoicePortfolio.effectiveRate}%</strong> cashback!
                          </p>
                        </div>
                      </div>
                    ) : (
                      <div className="bg-amber-50 border border-amber-250 p-4 rounded-2xl flex items-start space-x-3 shadow-inner">
                        <AlertTriangle className="h-5 w-5 text-amber-600 mt-0.5 flex-shrink-0" />
                        <div>
                          <strong className="text-amber-950 font-black text-sm block font-extrabold">Swipe Optimization Opportunity</strong>
                          <p className="text-amber-800 text-xs font-semibold leading-relaxed mt-0.5">
                            You are leaving rewards on the table. Swiping your <strong>{topChoicePortfolio.portfolioNickname || topChoicePortfolio.card.name}</strong> gets you <strong>{topChoicePortfolio.effectiveRate}%</strong>, but applying for the <strong>{topChoiceOverall.card.name}</strong> will elevate your cashback to <strong>{topChoiceOverall.effectiveRate}%</strong>. That's a <strong>{rateDiff}%</strong> increase in rewards!
                          </p>
                          <div className="flex gap-2 mt-3">
                            {topChoiceOverall.card.applyUrl && (
                              <Button 
                                size="sm" 
                                className="bg-amber-600 hover:bg-amber-700 text-white font-bold rounded-xl text-xs py-1 px-3 border-0"
                                onClick={() => window.open(topChoiceOverall.card.applyUrl, '_blank')}
                              >
                                <ExternalLink className="h-3 w-3 mr-1" />
                                Apply Now
                              </Button>
                            )}
                          </div>
                        </div>
                      </div>
                    )}
                  </CardContent>
                </Card>
              );
            })()
          )}

          {/* Merchant Offers */}
          {merchantOffers.length > 0 && (
            <Card className="border-0 bg-gradient-to-r from-orange-50 to-red-50 border-orange-200">
              <CardHeader>
                <div className="flex items-center space-x-2">
                  <Gift className="h-5 w-5 text-orange-600" />
                  <h3 className="font-semibold text-orange-900">Special Merchant Offers</h3>
                </div>
              </CardHeader>
              <CardContent className="space-y-3">
                {merchantOffers.slice(0, 3).map((offer) => (
                  <div key={offer.id} className="flex items-center justify-between p-3 bg-white rounded-lg">
                    <div className="flex-1">
                      <div className="flex items-center space-x-2">
                        <span className="font-medium text-gray-900">{offer.merchantName}</span>
                        <Badge className="bg-orange-100 text-orange-700">{offer.cardName}</Badge>
                      </div>
                      <p className="text-sm text-gray-600 mt-1">{offer.offerDescription}</p>
                      {offer.endDate && (
                        <p className="text-xs text-orange-600 mt-1">
                          Valid until {new Date(offer.endDate).toLocaleDateString()}
                        </p>
                      )}
                    </div>
                    <div className="text-right">
                      {offer.isActivated ? (
                        <Badge className="bg-green-100 text-green-700">Activated</Badge>
                      ) : (
                        <Badge variant="outline">Not Activated</Badge>
                      )}
                    </div>
                  </div>
                ))}
                {merchantOffers.length > 3 && (
                  <p className="text-sm text-gray-600 text-center">
                    +{merchantOffers.length - 3} more offers available
                  </p>
                )}
              </CardContent>
            </Card>
          )}

          {/* Recommendations Tabs */}
          <Tabs defaultValue="all" className="w-full">
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="all">All Cards</TabsTrigger>
              <TabsTrigger value="portfolio" disabled={!user || portfolioRecommendations.length === 0}>
                From Your Portfolio ({portfolioRecommendations.length})
              </TabsTrigger>
            </TabsList>

            <TabsContent value="all" className="space-y-4">
              {allRecommendations.map((recommendation, index) => (
                <RecommendationCard 
                  key={recommendation.card.id} 
                  recommendation={recommendation} 
                  rank={index + 1} 
                  category={category} 
                />
              ))}
            </TabsContent>

            <TabsContent value="portfolio" className="space-y-4">
              {portfolioRecommendations.length > 0 ? (
                <>
                  <div className="text-center mb-4">
                    <h3 className="text-lg font-semibold text-gray-900 mb-2">
                      Best Cards from Your Portfolio
                    </h3>
                    <p className="text-gray-600">These are the cards you already have that work best for {category}</p>
                  </div>
                  {portfolioRecommendations.map((recommendation, index) => (
                    <RecommendationCard 
                      key={recommendation.card.id} 
                      recommendation={recommendation} 
                      rank={index + 1} 
                      category={category}
                      isPortfolioCard={true}
                    />
                  ))}
                </>
              ) : (
                <div className="text-center py-8">
                  <p className="text-gray-600">No cards in your portfolio match this category.</p>
                </div>
              )}
            </TabsContent>
          </Tabs>
        </div>
      )}

      {searchTriggered && !isLoading && allRecommendations.length === 0 && category && (
        <div className="text-center py-12">
          <Target className="h-12 w-12 text-gray-400 mx-auto mb-4" />
          <h3 className="text-lg font-medium text-gray-900 mb-2">No specific recommendations found</h3>
          <p className="text-gray-600 mb-4">
            Try searching for a different category or browse all cards to find the best option.
          </p>
          <Button variant="outline" onClick={() => setCategory('')}>
            Clear Search
          </Button>
        </div>
      )}
    </div>
  );
}

function RecommendationCard({ 
  recommendation, 
  rank, 
  category, 
  isPortfolioCard = false 
}: { 
  recommendation: CardRecommendation; 
  rank: number; 
  category: string;
  isPortfolioCard?: boolean;
}) {
  const { card, relevantCategory, isInPortfolio, portfolioNickname, relevantOffers, effectiveRate, offerAppliedText } = recommendation;
  const isTopChoice = rank === 1;

  const getNetworkColor = (network: string) => {
    switch (network.toLowerCase()) {
      case 'visa': return 'bg-blue-100 text-blue-700';
      case 'mastercard': return 'bg-red-100 text-red-700';
      case 'american express': return 'bg-green-100 text-green-700';
      case 'discover': return 'bg-orange-100 text-orange-700';
      default: return 'bg-gray-100 text-gray-700';
    }
  };

  return (
    <Card className={`transition-all duration-300 border-0 ${
      isTopChoice && !isPortfolioCard
        ? 'bg-gradient-to-r from-teal-50 to-green-50 ring-2 ring-teal-200' 
        : isPortfolioCard
        ? 'bg-gradient-to-r from-blue-50 to-indigo-50 ring-2 ring-blue-200'
        : 'bg-white hover:shadow-md'
    }`}>
      <CardContent className="p-6">
        <div className="flex items-start space-x-4">
          {/* Rank Badge */}
          <div className={`flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold ${
            isTopChoice && !isPortfolioCard
              ? 'bg-gradient-to-r from-teal-500 to-green-500 text-white' 
              : isPortfolioCard
              ? 'bg-gradient-to-r from-blue-500 to-indigo-500 text-white'
              : 'bg-gray-100 text-gray-600'
          }`}>
            {rank}
          </div>

          {/* Card Image */}
          <div className="w-16 h-10 bg-gradient-to-r from-gray-100 to-gray-200 rounded-lg flex items-center justify-center overflow-hidden">
            <img 
              src={card.imageUrl} 
              alt={card.name}
              className="w-full h-full object-cover"
              onError={(e) => {
                const target = e.target as HTMLImageElement;
                target.style.display = 'none';
                target.parentElement!.innerHTML = `<span class="text-xs font-medium text-gray-500">${card.issuer}</span>`;
              }}
            />
          </div>

          {/* Card Details */}
          <div className="flex-1 space-y-3">
            <div className="flex items-start justify-between">
              <div>
                <h3 className="font-semibold text-gray-900 flex items-center space-x-2">
                  <span>{portfolioNickname || card.name}</span>
                  {isTopChoice && !isPortfolioCard && (
                    <Badge className="bg-gradient-to-r from-teal-500 to-green-500 text-white">
                      <Star className="h-3 w-3 mr-1" />
                      Best Choice
                    </Badge>
                  )}
                  {isPortfolioCard && (
                    <Badge className="bg-gradient-to-r from-blue-500 to-indigo-500 text-white">
                      Your Card
                    </Badge>
                  )}
                  {isInPortfolio && !isPortfolioCard && (
                    <Badge className="bg-green-100 text-green-700">
                      In Portfolio
                    </Badge>
                  )}
                </h3>
                {portfolioNickname && (
                  <p className="text-xs text-gray-500">{card.name}</p>
                )}
                <div className="flex items-center space-x-2 mt-1">
                  <p className="text-sm text-gray-600">{card.issuer}</p>
                  <Badge className={`text-xs ${getNetworkColor(card.network)}`}>
                    {card.network}
                  </Badge>
                </div>
                {offerAppliedText && (
                  <div className="mt-2 text-xs font-bold text-emerald-700 bg-emerald-50 border border-emerald-100 rounded-lg px-2.5 py-1.5 inline-block animate-pulse">
                    {offerAppliedText}
                  </div>
                )}
              </div>
              
              <div className="text-right">
                <div className="text-2xl font-bold text-teal-600">
                  {effectiveRate || relevantCategory.cashbackRate}%
                </div>
                <div className="text-xs text-gray-500">cashback</div>
              </div>
            </div>

            <div className="flex items-center justify-between text-sm">
              <span className="text-gray-600">Category: {relevantCategory.category}</span>
              <span className="text-gray-600">
                Annual Fee: {card.annualFee === 0 ? 'No Fee' : `$${card.annualFee}`}
              </span>
            </div>

            {relevantCategory.isRotating && relevantCategory.validUntil && (
              <div className="flex items-center space-x-2 text-sm">
                <TrendingUp className="h-4 w-4 text-orange-500" />
                <span className="text-orange-600">
                  Rotating category valid until {new Date(relevantCategory.validUntil).toLocaleDateString()}
                </span>
              </div>
            )}

            {/* Merchant Offers */}
            {relevantOffers.length > 0 && (
              <div className="space-y-2">
                <div className="flex items-center space-x-2">
                  <Gift className="h-4 w-4 text-orange-500" />
                  <span className="text-sm font-medium text-gray-700">Special Offers</span>
                </div>
                <div className="space-y-1">
                  {relevantOffers.slice(0, 2).map((offer) => (
                    <div key={offer.id} className="text-xs bg-orange-50 p-2 rounded border border-orange-200">
                      <div className="flex items-center justify-between">
                        <span className="font-medium text-orange-900">{offer.merchantName}</span>
                        {offer.isActivated ? (
                          <Badge className="bg-green-100 text-green-700 text-xs">Activated</Badge>
                        ) : (
                          <Badge variant="outline" className="text-xs">Not Activated</Badge>
                        )}
                      </div>
                      <p className="text-orange-700 mt-1">{offer.offerDescription}</p>
                    </div>
                  ))}
                  {relevantOffers.length > 2 && (
                    <p className="text-xs text-gray-600">+{relevantOffers.length - 2} more offers</p>
                  )}
                </div>
              </div>
            )}

            <div className="flex flex-wrap gap-1">
              {card.categories.slice(0, 4).map((cat, index) => (
                <Badge key={index} variant="outline" className="text-xs">
                  {cat.cashbackRate}% {cat.category}
                </Badge>
              ))}
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
