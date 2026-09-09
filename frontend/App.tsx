import React from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Toaster } from '@/components/ui/toaster';
import { AuthProvider } from './contexts/AuthContext';
import Layout from './components/Layout';
import Counter from './pages/Counter';
import Cards from './pages/Cards';
import Recommendations from './pages/Recommendations';
import AIChat from './pages/AIChat';

const queryClient = new QueryClient();

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <Router>
          <Layout>
            <Routes>
              {/* The counter screen is the app. Everything else supports it. */}
              <Route path="/" element={<Counter />} />
              <Route path="/cards" element={<Cards />} />
              <Route path="/recommendations" element={<Recommendations />} />
              {/* Kept reachable by link; no longer a tab — Ask replaced it. */}
              <Route path="/ai-chat" element={<AIChat />} />
              <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>
          </Layout>
          <Toaster />
        </Router>
      </AuthProvider>
    </QueryClientProvider>
  );
}
