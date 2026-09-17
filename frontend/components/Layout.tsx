import React, { useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { CreditCard, Sparkles, Target, UserRound } from 'lucide-react';
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
        <div className="max-w-md mx-auto px-4">
          <div className="flex items-center justify-between gap-3 h-[62px]">
            <Link to="/" className="min-w-0" aria-label="SwipeRight home">
              <span className="block font-display text-[21px] font-semibold leading-none tracking-[-0.005em]">
                Swipe<span className="text-[#E64BD4]">Right</span>
              </span>
              <span className="mt-[5px] block truncate text-[11.5px] font-medium leading-none text-[#A99DB3]">
                Max Out Your Cash Back, Not Your Credit Card
              </span>
            </Link>

            {/* One account control: signing up happens inside the sign-in sheet. */}
            <div className="shrink-0">
              {isLoading ? (
                <div className="h-[38px] w-[38px] rounded-full bg-white/10 animate-pulse" />
              ) : user ? (
                <UserMenu />
              ) : (
                <button
                  type="button"
                  onClick={() => openAuthModal('signin')}
                  aria-label="Sign in"
                  className="grid h-[38px] w-[38px] place-items-center rounded-full border border-white/[0.14] bg-white/[0.04] text-[#F3EBF8] transition hover:bg-white/[0.09] active:scale-[0.96] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#E64BD4]/60"
                >
                  <UserRound className="h-[18px] w-[18px]" strokeWidth={1.75} />
                </button>
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
