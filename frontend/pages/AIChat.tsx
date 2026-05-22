import React, { useState, useRef, useEffect } from 'react';
import { useMutation } from '@tanstack/react-query';
import { 
  Send, Bot, User, Sparkles, Mic, MicOff, Volume2, VolumeX, 
  MessageSquare, Headphones, RefreshCw, X
} from 'lucide-react';
import backend from '~backend/client';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { useToast } from '@/components/ui/use-toast';

interface Message {
  id: string;
  content: string;
  isUser: boolean;
  timestamp: Date;
}

const suggestedQuestions = [
  "What's the best card for grocery shopping?",
  "How do I track my rotating category benefits?",
  "Which card should I use for gas purchases?",
  "What are the annual limits on my cashback cards?",
  "Best travel credit cards for 2024?",
];

export default function AIChat() {
  const [messages, setMessages] = useState<Message[]>([
    {
      id: '1',
      content: "Hi! I'm SwipeRight AI, your personal credit card advisor. I can help you find the best cards for specific purchases, track your benefits, and optimize your cash back strategy. What would you like to know?",
      isUser: false,
      timestamp: new Date(),
    }
  ]);
  const [inputMessage, setInputMessage] = useState('');
  const [isVoiceMode, setIsVoiceMode] = useState(false);
  const [voiceState, setVoiceState] = useState<'idle' | 'listening' | 'thinking' | 'speaking'>('idle');
  const [voiceTranscript, setVoiceTranscript] = useState('');
  const [voiceResponse, setVoiceResponse] = useState('');
  const [voiceSynthesized, setVoiceSynthesized] = useState(true);
  const [isDictating, setIsDictating] = useState(false);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const recognitionRef = useRef<any>(null);
  const dictationRecognitionRef = useRef<any>(null);
  const { toast } = useToast();

  const speakText = (text: string, onEndCallback?: () => void) => {
    window.speechSynthesis.cancel();
    
    // Clean text of markdown format characters
    const cleanText = text.replace(/[*#_`[\]()]/g, '');
    
    const utterance = new SpeechSynthesisUtterance(cleanText);
    
    utterance.onstart = () => {
      if (isVoiceMode) {
        setVoiceState('speaking');
        setVoiceResponse(text);
      }
    };
    
    utterance.onend = () => {
      if (isVoiceMode) {
        setVoiceState('listening');
        if (recognitionRef.current) {
          try {
            recognitionRef.current.start();
          } catch (e) {
            console.log("Failed to restart speech recognition: ", e);
          }
        }
      }
      if (onEndCallback) onEndCallback();
    };
    
    utterance.onerror = (e) => {
      console.error("Speech Synthesis Error:", e);
      if (isVoiceMode) {
        setVoiceState('listening');
        if (recognitionRef.current) {
          try { recognitionRef.current.start(); } catch (err) {}
        }
      }
    };
    
    window.speechSynthesis.speak(utterance);
  };

  const chatMutation = useMutation({
    mutationFn: (message: string) => backend.ai.chat({ message }),
    onSuccess: (data) => {
      const aiMessage: Message = {
        id: Date.now().toString(),
        content: data.response,
        isUser: false,
        timestamp: new Date(),
      };
      setMessages(prev => [...prev, aiMessage]);
      
      if (isVoiceMode || voiceSynthesized) {
        speakText(data.response);
      } else if (isVoiceMode) {
        setVoiceState('listening');
        if (recognitionRef.current) {
          try { recognitionRef.current.start(); } catch (err) {}
        }
      }
    },
    onError: (error) => {
      console.error('Chat error:', error);
      toast({
        title: "Error",
        description: "Failed to get AI response. Please try again.",
        variant: "destructive",
      });
      if (isVoiceMode) {
        setVoiceState('listening');
        if (recognitionRef.current) {
          try { recognitionRef.current.start(); } catch (err) {}
        }
      }
    },
  });

  // Setup Voice Mode Speech Recognition
  useEffect(() => {
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (SpeechRecognition) {
      const rec = new SpeechRecognition();
      rec.continuous = false;
      rec.interimResults = false;
      rec.lang = 'en-US';
      
      rec.onstart = () => {
        setVoiceState('listening');
        setVoiceTranscript('');
      };
      
      rec.onresult = (event: any) => {
        const transcript = event.results[0][0].transcript;
        setVoiceTranscript(transcript);
        setVoiceState('thinking');
        
        const userMsg: Message = {
          id: Date.now().toString(),
          content: transcript,
          isUser: true,
          timestamp: new Date(),
        };
        setMessages(prev => [...prev, userMsg]);
        chatMutation.mutate(transcript);
      };
      
      rec.onerror = (err: any) => {
        console.error("Speech Recognition Error:", err);
        // Don't toast on no-speech or aborted errors as they occur normally in voice flow
        if (err.error !== 'no-speech' && err.error !== 'aborted') {
          toast({
            title: "Voice Recognition Warning",
            description: `Voice engine encountered an error: ${err.error}. Reconnecting...`,
            variant: "destructive"
          });
        }
        setVoiceState('idle');
      };
      
      recognitionRef.current = rec;
    }
    
    return () => {
      if (recognitionRef.current) {
        recognitionRef.current.abort();
      }
      window.speechSynthesis.cancel();
    };
  }, []);

  const toggleVoiceMode = () => {
    window.speechSynthesis.cancel();
    if (recognitionRef.current) {
      recognitionRef.current.abort();
    }
    
    if (isVoiceMode) {
      setIsVoiceMode(false);
      setVoiceState('idle');
    } else {
      const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
      if (!SpeechRecognition) {
        toast({
          title: "Speech Recognition Unsupported",
          description: "Your browser does not support Speech Recognition. Please try Google Chrome.",
          variant: "destructive"
        });
        return;
      }
      setIsVoiceMode(true);
      setVoiceState('listening');
      setTimeout(() => {
        if (recognitionRef.current) {
          try {
            recognitionRef.current.start();
          } catch (e) {
            console.log("Error starting voice recognition: ", e);
          }
        }
      }, 300);
    }
  };

  const startVoiceLoop = () => {
    window.speechSynthesis.cancel();
    setVoiceState('listening');
    if (recognitionRef.current) {
      try {
        recognitionRef.current.start();
      } catch (e) {
        console.log("Error starting voice loop: ", e);
      }
    }
  };

  const stopVoiceLoop = () => {
    if (recognitionRef.current) {
      recognitionRef.current.abort();
    }
    window.speechSynthesis.cancel();
    setVoiceState('idle');
  };

  const startDictation = () => {
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRecognition) {
      toast({
        title: "Speech Recognition Unsupported",
        description: "Your browser does not support Speech Recognition. Please try Google Chrome.",
        variant: "destructive"
      });
      return;
    }
    
    window.speechSynthesis.cancel();
    const rec = new SpeechRecognition();
    rec.continuous = false;
    rec.interimResults = false;
    rec.lang = 'en-US';
    
    rec.onstart = () => {
      setIsDictating(true);
    };
    
    rec.onresult = (event: any) => {
      const transcript = event.results[0][0].transcript;
      setInputMessage(prev => prev ? `${prev} ${transcript}` : transcript);
    };
    
    rec.onend = () => {
      setIsDictating(false);
    };
    
    rec.onerror = (err: any) => {
      console.error("Dictation Error:", err);
      setIsDictating(false);
    };
    
    dictationRecognitionRef.current = rec;
    rec.start();
  };

  const stopDictation = () => {
    if (dictationRecognitionRef.current) {
      dictationRecognitionRef.current.stop();
    }
  };

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const handleSendMessage = () => {
    if (!inputMessage.trim() || chatMutation.isPending) return;

    const userMessage: Message = {
      id: Date.now().toString(),
      content: inputMessage,
      isUser: true,
      timestamp: new Date(),
    };

    setMessages(prev => [...prev, userMessage]);
    chatMutation.mutate(inputMessage);
    setInputMessage('');
  };

  const handleSuggestedQuestion = (question: string) => {
    setInputMessage(question);
  };

  return (
    <div className="max-w-4xl mx-auto px-4 py-8 h-[calc(100vh-12rem)] flex flex-col space-y-6">
      {/* Header with Mode Toggle */}
      <div className="flex flex-col sm:flex-row items-center justify-between gap-4 border-b border-slate-100 pb-4">
        <div className="flex items-center space-x-3 text-left">
          <div className="p-2.5 bg-gradient-to-r from-teal-500 to-green-500 rounded-xl text-white">
            <Sparkles className="h-5 w-5" />
          </div>
          <div>
            <h1 className="text-xl font-extrabold text-slate-800">SwipeRight AI Advisor</h1>
            <p className="text-slate-500 text-xs font-semibold">Your intelligent credit rewards strategist</p>
          </div>
        </div>

        <div className="flex items-center space-x-2 bg-slate-100 p-1.5 rounded-2xl border border-slate-200">
          <Button 
            onClick={() => isVoiceMode && toggleVoiceMode()} 
            className={`rounded-xl text-xs font-extrabold px-4 py-2 flex items-center space-x-1.5 border-0 shadow-none hover:bg-transparent ${
              !isVoiceMode 
                ? 'bg-white text-teal-600 shadow-sm' 
                : 'bg-transparent text-slate-600'
            }`}
          >
            <MessageSquare className="h-3.5 w-3.5" />
            <span>Standard Chat</span>
          </Button>
          <Button 
            onClick={() => !isVoiceMode && toggleVoiceMode()} 
            className={`rounded-xl text-xs font-extrabold px-4 py-2 flex items-center space-x-1.5 border-0 shadow-none hover:bg-transparent ${
              isVoiceMode 
                ? 'bg-slate-900 text-emerald-400 shadow-sm' 
                : 'bg-transparent text-slate-600'
            }`}
          >
            <Headphones className="h-3.5 w-3.5 animate-pulse" />
            <span>Voice Wingman</span>
          </Button>
        </div>
      </div>

      {/* Main Container */}
      {isVoiceMode ? (
        <div className="flex-1 bg-slate-950 rounded-3xl border border-slate-900 shadow-2xl relative overflow-hidden flex flex-col items-center justify-center p-8 text-center text-white">
          {/* Glowing backdrops */}
          <div className="absolute top-1/4 left-1/2 -translate-x-1/2 -translate-y-1/2 w-96 h-96 bg-emerald-500/10 rounded-full blur-3xl pointer-events-none" />
          
          <div className="absolute top-6 left-6 flex items-center space-x-2 bg-slate-900/60 backdrop-blur-md px-3.5 py-1.5 rounded-full border border-slate-800">
            <span className="flex h-2 w-2 relative">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
            </span>
            <span className="text-[10px] font-bold text-emerald-400 uppercase tracking-widest">Active Voice Wingman</span>
          </div>

          <button 
            onClick={toggleVoiceMode}
            className="absolute top-6 right-6 bg-white/10 hover:bg-white/20 transition-all rounded-full p-2.5 border border-white/10 flex items-center justify-center cursor-pointer text-white"
            title="Switch to Keyboard Chat"
          >
            <MessageSquare className="h-5 w-5" />
          </button>

          {/* Eleven Labs Glowing Green Spherical Orb */}
          <div className="relative w-64 h-64 flex items-center justify-center mb-10 mt-6 select-none">
            {/* Morphing Background Gradient Shell */}
            <div className={`absolute inset-0 rounded-full bg-gradient-to-tr from-emerald-500 via-teal-400 to-green-600 blur-xl opacity-40 scale-110 transition-all duration-700 ${
              voiceState === 'listening' 
                ? 'animate-orb-pulse opacity-50' 
                : voiceState === 'thinking' 
                ? 'animate-orb-thinking opacity-75 scale-95' 
                : voiceState === 'speaking' 
                ? 'animate-orb-speaking opacity-90 scale-105' 
                : 'animate-orb-pulse opacity-30'
            }`} />
            
            {/* Core Morphing Orb Body */}
            <div className={`w-48 h-48 rounded-full bg-gradient-to-tr from-emerald-600 via-teal-500 to-green-400 transition-all duration-700 shadow-[0_0_50px_rgba(16,185,129,0.4)] ${
              voiceState === 'listening' 
                ? 'animate-orb-pulse animate-orb-morph' 
                : voiceState === 'thinking' 
                ? 'animate-orb-thinking' 
                : voiceState === 'speaking' 
                ? 'animate-orb-speaking' 
                : 'animate-orb-pulse animate-orb-morph'
            }`} />

            {/* Micro-Soundwave Oscillators (speaking mode) */}
            {voiceState === 'speaking' && (
              <div className="absolute bottom-4 flex items-center justify-center space-x-1.5 h-12 w-full">
                {[0.4, 0.8, 1.2, 0.7, 0.3, 0.9, 0.5, 1.1, 0.6, 0.2].map((delay, index) => (
                  <div 
                    key={index} 
                    className="w-1.5 h-6 bg-white rounded-full animate-wave-bounce" 
                    style={{ animationDelay: `${delay}s`, transformOrigin: 'center' }}
                  />
                ))}
              </div>
            )}
          </div>

          <div className="space-y-4 max-w-md relative z-10">
            <h3 className="text-xl font-extrabold tracking-tight">
              {voiceState === 'listening' && "Listening for your question..."}
              {voiceState === 'thinking' && "Analyzing your wallet..."}
              {voiceState === 'speaking' && "SwipeRight Wingman speaking..."}
              {voiceState === 'idle' && "Tap Orb to Start Assistant"}
            </h3>
            
            <p className="text-slate-400 text-sm font-medium leading-relaxed min-h-[3rem] px-4 italic">
              {voiceState === 'listening' && (voiceTranscript || '"Where should I swipe my card for grocery shopping?"')}
              {voiceState === 'thinking' && "Finding matching cashback offers in database..."}
              {voiceState === 'speaking' && voiceResponse}
              {voiceState === 'idle' && "Ask your wingman: 'Where should I go for gas?' or 'What's the best dining card?'"}
            </p>

            <div className="flex justify-center gap-4 pt-4">
              <Button 
                onClick={voiceState === 'listening' ? stopVoiceLoop : startVoiceLoop} 
                className={`font-extrabold rounded-2xl px-6 py-5 border-0 shadow-lg flex items-center space-x-2 cursor-pointer transition-all duration-300 ${
                  voiceState === 'listening' 
                    ? 'bg-red-500 hover:bg-red-600 text-white' 
                    : 'bg-emerald-500 hover:bg-emerald-600 text-white animate-pulse'
                }`}
              >
                {voiceState === 'listening' ? (
                  <>
                    <VolumeX className="h-5 w-5" />
                    <span>Pause Listening</span>
                  </>
                ) : (
                  <>
                    <Mic className="h-5 w-5" />
                    <span>Start Voice Command</span>
                  </>
                )}
              </Button>
            </div>
          </div>
        </div>
      ) : (
        <>
          {/* Messages Container */}
          <div className="flex-1 overflow-y-auto space-y-4 pr-1">
            {messages.map((message) => (
              <MessageBubble key={message.id} message={message} onSpeak={speakText} />
            ))}
            
            {chatMutation.isPending && (
              <div className="flex items-start space-x-3">
                <div className="p-2.5 bg-teal-100 rounded-full">
                  <Bot className="h-5 w-5 text-teal-600" />
                </div>
                <Card className="flex-1 border-0 bg-gray-50 rounded-2xl">
                  <CardContent className="p-4">
                    <div className="flex items-center space-x-2">
                      <div className="flex space-x-1">
                        <div className="w-2 h-2 bg-teal-500 rounded-full animate-bounce"></div>
                        <div className="w-2 h-2 bg-teal-500 rounded-full animate-bounce" style={{ animationDelay: '0.1s' }}></div>
                        <div className="w-2 h-2 bg-teal-500 rounded-full animate-bounce" style={{ animationDelay: '0.2s' }}></div>
                      </div>
                      <span className="text-xs text-slate-500 font-bold uppercase tracking-wider">AI Advisor is computing...</span>
                    </div>
                  </CardContent>
                </Card>
              </div>
            )}
            
            <div ref={messagesEndRef} />
          </div>

          {/* Suggested Questions */}
          {messages.length === 1 && (
            <div className="space-y-2">
              <p className="text-xs text-slate-500 font-bold uppercase tracking-wider">Try asking:</p>
              <div className="flex flex-wrap gap-2">
                {suggestedQuestions.map((question, index) => (
                  <Button
                    key={index}
                    variant="outline"
                    size="sm"
                    onClick={() => handleSuggestedQuestion(question)}
                    className="text-left hover:bg-teal-50 hover:border-teal-300 font-semibold rounded-xl text-xs py-2"
                  >
                    {question}
                  </Button>
                ))}
              </div>
            </div>
          )}

          {/* Input Box */}
          <div className="flex items-center space-x-2 bg-white border border-slate-200 p-2 rounded-2xl shadow-sm focus-within:ring-2 focus-within:ring-teal-500/20 focus-within:border-teal-500 transition-all">
            <Button 
              onClick={isDictating ? stopDictation : startDictation} 
              className={`p-2.5 rounded-xl border-0 shadow-none cursor-pointer flex items-center justify-center ${
                isDictating 
                  ? 'bg-red-500 text-white hover:bg-red-600' 
                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
              }`}
              title="Dictate message"
            >
              {isDictating ? <MicOff className="h-4 w-4" /> : <Mic className="h-4 w-4" />}
            </Button>
            
            <Input
              placeholder={isDictating ? "Listening..." : "Ask about credit cards, cashback strategies, or benefits..."}
              value={inputMessage}
              onChange={(e) => setInputMessage(e.target.value)}
              onKeyPress={(e) => e.key === 'Enter' && handleSendMessage()}
              disabled={chatMutation.isPending}
              className="flex-1 border-0 focus-visible:ring-0 focus-visible:ring-offset-0 px-2 text-sm shadow-none"
            />
            
            <Button 
              onClick={() => setVoiceSynthesized(prev => !prev)} 
              className={`p-2.5 rounded-xl border-0 shadow-none cursor-pointer flex items-center justify-center ${
                voiceSynthesized 
                  ? 'bg-teal-50 text-teal-600 hover:bg-teal-100' 
                  : 'bg-slate-50 text-slate-400 hover:bg-slate-100'
              }`}
              title="Speech Synthesis Switch"
            >
              {voiceSynthesized ? <Volume2 className="h-4 w-4" /> : <VolumeX className="h-4 w-4" />}
            </Button>

            <Button 
              onClick={handleSendMessage}
              disabled={!inputMessage.trim() || chatMutation.isPending}
              className="bg-teal-500 hover:bg-teal-600 text-white font-bold p-3 rounded-xl border-0"
            >
              <Send className="h-4 w-4" />
            </Button>
          </div>
        </>
      )}
    </div>
  );
}

function MessageBubble({ 
  message, 
  onSpeak 
}: { 
  message: Message; 
  onSpeak: (text: string, onEndCallback?: () => void) => void;
}) {
  const [isSpeaking, setIsSpeaking] = useState(false);

  const handleSpeakClick = () => {
    if (isSpeaking) {
      window.speechSynthesis.cancel();
      setIsSpeaking(false);
    } else {
      setIsSpeaking(true);
      onSpeak(message.content, () => setIsSpeaking(false));
    }
  };

  return (
    <div className={`flex items-start space-x-3 ${message.isUser ? 'flex-row-reverse space-x-reverse' : ''} relative group`}>
      <div className={`p-2.5 rounded-full shadow-sm ${
        message.isUser 
          ? 'bg-teal-500 text-white' 
          : 'bg-teal-100 text-teal-600'
      }`}>
        {message.isUser ? <User className="h-5 w-5" /> : <Bot className="h-5 w-5" />}
      </div>
      
      <Card className={`flex-1 max-w-[80%] border-0 relative ${
        message.isUser 
          ? 'bg-teal-500 text-white shadow-md rounded-2xl rounded-tr-none' 
          : 'bg-slate-50 shadow-sm rounded-2xl rounded-tl-none border border-slate-100'
      }`}>
        <CardContent className="p-4 pr-10">
          <p className="text-sm leading-relaxed whitespace-pre-wrap">
            {message.content}
          </p>
          <p className={`text-[10px] mt-2 font-bold uppercase ${
            message.isUser ? 'text-teal-100' : 'text-slate-400'
          }`}>
            {message.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
          </p>
          
          {!message.isUser && (
            <button 
              onClick={handleSpeakClick} 
              className={`absolute bottom-3 right-3 transition-all p-1.5 rounded-lg border cursor-pointer ${
                isSpeaking 
                  ? 'bg-emerald-500 text-white border-emerald-500 shadow-md animate-pulse' 
                  : 'bg-white hover:bg-slate-100 text-slate-400 hover:text-teal-600 border-slate-100 shadow-sm'
              }`}
              title={isSpeaking ? "Stop Speaking" : "Speak Aloud"}
            >
              {isSpeaking ? <VolumeX className="h-3.5 w-3.5" /> : <Volume2 className="h-3.5 w-3.5" />}
            </button>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
