import React from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Toaster } from '@/components/ui/toaster';
import { AuthProvider } from './contexts/AuthContext';
import Layout from './components/Layout';
import Counter from './pages/Counter';
import Cards from './pages/Cards';
import Recommendations from './pages/Recommendations';
import AIChat from './pages/AIChat';

const queryClient = new QueryClient();

/**
 * Keying on pathname remounts the wrapper on every navigation, which replays
 * the enter animation. Cheap, no transition library, and it degrades to an
 * instant swap under prefers-reduced-motion.
 */
function Screens() {
  const location = useLocation();
  return (
    <div key={location.pathname} className="screen-enter flex flex-1 flex-col">
      <Routes location={location}>
        {/* The counter screen is the app. Everything else supports it. */}
        <Route path="/" element={<Counter />} />
        <Route path="/cards" element={<Cards />} />
        <Route path="/recommendations" element={<Recommendations />} />
        {/* Kept reachable by link; no longer a tab, Ask replaced it. */}
        <Route path="/ai-chat" element={<AIChat />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </div>
  );
}

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <Router>
          <Layout>
            <Screens />
          </Layout>
          <Toaster />
        </Router>
      </AuthProvider>
    </QueryClientProvider>
  );
}
