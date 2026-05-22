import React from 'react';
import { Link } from 'react-router-dom';
import { CreditCard, Target, TrendingUp, Sparkles, Shield, Users } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { useAuth } from '../contexts/AuthContext';
import backend from '~backend/client';
import { useState, useEffect } from 'react';

export default function Home() {
  const { user } = useAuth();
  const [expiringOffers, setExpiringOffers] = useState<any[]>([]);

  useEffect(() => {
    if (user?.userId) {
      backend.cards.getUserMerchantOffers({ userId: user.userId })
        .then(res => {
          const now = new Date();
          now.setHours(0, 0, 0, 0); // start of today
          const soon = new Date();
          soon.setDate(now.getDate() + 30);
          soon.setHours(23, 59, 59, 999); // end of 30 days from now

          const expiring = res.offers.filter(offer => {
            if (!offer.endDate) return false;
            // Parse 'YYYY-MM-DD' properly
            const [year, month, day] = offer.endDate.split('-').map(Number);
            const end = new Date(year, month - 1, day, 23, 59, 59, 999);
            return end >= now && end <= soon;
          });
          setExpiringOffers(expiring);
        })
        .catch(err => console.error('Failed to fetch merchant offers:', err));
    }
  }, [user]);

  return (
    <div className="max-w-4xl mx-auto px-4 py-8 space-y-8">
      {/* Hero Section */}
      <div className="text-center space-y-4">
        <div className="inline-flex items-center space-x-2 bg-gradient-to-r from-teal-500 to-green-500 text-white px-4 py-2 rounded-full text-sm font-medium">
          <Sparkles className="h-4 w-4" />
          <span>Max out your cash back, not your credit card</span>
        </div>
        
        <h1 className="text-4xl font-bold text-gray-900 leading-tight">
          {user ? `Welcome back, ${user.firstName || 'there'}!` : 'Optimize Your'}
          <span className="block bg-gradient-to-r from-teal-600 to-green-600 bg-clip-text text-transparent">
            {user ? 'Ready to maximize your rewards?' : 'Credit Card Cash Back'}
          </span>
        </h1>
        
        <p className="text-lg text-gray-600 max-w-2xl mx-auto">
          {user 
            ? 'Discover the best credit cards for every purchase and track your cashback with intelligent recommendations.'
            : 'Discover the best credit cards for every purchase and maximize your cashback with intelligent recommendations.'
          }
        </p>
      </div>

      {/* Expiring Deals */}
      {user && expiringOffers.length > 0 && (() => {
        const getDaysLeft = (endDateStr: string) => {
          const now = new Date();
          now.setHours(0, 0, 0, 0);
          const [year, month, day] = endDateStr.split('-').map(Number);
          const end = new Date(year, month - 1, day);
          const diffTime = end.getTime() - now.getTime();
          const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
          return diffDays;
        };

        return (
          <Card className="border border-amber-500/30 bg-gray-900/40 backdrop-blur-lg shadow-[0_0_20px_rgba(245,158,11,0.15)] animate-in fade-in slide-in-from-bottom-2 duration-500">
            <CardContent className="p-6">
              <div className="flex items-start space-x-4">
                <div className="p-3 bg-amber-500/20 text-amber-300 border border-amber-500/30 rounded-xl shadow-[0_0_10px_rgba(245,158,11,0.2)]">
                  <Target className="h-6 w-6 text-amber-400" />
                </div>
                <div className="flex-1">
                  <h3 className="font-bold text-white mb-3 text-lg flex items-center space-x-2">
                    <span>Expiring Card Offers</span>
                    <span className="text-xs bg-amber-500/30 text-amber-300 border border-amber-500/40 px-2 py-0.5 rounded-full font-semibold animate-pulse">
                      Action Required
                    </span>
                  </h3>
                  <ul className="space-y-4">
                    {expiringOffers.map(offer => {
                      const daysLeft = getDaysLeft(offer.endDate);
                      const isUrgent = daysLeft <= 7;
                      return (
                        <li key={offer.id} className="text-sm flex flex-col md:flex-row md:items-center md:justify-between border-b border-white/5 pb-3 last:border-0 last:pb-0">
                          <div className="flex flex-col">
                            <span className="font-semibold text-white text-base flex items-center space-x-2">
                              <span>{offer.merchantName}</span>
                              <span className="text-xs font-normal text-teal-400">({offer.cardName})</span>
                            </span>
                            <span className="text-gray-400 text-xs mt-0.5">{offer.offerDescription}</span>
                          </div>
                          <div className="flex items-center space-x-2 mt-2 md:mt-0">
                            {isUrgent ? (
                              <span className="px-3 py-1 bg-rose-500/20 text-rose-300 border border-rose-500/40 rounded-full text-xs font-semibold shadow-[0_0_8px_rgba(244,63,94,0.3)] animate-pulse">
                                🚨 {daysLeft === 0 ? 'Expires Today' : daysLeft === 1 ? 'Expires Tomorrow' : `${daysLeft} days left`}
                              </span>
                            ) : (
                              <span className="px-3 py-1 bg-amber-500/10 text-amber-300 border border-amber-500/20 rounded-full text-xs font-medium">
                                Expires: {offer.endDate}
                              </span>
                            )}
                          </div>
                        </li>
                      );
                    })}
                  </ul>
                </div>
              </div>
            </CardContent>
          </Card>
        );
      })()}

      {/* Quick Actions */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Link to="/recommendations">
          <Card className="group hover:shadow-lg transition-all duration-300 border-0 bg-gradient-to-br from-teal-50 to-teal-100 hover:from-teal-100 hover:to-teal-200">
            <CardContent className="p-6">
              <div className="flex items-center space-x-4">
                <div className="p-3 bg-teal-500 rounded-xl text-white group-hover:scale-110 transition-transform duration-300">
                  <Target className="h-6 w-6" />
                </div>
                <div>
                  <h3 className="font-semibold text-gray-900">Get Recommendations</h3>
                  <p className="text-sm text-gray-600">Find the best card for your next purchase</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </Link>

        <Link to="/cards">
          <Card className="group hover:shadow-lg transition-all duration-300 border-0 bg-gradient-to-br from-green-50 to-green-100 hover:from-green-100 hover:to-green-200">
            <CardContent className="p-6">
              <div className="flex items-center space-x-4">
                <div className="p-3 bg-green-500 rounded-xl text-white group-hover:scale-110 transition-transform duration-300">
                  <CreditCard className="h-6 w-6" />
                </div>
                <div>
                  <h3 className="font-semibold text-gray-900">Browse Cards</h3>
                  <p className="text-sm text-gray-600">Explore all available credit cards</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </Link>
      </div>

      {/* Featured Insight */}
      <Card className="border-0 bg-gradient-to-r from-teal-500 to-green-500 text-white">
        <CardContent className="p-6">
          <div className="flex items-start space-x-4">
            <div className="p-2 bg-white/20 rounded-lg">
              <TrendingUp className="h-6 w-6" />
            </div>
            <div className="flex-1">
              <h3 className="font-semibold mb-2">Today's Top Tip</h3>
              <p className="text-white/90 mb-4">
                Chase Freedom Flex is offering 5% cashback on groceries until September 30th. 
                Perfect for your weekly shopping trips!
              </p>
              <Link to="/recommendations">
                <Button variant="secondary" size="sm" className="bg-white text-teal-600 hover:bg-white/90">
                  Learn More
                </Button>
              </Link>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Features Section */}
      {!user && (
        <div className="space-y-6">
          <div className="text-center">
            <h2 className="text-2xl font-bold text-gray-900 mb-2">Why Choose SwipeRight?</h2>
            <p className="text-gray-600">Join thousands of users maximizing their credit card benefits</p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <Card className="border-0 bg-white shadow-sm">
              <CardContent className="p-6 text-center">
                <div className="w-12 h-12 bg-teal-100 rounded-lg flex items-center justify-center mx-auto mb-4">
                  <Shield className="h-6 w-6 text-teal-600" />
                </div>
                <h3 className="font-semibold text-gray-900 mb-2">Secure & Private</h3>
                <p className="text-sm text-gray-600">Your financial data is encrypted and never shared with third parties.</p>
              </CardContent>
            </Card>

            <Card className="border-0 bg-white shadow-sm">
              <CardContent className="p-6 text-center">
                <div className="w-12 h-12 bg-green-100 rounded-lg flex items-center justify-center mx-auto mb-4">
                  <TrendingUp className="h-6 w-6 text-green-600" />
                </div>
                <h3 className="font-semibold text-gray-900 mb-2">Smart Recommendations</h3>
                <p className="text-sm text-gray-600">AI-powered suggestions to maximize your cashback on every purchase.</p>
              </CardContent>
            </Card>

            <Card className="border-0 bg-white shadow-sm">
              <CardContent className="p-6 text-center">
                <div className="w-12 h-12 bg-blue-100 rounded-lg flex items-center justify-center mx-auto mb-4">
                  <Users className="h-6 w-6 text-blue-600" />
                </div>
                <h3 className="font-semibold text-gray-900 mb-2">Community Driven</h3>
                <p className="text-sm text-gray-600">Real user reviews and experiences to help you make informed decisions.</p>
              </CardContent>
            </Card>
          </div>
        </div>
      )}

      {/* Stats */}
      <div className="grid grid-cols-3 gap-4 text-center">
        <div className="space-y-2">
          <div className="text-2xl font-bold text-teal-600">50+</div>
          <div className="text-sm text-gray-600">Credit Cards</div>
        </div>
        <div className="space-y-2">
          <div className="text-2xl font-bold text-green-600">5%</div>
          <div className="text-sm text-gray-600">Max Cashback</div>
        </div>
        <div className="space-y-2">
          <div className="text-2xl font-bold text-teal-600">24/7</div>
          <div className="text-sm text-gray-600">AI Support</div>
        </div>
      </div>
    </div>
  );
}
