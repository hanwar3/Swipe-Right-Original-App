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
    { path: '/ai-chat', icon: Bot, label: 'AI' },
  ];

  const openAuthModal = (mode: 'signin' | 'signup') => {
    setAuthModalMode(mode);
    setIsAuthModalOpen(true);
  };

  return (
    <div className="min-h-screen flex flex-col bg-[#0a0a0b]">
      {/* Header */}
      <header className="bg-[#0a0a0b]/80 backdrop-blur-xl border-b border-white/[0.06] sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            <div className="flex items-center space-x-2.5">
              <div className="w-9 h-9 bg-gradient-to-br from-teal-500 to-emerald-500 rounded-xl flex items-center justify-center shadow-lg shadow-teal-500/20">
                <CreditCard className="h-5 w-5 text-white" />
              </div>
              <div>
                <h1 className="text-lg font-bold tracking-tight text-white">
                  SwipeRight
                </h1>
                <p className="text-[10px] text-white/30 -mt-0.5">Your Wallet's Wingman</p>
              </div>
            </div>

            {/* Auth Section */}
            <div className="flex items-center space-x-3">
              {isLoading ? (
                <div className="w-8 h-8 animate-pulse bg-white/10 rounded-full"></div>
              ) : user ? (
                <UserMenu />
              ) : (
                <div className="flex items-center space-x-2">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => openAuthModal('signin')}
                    className="text-white/60 hover:text-white hover:bg-white/5 text-xs font-medium"
                  >
                    Sign In
                  </Button>
                  <Button
                    size="sm"
                    onClick={() => openAuthModal('signup')}
                    className="bg-white text-black hover:bg-white/90 text-xs font-semibold rounded-full"
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

      {/* Global Voice Activation Button */}
      <div className="fixed bottom-20 right-5 z-40">
        <div className="relative group">
          <span className="absolute -inset-1.5 rounded-full bg-gradient-to-r from-teal-500 to-green-500 opacity-25 group-hover:opacity-60 blur-md transition-opacity"></span>
          <button
            onClick={() => setIsSiriOpen(true)}
            className="relative w-14 h-14 bg-gradient-to-r from-teal-500 to-green-500 rounded-full flex items-center justify-center text-white shadow-[0_4px_20px_rgba(20,184,166,0.3)] hover:scale-110 active:scale-95 transition-transform duration-300 cursor-pointer"
            title="Ask Voice Assistant"
          >
            <Mic className="h-5 w-5" />
          </button>
        </div>
      </div>

      {/* Bottom Navigation */}
      <nav className="fixed bottom-0 left-0 right-0 bg-[#0a0a0b]/90 backdrop-blur-xl border-t border-white/[0.06] z-50">
        <div className="max-w-md mx-auto px-4">
          <div className="flex justify-around py-2">
            {navItems.map(({ path, icon: Icon, label }) => {
              const isActive = location.pathname === path;
              return (
                <Link
                  key={path}
                  to={path}
                  className={`flex flex-col items-center py-2 px-3 rounded-lg transition-colors duration-200 ${
                    isActive
                      ? 'text-teal-400'
                      : 'text-white/30 hover:text-white/60'
                  }`}
                >
                  <Icon className="h-5 w-5 mb-1" />
                  <span className="text-[10px] font-medium">{label}</span>
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
