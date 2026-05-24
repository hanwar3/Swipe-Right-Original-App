import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Search, Filter, Plus, CreditCard as CreditCardIcon, User, Wallet, Star, ExternalLink, TrendingUp, Calendar, Clock } from 'lucide-react';
import backend from '~backend/client';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Slider } from '@/components/ui/slider';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/components/ui/use-toast';
import { useAuth } from '../contexts/AuthContext';
import type { ComprehensiveCard } from '~backend/cards/comprehensive';
import type { UserCard } from '~backend/cards/portfolio';

export default function Cards() {
  const [activeTab, setActiveTab] = useState('comprehensive');
  
  // Comprehensive cards filters
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedIssuer, setSelectedIssuer] = useState<string>('');
  const [selectedNetwork, setSelectedNetwork] = useState<string>('');
  const [selectedCategory, setSelectedCategory] = useState<string>('');
  const [maxAnnualFee, setMaxAnnualFee] = useState<number[]>([500]);
  const [minCashback, setMinCashback] = useState<number[]>([0]);
  
  // Add card dialog
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);
  const [newCardName, setNewCardName] = useState('');
  const [newCardIssuer, setNewCardIssuer] = useState('');
  const [useExternalApi, setUseExternalApi] = useState(true);

  const { user } = useAuth();
  const queryClient = useQueryClient();
  const { toast } = useToast();

  // Comprehensive cards query
  const { data: comprehensiveData, isLoading: isComprehensiveLoading } = useQuery({
    queryKey: ['comprehensive-cards', searchQuery, selectedIssuer, selectedNetwork, selectedCategory, maxAnnualFee[0], minCashback[0]],
    queryFn: () => backend.cards.getComprehensiveCards({
      query: searchQuery || undefined,
      issuer: selectedIssuer || undefined,
      network: selectedNetwork || undefined,
      category: selectedCategory || undefined,
      maxAnnualFee: maxAnnualFee[0],
      minCashback: minCashback[0],
      limit: 50
    }),
  });

  // User portfolio query
  const { data: portfolioData, isLoading: isPortfolioLoading } = useQuery({
    queryKey: ['portfolio', user?.userId],
    queryFn: () => user ? backend.cards.getUserPortfolio({ userId: user.userId }) : null,
    enabled: !!user,
  });

  // User merchant offers query
  const { data: offersData, isLoading: isOffersLoading } = useQuery({
    queryKey: ['merchant-offers', user?.userId],
    queryFn: () => user ? backend.cards.getUserMerchantOffers({ userId: user.userId }) : null,
    enabled: !!user,
  });

  const addCardMutation = useMutation({
    mutationFn: (data: { name: string; issuer?: string; useExternalApi?: boolean }) => 
      backend.cards.addCard(data),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['comprehensive-cards'] });
      setIsAddDialogOpen(false);
      setNewCardName('');
      setNewCardIssuer('');
      toast({
        title: data.isNew ? "Card Added" : "Card Found",
        description: data.isNew 
          ? `${data.card.name} has been added to the database${data.fromExternalApi ? ' with data from RewardsCC API' : ''}.`
          : `${data.card.name} was already in our database.`,
      });
    },
    onError: (error: any) => {
      console.error('Add card error:', error);
      toast({
        title: "Error",
        description: error.message || "Failed to add card. Please try again.",
        variant: "destructive",
      });
    },
  });

  const addToPortfolioMutation = useMutation({
    mutationFn: (data: { cardId: number; nickname?: string }) => 
      user ? backend.cards.addToPortfolio({ 
        userId: user.userId, 
        cardId: data.cardId, 
        nickname: data.nickname 
      }) : Promise.reject('Not authenticated'),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['portfolio', user?.userId] });
      toast({
        title: "Card Added to Portfolio",
        description: "The card has been added to your portfolio.",
      });
    },
    onError: (error: any) => {
      console.error('Add to portfolio error:', error);
      toast({
        title: "Error",
        description: error.message || "Failed to add card to portfolio.",
        variant: "destructive",
      });
    },
  });

  const comprehensiveCards = comprehensiveData?.cards || [];
  const popularCards = comprehensiveData?.popularCards || [];
  const portfolioCards = portfolioData?.cards || [];
  const merchantOffers = offersData?.offers || [];
  
  const issuers = [...new Set(comprehensiveCards.filter(Boolean).map(card => card.issuer).filter(Boolean))];
  const networks = [...new Set(comprehensiveCards.filter(Boolean).map(card => card.network).filter(Boolean))];
  const categories = ['Groceries', 'Gas', 'Dining', 'Travel', 'Shopping', 'Streaming', 'All Purchases'];

  const handleAddCard = () => {
    if (!newCardName.trim()) {
      toast({
        title: "Error",
        description: "Please enter a card name.",
        variant: "destructive",
      });
      return;
    }

    addCardMutation.mutate({
      name: newCardName.trim(),
      issuer: newCardIssuer.trim() || undefined,
      useExternalApi
    });
  };

  const handleAddToPortfolio = (cardId: number) => {
    if (!user) {
      toast({
        title: "Sign In Required",
        description: "Please sign in to add cards to your portfolio.",
        variant: "destructive",
      });
      return;
    }

    addToPortfolioMutation.mutate({ cardId });
  };

  const isCardInPortfolio = (cardId: number) => {
    return portfolioCards.some(pc => pc && pc.card && pc.card.id === cardId);
  };

  const clearFilters = () => {
    setSearchQuery('');
    setSelectedIssuer('');
    setSelectedNetwork('');
    setSelectedCategory('');
    setMaxAnnualFee([500]);
    setMinCashback([0]);
  };

  return (
    <div className="max-w-6xl mx-auto px-4 py-8 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="space-y-2">
          <h1 className="text-3xl font-bold text-gray-900">Credit Cards</h1>
          <p className="text-gray-600">Explore our comprehensive database and manage your portfolio</p>
        </div>
        
        <Dialog open={isAddDialogOpen} onOpenChange={setIsAddDialogOpen}>
          <DialogTrigger asChild>
            <Button className="bg-teal-500 hover:bg-teal-600">
              <Plus className="h-4 w-4 mr-2" />
              Add Card
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Add New Credit Card</DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="cardName">Card Name *</Label>
                <Input
                  id="cardName"
                  placeholder="e.g., Chase Sapphire Reserve"
                  value={newCardName}
                  onChange={(e) => setNewCardName(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="cardIssuer">Issuer (Optional)</Label>
                <Input
                  id="cardIssuer"
                  placeholder="e.g., Chase, Amex, Capital One"
                  value={newCardIssuer}
                  onChange={(e) => setNewCardIssuer(e.target.value)}
                />
              </div>
              <div className="flex items-center space-x-2">
                <Switch
                  id="useExternalApi"
                  checked={useExternalApi}
                  onCheckedChange={setUseExternalApi}
                />
                <Label htmlFor="useExternalApi">Use RewardsCC API for card details</Label>
              </div>
              <div className="flex justify-end space-x-2">
                <Button 
                  variant="outline" 
                  onClick={() => setIsAddDialogOpen(false)}
                  disabled={addCardMutation.isPending}
                >
                  Cancel
                </Button>
                <Button 
                  onClick={handleAddCard}
                  disabled={addCardMutation.isPending}
                  className="bg-teal-500 hover:bg-teal-600"
                >
                  {addCardMutation.isPending ? 'Adding...' : 'Add Card'}
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="comprehensive" className="flex items-center space-x-2">
            <CreditCardIcon className="h-4 w-4" />
            <span>All Cards Database</span>
          </TabsTrigger>
          <TabsTrigger value="portfolio" className="flex items-center space-x-2" disabled={!user}>
            <Wallet className="h-4 w-4" />
            <span>My Cards Portfolio</span>
          </TabsTrigger>
          <TabsTrigger value="expiring" className="flex items-center space-x-2" disabled={!user}>
            <Calendar className="h-4 w-4" />
            <span>Reward Deadlines</span>
          </TabsTrigger>
        </TabsList>

        <TabsContent value="comprehensive" className="space-y-6">
          {/* Popular Cards Section */}
          {popularCards.length > 0 && (
            <div className="space-y-4">
              <div className="flex items-center space-x-2">
                <Star className="h-5 w-5 text-yellow-500" />
                <h2 className="text-xl font-semibold text-gray-900">Popular Cards</h2>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {popularCards.filter(card => card && card.id).slice(0, 6).map((card) => (
                  <ComprehensiveCardComponent 
                    key={card.id} 
                    card={card} 
                    isInPortfolio={isCardInPortfolio(card.id)}
                    onAddToPortfolio={() => handleAddToPortfolio(card.id)}
                    showAddButton={!!user}
                    isAddingToPortfolio={addToPortfolioMutation.isPending}
                    isPopular={true}
                  />
                ))}
              </div>
            </div>
          )}

          {/* Filters */}
          <div className="space-y-4 bg-gray-50 p-4 rounded-lg">
            <div className="flex items-center justify-between">
              <h3 className="font-medium text-gray-900">Filters</h3>
              <Button variant="ghost" size="sm" onClick={clearFilters}>
                Clear All
              </Button>
            </div>
            
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
              {/* Search */}
              <div className="space-y-2">
                <Label>Search</Label>
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 h-4 w-4" />
                  <Input
                    placeholder="Card name or issuer..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="pl-10"
                  />
                </div>
              </div>

              {/* Issuer */}
              <div className="space-y-2">
                <Label>Issuer</Label>
                <Select value={selectedIssuer} onValueChange={setSelectedIssuer}>
                  <SelectTrigger>
                    <SelectValue placeholder="All Issuers" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="">All Issuers</SelectItem>
                    {issuers.map(issuer => (
                      <SelectItem key={issuer} value={issuer}>{issuer}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Network */}
              <div className="space-y-2">
                <Label>Network</Label>
                <Select value={selectedNetwork} onValueChange={setSelectedNetwork}>
                  <SelectTrigger>
                    <SelectValue placeholder="All Networks" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="">All Networks</SelectItem>
                    {networks.map(network => (
                      <SelectItem key={network} value={network}>{network}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Category */}
              <div className="space-y-2">
                <Label>Category</Label>
                <Select value={selectedCategory} onValueChange={setSelectedCategory}>
                  <SelectTrigger>
                    <SelectValue placeholder="All Categories" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="">All Categories</SelectItem>
                    {categories.map(category => (
                      <SelectItem key={category} value={category}>{category}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* Annual Fee */}
              <div className="space-y-2">
                <Label>Max Annual Fee: ${maxAnnualFee[0]}</Label>
                <Slider
                  value={maxAnnualFee}
                  onValueChange={setMaxAnnualFee}
                  max={1000}
                  step={25}
                  className="w-full"
                />
              </div>

              {/* Min Cashback */}
              <div className="space-y-2">
                <Label>Min Cashback Rate: {minCashback[0]}%</Label>
                <Slider
                  value={minCashback}
                  onValueChange={setMinCashback}
                  max={10}
                  step={0.5}
                  className="w-full"
                />
              </div>
            </div>
          </div>

          {/* All Cards Grid */}
          {isComprehensiveLoading ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {[...Array(9)].map((_, i) => (
                <Card key={i} className="animate-pulse">
                  <CardContent className="p-6">
                    <div className="h-32 bg-gray-200 rounded mb-4"></div>
                    <div className="h-4 bg-gray-200 rounded mb-2"></div>
                    <div className="h-4 bg-gray-200 rounded w-2/3"></div>
                  </CardContent>
                </Card>
              ))}
            </div>
          ) : comprehensiveCards.length > 0 ? (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="text-lg font-semibold text-gray-900">
                  All Cards ({comprehensiveData?.totalCount || 0})
                </h3>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {comprehensiveCards.filter(card => card && card.id).map((card) => (
                  <ComprehensiveCardComponent 
                    key={card.id} 
                    card={card} 
                    isInPortfolio={isCardInPortfolio(card.id)}
                    onAddToPortfolio={() => handleAddToPortfolio(card.id)}
                    showAddButton={!!user}
                    isAddingToPortfolio={addToPortfolioMutation.isPending}
                  />
                ))}
              </div>
            </div>
          ) : (
            <div className="text-center py-12">
              <Filter className="h-12 w-12 text-gray-400 mx-auto mb-4" />
              <h3 className="text-lg font-medium text-gray-900 mb-2">No cards found</h3>
              <p className="text-gray-600">Try adjusting your filters</p>
            </div>
          )}
        </TabsContent>

        <TabsContent value="portfolio" className="space-y-4">
          {user ? (
            isPortfolioLoading ? (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {[...Array(6)].map((_, i) => (
                  <Card key={i} className="animate-pulse">
                    <CardContent className="p-6">
                      <div className="h-32 bg-gray-200 rounded mb-4"></div>
                      <div className="h-4 bg-gray-200 rounded mb-2"></div>
                      <div className="h-4 bg-gray-200 rounded w-2/3"></div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            ) : portfolioCards.length > 0 ? (
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <h3 className="text-lg font-semibold text-gray-900">
                    My Cards ({portfolioCards.length})
                  </h3>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                  {portfolioCards.map((userCard) => (
                    <PortfolioCardComponent key={userCard.id} userCard={userCard} />
                  ))}
                </div>
              </div>
            ) : (
              <div className="text-center py-12">
                <Wallet className="h-12 w-12 text-gray-400 mx-auto mb-4" />
                <h3 className="text-lg font-medium text-gray-900 mb-2">No cards in portfolio</h3>
                <p className="text-gray-600 mb-4">Add cards from the "All Cards Database" tab to start building your portfolio</p>
                <Button onClick={() => setActiveTab('comprehensive')} className="bg-teal-500 hover:bg-teal-600">
                  Browse All Cards
                </Button>
              </div>
            )
          ) : (
            <div className="text-center py-12">
              <User className="h-12 w-12 text-gray-400 mx-auto mb-4" />
              <h3 className="text-lg font-medium text-gray-900 mb-2">Sign in to view your portfolio</h3>
              <p className="text-gray-600">Create an account to track your credit cards and get personalized recommendations</p>
            </div>
          )}
        </TabsContent>

        <TabsContent value="expiring" className="space-y-6">
          <div className="bg-gradient-to-r from-teal-500/10 via-emerald-500/5 to-transparent p-6 rounded-3xl border border-teal-500/15 space-y-2">
            <div className="flex items-center space-x-2 text-teal-700">
              <Calendar className="h-5 w-5" />
              <h2 className="text-lg font-bold">Reward Deadlines & Expiring Benefits</h2>
            </div>
            <p className="text-sm text-gray-600 max-w-2xl">
              Never let valuable credits expire. This panel aggregates static annual resetting benefits for cards in your wallet and dynamic merchant offers from your synced accounts.
            </p>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Left Column: Annual Card Credits */}
            <div className="space-y-4">
              <div className="flex items-center space-x-2">
                <Wallet className="h-5 w-5 text-gray-700" />
                <h3 className="text-md font-bold text-gray-900">Annual Statement Credits</h3>
              </div>

              <div className="space-y-3">
                {portfolioCards.length > 0 ? (
                  (() => {
                    let hasCredits = false;
                    const rendered = portfolioCards.map((userCard) => {
                      const card = userCard?.card;
                      if (!card) return null;
                      
                      const credits = getAnnualCredits(card.id);
                      if (credits.length === 0) return null;
                      hasCredits = true;
                      
                      return (
                        <Card key={userCard.id} className="border border-slate-100/80 rounded-2xl p-4 bg-white hover:shadow-md transition-all">
                          <div className="flex items-start justify-between">
                            <div className="space-y-1">
                              <span className="text-[10px] uppercase font-bold tracking-wider text-teal-600 block">{card.name}</span>
                              {credits.map((cr, idx) => (
                                <div key={idx} className="space-y-1 mt-2 pt-2 border-t border-slate-50 first:border-t-0 first:mt-0 first:pt-0">
                                  <h4 className="text-sm font-extrabold text-slate-800">{cr.name}</h4>
                                  <p className="text-xs text-slate-500 leading-normal">{cr.description}</p>
                                  <div className="flex items-center space-x-1 text-[10px] text-teal-600 font-bold bg-teal-50 px-2 py-0.5 rounded-md w-fit mt-1">
                                    <Clock className="h-3 w-3" />
                                    <span>Resets: {cr.resets}</span>
                                  </div>
                                </div>
                              ))}
                            </div>
                          </div>
                        </Card>
                      );
                    });
                    
                    return hasCredits ? rendered : (
                      <div className="text-center py-8 bg-slate-50 rounded-2xl border border-slate-100">
                        <p className="text-sm text-gray-500">Your portfolio cards do not have annual resetting credits recorded.</p>
                      </div>
                    );
                  })()
                ) : (
                  <div className="text-center py-8 bg-slate-50 rounded-2xl border border-slate-100">
                    <p className="text-sm text-gray-500">Add cards to your portfolio to view their annual credits.</p>
                  </div>
                )}
              </div>
            </div>

            {/* Right Column: Synced Merchant Offers */}
            <div className="space-y-4">
              <div className="flex items-center space-x-2">
                <Clock className="h-5 w-5 text-gray-700" />
                <h3 className="text-md font-bold text-gray-900">Expiring Merchant Offers</h3>
              </div>

              <div className="space-y-3">
                {isOffersLoading ? (
                  <div className="space-y-3">
                    {[...Array(3)].map((_, i) => (
                      <div key={i} className="h-24 bg-gray-100 animate-pulse rounded-2xl border border-gray-150" />
                    ))}
                  </div>
                ) : merchantOffers.length > 0 ? (
                  <div className="space-y-3">
                    {merchantOffers.slice().sort((a: any, b: any) => {
                      return a.merchantName.localeCompare(b.merchantName);
                    }).map((offer: any) => {
                      const isUrgent = offer.offerDescription.toLowerCase().includes("10%") || offer.offerDescription.toLowerCase().includes("10");
                      return (
                        <Card key={offer.offerId} className="border border-slate-100/80 rounded-2xl p-4 bg-white hover:shadow-md transition-all">
                          <div className="flex items-start justify-between">
                            <div className="space-y-1 flex-1">
                              <div className="flex items-center justify-between">
                                <span className="text-sm font-extrabold text-slate-800">{offer.merchantName}</span>
                                <Badge className={isUrgent ? "bg-orange-100 text-orange-700 text-[10px] font-bold" : "bg-teal-100 text-teal-700 text-[10px] font-bold"}>
                                  {isUrgent ? "Expiring Soon!" : "Active"}
                                </Badge>
                              </div>
                              <p className="text-xs text-slate-600 leading-normal">{offer.offerDescription}</p>
                              
                              <div className="flex items-center justify-between pt-2 mt-2 border-t border-slate-50">
                                <span className="text-[10px] text-slate-400 font-semibold">Ends: {new Date(offer.endDate).toLocaleDateString()}</span>
                                <span className="text-[10px] text-emerald-600 font-bold bg-emerald-50 px-2 py-0.5 rounded-full border border-emerald-100">Simulated Sync</span>
                              </div>
                            </div>
                          </div>
                        </Card>
                      );
                    })}
                  </div>
                ) : (
                  <div className="text-center py-8 bg-slate-50 rounded-2xl border border-slate-100">
                    <p className="text-sm text-gray-500">No active merchant offers synced. Sync your cards to pull targeted bank deals.</p>
                  </div>
                )}
              </div>
            </div>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}

const getAnnualCredits = (cardId: number) => {
  switch (cardId) {
    case 101: // Chase Sapphire Preferred
      return [
        { name: "$50 Annual Hotel Credit", description: "Statement credit for hotel stays booked through Chase Travel.", resets: "December 31, 2026" }
      ];
    case 107: // Chase Sapphire Reserve
      return [
        { name: "$300 Annual Travel Credit", description: "Automatic statement credit for travel purchases charged to your card.", resets: "December 31, 2026" }
      ];
    case 102: // Amex Gold
      return [
        { name: "$120 Annual Dining Credit", description: "Earn up to $10/month in statement credits at Grubhub, Cheesecake Factory, etc.", resets: "Monthly (Dec 31, 2026)" },
        { name: "$120 Uber Cash", description: "Earn $10/month in Uber Cash added to your Uber account for rides or Uber Eats.", resets: "Monthly (Dec 31, 2026)" }
      ];
    case 110: // Amex Platinum
      return [
        { name: "$200 Hotel Credit", description: "Statement credit for prepaid Fine Hotels + Resorts bookings via Amex Travel.", resets: "December 31, 2026" },
        { name: "$200 Airline Fee Credit", description: "Statement credit for incidental airline fees charged to your card.", resets: "December 31, 2026" },
        { name: "$200 Uber Cash", description: "$15/month in Uber Cash (plus a $20 bonus in December) for U.S. rides and eats.", resets: "Monthly (Dec 31, 2026)" },
        { name: "$189 CLEAR® Plus Credit", description: "Statement credit for annual CLEAR Plus biometric security membership.", resets: "December 31, 2026" }
      ];
    case 106: // Venture X
      return [
        { name: "$300 Annual Travel Credit", description: "Statement credit for travel bookings made through Capital One Travel.", resets: "December 31, 2026" },
        { name: "10,000 Anniversary Miles", description: "Bonus miles awarded on every account anniversary worth $100 in travel.", resets: "Card Anniversary Date" }
      ];
    default:
      return [];
  }
};

function CreditCardRender({ 
  name, 
  issuer, 
  network, 
  imageUrl 
}: { 
  name: string; 
  issuer: string; 
  network: string; 
  imageUrl?: string; 
}) {
  const [imageError, setImageError] = useState(false);
  const normalizedIssuer = issuer.toLowerCase();
  const normalizedNetwork = network.toLowerCase();
  const normalizedName = name.toLowerCase();

  // Curated premium card styling based on issuer/brand colorways
  const getCardStyle = () => {
    if (normalizedIssuer.includes('chase')) {
      if (normalizedName.includes('reserve')) {
        return 'from-slate-900 via-indigo-950 to-slate-900 text-slate-100 border border-slate-800 shadow-[0_12px_30px_rgba(15,23,42,0.4)]';
      }
      if (normalizedName.includes('preferred')) {
        return 'from-indigo-900 via-blue-900 to-indigo-950 text-white border border-indigo-900/60 shadow-[0_12px_30px_rgba(30,58,138,0.4)]';
      }
      return 'from-blue-600 via-blue-700 to-indigo-900 text-white shadow-[0_12px_30px_rgba(29,78,216,0.35)]';
    }
    if (normalizedIssuer.includes('american express') || normalizedIssuer.includes('amex')) {
      if (normalizedName.includes('platinum')) {
        return 'from-slate-350 via-zinc-150 to-slate-400 text-zinc-800 border border-slate-300 shadow-[0_12px_30px_rgba(100,116,139,0.25)]';
      }
      if (normalizedName.includes('gold')) {
        return 'from-amber-200 via-amber-400 to-yellow-600 text-amber-950 border border-amber-300 shadow-[0_12px_30px_rgba(217,119,6,0.35)]';
      }
      if (normalizedName.includes('blue cash')) {
        return 'from-sky-850 via-blue-900 to-slate-950 text-white border border-blue-950 shadow-[0_12px_30px_rgba(3,105,161,0.3)]';
      }
      return 'from-amber-500 via-yellow-500 to-yellow-600 text-amber-950 shadow-[0_12px_30px_rgba(245,158,11,0.3)]';
    }
    if (normalizedIssuer.includes('capital one')) {
      if (normalizedName.includes('venture')) {
        return 'from-slate-800 via-slate-900 to-slate-950 text-slate-100 border border-slate-800/80 shadow-[0_12px_30px_rgba(15,23,42,0.4)]';
      }
      if (normalizedName.includes('savor')) {
        return 'from-amber-900 via-yellow-950 to-amber-950 text-amber-100 border border-amber-900/60 shadow-[0_12px_30px_rgba(120,53,4,0.3)]';
      }
      return 'from-slate-700 via-slate-850 to-slate-900 text-white border border-slate-800';
    }
    if (normalizedIssuer.includes('citi')) {
      return 'from-cyan-500 via-blue-600 to-blue-800 text-white border border-blue-600/40 shadow-[0_12px_30px_rgba(6,182,212,0.3)]';
    }
    if (normalizedIssuer.includes('discover')) {
      return 'from-orange-500 via-red-500 to-pink-600 text-white shadow-[0_12px_30px_rgba(249,115,22,0.3)]';
    }
    if (normalizedIssuer.includes('apple')) {
      return 'from-zinc-50 via-zinc-100 to-zinc-250 text-slate-800 border border-zinc-200 shadow-[0_12px_30px_rgba(0,0,0,0.06)]';
    }
    return 'from-teal-600 via-emerald-600 to-emerald-800 text-white shadow-[0_12px_30px_rgba(13,148,136,0.3)]';
  };

  const renderNetworkLogo = () => {
    switch (normalizedNetwork) {
      case 'visa':
        return <span className="text-xl font-black italic tracking-widest text-blue-100 drop-shadow-[0_1px_2px_rgba(0,0,0,0.3)]">VISA</span>;
      case 'mastercard':
        return (
          <div className="flex items-center">
            <span className="w-4.5 h-4.5 rounded-full bg-red-500 opacity-95"></span>
            <span className="w-4.5 h-4.5 rounded-full bg-yellow-500 opacity-95 -ml-2.5"></span>
            <span className="text-[9px] font-black text-white ml-1.5 uppercase tracking-tighter drop-shadow-sm">mc</span>
          </div>
        );
      case 'american express':
      case 'amex':
        return (
          <div className="border border-white/40 px-1.5 py-0.5 rounded bg-cyan-600/10 flex items-center justify-center">
            <span className="text-[7.5px] font-black uppercase tracking-widest text-white">AMEX</span>
          </div>
        );
      case 'discover':
        return <span className="text-xs font-black tracking-tight text-white uppercase drop-shadow-[0_1px_2px_rgba(0,0,0,0.3)]">DISCOVER</span>;
      default:
        return <span className="text-[9px] font-bold text-white/60 uppercase">{network}</span>;
    }
  };

  if (imageUrl && !imageError) {
    return (
      <div className="relative w-full aspect-[1.586/1] rounded-2xl overflow-hidden shadow-lg border border-gray-100 transition-all duration-300">
        <img 
          src={imageUrl} 
          alt={name}
          className="w-full h-full object-cover"
          onError={() => setImageError(true)}
        />
        {/* Apple HIG soft glare layer */}
        <div className="absolute inset-0 bg-gradient-to-tr from-transparent via-white/5 to-white/10 pointer-events-none" />
      </div>
    );
  }

  // Premium CSS fallback
  return (
    <div className={`relative w-full aspect-[1.586/1] rounded-2xl p-5 flex flex-col justify-between overflow-hidden bg-gradient-to-br transition-all duration-500 shadow-xl ${getCardStyle()}`}>
      <div className="absolute inset-0 bg-gradient-to-tr from-transparent via-white/5 to-white/12 pointer-events-none" />
      
      {/* Top Section */}
      <div className="flex justify-between items-start z-10">
        <div className="space-y-0.5">
          <span className="text-[9px] font-black uppercase tracking-widest opacity-80 block">{issuer}</span>
          <span className="text-sm font-black tracking-tight block leading-tight drop-shadow-md">{name}</span>
        </div>
        
        {/* Realistic Gold EMV Metallic Chip */}
        <div className="w-8.5 h-6.5 bg-gradient-to-br from-amber-200 via-yellow-400 to-amber-300 rounded-md border border-yellow-600/35 relative flex items-center justify-center shadow-md">
          <div className="absolute top-0 bottom-0 left-3 w-px bg-yellow-800/20" />
          <div className="absolute top-0 bottom-0 right-3 w-px bg-yellow-800/20" />
          <div className="absolute left-0 right-0 top-3 h-px bg-yellow-800/20" />
        </div>
      </div>

      {/* Bottom Section */}
      <div className="flex justify-between items-end z-10">
        <div className="space-y-0.5">
          <span className="text-[8px] uppercase tracking-widest opacity-70 block font-semibold">Wallet Wingman</span>
          <span className="text-[9px] font-mono tracking-widest opacity-85 block">•••• •••• •••• 2026</span>
        </div>
        <div className="flex items-center justify-center">
          {renderNetworkLogo()}
        </div>
      </div>

      {/* Futuristic soft background circle mesh */}
      <div className="absolute -right-12 -bottom-12 w-28 h-28 bg-white/5 rounded-full blur-xl pointer-events-none" />
    </div>
  );
}

function ComprehensiveCardComponent({ 
  card, 
  isInPortfolio, 
  onAddToPortfolio, 
  showAddButton, 
  isAddingToPortfolio,
  isPopular = false
}: { 
  card: ComprehensiveCard; 
  isInPortfolio: boolean;
  onAddToPortfolio: () => void;
  showAddButton: boolean;
  isAddingToPortfolio: boolean;
  isPopular?: boolean;
}) {
  if (!card) return null;

  // Fix the reduce error by providing a default value and checking for empty array
  const bestCategory = card.categories && card.categories.length > 0 
    ? card.categories.reduce((best, current) => 
        current.cashbackRate > best.cashbackRate ? current : best
      )
    : { cashbackRate: 0, category: 'N/A', id: 0, isRotating: false };

  const getNetworkColor = (network: string) => {
    switch (network.toLowerCase()) {
      case 'visa': return 'bg-blue-100 text-blue-700 border-blue-200';
      case 'mastercard': return 'bg-red-100 text-red-700 border-red-200';
      case 'american express': return 'bg-teal-100 text-teal-700 border-teal-200';
      case 'discover': return 'bg-orange-100 text-orange-700 border-orange-200';
      default: return 'bg-gray-100 text-gray-700 border-gray-200';
    }
  };

  return (
    <Card className={`group hover:shadow-2xl transition-all duration-500 border border-slate-100/80 rounded-3xl overflow-hidden flex flex-col justify-between ${isPopular ? 'ring-2 ring-yellow-250 bg-gradient-to-br from-yellow-50/70 via-orange-50/20 to-white' : 'bg-white'}`}>
      
      {/* Top Banner Renders */}
      <div className="p-4 pb-0">
        <CreditCardRender 
          name={card.name} 
          issuer={card.issuer} 
          network={card.network} 
          imageUrl={card.imageUrl} 
        />
      </div>

      <CardHeader className="pt-4 pb-2 px-5">
        <div className="flex items-start justify-between">
          <div className="space-y-1">
            <div className="flex items-center space-x-2">
              <h3 className="font-extrabold text-slate-800 group-hover:text-teal-600 transition-colors text-base tracking-tight leading-tight">
                {card.name}
              </h3>
              {isPopular && <Star className="h-4 w-4 text-yellow-500 fill-yellow-500" />}
            </div>
            <div className="flex items-center space-x-2">
              <p className="text-xs text-slate-500 font-semibold">{card.issuer}</p>
              <Badge variant="outline" className={`text-[10px] font-bold py-px px-2 border rounded-full ${getNetworkColor(card.network)}`}>
                {card.network}
              </Badge>
            </div>
          </div>
          <div className="text-right">
            <div className="flex items-center space-x-0.5 justify-end">
              <Star className="h-3.5 w-3.5 text-yellow-500 fill-yellow-500" />
              <span className="text-xs font-bold text-slate-800">{card.rating}</span>
            </div>
            <p className="text-[10px] text-slate-400 font-medium">{card.reviewCount} reviews</p>
          </div>
        </div>
      </CardHeader>
      
      <CardContent className="pt-0 px-5 pb-5 space-y-4 flex-1 flex flex-col justify-between">
        <div className="space-y-3">
          <div className="flex items-center justify-between text-xs font-medium border-b border-slate-100 pb-2">
            <span className="text-slate-500">Annual Fee</span>
            <span className="font-extrabold text-slate-800">
              {card.annualFee === 0 ? 'No Fee' : `$${card.annualFee}`}
            </span>
          </div>

          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <span className="text-xs text-slate-500 font-medium">Top Reward</span>
              <Badge variant="secondary" className="bg-teal-50 border border-teal-100 text-teal-700 text-xs font-black py-0.5 rounded-lg">
                {bestCategory.cashbackRate}% {bestCategory.category}
              </Badge>
            </div>
            
            {bestCategory.isRotating && bestCategory.validUntil && (
              <div className="flex items-center space-x-1 text-[10px] text-orange-600 font-bold bg-orange-50 border border-orange-100 p-1 rounded-md">
                <TrendingUp className="h-3.5 w-3.5 text-orange-500" />
                <span>Expires {new Date(bestCategory.validUntil).toLocaleDateString()}</span>
              </div>
            )}
          </div>

          {card.welcomeBonus && (
            <div className="text-[11px] text-emerald-800 bg-emerald-50/70 border border-emerald-100/60 p-2.5 rounded-xl font-medium leading-normal">
              <strong className="text-emerald-950 font-bold">Welcome Bonus:</strong> {card.welcomeBonus}
            </div>
          )}

          <div className="space-y-1.5">
            <span className="text-xs font-bold text-slate-700">Categorized Perks:</span>
            <div className="flex flex-wrap gap-1">
              {card.categories && card.categories.length > 0 ? (
                <>
                  {card.categories.slice(0, 3).map((category, index) => (
                    <Badge key={index} variant="outline" className="text-[10px] font-bold py-0.5 px-2 border border-slate-200 text-slate-600 rounded-md">
                      {category.cashbackRate}% {category.category}
                    </Badge>
                  ))}
                  {card.categories.length > 3 && (
                    <Badge variant="outline" className="text-[10px] font-bold py-0.5 px-1.5 border border-slate-200 text-slate-400 rounded-md">
                      +{card.categories.length - 3} more
                    </Badge>
                  )}
                </>
              ) : (
                <Badge variant="outline" className="text-[10px]">
                  No rates recorded
                </Badge>
              )}
            </div>
          </div>
        </div>

        <div className="flex space-x-2 pt-3 border-t border-slate-100">
          {showAddButton && (
            <div className="flex-1">
              {isInPortfolio ? (
                <Badge className="bg-green-50 border border-green-200 text-green-700 font-extrabold w-full py-1.5 justify-center rounded-xl text-xs">
                  In Portfolio
                </Badge>
              ) : (
                <Button 
                  onClick={onAddToPortfolio}
                  disabled={isAddingToPortfolio}
                  size="sm"
                  className="w-full bg-teal-500 hover:bg-teal-600 text-white font-extrabold rounded-xl py-1.5 text-xs shadow-md transition-all active:scale-[0.98]"
                >
                  {isAddingToPortfolio ? 'Adding...' : 'Add to Portfolio'}
                </Button>
              )}
            </div>
          )}
          {card.applyUrl && (
            <Button 
              variant="outline" 
              size="sm" 
              className="text-xs font-extrabold border-slate-200 hover:bg-slate-50 text-slate-700 rounded-xl"
              onClick={() => window.open(card.applyUrl, '_blank')}
            >
              <ExternalLink className="h-3.5 w-3.5 mr-1" />
              Apply
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

function PortfolioCardComponent({ userCard }: { userCard: UserCard }) {
  const card = userCard?.card;
  if (!card) return null;
  
  // Fix the reduce error by providing a default value and checking for empty array
  const bestCategory = card.categories && card.categories.length > 0 
    ? card.categories.reduce((best, current) => 
        current.cashbackRate > best.cashbackRate ? current : best
      )
    : { cashbackRate: 0, category: 'N/A', id: 0, isRotating: false };

  const getNetworkColor = (network: string) => {
    switch (network.toLowerCase()) {
      case 'visa': return 'bg-blue-100 text-blue-700 border-blue-200';
      case 'mastercard': return 'bg-red-100 text-red-700 border-red-200';
      case 'american express': return 'bg-teal-100 text-teal-700 border-teal-200';
      case 'discover': return 'bg-orange-100 text-orange-700 border-orange-200';
      default: return 'bg-gray-100 text-gray-700 border-gray-200';
    }
  };

  return (
    <Card className="group hover:shadow-2xl transition-all duration-500 border border-slate-100/80 rounded-3xl overflow-hidden bg-gradient-to-br from-slate-50/60 via-teal-50/10 to-white flex flex-col justify-between">
      
      {/* Top Banner aspect-ratio renders */}
      <div className="p-4 pb-0">
        <CreditCardRender 
          name={card.name} 
          issuer={card.issuer} 
          network={card.network} 
          imageUrl={card.imageUrl} 
        />
      </div>

      <CardHeader className="pt-4 pb-2 px-5">
        <div className="flex items-center space-x-3">
          <div className="flex-1">
            <h3 className="font-extrabold text-slate-800 text-base tracking-tight leading-tight">
              {userCard.nickname || card.name}
            </h3>
            {userCard.nickname && (
              <p className="text-[10px] text-slate-400 font-medium leading-none mt-1">{card.name}</p>
            )}
            <div className="flex items-center space-x-2 mt-1">
              <p className="text-xs text-slate-500 font-semibold leading-none">{card.issuer}</p>
              <Badge variant="outline" className={`text-[9px] font-black py-0.5 px-2 border rounded-full ${getNetworkColor(card.network)}`}>
                {card.network}
              </Badge>
            </div>
          </div>
        </div>
      </CardHeader>
      
      <CardContent className="pt-0 px-5 pb-5 space-y-4">
        {userCard.creditLimit && (
          <div className="flex items-center justify-between text-xs font-semibold border-b border-slate-100/60 pb-2">
            <span className="text-slate-500">Credit Limit</span>
            <span className="font-extrabold text-slate-800">${userCard.creditLimit.toLocaleString()}</span>
          </div>
        )}

        <div className="flex items-center justify-between text-xs font-semibold border-b border-slate-100/60 pb-2">
          <span className="text-slate-500 font-semibold">Best Portfolio Rate</span>
          <Badge variant="secondary" className="bg-teal-50 border border-teal-150 text-teal-700 font-black rounded-lg">
            {bestCategory.cashbackRate}% {bestCategory.category}
          </Badge>
        </div>

        <div className="space-y-1.5">
          <span className="text-xs font-bold text-slate-700">Category Cashback Rates:</span>
          <div className="flex flex-wrap gap-1">
            {card.categories && card.categories.length > 0 ? (
              <>
                {card.categories.slice(0, 3).map((category, index) => (
                  <Badge key={index} variant="outline" className="text-[10px] font-bold py-0.5 px-2 border border-slate-200 text-slate-600 rounded-md">
                    {category.cashbackRate}% {category.category}
                  </Badge>
                ))}
                {card.categories.length > 3 && (
                  <Badge variant="outline" className="text-[10px] font-bold py-0.5 px-1.5 border border-slate-200 text-slate-400 rounded-md">
                    +{card.categories.length - 3} more
                  </Badge>
                )}
              </>
            ) : (
              <Badge variant="outline" className="text-[10px]">
                No category details available
              </Badge>
            )}
          </div>
        </div>

        <div className="text-[10px] text-slate-400 font-semibold pt-1 border-t border-slate-100/60 flex items-center justify-between">
          <span>Added {new Date(userCard.addedAt).toLocaleDateString()}</span>
          <span className="text-emerald-600 font-bold bg-emerald-50 px-2 py-0.5 rounded-full border border-emerald-100">Wallet Synced</span>
        </div>
      </CardContent>
    </Card>
  );
}
