import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Search, Filter, Plus, CreditCard as CreditCardIcon, User, Wallet, Star, ExternalLink, TrendingUp } from 'lucide-react';
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
  const [selectedIssuer, setSelectedIssuer] = useState<string>('all');
  const [selectedNetwork, setSelectedNetwork] = useState<string>('all');
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
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
      issuer: selectedIssuer === 'all' ? undefined : selectedIssuer,
      network: selectedNetwork === 'all' ? undefined : selectedNetwork,
      category: selectedCategory === 'all' ? undefined : selectedCategory,
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
  
  const issuers = [...new Set(comprehensiveCards.map(card => card.issuer).filter(Boolean))];
  const networks = [...new Set(comprehensiveCards.map(card => card.network).filter(Boolean))];
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
    return portfolioCards.some(pc => pc.card.id === cardId);
  };

  const clearFilters = () => {
    setSearchQuery('');
    setSelectedIssuer('all');
    setSelectedNetwork('all');
    setSelectedCategory('all');
    setMaxAnnualFee([500]);
    setMinCashback([0]);
  };

  return (
    <div className="max-w-6xl mx-auto px-4 py-8 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="space-y-2">
          <h1 className="text-3xl font-bold text-gray-900">Credit & Debit Cards</h1>
          <p className="text-gray-600">Explore our comprehensive database and manage your card portfolio</p>
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
              <DialogTitle>Add New Credit or Debit Card</DialogTitle>
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
        <TabsList className="grid w-full grid-cols-2">
          <TabsTrigger value="comprehensive" className="flex items-center space-x-2">
            <CreditCardIcon className="h-4 w-4" />
            <span>All Cards Database</span>
          </TabsTrigger>
          <TabsTrigger value="portfolio" className="flex items-center space-x-2" disabled={!user}>
            <Wallet className="h-4 w-4" />
            <span>My Cards Portfolio</span>
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
                {popularCards.slice(0, 6).map((card) => (
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
                    <SelectItem value="all">All Issuers</SelectItem>
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
                    <SelectItem value="all">All Networks</SelectItem>
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
                    <SelectItem value="all">All Categories</SelectItem>
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
                {comprehensiveCards.map((card) => (
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
      </Tabs>
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
  // Fix the reduce error by providing a default value and checking for empty array
  const bestCategory = card.categories && card.categories.length > 0 
    ? card.categories.reduce((best, current) => 
        current.cashbackRate > best.cashbackRate ? current : best
      )
    : { cashbackRate: 0, category: 'N/A', id: 0, isRotating: false };

  const getNetworkColor = (network: string | undefined) => {
    if (!network) return 'bg-gray-100 text-gray-700';
    switch (network.toLowerCase()) {
      case 'visa': return 'bg-blue-100 text-blue-700';
      case 'mastercard': return 'bg-red-100 text-red-700';
      case 'american express': return 'bg-green-100 text-green-700';
      case 'discover': return 'bg-orange-100 text-orange-700';
      default: return 'bg-gray-100 text-gray-700';
    }
  };

  return (
    <Card className={`group hover:shadow-lg transition-all duration-300 border-0 ${isPopular ? 'ring-2 ring-yellow-200 bg-gradient-to-br from-yellow-50 to-orange-50' : 'bg-white'}`}>
      <CardHeader className="pb-4">
        <div className="flex items-start justify-between">
          <div className="flex items-center space-x-3">
            <div className="w-16 h-10 bg-gradient-to-r from-gray-100 to-gray-200 rounded-lg flex items-center justify-center overflow-hidden">
              {card.imageUrl ? (
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
              ) : (
                <span className="text-xs font-medium text-gray-500">{card.issuer}</span>
              )}
            </div>
            <div className="flex-1">
              <div className="flex items-center space-x-2">
                <h3 className="font-semibold text-gray-900 group-hover:text-teal-600 transition-colors text-sm">
                  {card.name}
                </h3>
                {isPopular && <Star className="h-4 w-4 text-yellow-500" />}
              </div>
              <div className="flex items-center space-x-2 mt-1">
                <p className="text-xs text-gray-600">{card.issuer}</p>
                {card.network && (
                  <Badge className={`text-xs ${getNetworkColor(card.network)}`}>
                    {card.network}
                  </Badge>
                )}
                <Badge className={`text-xs font-semibold ${card.type === 'debit' ? 'bg-cyan-100 text-cyan-800 border-cyan-200' : 'bg-purple-100 text-purple-800 border-purple-200'}`}>
                  {card.type === 'debit' ? 'Debit' : 'Credit'}
                </Badge>
              </div>
            </div>
          </div>
          <div className="text-right">
            <div className="flex items-center space-x-1">
              <Star className="h-3 w-3 text-yellow-500" />
              <span className="text-xs font-medium">{card.rating !== undefined ? card.rating : 4.0}</span>
            </div>
            <p className="text-xs text-gray-500">{card.reviewCount !== undefined ? card.reviewCount : 0} reviews</p>
          </div>
        </div>
      </CardHeader>
      
      <CardContent className="pt-0 space-y-3">
        <div className="flex items-center justify-between text-sm">
          <span className="text-gray-600">Annual Fee</span>
          <span className="font-medium text-gray-900">
            {card.annualFee === 0 ? 'No Fee' : `$${card.annualFee}`}
          </span>
        </div>

        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-sm text-gray-600">Best Rate</span>
            <Badge variant="secondary" className="bg-teal-100 text-teal-700 text-xs">
              {bestCategory.cashbackRate}% {bestCategory.category}
            </Badge>
          </div>
          
          {bestCategory.isRotating && bestCategory.validUntil && (
            <div className="flex items-center space-x-1 text-xs text-orange-600">
              <TrendingUp className="h-3 w-3" />
              <span>Valid until {new Date(bestCategory.validUntil).toLocaleDateString()}</span>
            </div>
          )}
        </div>

        {card.welcomeBonus && (
          <div className="text-xs text-green-700 bg-green-50 p-2 rounded">
            <strong>Welcome Bonus:</strong> {card.welcomeBonus}
          </div>
        )}

        <div className="space-y-1">
          <span className="text-sm font-medium text-gray-700">Categories:</span>
          <div className="flex flex-wrap gap-1">
            {card.categories && card.categories.length > 0 ? (
              <>
                {card.categories.slice(0, 3).map((category, index) => (
                  <Badge key={index} variant="outline" className="text-xs">
                    {category.cashbackRate}% {category.category}
                  </Badge>
                ))}
                {card.categories.length > 3 && (
                  <Badge variant="outline" className="text-xs">
                    +{card.categories.length - 3} more
                  </Badge>
                )}
              </>
            ) : (
              <Badge variant="outline" className="text-xs">
                No categories available
              </Badge>
            )}
          </div>
        </div>

        {card.features && card.features.length > 0 && (
          <div className="space-y-1">
            <span className="text-sm font-medium text-gray-700">Features:</span>
            <div className="text-xs text-gray-600">
              {card.features.slice(0, 2).join(' • ')}
              {card.features.length > 2 && ` • +${card.features.length - 2} more`}
            </div>
          </div>
        )}

        <div className="flex space-x-2 pt-2">
          {showAddButton && (
            <div className="flex-1">
              {isInPortfolio ? (
                <Badge className="bg-green-100 text-green-700 w-full justify-center text-xs">
                  In Portfolio
                </Badge>
              ) : (
                <Button 
                  onClick={onAddToPortfolio}
                  disabled={isAddingToPortfolio}
                  size="sm"
                  className="w-full bg-teal-500 hover:bg-teal-600 text-xs"
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
              className="text-xs"
              onClick={() => window.open(card.applyUrl, '_blank')}
            >
              <ExternalLink className="h-3 w-3 mr-1" />
              Apply
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

function PortfolioCardComponent({ userCard }: { userCard: UserCard }) {
  const { card } = userCard;
  
  // Fix the reduce error by providing a default value and checking for empty array
  const bestCategory = card.categories && card.categories.length > 0 
    ? card.categories.reduce((best, current) => 
        current.cashbackRate > best.cashbackRate ? current : best
      )
    : { cashbackRate: 0, category: 'N/A', id: 0, isRotating: false };

  const getNetworkColor = (network: string | undefined) => {
    if (!network) return 'bg-gray-100 text-gray-700';
    switch (network.toLowerCase()) {
      case 'visa': return 'bg-blue-100 text-blue-700';
      case 'mastercard': return 'bg-red-100 text-red-700';
      case 'american express': return 'bg-green-100 text-green-700';
      case 'discover': return 'bg-orange-100 text-orange-700';
      default: return 'bg-gray-100 text-gray-700';
    }
  };

  return (
    <Card className="group hover:shadow-lg transition-all duration-300 border-0 bg-gradient-to-br from-teal-50 to-green-50">
      <CardHeader className="pb-4">
        <div className="flex items-center space-x-4">
          <div className="w-16 h-10 bg-gradient-to-r from-gray-100 to-gray-200 rounded-lg flex items-center justify-center overflow-hidden">
            {card.imageUrl ? (
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
            ) : (
              <span className="text-xs font-medium text-gray-500">{card.issuer}</span>
            )}
          </div>
          <div className="flex-1">
            <h3 className="font-semibold text-gray-900">
              {userCard.nickname || card.name}
            </h3>
            {userCard.nickname && (
              <p className="text-xs text-gray-500">{card.name}</p>
            )}
            <div className="flex items-center space-x-2 mt-1">
              <p className="text-sm text-gray-600">{card.issuer}</p>
              {card.network && (
                <Badge className={`text-xs ${getNetworkColor(card.network)}`}>
                  {card.network}
                </Badge>
              )}
              <Badge className={`text-xs font-semibold ${card.type === 'debit' ? 'bg-cyan-100 text-cyan-800 border-cyan-200' : 'bg-purple-100 text-purple-800 border-purple-200'}`}>
                {card.type === 'debit' ? 'Debit' : 'Credit'}
              </Badge>
            </div>
          </div>
        </div>
      </CardHeader>
      
      <CardContent className="pt-0 space-y-4">
        {userCard.creditLimit && (
          <div className="flex items-center justify-between">
            <span className="text-sm text-gray-600">Credit Limit</span>
            <span className="font-medium text-gray-900">${userCard.creditLimit.toLocaleString()}</span>
          </div>
        )}

        <div className="flex items-center justify-between">
          <span className="text-sm text-gray-600">Best Rate</span>
          <Badge variant="secondary" className="bg-teal-100 text-teal-700">
            {bestCategory.cashbackRate}% {bestCategory.category}
          </Badge>
        </div>

        <div className="space-y-1">
          <span className="text-sm font-medium text-gray-700">Categories:</span>
          <div className="flex flex-wrap gap-1">
            {card.categories && card.categories.length > 0 ? (
              <>
                {card.categories.slice(0, 3).map((category, index) => (
                  <Badge key={index} variant="outline" className="text-xs">
                    {category.cashbackRate}% {category.category}
                  </Badge>
                ))}
                {card.categories.length > 3 && (
                  <Badge variant="outline" className="text-xs">
                    +{card.categories.length - 3} more
                  </Badge>
                )}
              </>
            ) : (
              <Badge variant="outline" className="text-xs">
                No categories available
              </Badge>
            )}
          </div>
        </div>

        <div className="text-xs text-gray-500">
          Added {new Date(userCard.addedAt).toLocaleDateString()}
        </div>
      </CardContent>
    </Card>
  );
}
