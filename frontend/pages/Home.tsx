import React from 'react';
import { Link } from 'react-router-dom';
import { CreditCard, Target, TrendingUp, Sparkles, Shield, Users, Mic, Sparkle, ArrowRight, AlertTriangle } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useAuth } from '../contexts/AuthContext';
import { useQuery } from '@tanstack/react-query';
import backend from '~backend/client';

export default function Home() {
  const { user } = useAuth();

  // Load user's portfolio to render their actual cards!
  const { data: portfolioData } = useQuery({
    queryKey: ['portfolio', user?.userId],
    queryFn: () => user ? backend.cards.getUserPortfolio({ userId: user.userId }) : null,
    enabled: !!user,
  });

  const portfolioCards = portfolioData?.cards || [];

  // Load user's merchant offers to check for expiring deals
  const { data: offersData } = useQuery({
    queryKey: ['merchant-offers', user?.userId],
    queryFn: () => user ? backend.cards.getUserMerchantOffers({ userId: user.userId }) : null,
    enabled: !!user,
  });

  const merchantOffers = offersData?.offers || [];
  const expiringOffers = merchantOffers.filter(offer => {
    if (!offer.endDate || offer.isUsed) return false;
    const expiry = new Date(offer.endDate);
    const now = new Date();
    expiry.setHours(0,0,0,0);
    now.setHours(0,0,0,0);
    const diffTime = expiry.getTime() - now.getTime();
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    return diffDays >= 0 && diffDays <= 30;
  });

  // Sort by days remaining
  const sortedExpiringOffers = [...expiringOffers].sort((a, b) => {
    const aDays = Math.ceil((new Date(a.endDate!).getTime() - new Date().setHours(0,0,0,0)) / (1000 * 60 * 60 * 24));
    const bDays = Math.ceil((new Date(b.endDate!).getTime() - new Date().setHours(0,0,0,0)) / (1000 * 60 * 60 * 24));
    return aDays - bDays;
  });

  // Card gradient themes
  const getCardGradient = (issuer: string) => {
    const name = issuer.toLowerCase();
    if (name.includes('chase')) return 'from-blue-600 to-indigo-900 text-white shadow-[0_8px_30px_rgba(30,58,138,0.4)]';
    if (name.includes('american express') || name.includes('amex')) return 'from-amber-400 via-amber-500 to-yellow-600 text-amber-950 shadow-[0_8px_30px_rgba(234,179,8,0.3)]';
    if (name.includes('citi')) return 'from-cyan-500 to-blue-700 text-white shadow-[0_8px_30px_rgba(6,182,212,0.3)]';
    if (name.includes('capital one')) return 'from-slate-700 to-slate-900 text-white shadow-[0_8px_30px_rgba(30,41,59,0.4)]';
    return 'from-teal-600 to-emerald-800 text-white shadow-[0_8px_30px_rgba(16,185,129,0.3)]';
  };

  return (
    <div className="max-w-6xl mx-auto px-4 py-8 space-y-12">
      
      {/* Hero Section */}
      <div className="text-center space-y-4 max-w-3xl mx-auto">
        <div className="inline-flex items-center space-x-2 bg-gradient-to-r from-teal-500/10 to-green-500/10 border border-teal-500/30 text-teal-700 px-4 py-1.5 rounded-full text-xs font-semibold uppercase tracking-wider animate-pulse">
          <Sparkle className="h-3 w-3 text-teal-600" />
          <span>Max out cashback, not credit limits</span>
        </div>
        
        <h1 className="text-4xl md:text-5xl font-black text-slate-900 tracking-tight leading-none">
          {user ? `Welcome back, ${user.firstName || 'there'}!` : 'Meet the Sleekest'}
          <span className="block bg-gradient-to-r from-teal-600 via-emerald-600 to-green-600 bg-clip-text text-transparent font-extrabold mt-1">
            {user ? 'Maximize rewards today' : 'Credit Card Optimizer'}
          </span>
        </h1>
        
        <p className="text-base md:text-lg text-slate-600 font-medium max-w-xl mx-auto leading-relaxed">
          {user 
            ? 'Use our voice assistant or search spending categories below to find which card in your portfolio to swipe for maximum rewards.'
            : 'SwipeRight scans available credit cards and guides you on which card to use for every purchase so you never leave money on the table.'
          }
        </p>
      </div>

      {/* Expiring Deals Warning Alert Banner */}
      {user && sortedExpiringOffers.length > 0 && (
        <Card className="border border-red-100 bg-gradient-to-r from-red-50/50 via-white to-red-50/50 shadow-[0_8px_30px_rgba(239,68,68,0.03)] rounded-3xl overflow-hidden text-left animate-fade-in">
          <CardContent className="p-6 space-y-4">
            <div className="flex items-center space-x-3 text-red-700 font-extrabold text-sm">
              <div className="p-2 bg-red-100 rounded-xl text-red-600 animate-pulse">
                <AlertTriangle className="h-5 w-5" />
              </div>
              <div>
                <h3 className="text-base font-extrabold text-red-950">Urgent Rewards Warning!</h3>
                <p className="text-red-700 text-xs font-semibold">You have high-value merchant offers expiring soon. Don't leave money on the table!</p>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {sortedExpiringOffers.slice(0, 3).map((offer) => {
                const daysLeft = Math.ceil((new Date(offer.endDate!).getTime() - new Date().setHours(0,0,0,0)) / (1000 * 60 * 60 * 24));
                return (
                  <Link 
                    key={offer.id} 
                    to={`/recommendations?cat=${encodeURIComponent(offer.merchantName)}`}
                    className="group bg-white hover:bg-slate-50 border border-slate-100 hover:border-red-200 transition-all duration-300 rounded-2xl p-4 flex flex-col justify-between space-y-3 relative shadow-sm"
                  >
                    <div className="flex justify-between items-start gap-2">
                      <div>
                        <span className="text-[10px] font-extrabold text-slate-500 uppercase tracking-wider">{offer.cardName}</span>
                        <h4 className="font-extrabold text-slate-800 text-sm mt-0.5 group-hover:text-teal-600 transition-colors">{offer.merchantName}</h4>
                      </div>
                      <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                        daysLeft <= 3 
                          ? 'bg-red-100 text-red-700 animate-pulse font-extrabold' 
                          : daysLeft <= 7 
                          ? 'bg-orange-100 text-orange-700' 
                          : 'bg-yellow-100 text-yellow-700'
                      }`}>
                        {daysLeft === 0 ? 'Expires Today!' : daysLeft === 1 ? 'Expires Tomorrow!' : `${daysLeft} days left!`}
                      </span>
                    </div>

                    <div className="space-y-2">
                      <p className="text-[11px] font-medium text-slate-600 line-clamp-2 leading-relaxed">{offer.offerDescription}</p>
                      
                      <div className="flex items-center text-[10px] font-bold text-teal-600 group-hover:translate-x-1 transition-transform">
                        <span>Swipe Now</span>
                        <ArrowRight className="h-3 w-3 ml-1" />
                      </div>
                    </div>
                  </Link>
                );
              })}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Voice Assistant Onboarding Widget (Siri Mockup) */}
      <Card className="border-0 bg-slate-900 text-white overflow-hidden shadow-2xl relative">
        {/* Glowing background meshes */}
        <div className="absolute top-0 right-0 w-80 h-80 bg-teal-500/10 rounded-full blur-3xl -z-0 pointer-events-none" />
        <div className="absolute bottom-0 left-0 w-60 h-60 bg-purple-500/10 rounded-full blur-2xl -z-0 pointer-events-none" />
        
        <CardContent className="p-6 md:p-8 relative z-10 flex flex-col md:flex-row items-center justify-between gap-6">
          <div className="space-y-3 text-center md:text-left flex-1">
            <div className="inline-flex items-center space-x-2 bg-white/10 px-3 py-1 rounded-full text-[10px] uppercase font-bold tracking-widest text-teal-400">
              <Mic className="h-3.5 w-3.5" />
              <span>Voice Activated</span>
            </div>
            <h3 className="text-2xl font-bold tracking-tight">"Where should I buy groceries?"</h3>
            <p className="text-slate-400 text-sm max-w-md font-medium">
              Tap the floating microphone button on the bottom right of the app anytime to start the Siri Voice Search assistant. Just speak the category to get the best card instantly!
            </p>
          </div>

          <div className="flex flex-col items-center justify-center p-4 bg-white/5 rounded-2xl border border-white/10 w-full md:w-auto min-w-[200px] text-center">
            {/* Animated Siri Orb */}
            <div className="relative w-16 h-16 flex items-center justify-center mb-3">
              <span className="absolute inset-0 rounded-full bg-gradient-to-r from-teal-400 via-pink-400 to-purple-500 blur-md opacity-75 animate-pulse scale-110"></span>
              <span className="absolute inset-2 rounded-full bg-slate-900 flex items-center justify-center">
                <Mic className="h-6 w-6 text-teal-400 animate-bounce" />
              </span>
            </div>
            <span className="text-[11px] font-semibold text-teal-400 uppercase tracking-widest animate-pulse">Siri Bot Ready</span>
          </div>
        </CardContent>
      </Card>

      {/* User Portfolio Showcase or Demo Cards */}
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-2xl font-extrabold tracking-tight text-slate-900">
              {user ? 'My Cards Portfolio' : 'Featured Cashback Renders'}
            </h2>
            <p className="text-slate-500 text-xs font-semibold uppercase tracking-wider mt-0.5">
              {user ? 'Tap optimized to swipe best card' : 'Sleek physical card aesthetics'}
            </p>
          </div>
          <Link to="/cards" className="text-teal-600 hover:text-teal-700 text-sm font-semibold flex items-center space-x-1 hover:underline">
            <span>Manage Wallet</span>
            <ArrowRight className="h-4 w-4" />
          </Link>
        </div>

        {/* Carousel / Card List Grid */}
        {user && portfolioCards.length > 0 ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-6">
            {portfolioCards.slice(0, 3).map((userCard: any) => (
              <div 
                key={userCard.id} 
                className={`relative aspect-[1.586/1] rounded-2xl p-5 flex flex-col justify-between overflow-hidden bg-gradient-to-br transition-all duration-300 hover:scale-[1.03] hover:rotate-1 ${getCardGradient(userCard.card.issuer)}`}
              >
                <div className="absolute inset-0 bg-gradient-to-tr from-transparent via-white/5 to-white/10 pointer-events-none" />
                <div className="flex justify-between items-start">
                  <div>
                    <span className="text-[10px] font-extrabold uppercase tracking-widest opacity-80 block">{userCard.card.issuer}</span>
                    <span className="text-sm font-bold tracking-tight block mt-0.5">{userCard.nickname || userCard.card.name}</span>
                  </div>
                  <CreditCard className="h-6 w-6 opacity-65" />
                </div>
                
                <div className="flex justify-between items-end">
                  <div>
                    <span className="text-[9px] uppercase tracking-wider opacity-60 block">Best Cashback</span>
                    <Badge className="bg-white/20 text-white border-0 text-[10px] font-bold">
                      {userCard.card.categories?.[0]?.cashbackRate || 2}% {userCard.card.categories?.[0]?.category || 'All'}
                    </Badge>
                  </div>
                  <span className="text-[10px] font-bold opacity-80 uppercase tracking-widest">{userCard.card.network}</span>
                </div>
              </div>
            ))}
          </div>
        ) : (
          /* Premium Demo Cards Grid */
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-6">
            {/* Chase Freedom Flex */}
            <div className="relative aspect-[1.586/1] rounded-2xl p-5 flex flex-col justify-between overflow-hidden bg-gradient-to-br from-blue-600 to-indigo-900 text-white shadow-[0_8px_30px_rgba(30,58,138,0.4)] transition-all duration-300 hover:scale-[1.03] hover:-rotate-1">
              <div className="absolute inset-0 bg-gradient-to-tr from-transparent via-white/5 to-white/10 pointer-events-none" />
              <div className="flex justify-between items-start">
                <div>
                  <span className="text-[10px] font-extrabold uppercase tracking-widest opacity-80 block">Chase</span>
                  <span className="text-sm font-bold tracking-tight block mt-0.5">Freedom Flex</span>
                </div>
                <CreditCard className="h-6 w-6 opacity-65" />
              </div>
              <div className="flex justify-between items-end">
                <div>
                  <span className="text-[9px] uppercase tracking-wider opacity-60 block">Best Category</span>
                  <Badge className="bg-white/20 text-white border-0 text-[10px] font-bold">
                    5% Rotating
                  </Badge>
                </div>
                <span className="text-[10px] font-bold opacity-80 uppercase tracking-widest">Visa</span>
              </div>
            </div>

            {/* Amex Gold */}
            <div className="relative aspect-[1.586/1] rounded-2xl p-5 flex flex-col justify-between overflow-hidden bg-gradient-to-br from-amber-400 via-amber-500 to-yellow-600 text-amber-950 shadow-[0_8px_30px_rgba(234,179,8,0.3)] transition-all duration-300 hover:scale-[1.03] hover:scale-105">
              <div className="absolute inset-0 bg-gradient-to-tr from-transparent via-white/5 to-white/10 pointer-events-none" />
              <div className="flex justify-between items-start">
                <div>
                  <span className="text-[10px] font-extrabold uppercase tracking-widest opacity-80 block">American Express</span>
                  <span className="text-sm font-bold tracking-tight block mt-0.5">Gold Card</span>
                </div>
                <CreditCard className="h-6 w-6 opacity-65" />
              </div>
              <div className="flex justify-between items-end">
                <div>
                  <span className="text-[9px] uppercase tracking-wider opacity-60 block">Dining & Groceries</span>
                  <Badge className="bg-amber-950/15 text-amber-950 border-0 text-[10px] font-bold">
                    4% Cashback
                  </Badge>
                </div>
                <span className="text-[10px] font-bold opacity-80 uppercase tracking-widest">Amex</span>
              </div>
            </div>

            {/* Citi Double Cash */}
            <div className="relative aspect-[1.586/1] rounded-2xl p-5 flex flex-col justify-between overflow-hidden bg-gradient-to-br from-cyan-500 to-blue-700 text-white shadow-[0_8px_30px_rgba(6,182,212,0.3)] transition-all duration-300 hover:scale-[1.03] hover:rotate-1">
              <div className="absolute inset-0 bg-gradient-to-tr from-transparent via-white/5 to-white/10 pointer-events-none" />
              <div className="flex justify-between items-start">
                <div>
                  <span className="text-[10px] font-extrabold uppercase tracking-widest opacity-80 block">Citi</span>
                  <span className="text-sm font-bold tracking-tight block mt-0.5">Double Cash</span>
                </div>
                <CreditCard className="h-6 w-6 opacity-65" />
              </div>
              <div className="flex justify-between items-end">
                <div>
                  <span className="text-[9px] uppercase tracking-wider opacity-60 block">Every purchase</span>
                  <Badge className="bg-white/20 text-white border-0 text-[10px] font-bold">
                    2% Unlimited
                  </Badge>
                </div>
                <span className="text-[10px] font-bold opacity-80 uppercase tracking-widest">Mastercard</span>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Main Core Actions */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <Link to="/recommendations">
          <Card className="group hover:shadow-[0_20px_40px_-15px_rgba(13,148,136,0.15)] transition-all duration-500 border-0 bg-gradient-to-br from-teal-50 to-teal-100 hover:from-teal-100 hover:to-teal-200 cursor-pointer overflow-hidden relative">
            <CardContent className="p-8">
              <div className="flex items-center space-x-6">
                <div className="p-4 bg-teal-500 rounded-2xl text-white group-hover:scale-110 transition-transform duration-500 shadow-md">
                  <Target className="h-7 w-7" />
                </div>
                <div className="space-y-1">
                  <h3 className="font-bold text-lg text-slate-800">Optimize Purchase</h3>
                  <p className="text-xs text-slate-600 font-semibold uppercase tracking-wider">Search categories instantly</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </Link>

        <Link to="/cards">
          <Card className="group hover:shadow-[0_20px_40px_-15px_rgba(16,185,129,0.15)] transition-all duration-500 border-0 bg-gradient-to-br from-green-50 to-green-100 hover:from-green-100 hover:to-green-200 cursor-pointer overflow-hidden relative">
            <CardContent className="p-8">
              <div className="flex items-center space-x-6">
                <div className="p-4 bg-green-500 rounded-2xl text-white group-hover:scale-110 transition-transform duration-500 shadow-md">
                  <CreditCard className="h-7 w-7" />
                </div>
                <div className="space-y-1">
                  <h3 className="font-bold text-lg text-slate-800">Browse Card Database</h3>
                  <p className="text-xs text-slate-600 font-semibold uppercase tracking-wider">50+ reward cards registered</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </Link>
      </div>

      {/* Featured Insight Card */}
      <Card className="border-0 bg-gradient-to-r from-teal-500 via-emerald-500 to-green-500 text-white shadow-2xl relative overflow-hidden group">
        <div className="absolute right-0 bottom-0 w-32 h-32 bg-white/10 rounded-full blur-xl scale-150 group-hover:scale-175 transition-transform duration-500 pointer-events-none" />
        <CardContent className="p-6 md:p-8">
          <div className="flex items-start space-x-5">
            <div className="p-3 bg-white/20 rounded-xl shadow-inner">
              <TrendingUp className="h-6 w-6" />
            </div>
            <div className="flex-1 space-y-4">
              <div className="space-y-1">
                <h3 className="font-extrabold text-xl">Optimizer Strategy Alert</h3>
                <p className="text-white/80 text-sm font-medium">
                  Rotating cashback categories are changing next month! Chase Freedom Flex will shift to 5% cashback on Gas and Home Improvement. Ensure your portfolio cards are up to date!
                </p>
              </div>
              <Link to="/recommendations">
                <Button size="sm" className="bg-white text-teal-600 hover:bg-slate-100 font-bold px-5 py-2.5 rounded-xl text-xs uppercase tracking-wider shadow-md">
                  Test Recommendation Engine
                </Button>
              </Link>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Secure & Privacy Guarantees */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 pt-4">
        <Card className="border-0 bg-white/60 backdrop-blur-md shadow-[0_8px_30px_rgb(0,0,0,0.04)] rounded-2xl">
          <CardContent className="p-6 text-center space-y-3">
            <div className="w-12 h-12 bg-teal-100 rounded-xl flex items-center justify-center mx-auto text-teal-600">
              <Shield className="h-6 w-6" />
            </div>
            <h3 className="font-bold text-slate-800 text-sm">Secure & Private</h3>
            <p className="text-xs text-slate-500 leading-relaxed">Your wallet portfolio is strictly confidential, encrypted locally, and never shared.</p>
          </CardContent>
        </Card>

        <Card className="border-0 bg-white/60 backdrop-blur-md shadow-[0_8px_30px_rgb(0,0,0,0.04)] rounded-2xl">
          <CardContent className="p-6 text-center space-y-3">
            <div className="w-12 h-12 bg-green-100 rounded-xl flex items-center justify-center mx-auto text-green-600">
              <Sparkles className="h-6 w-6" />
            </div>
            <h3 className="font-bold text-slate-800 text-sm">Siri Voice Intelligence</h3>
            <p className="text-xs text-slate-500 leading-relaxed">Speak directly to optimize dining, travel, or fuel in less than 2 seconds.</p>
          </CardContent>
        </Card>

        <Card className="border-0 bg-white/60 backdrop-blur-md shadow-[0_8px_30px_rgb(0,0,0,0.04)] rounded-2xl">
          <CardContent className="p-6 text-center space-y-3">
            <div className="w-12 h-12 bg-blue-100 rounded-xl flex items-center justify-center mx-auto text-blue-600">
              <Users className="h-6 w-6" />
            </div>
            <h3 className="font-bold text-slate-800 text-sm">100% Free Service</h3>
            <p className="text-xs text-slate-500 leading-relaxed">SwipeRight is entirely free. Our goal is helping you gain every reward point possible.</p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

