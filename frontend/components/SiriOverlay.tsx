import React, { useState, useEffect, useRef } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Mic, MicOff, X, Volume2, VolumeX, Sparkles, AlertCircle, ShoppingBag, CreditCard, ChevronRight, Terminal } from 'lucide-react';
import backend from '~backend/client';
import { Button } from './ui/button';
import { Card, CardContent } from './ui/card';
import { Badge } from './ui/badge';
import { Input } from './ui/input';
import { useToast } from './ui/use-toast';
import { useAuth } from '../contexts/AuthContext';

// Types from backend or local equivalents
interface SiriOverlayProps {
  isOpen: boolean;
  onClose: () => void;
}

interface WebkitSpeechRecognition extends EventTarget {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  start(): void;
  stop(): void;
  abort(): void;
  onstart: (event: Event) => void;
  onresult: (event: any) => void;
  onerror: (event: any) => void;
  onend: (event: Event) => void;
}

const quickSuggestions = [
  { label: 'Grocery Store 🛒', query: 'groceries' },
  { label: 'Gas Station ⛽', query: 'gas' },
  { label: 'Dining Out 🍔', query: 'dining' },
  { label: 'Book Flights ✈️', query: 'travel' },
  { label: 'Amazon Shopping 🛍️', query: 'shopping' },
  { label: 'Netflix Streaming 📺', query: 'streaming' },
];

export default function SiriOverlay({ isOpen, onClose }: SiriOverlayProps) {
  const [status, setStatus] = useState<'idle' | 'listening' | 'processing' | 'speaking' | 'error'>('idle');
  const [transcript, setTranscript] = useState('');
  const [aiResponse, setAiResponse] = useState('');
  const [isMuted, setIsMuted] = useState(false);
  const [manualText, setManualText] = useState('');
  
  // Custom parsed intent details
  const [detectedCategory, setDetectedCategory] = useState<string | null>(null);
  const [recommendedCard, setRecommendedCard] = useState<any | null>(null);
  const [hasSpeechSupport, setHasSpeechSupport] = useState(true);

  const { user } = useAuth();
  const { toast } = useToast();
  const recognitionRef = useRef<WebkitSpeechRecognition | null>(null);
  const speechUtteranceRef = useRef<SpeechSynthesisUtterance | null>(null);

  // Initialize Speech Recognition
  useEffect(() => {
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRecognition) {
      setHasSpeechSupport(false);
      return;
    }

    try {
      const rec = new SpeechRecognition();
      rec.continuous = false;
      rec.interimResults = true;
      rec.lang = 'en-US';

      rec.onstart = () => {
        setStatus('listening');
        setTranscript('');
        setAiResponse('');
        setDetectedCategory(null);
        setRecommendedCard(null);
        // Stop any ongoing speech
        window.speechSynthesis.cancel();
      };

      rec.onresult = (event: any) => {
        const currentTranscript = Array.from(event.results)
          .map((result: any) => result[0])
          .map((result: any) => result.transcript)
          .join('');
        
        setTranscript(currentTranscript);
      };

      rec.onerror = (event: any) => {
        console.error('Speech recognition error:', event);
        if (event.error === 'not-allowed') {
          toast({
            title: "Microphone Blocked",
            description: "Please enable microphone access in your browser settings to use the voice bot.",
            variant: "destructive",
          });
        }
        setStatus('error');
      };

      rec.onend = () => {
        // Recognition stops, process what we heard if transcript exists
        setStatus(prev => {
          if (prev === 'listening') {
            return 'processing';
          }
          return prev;
        });
      };

      recognitionRef.current = rec;
    } catch (e) {
      console.error('Error starting Speech Recognition:', e);
      setHasSpeechSupport(false);
    }
  }, []);

  // Process text whenever we finish listening
  useEffect(() => {
    if (status === 'processing' && transcript.trim()) {
      handleProcessQuery(transcript);
    }
  }, [status]);

  // Restart listener or stop speaking when overlay closes
  useEffect(() => {
    if (!isOpen) {
      stopAllVoiceActivity();
    } else {
      // Auto-start voice if supported and not muted
      startListening();
    }
  }, [isOpen]);

  const startListening = () => {
    if (recognitionRef.current) {
      try {
        recognitionRef.current.start();
      } catch (e) {
        // Recognition already running or other error
        console.warn('Recognition start caught error:', e);
      }
    } else {
      setStatus('idle');
    }
  };

  const stopAllVoiceActivity = () => {
    try {
      if (recognitionRef.current) recognitionRef.current.abort();
    } catch (e) {}
    window.speechSynthesis.cancel();
    setStatus('idle');
    setTranscript('');
    setAiResponse('');
    setDetectedCategory(null);
    setRecommendedCard(null);
  };

  const speakText = (text: string) => {
    if (isMuted) return;
    
    // Stop ongoing speech
    window.speechSynthesis.cancel();

    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = 'en-US';
    
    // Attempt to pick a premium/smooth voice if available
    const voices = window.speechSynthesis.getVoices();
    const premiumVoice = voices.find(voice => 
      (voice.name.includes('Google') || voice.name.includes('Siri') || voice.name.includes('Natural')) && 
      voice.lang.startsWith('en')
    );
    if (premiumVoice) utterance.voice = premiumVoice;

    utterance.onstart = () => setStatus('speaking');
    utterance.onend = () => setStatus('idle');
    utterance.onerror = () => setStatus('idle');

    speechUtteranceRef.current = utterance;
    window.speechSynthesis.speak(utterance);
  };

  // Parses categories from query
  const parseCategory = (queryText: string): string | null => {
    const text = queryText.toLowerCase();
    
    if (text.includes('grocery') || text.includes('groceries') || text.includes('supermarket') || text.includes('food shop')) {
      return 'Groceries';
    }
    if (text.includes('gas') || text.includes('fuel') || text.includes('petrol') || text.includes('station') || text.includes('chevron') || text.includes('shell')) {
      return 'Gas';
    }
    if (text.includes('dining') || text.includes('restaurant') || text.includes('restaurants') || text.includes('eat') || text.includes('cafe') || text.includes('food') || text.includes('dinner') || text.includes('lunch') || text.includes('brunch')) {
      return 'Dining';
    }
    if (text.includes('travel') || text.includes('flight') || text.includes('flights') || text.includes('hotel') || text.includes('hotels') || text.includes('plane') || text.includes('booking') || text.includes('airbnb')) {
      return 'Travel';
    }
    if (text.includes('shopping') || text.includes('shop') || text.includes('amazon') || text.includes('store') || text.includes('target') || text.includes('walmart')) {
      return 'Shopping';
    }
    if (text.includes('streaming') || text.includes('netflix') || text.includes('hulu') || text.includes('spotify') || text.includes('disney') || text.includes('music')) {
      return 'Streaming';
    }
    return null;
  };

  const handleProcessQuery = async (queryText: string) => {
    setStatus('processing');
    setTranscript(queryText);

    const parsedCat = parseCategory(queryText);

    try {
      if (parsedCat) {
        // Structured card optimization lookup
        setDetectedCategory(parsedCat);
        const recommendations = await backend.cards.recommend({
          category: parsedCat,
          userId: user?.userId,
        });

        const cards = recommendations.portfolioRecommendations.length > 0
          ? recommendations.portfolioRecommendations
          : recommendations.cards;

        if (cards && cards.length > 0) {
          const topChoice = cards[0];
          setRecommendedCard(topChoice);
          
          const rate = topChoice.relevantCategory.cashbackRate;
          const cardName = topChoice.portfolioNickname || topChoice.card.name;
          const source = recommendations.portfolioRecommendations.length > 0 ? "your portfolio" : "our database";
          
          const voiceAnswer = `I recommend using the ${cardName} from ${source}. It gives you a maximum of ${rate}% cashback on ${parsedCat}!`;
          setAiResponse(voiceAnswer);
          speakText(voiceAnswer);
        } else {
          const fallbackAns = `I couldn't find a matching cashback card for ${parsedCat} in your portfolio. You can add one under the Cards tab.`;
          setAiResponse(fallbackAns);
          speakText(fallbackAns);
        }
      } else {
        // Fallback to OpenAI AI Chat Bot
        const responseData = await backend.ai.chat({ message: queryText });
        setAiResponse(responseData.response);
        speakText(responseData.response);
      }
    } catch (error) {
      console.error('Error processing voice query:', error);
      const errorAns = "I had trouble matching that request. Please try telling me a category like groceries, gas, or dining.";
      setAiResponse(errorAns);
      speakText(errorAns);
      setStatus('error');
    }
  };

  const handleManualSubmit = () => {
    if (!manualText.trim()) return;
    const text = manualText;
    setManualText('');
    handleProcessQuery(text);
  };

  if (!isOpen) return null;

  // Visual card gradient helper
  const getCardGradient = (issuer: string) => {
    const name = issuer.toLowerCase();
    if (name.includes('chase')) return 'from-blue-600 to-indigo-900 text-white';
    if (name.includes('american express') || name.includes('amex')) return 'from-amber-400 via-amber-500 to-yellow-600 text-amber-950';
    if (name.includes('citi')) return 'from-cyan-500 to-blue-700 text-white';
    if (name.includes('capital one')) return 'from-slate-800 to-slate-950 text-white';
    if (name.includes('discover')) return 'from-orange-500 to-red-600 text-white';
    return 'from-teal-600 to-emerald-800 text-white';
  };

  return (
    <div className="fixed inset-0 z-9999 flex flex-col items-center justify-between p-6 bg-black/80 backdrop-blur-2xl transition-all duration-500 animate-in fade-in">
      
      {/* Siri Top controls */}
      <div className="w-full max-w-2xl flex items-center justify-between mt-2">
        <div className="flex items-center space-x-2">
          <div className="w-8 h-8 rounded-full bg-gradient-to-r from-teal-500 to-green-500 flex items-center justify-center animate-pulse">
            <Sparkles className="h-4 w-4 text-white animate-spin-slow" />
          </div>
          <div>
            <h2 className="text-white font-bold text-sm">SwipeRight Voice Bot</h2>
            <p className="text-xs text-teal-400">Integrated Siri & Android Assistant</p>
          </div>
        </div>

        <div className="flex items-center space-x-2">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setIsMuted(!isMuted)}
            className="text-gray-400 hover:text-white rounded-full hover:bg-white/10"
            title={isMuted ? "Unmute Bot Speech" : "Mute Bot Speech"}
          >
            {isMuted ? <VolumeX className="h-5 w-5" /> : <Volume2 className="h-5 w-5" />}
          </Button>

          <Button
            variant="ghost"
            size="icon"
            onClick={onClose}
            className="text-gray-400 hover:text-white rounded-full hover:bg-white/10"
          >
            <X className="h-5 w-5" />
          </Button>
        </div>
      </div>

      {/* Main Content Area: Visual Answer Cards */}
      <div className="flex-1 w-full max-w-xl flex flex-col justify-center items-center py-6 overflow-y-auto space-y-6">
        
        {/* User spoken input bubble */}
        {transcript && (
          <div className="w-full text-center space-y-1 px-4">
            <p className="text-gray-400 text-xs font-semibold uppercase tracking-widest">You said</p>
            <h3 className="text-xl md:text-2xl font-medium text-white max-w-lg mx-auto leading-relaxed">
              "{transcript}"
            </h3>
          </div>
        )}

        {/* AI Thinking Indicator */}
        {status === 'processing' && (
          <div className="flex flex-col items-center space-y-2">
            <div className="flex space-x-1.5">
              <span className="w-2.5 h-2.5 bg-teal-400 rounded-full animate-bounce delay-100"></span>
              <span className="w-2.5 h-2.5 bg-green-400 rounded-full animate-bounce delay-200"></span>
              <span className="w-2.5 h-2.5 bg-cyan-400 rounded-full animate-bounce delay-300"></span>
            </div>
            <p className="text-xs text-teal-400 font-medium">Analyzing cashback portfolios...</p>
          </div>
        )}

        {/* Dynamic Card/AI Response Widget */}
        {aiResponse && (
          <div className="w-full space-y-4 animate-in slide-in-from-bottom-6 duration-300">
            {/* Visual shiny credit card representation */}
            {recommendedCard && (
              <div className="relative group max-w-sm mx-auto aspect-[1.586/1] w-full rounded-2xl p-6 flex flex-col justify-between overflow-hidden shadow-[0_0_50px_rgba(20,184,166,0.3)] border border-white/20">
                
                {/* Glossy glass highlight overlay */}
                <div className="absolute inset-0 bg-gradient-to-tr from-transparent via-white/5 to-white/15 pointer-events-none" />
                <div className={`absolute inset-0 bg-gradient-to-br -z-10 ${getCardGradient(recommendedCard.card.issuer)}`} />

                {/* Card Top */}
                <div className="flex justify-between items-start">
                  <div>
                    <h4 className="font-bold text-xs uppercase tracking-wider opacity-85">
                      {recommendedCard.card.issuer}
                    </h4>
                    <p className="text-sm font-semibold mt-1">
                      {recommendedCard.portfolioNickname || recommendedCard.card.name}
                    </p>
                  </div>
                  <CreditCard className="h-6 w-6 opacity-75" />
                </div>

                {/* Card Bottom with Cashback Rate */}
                <div className="flex justify-between items-end">
                  <div className="space-y-1">
                    <p className="text-[10px] uppercase tracking-widest opacity-60">Max Rewards</p>
                    <div className="flex items-center space-x-1.5">
                      <Badge className="bg-white/20 text-white font-bold text-xs hover:bg-white/35 border-0">
                        {detectedCategory}
                      </Badge>
                      <span className="text-2xl font-extrabold tracking-tight">
                        {recommendedCard.relevantCategory.cashbackRate}%
                      </span>
                    </div>
                  </div>

                  <div className="text-right">
                    <span className="text-[10px] uppercase tracking-widest opacity-60 block">Network</span>
                    <span className="text-xs font-bold">{recommendedCard.card.network}</span>
                  </div>
                </div>

                {/* Floating shine circle decoration */}
                <div className="absolute -right-16 -bottom-16 w-32 h-32 bg-white/10 rounded-full blur-xl pointer-events-none group-hover:scale-125 transition-transform duration-500" />
              </div>
            )}

            {/* AI message display */}
            <Card className="border-0 bg-white/10 backdrop-blur-md max-w-md mx-auto text-white shadow-2xl">
              <CardContent className="p-5 space-y-2">
                <div className="flex items-center space-x-2 text-xs font-semibold text-teal-400">
                  <Sparkles className="h-3.5 w-3.5" />
                  <span>SwipeRight Assistant</span>
                </div>
                <p className="text-sm md:text-base leading-relaxed text-gray-200">
                  {aiResponse}
                </p>
              </CardContent>
            </Card>
          </div>
        )}
      </div>

      {/* Siri Voice Waveform & Interactive Control Center */}
      <div className="w-full max-w-lg flex flex-col items-center space-y-6 mb-4">
        
        {/* Animated Siri/Assistant Waves */}
        {status !== 'idle' && (
          <div className="w-full h-16 flex items-center justify-center overflow-hidden">
            <svg className="w-full max-w-sm h-full" viewBox="0 0 400 100" xmlns="http://www.w3.org/2000/svg">
              <defs>
                <linearGradient id="siri-pink" x1="0%" y1="0%" x2="100%" y2="0%">
                  <stop offset="0%" stopColor="#ec4899" stopOpacity="0.8" />
                  <stop offset="100%" stopColor="#8b5cf6" stopOpacity="0" />
                </linearGradient>
                <linearGradient id="siri-cyan" x1="0%" y1="0%" x2="100%" y2="0%">
                  <stop offset="0%" stopColor="#06b6d4" stopOpacity="0.8" />
                  <stop offset="100%" stopColor="#3b82f6" stopOpacity="0" />
                </linearGradient>
                <linearGradient id="siri-green" x1="0%" y1="0%" x2="100%" y2="0%">
                  <stop offset="0%" stopColor="#10b981" stopOpacity="0.7" />
                  <stop offset="100%" stopColor="#14b8a6" stopOpacity="0" />
                </linearGradient>
              </defs>
              
              {/* Wave 1: Pink */}
              <path
                className={`transition-all duration-1000 ${status === 'listening' ? 'animate-pulse' : ''}`}
                d="M 0 50 Q 100 20, 200 50 T 400 50"
                fill="none"
                stroke="url(#siri-pink)"
                strokeWidth={status === 'listening' ? "4" : "2"}
                strokeLinecap="round"
              />
              
              {/* Wave 2: Cyan */}
              <path
                className={`transition-all duration-1000 ${status === 'speaking' ? 'animate-pulse' : ''}`}
                d="M 0 50 Q 100 80, 200 50 T 400 50"
                fill="none"
                stroke="url(#siri-cyan)"
                strokeWidth={status === 'speaking' ? "5" : "2"}
                strokeLinecap="round"
              />

              {/* Wave 3: Green */}
              <path
                d="M 0 50 Q 100 40, 200 50 T 400 50"
                fill="none"
                stroke="url(#siri-green)"
                strokeWidth="2.5"
                strokeLinecap="round"
              />
            </svg>
          </div>
        )}

        {/* Suggestion Chips */}
        {status === 'idle' && !transcript && (
          <div className="w-full text-center space-y-3">
            <p className="text-gray-400 text-xs font-semibold tracking-wider uppercase">Try saying or tapping</p>
            <div className="flex flex-wrap justify-center gap-2 max-w-md mx-auto">
              {quickSuggestions.map((sug, i) => (
                <button
                  key={i}
                  onClick={() => handleProcessQuery(sug.query)}
                  className="px-3.5 py-1.5 text-xs text-gray-300 bg-white/5 hover:bg-white/15 hover:text-white rounded-full border border-white/10 transition-all duration-300 shadow-md transform hover:-translate-y-0.5 active:scale-95"
                >
                  {sug.label}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Trigger Button & Status message */}
        <div className="flex flex-col items-center space-y-3">
          
          <button
            onClick={status === 'listening' ? stopAllVoiceActivity : startListening}
            className={`w-20 h-20 rounded-full flex items-center justify-center transition-all duration-500 ${
              status === 'listening'
                ? 'bg-gradient-to-r from-red-500 to-pink-600 scale-110 shadow-[0_0_40px_rgba(239,68,68,0.5)]'
                : status === 'speaking'
                ? 'bg-gradient-to-r from-cyan-500 to-blue-600 shadow-[0_0_40px_rgba(6,182,212,0.5)]'
                : 'bg-gradient-to-r from-teal-500 to-green-500 hover:scale-105 shadow-[0_0_30px_rgba(20,184,166,0.3)]'
            }`}
          >
            {status === 'listening' ? (
              <div className="relative w-full h-full flex items-center justify-center">
                <span className="absolute animate-ping inline-flex h-14 w-14 rounded-full bg-white/20"></span>
                <MicOff className="h-8 w-8 text-white relative" />
              </div>
            ) : (
              <Mic className="h-8 w-8 text-white" />
            )}
          </button>

          <p className="text-sm font-semibold text-gray-300">
            {status === 'listening'
              ? 'Listening...'
              : status === 'processing'
              ? 'Processing intent...'
              : status === 'speaking'
              ? 'Assistant is speaking...'
              : 'Tap microphone to search'}
          </p>
        </div>

        {/* Manual Keyboard Input Fallback */}
        <div className="w-full bg-white/5 p-3 rounded-2xl border border-white/10 flex items-center space-x-2">
          <Terminal className="h-4 w-4 text-teal-400 flex-shrink-0" />
          <Input
            type="text"
            placeholder="Or type spending category (e.g. gas, target)..."
            value={manualText}
            onChange={(e) => setManualText(e.target.value)}
            onKeyPress={(e) => e.key === 'Enter' && handleManualSubmit()}
            className="flex-1 bg-transparent border-0 text-white focus-visible:ring-0 focus-visible:ring-offset-0 placeholder-gray-500 text-sm h-8"
          />
          <Button
            size="sm"
            onClick={handleManualSubmit}
            className="bg-teal-500 hover:bg-teal-600 text-white text-xs h-8 px-4 rounded-xl"
          >
            Ask Bot
          </Button>
        </div>

        {!hasSpeechSupport && (
          <div className="flex items-center space-x-1.5 text-amber-400 bg-amber-950/20 border border-amber-900/50 p-2 rounded-xl text-xs w-full text-center justify-center">
            <AlertCircle className="h-4 w-4" />
            <span>Voice synthesis is active, but voice input falls back to text in this browser.</span>
          </div>
        )}
      </div>
    </div>
  );
}
