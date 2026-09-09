import React, { useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { CreditCard, Sparkles, Target } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useAuth } from '../contexts/AuthContext';
import AuthModal from './AuthModal';
import UserMenu from './UserMenu';

interface LayoutProps {
  children: React.ReactNode;
}

/**
 * Three tabs, not five.
 *
 * The old shell had Home, Cards, Optimize and AI Chat plus a floating mic —
 * five ways in for an app that does one thing. Ask absorbed Home and AI Chat;
 * the mic now lives on the Ask screen where it is actually used.
 */
const NAV = [
  { path: '/', icon: Sparkles, label: 'Ask' },
  { path: '/cards', icon: CreditCard, label: 'Wallet' },
  { path: '/recommendations', icon: Target, label: 'Insights' },
];

export default function Layout({ children }: LayoutProps) {
  const location = useLocation();
  const { user, isLoading } = useAuth();
  const [isAuthModalOpen, setIsAuthModalOpen] = useState(false);
  const [authModalMode, setAuthModalMode] = useState<'signin' | 'signup'>('signin');

  const openAuthModal = (mode: 'signin' | 'signup') => {
    setAuthModalMode(mode);
    setIsAuthModalOpen(true);
  };

  return (
    <div className="min-h-[100dvh] flex flex-col bg-black text-[#F3EBF8]">
      <header className="sticky top-0 z-50 bg-black/85 backdrop-blur-md border-b border-white/[0.07]">
        <div className="max-w-md mx-auto px-5">
          <div className="flex items-center justify-between h-14">
            <Link to="/" className="min-w-0 group">
              <h1 className="text-[17px] font-extrabold tracking-tight leading-none">
                Swipe<span className="text-[#E64BD4]">Right</span>
              </h1>
              <p className="text-[10.5px] text-[#6E637A] leading-none mt-1 truncate">
                Max out your cash back, not your card limit
              </p>
            </Link>

            <div className="flex items-center gap-2 shrink-0">
              {isLoading ? (
                <div className="w-8 h-8 rounded-full bg-white/10 animate-pulse" />
              ) : user ? (
                <UserMenu />
              ) : (
                <>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => openAuthModal('signin')}
                    className="text-[#9B8FA6] hover:text-[#F3EBF8] hover:bg-white/5 text-xs font-semibold"
                  >
                    Sign in
                  </Button>
                  <Button
                    size="sm"
                    onClick={() => openAuthModal('signup')}
                    className="bg-[#E64BD4] hover:bg-[#F06BDD] text-black text-xs font-bold"
                  >
                    Start
                  </Button>
                </>
              )}
            </div>
          </div>
        </div>
      </header>

      {/* flex column so a full-height page fills exactly the space left
          between header and nav, rather than overflowing behind them */}
      <main className="flex-1 flex flex-col pb-16 min-h-0">{children}</main>

      <nav className="fixed bottom-0 left-0 right-0 z-50 bg-black/90 backdrop-blur-md border-t border-white/[0.07]">
        <div className="max-w-md mx-auto px-4">
          <div className="flex justify-around py-1.5">
            {NAV.map(({ path, icon: Icon, label }) => {
              const isActive = location.pathname === path;
              return (
                <Link
                  key={path}
                  to={path}
                  className={`flex flex-col items-center gap-0.5 py-2 px-5 rounded-xl transition-colors ${
                    isActive ? 'text-[#E64BD4]' : 'text-[#6E637A] hover:text-[#DDD0E6]'
                  }`}
                >
                  <Icon className="h-[18px] w-[18px]" />
                  <span className="text-[10.5px] font-semibold">{label}</span>
                </Link>
              );
            })}
          </div>
        </div>
      </nav>

      <AuthModal
        isOpen={isAuthModalOpen}
        onClose={() => setIsAuthModalOpen(false)}
        initialMode={authModalMode}
      />
    </div>
  );
}
