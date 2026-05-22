import React, { useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { CreditCard, Home, Target, Bot, Mic } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useAuth } from '../contexts/AuthContext';
import AuthModal from './AuthModal';
import UserMenu from './UserMenu';
import SiriOverlay from './SiriOverlay';

interface LayoutProps {
  children: React.ReactNode;
}

export default function Layout({ children }: LayoutProps) {
  const location = useLocation();
  const { user, isLoading } = useAuth();
  const [isAuthModalOpen, setIsAuthModalOpen] = useState(false);
  const [authModalMode, setAuthModalMode] = useState<'signin' | 'signup'>('signin');
  const [isSiriOpen, setIsSiriOpen] = useState(false);

  const navItems = [
    { path: '/', icon: Home, label: 'Home' },
    { path: '/cards', icon: CreditCard, label: 'Cards' },
    { path: '/recommendations', icon: Target, label: 'Optimize' },
    { path: '/ai-chat', icon: Bot, label: 'AI Chat' },
  ];

  const openAuthModal = (mode: 'signin' | 'signup') => {
    setAuthModalMode(mode);
    setIsAuthModalOpen(true);
  };

  return (
    <div className="min-h-screen flex flex-col">
      {/* Header */}
      <header className="bg-white/80 backdrop-blur-md border-b border-teal-100 sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            <div className="flex items-center space-x-3">
              <div className="w-10 h-10 bg-gradient-to-br from-teal-500 to-green-500 rounded-xl flex items-center justify-center">
                <CreditCard className="h-6 w-6 text-white animate-pulse" />
              </div>
              <div>
                <h1 className="text-xl font-bold bg-gradient-to-r from-teal-600 to-green-600 bg-clip-text text-transparent">
                  SwipeRight
                </h1>
                <p className="text-xs text-gray-500 -mt-1">Your Wallet's Wingman</p>
              </div>
            </div>

            {/* Auth Section */}
            <div className="flex items-center space-x-3">
              {isLoading ? (
                <div className="w-8 h-8 animate-pulse bg-gray-200 rounded-full"></div>
              ) : user ? (
                <UserMenu />
              ) : (
                <div className="flex items-center space-x-2">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => openAuthModal('signin')}
                    className="text-gray-600 hover:text-teal-600 text-xs font-semibold"
                  >
                    Sign In
                  </Button>
                  <Button
                    size="sm"
                    onClick={() => openAuthModal('signup')}
                    className="bg-teal-500 hover:bg-teal-600 text-xs font-semibold"
                  >
                    Register
                  </Button>
                </div>
              )}
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 pb-24">
        {children}
      </main>

      {/* Global Siri Voice Activation Button */}
      <div className="fixed bottom-20 right-6 z-40">
        <div className="relative group">
          {/* Pulsating breathing outer rings */}
          <span className="absolute -inset-1.5 rounded-full bg-gradient-to-r from-teal-500 to-green-500 opacity-30 group-hover:opacity-75 blur-md animate-pulse"></span>
          <span className="absolute -inset-3 rounded-full bg-gradient-to-r from-cyan-400 to-emerald-400 opacity-15 group-hover:opacity-40 blur-lg animate-ping duration-1000"></span>
          
          <button
            onClick={() => setIsSiriOpen(true)}
            className="relative w-14 h-14 bg-gradient-to-r from-teal-500 to-green-500 rounded-full flex items-center justify-center text-white shadow-[0_4px_20px_rgba(20,184,166,0.4)] hover:scale-110 active:scale-95 transition-all duration-300 cursor-pointer"
            title="Ask Voice Assistant"
          >
            <Mic className="h-6 w-6 animate-pulse" />
          </button>
        </div>
      </div>

      {/* Bottom Navigation */}
      <nav className="fixed bottom-0 left-0 right-0 bg-white/95 backdrop-blur-md border-t border-teal-100 z-50">
        <div className="max-w-md mx-auto px-4">
          <div className="flex justify-around py-2">
            {navItems.map(({ path, icon: Icon, label }) => {
              const isActive = location.pathname === path;
              return (
                <Link
                  key={path}
                  to={path}
                  className={`flex flex-col items-center py-2 px-3 rounded-lg transition-all duration-200 ${
                    isActive
                      ? 'text-teal-600 bg-teal-50'
                      : 'text-gray-500 hover:text-teal-600 hover:bg-teal-50/50'
                  }`}
                >
                  <Icon className="h-5 w-5 mb-1" />
                  <span className="text-xs font-medium">{label}</span>
                </Link>
              );
            })}
          </div>
        </div>
      </nav>

      {/* Siri Screen Overlay */}
      <SiriOverlay isOpen={isSiriOpen} onClose={() => setIsSiriOpen(false)} />

      {/* Auth Modal */}
      <AuthModal
        isOpen={isAuthModalOpen}
        onClose={() => setIsAuthModalOpen(false)}
        initialMode={authModalMode}
      />
    </div>
  );
}

