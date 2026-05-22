import React, { useState, useRef, useEffect, useCallback } from 'react';
import { useMutation } from '@tanstack/react-query';
import { Mic, MicOff, Send, Volume2, VolumeX, MessageSquare, ChevronDown, X, Loader2 } from 'lucide-react';
import backend from '~backend/client';
import { useToast } from '@/components/ui/use-toast';
import { useAuth } from '../contexts/AuthContext';

type Mode = 'speech-to-speech' | 'text-to-speech' | 'speech-to-text';

interface Message {
  id: string;
  content: string;
  isUser: boolean;
  timestamp: Date;
  isAudio?: boolean;
}

const MODE_CONFIG = {
  'speech-to-speech': {
    label: 'Speech to Speech',
    description: 'Speak and hear the response',
    icon: '🎙️',
  },
  'text-to-speech': {
    label: 'Text to Speech',
    description: 'Type and hear the response',
    icon: '⌨️',
  },
  'speech-to-text': {
    label: 'Speech to Text',
    description: 'Speak and read the response',
    icon: '📝',
  },
};

export default function AIChat() {
  const [mode, setMode] = useState<Mode>('text-to-speech');
  const [showModeMenu, setShowModeMenu] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [inputText, setInputText] = useState('');
  const [isRecording, setIsRecording] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [isThinking, setIsThinking] = useState(false);
  const [isProcessingVoice, setIsProcessingVoice] = useState(false);
  const [transcript, setTranscript] = useState('');
  const [audioLevel, setAudioLevel] = useState(0);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const currentAudioRef = useRef<HTMLAudioElement | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const animFrameRef = useRef<number>(0);
  const inputRef = useRef<HTMLInputElement>(null);

  // Browser Web Speech API references
  const recognitionRef = useRef<any>(null);
  const localStreamRef = useRef<MediaStream | null>(null);
  const localAudioCtxRef = useRef<AudioContext | null>(null);

  const { user } = useAuth();
  const { toast } = useToast();

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Handle cleanup on unmount
  useEffect(() => {
    return () => {
      if (currentAudioRef.current) {
        currentAudioRef.current.pause();
      }
      if ('speechSynthesis' in window) {
        window.speechSynthesis.cancel();
      }
      if (recognitionRef.current) {
        recognitionRef.current.stop();
      }
      if (localStreamRef.current) {
        localStreamRef.current.getTracks().forEach(t => t.stop());
      }
      if (localAudioCtxRef.current) {
        localAudioCtxRef.current.close();
      }
      cancelAnimationFrame(animFrameRef.current);
    };
  }, []);

  const stopAudio = useCallback(() => {
    if (currentAudioRef.current) {
      currentAudioRef.current.pause();
      currentAudioRef.current = null;
    }
    if ('speechSynthesis' in window) {
      window.speechSynthesis.cancel();
    }
    setIsSpeaking(false);
  }, []);

  // Premium local text-to-speech fallback using SpeechSynthesis
  const speakWithLocalFallback = (text: string) => {
    if ('speechSynthesis' in window) {
      window.speechSynthesis.cancel();
      
      const utterance = new SpeechSynthesisUtterance(text);
      const voices = window.speechSynthesis.getVoices();
      
      // Match high quality natural English voice
      const preferredVoice = voices.find(voice => 
        voice.lang.includes('en-US') && (
          voice.name.includes('Google') || 
          voice.name.includes('Natural') || 
          voice.name.includes('Samantha') ||
          voice.name.includes('Microsoft Aria')
        )
      ) || voices.find(voice => voice.lang.startsWith('en'));
      
      if (preferredVoice) {
        utterance.voice = preferredVoice;
      }
      
      utterance.rate = 1.05;
      utterance.pitch = 1.0;
      
      utterance.onstart = () => {
        setIsSpeaking(true);
      };
      
      utterance.onend = () => {
        setIsSpeaking(false);
      };
      
      utterance.onerror = (e) => {
        console.error('Local SpeechSynthesis Error:', e);
        setIsSpeaking(false);
      };
      
      window.speechSynthesis.speak(utterance);
    } else {
      setIsSpeaking(false);
      toast({ title: "Speech Synthesis not supported", description: "Your browser doesn't support offline TTS playback.", variant: "destructive" });
    }
  };

  const ttsMutation = useMutation({
    mutationFn: (text: string) => backend.ai.textToSpeech({ text }),
    onSuccess: (data) => {
      // If backend returns empty/error indicators, use local fallback
      if (!data || !data.audioBase64) {
        speakWithLocalFallback(ttsMutation.variables || '');
        return;
      }
      const audio = new Audio(`data:${data.mimeType};base64,${data.audioBase64}`);
      currentAudioRef.current = audio;
      setIsSpeaking(true);
      audio.play().catch(err => {
        console.warn("Audio autoplay blocked or failed, using Web Speech Synthesis:", err);
        speakWithLocalFallback(ttsMutation.variables || '');
      });
      audio.onended = () => { setIsSpeaking(false); currentAudioRef.current = null; };
      audio.onerror = () => { speakWithLocalFallback(ttsMutation.variables || ''); };
    },
    onError: (err) => {
      console.warn("Backend ElevenLabs TTS failed or unconfigured. Falling back to high-fidelity local browser SpeechSynthesis.");
      speakWithLocalFallback(ttsMutation.variables || '');
    },
  });

  const chatMutation = useMutation({
    mutationFn: (msg: string) => backend.ai.chat({ message: msg, userId: user?.userId }),
    onSuccess: (data) => {
      setIsThinking(false);
      const aiMsg: Message = {
        id: Date.now().toString(),
        content: data.response,
        isUser: false,
        timestamp: new Date(),
      };
      setMessages(prev => [...prev, aiMsg]);
      if (mode === 'speech-to-speech' || mode === 'text-to-speech') {
        ttsMutation.mutate(data.response);
      }
    },
    onError: () => {
      setIsThinking(false);
      // Premium offline fallback chatbot logic in case AI endpoint fails or API key is missing
      const userText = chatMutation.variables || '';
      let replyText = "I'm SwipeRight's local card assistant. To get precise card recommendations, make sure your Gemini API key is configured. ";
      
      const lower = userText.toLowerCase();
      if (lower.includes('grocery') || lower.includes('groceries')) {
        replyText += "From your wallet, American Express Blue Cash Preferred is excellent (6% back at supermarkets), or Chase Freedom Flex if it is a rotating 5% category.";
      } else if (lower.includes('gas')) {
        replyText += "For gas stations, the Citi Premier Card gives 3x points, and Discover it Cash Back gives 5% rotating cashback during gas quarters.";
      } else if (lower.includes('debit')) {
        replyText += "Discover Cashback Debit is your best debit card, offering a solid 1% cash back on all purchases up to $3,000 monthly!";
      } else if (lower.includes('dining') || lower.includes('restaurant')) {
        replyText += "For restaurants, use your American Express Gold Card for 4x points, or Chase Sapphire Reserve for 3x points.";
      } else {
        replyText += "Try swiping a card like the Wells Fargo Active Cash for 2% flat rate cash back on everyday purchases!";
      }

      const aiMsg: Message = {
        id: Date.now().toString(),
        content: replyText,
        isUser: false,
        timestamp: new Date(),
      };
      setMessages(prev => [...prev, aiMsg]);
      if (mode === 'speech-to-speech' || mode === 'text-to-speech') {
        ttsMutation.mutate(replyText);
      }
    },
  });

  const sendMessage = useCallback((text: string) => {
    if (!text.trim()) return;
    const userMsg: Message = {
      id: Date.now().toString(),
      content: text,
      isUser: true,
      timestamp: new Date(),
    };
    setMessages(prev => [...prev, userMsg]);
    setIsThinking(true);
    chatMutation.mutate(text);
    setInputText('');
    setTranscript('');
  }, [chatMutation]);

  const startRecording = async () => {
    try {
      stopAudio();
      
      const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
      if (SpeechRecognition) {
        // High fidelity online/offline browser-native Speech Recognition
        const recognition = new SpeechRecognition();
        recognition.continuous = true;
        recognition.interimResults = true;
        recognition.lang = 'en-US';
        
        recognition.onstart = () => {
          setIsRecording(true);
          setTranscript('');
        };
        
        recognition.onresult = (event: any) => {
          let interimTranscript = '';
          let finalTranscript = '';
          
          for (let i = event.resultIndex; i < event.results.length; ++i) {
            if (event.results[i].isFinal) {
              finalTranscript += event.results[i][0].transcript;
            } else {
              interimTranscript += event.results[i][0].transcript;
            }
          }
          
          const currentText = finalTranscript || interimTranscript;
          setTranscript(currentText);
        };
        
        recognition.onerror = (event: any) => {
          console.error("Speech recognition error:", event.error);
          if (event.error === 'not-allowed') {
            toast({ title: "Microphone access denied", variant: "destructive" });
            setIsRecording(false);
          }
        };
        
        recognition.onend = () => {
          setIsRecording(false);
        };
        
        recognitionRef.current = recognition;
        recognition.start();
        
        // Setup premium audio level visualizer
        try {
          const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
          const audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
          const source = audioCtx.createMediaStreamSource(stream);
          const analyser = audioCtx.createAnalyser();
          analyser.fftSize = 64;
          source.connect(analyser);
          analyserRef.current = analyser;
          
          const tick = () => {
            const data = new Uint8Array(analyser.frequencyBinCount);
            analyser.getByteFrequencyData(data);
            const avg = data.reduce((a, b) => a + b, 0) / data.length;
            setAudioLevel(avg / 128);
            animFrameRef.current = requestAnimationFrame(tick);
          };
          tick();
          
          localStreamRef.current = stream;
          localAudioCtxRef.current = audioCtx;
        } catch (e) {
          console.warn("Could not start visualizer stream:", e);
        }
      } else {
        // Fallback to legacy server-side transcription using local audio recorder
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        audioChunksRef.current = [];

        const audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
        const source = audioCtx.createMediaStreamSource(stream);
        const analyser = audioCtx.createAnalyser();
        analyser.fftSize = 64;
        source.connect(analyser);
        analyserRef.current = analyser;

        const tick = () => {
          const data = new Uint8Array(analyser.frequencyBinCount);
          analyser.getByteFrequencyData(data);
          const avg = data.reduce((a, b) => a + b, 0) / data.length;
          setAudioLevel(avg / 128);
          animFrameRef.current = requestAnimationFrame(tick);
        };
        tick();

        const mimeType = MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
          ? 'audio/webm;codecs=opus'
          : MediaRecorder.isTypeSupported('audio/webm') ? 'audio/webm' : 'audio/mp4';

        const recorder = new MediaRecorder(stream, { mimeType });
        mediaRecorderRef.current = recorder;

        recorder.ondataavailable = (e) => { if (e.data.size > 0) audioChunksRef.current.push(e.data); };
        recorder.onstop = async () => {
          cancelAnimationFrame(animFrameRef.current);
          setAudioLevel(0);
          stream.getTracks().forEach(t => t.stop());
          audioCtx.close();
          setIsProcessingVoice(true);
          const blob = new Blob(audioChunksRef.current, { type: mimeType });
          const reader = new FileReader();
          reader.onloadend = () => {
            const base64 = (reader.result as string).split(',')[1];
            sttMutation.mutate({ audioBase64: base64, mimeType });
          };
          reader.readAsDataURL(blob);
        };

        recorder.start();
        setIsRecording(true);
      }
    } catch (e) {
      toast({ title: "Microphone access denied", variant: "destructive" });
    }
  };

  const stopRecording = () => {
    if (recognitionRef.current) {
      recognitionRef.current.stop();
      recognitionRef.current = null;
      
      cancelAnimationFrame(animFrameRef.current);
      setAudioLevel(0);
      
      if (localStreamRef.current) {
        localStreamRef.current.getTracks().forEach(t => t.stop());
        localStreamRef.current = null;
      }
      if (localAudioCtxRef.current) {
        localAudioCtxRef.current.close();
        localAudioCtxRef.current = null;
      }
      
      setIsRecording(false);
      
      if (transcript.trim()) {
        sendMessage(transcript);
      } else {
        toast({ title: "No speech detected", description: "Please speak clearly or type your question.", variant: "destructive" });
      }
    } else if (mediaRecorderRef.current) {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
    }
  };

  const sttMutation = useMutation({
    mutationFn: (d: { audioBase64: string; mimeType: string }) => backend.ai.speechToText(d),
    onSuccess: (data) => {
      setIsProcessingVoice(false);
      if (data.transcript.trim()) {
        setTranscript(data.transcript);
        if (mode === 'speech-to-speech') {
          sendMessage(data.transcript);
        } else {
          setInputText(data.transcript);
        }
      } else {
        toast({ title: "No speech detected", description: "Please try again.", variant: "destructive" });
      }
    },
    onError: () => {
      setIsProcessingVoice(false);
      // Fallback transcription in case backend ElevenLabs SpeechToText fails
      if (transcript.trim()) {
        sendMessage(transcript);
      } else {
        toast({ title: "Speech recognition unavailable", description: "Please type your message instead.", variant: "destructive" });
      }
    },
  });

  const isActive = isRecording || isSpeaking || isThinking || isProcessingVoice;
  const sphereState: 'idle' | 'listening' | 'thinking' | 'speaking' = isRecording || isProcessingVoice
    ? 'listening'
    : isThinking
      ? 'thinking'
      : isSpeaking
        ? 'speaking'
        : 'idle';

  return (
    <div className="fixed inset-0 bg-black flex flex-col overflow-hidden" style={{ top: '64px', bottom: '68px' }}>
      {/* Background Orbs updated to Cyan/Teal/Blue */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-[-20%] left-[-10%] w-[60vw] h-[60vw] rounded-full opacity-20"
          style={{ background: 'radial-gradient(circle, #0ea5e9 0%, transparent 70%)', filter: 'blur(80px)' }} />
        <div className="absolute bottom-[-20%] right-[-10%] w-[50vw] h-[50vw] rounded-full opacity-15"
          style={{ background: 'radial-gradient(circle, #2dd4bf 0%, transparent 70%)', filter: 'blur(80px)' }} />
        <div className="absolute top-[40%] right-[20%] w-[30vw] h-[30vw] rounded-full opacity-10"
          style={{ background: 'radial-gradient(circle, #3b82f6 0%, transparent 70%)', filter: 'blur(60px)' }} />
      </div>

      <div className="relative z-10 flex flex-col h-full">
        <div className="flex items-center justify-between px-4 py-3 border-b border-white/5 bg-black/40 backdrop-blur-md">
          <div className="flex items-center gap-3">
            <div className="w-2.5 h-2.5 rounded-full bg-cyan-400 shadow-lg" style={{ boxShadow: '0 0 10px #22d3ee' }} />
            <span className="text-white/80 text-sm font-semibold tracking-wider">SwipeRight Voice Advisor</span>
          </div>
          <button
            onClick={() => setShowModeMenu(v => !v)}
            className="flex items-center gap-2 px-3.5 py-1.5 rounded-full border border-cyan-500/30 bg-cyan-950/20 hover:bg-cyan-900/30 hover:border-cyan-400/50 transition-all text-cyan-300 text-xs font-semibold"
          >
            <span>{MODE_CONFIG[mode].icon}</span>
            <span>{MODE_CONFIG[mode].label}</span>
            <ChevronDown className={`w-3.5 h-3.5 transition-transform ${showModeMenu ? 'rotate-180' : ''}`} />
          </button>

          {showModeMenu && (
            <div className="absolute top-14 right-4 z-50 w-64 rounded-2xl border border-white/10 overflow-hidden"
              style={{ background: 'rgba(10,10,10,0.95)', backdropFilter: 'blur(20px)' }}>
              {(Object.entries(MODE_CONFIG) as [Mode, typeof MODE_CONFIG[Mode]][]).map(([key, cfg]) => (
                <button key={key} onClick={() => { setMode(key as Mode); setShowModeMenu(false); stopAudio(); }}
                  className={`w-full flex items-start gap-3 px-4 py-3 text-left hover:bg-white/5 transition-colors ${mode === key ? 'bg-cyan-950/30' : ''}`}>
                  <span className="text-lg mt-0.5">{cfg.icon}</span>
                  <div>
                    <div className={`text-sm font-semibold ${mode === key ? 'text-cyan-400' : 'text-white/70'}`}>{cfg.label}</div>
                    <div className="text-xs text-white/40 mt-0.5">{cfg.description}</div>
                  </div>
                  {mode === key && <div className="ml-auto w-1.5 h-1.5 rounded-full bg-cyan-400 mt-1.5 shrink-0 animate-pulse" />}
                </button>
              ))}
            </div>
          )}
        </div>

        {mode === 'speech-to-speech' ? (
          <SphereChatInterface
            sphereState={sphereState}
            isRecording={isRecording}
            isSpeaking={isSpeaking}
            isThinking={isThinking}
            isProcessingVoice={isProcessingVoice}
            audioLevel={audioLevel}
            transcript={transcript}
            messages={messages}
            onStartRecording={startRecording}
            onStopRecording={stopRecording}
            onStopAudio={stopAudio}
          />
        ) : (
          <TextChatInterface
            mode={mode}
            messages={messages}
            inputText={inputText}
            setInputText={setInputText}
            inputRef={inputRef}
            messagesEndRef={messagesEndRef}
            isThinking={isThinking}
            isProcessingVoice={isProcessingVoice}
            isRecording={isRecording}
            isSpeaking={isSpeaking}
            audioLevel={audioLevel}
            onSend={() => sendMessage(inputText)}
            onStartRecording={startRecording}
            onStopRecording={stopRecording}
            onStopAudio={stopAudio}
          />
        )}
      </div>

      {showModeMenu && (
        <div className="fixed inset-0 z-40" onClick={() => setShowModeMenu(false)} />
      )}

      <style>{`
        @keyframes sphere-pulse {
          0%, 100% { transform: scale(1); opacity: 0.9; }
          50% { transform: scale(1.05); opacity: 1; }
        }
        @keyframes sphere-listen {
          0%, 100% { transform: scale(1); }
          50% { transform: scale(1.08); }
        }
        @keyframes sphere-speak {
          0%, 100% { transform: scale(1) rotate(0deg); }
          25% { transform: scale(1.06) rotate(1deg); }
          75% { transform: scale(1.04) rotate(-1deg); }
        }
        @keyframes ring-expand {
          0% { transform: scale(1); opacity: 0.6; }
          100% { transform: scale(1.8); opacity: 0; }
        }
        @keyframes float {
          0%, 100% { transform: translateY(0px); }
          50% { transform: translateY(-8px); }
        }
        @keyframes wave-bar {
          0%, 100% { transform: scaleY(0.3); }
          50% { transform: scaleY(1); }
        }
        @keyframes fade-up {
          from { opacity: 0; transform: translateY(8px); }
          to { opacity: 1; transform: translateY(0); }
        }
        @keyframes shimmer-sweep {
          0% { background-position: 200% 0; }
          100% { background-position: -200% 0; }
        }
      `}</style>
    </div>
  );
}

interface SphereProps {
  sphereState: 'idle' | 'listening' | 'thinking' | 'speaking';
  isRecording: boolean;
  isSpeaking: boolean;
  isThinking: boolean;
  isProcessingVoice: boolean;
  audioLevel: number;
  transcript: string;
  messages: Message[];
  onStartRecording: () => void;
  onStopRecording: () => void;
  onStopAudio: () => void;
}

function SphereChatInterface({
  sphereState, isRecording, isSpeaking, isThinking, isProcessingVoice,
  audioLevel, transcript, messages, onStartRecording, onStopRecording, onStopAudio
}: SphereProps) {
  const lastAiMsg = [...messages].reverse().find(m => !m.isUser);
  const lastUserMsg = [...messages].reverse().find(m => m.isUser);

  // premium custom cyan visual styles
  const sphereColors = {
    idle: ['#22d3ee', '#0ea5e9', '#1e40af'],      // Cyan -> Sky Blue -> Deep Blue
    listening: ['#67e8f9', '#2dd4bf', '#1d4ed8'], // Light Cyan -> Teal -> Blue
    thinking: ['#93c5fd', '#34d399', '#2563eb'],  // Soft Blue -> Emerald -> Royal
    speaking: ['#a7f3d0', '#22d3ee', '#3b82f6'],  // Light Green -> Cyan -> Bright Blue
  };
  const colors = sphereColors[sphereState];
  const pulseScale = 1 + audioLevel * 0.3;

  const statusLabel = {
    idle: 'Tap to speak',
    listening: 'Listening...',
    thinking: 'Thinking...',
    speaking: 'Speaking...',
  }[sphereState];

  return (
    <div className="flex-1 flex flex-col items-center justify-between py-6 px-4 overflow-hidden">
      <div className="flex-1 flex flex-col items-center justify-center w-full max-w-sm gap-8">
        <div className="relative flex items-center justify-center" style={{ width: 220, height: 220 }}>
          {(sphereState === 'listening' || sphereState === 'speaking') && (
            <>
              <div className="absolute inset-0 rounded-full animate-ping opacity-20"
                style={{ background: `radial-gradient(circle, ${colors[0]}, transparent)`, animationDuration: '1.5s' }} />
              <div className="absolute inset-0 rounded-full opacity-15"
                style={{ background: `radial-gradient(circle, ${colors[0]}, transparent)`,
                  animation: 'ring-expand 2s ease-out infinite', transform: 'scale(1.2)' }} />
            </>
          )}

          <div
            className="relative rounded-full cursor-pointer select-none transition-transform duration-150 overflow-hidden"
            style={{
              width: 180,
              height: 180,
              transform: `scale(${isRecording ? pulseScale : 1})`,
              animation: sphereState === 'idle' ? 'float 4s ease-in-out infinite' :
                sphereState === 'thinking' ? 'sphere-pulse 1.2s ease-in-out infinite' :
                sphereState === 'speaking' ? 'sphere-speak 0.8s ease-in-out infinite' : 'none',
              background: `radial-gradient(circle at 35% 30%, ${colors[0]}cc, ${colors[1]} 60%, ${colors[2]} 100%)`,
              boxShadow: `0 0 60px ${colors[0]}66, 0 0 120px ${colors[0]}33, inset 0 1px 0 rgba(255,255,255,0.4)`,
            }}
            onClick={() => {
              if (isSpeaking) onStopAudio();
              else if (isRecording) onStopRecording();
              else if (!isThinking && !isProcessingVoice) onStartRecording();
            }}
          >
            {/* Shimmer Overlay */}
            <div className="absolute inset-0 opacity-40 mix-blend-overlay pointer-events-none"
              style={{
                background: 'linear-gradient(60deg, transparent 20%, rgba(255,255,255,0.7) 40%, rgba(255,255,255,0.9) 50%, rgba(255,255,255,0.7) 60%, transparent 80%)',
                backgroundSize: '200% 200%',
                animation: 'shimmer-sweep 4s linear infinite',
              }} />

            {/* Inner highlights */}
            <div className="absolute inset-0 rounded-full"
              style={{ background: 'radial-gradient(circle at 30% 25%, rgba(255,255,255,0.4) 0%, transparent 55%)' }} />
            <div className="absolute inset-0 rounded-full"
              style={{ background: 'radial-gradient(circle at 70% 80%, rgba(0,0,0,0.3) 0%, transparent 50%)' }} />

            <div className="absolute inset-0 flex items-center justify-center">
              {isProcessingVoice || isThinking ? (
                <Loader2 className="w-10 h-10 text-white/90 animate-spin drop-shadow-md" />
              ) : isRecording ? (
                <div className="flex items-end gap-1 h-10">
                  {[0.4, 0.7, 1, 0.8, 0.5, 0.9, 0.6].map((h, i) => (
                    <div key={i} className="w-1.5 rounded-full bg-white drop-shadow-md"
                      style={{
                        height: `${Math.max(6, (h + audioLevel * 0.5) * 32)}px`,
                        animation: `wave-bar ${0.6 + i * 0.1}s ease-in-out infinite`,
                        animationDelay: `${i * 0.08}s`,
                      }} />
                  ))}
                </div>
              ) : isSpeaking ? (
                <div className="flex items-end gap-1 h-10">
                  {[0.5, 0.9, 0.7, 1, 0.6, 0.8, 0.4].map((h, i) => (
                    <div key={i} className="w-1.5 rounded-full bg-white drop-shadow-md"
                      style={{
                        height: `${h * 32}px`,
                        animation: `wave-bar ${0.5 + i * 0.07}s ease-in-out infinite`,
                        animationDelay: `${i * 0.06}s`,
                      }} />
                  ))}
                </div>
              ) : (
                <Mic className="w-10 h-10 text-white/90 drop-shadow-md" />
              )}
            </div>
          </div>
        </div>

        <div className="text-center space-y-1" style={{ animation: 'fade-up 0.3s ease-out' }}>
          <p className="text-cyan-400 text-sm font-semibold tracking-widest uppercase">{statusLabel}</p>
          {(isRecording || isProcessingVoice) && transcript && (
            <p className="text-white/80 text-base max-w-xs text-center italic mt-2">"{transcript}"</p>
          )}
        </div>

        <div className="w-full max-w-xs space-y-3">
          {lastUserMsg && (
            <div className="rounded-2xl px-4 py-3 ml-8"
              style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.08)', animation: 'fade-up 0.3s ease-out' }}>
              <p className="text-xs text-white/40 mb-1">You</p>
              <p className="text-sm text-white/70 line-clamp-3">{lastUserMsg.content}</p>
            </div>
          )}
          {lastAiMsg && !isThinking && (
            <div className="rounded-2xl px-4 py-3 mr-8 animate-pulse"
              style={{ background: 'rgba(14,165,233,0.12)', border: '1px solid rgba(14,165,233,0.2)', animation: 'fade-up 0.3s ease-out' }}>
              <p className="text-xs text-cyan-400/70 mb-1">SwipeRight AI</p>
              <p className="text-sm text-white/80 line-clamp-4">{lastAiMsg.content}</p>
            </div>
          )}
          {isThinking && (
            <div className="rounded-2xl px-4 py-3 mr-8"
              style={{ background: 'rgba(14,165,233,0.08)', border: '1px solid rgba(14,165,233,0.15)' }}>
              <p className="text-xs text-cyan-400/70 mb-2 font-semibold">SwipeRight AI</p>
              <div className="flex gap-1.5">
                {[0, 1, 2].map(i => (
                  <div key={i} className="w-1.5 h-1.5 rounded-full bg-cyan-400"
                    style={{ animation: `sphere-pulse 1s ease-in-out infinite`, animationDelay: `${i * 0.2}s` }} />
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      <div className="flex items-center gap-2 text-white/20 text-xs">
        <span>Tap sphere to speak</span>
        <span>·</span>
        <span>Tap again to stop</span>
      </div>
    </div>
  );
}

interface TextChatProps {
  mode: Mode;
  messages: Message[];
  inputText: string;
  setInputText: (v: string) => void;
  inputRef: React.RefObject<HTMLInputElement | null>;
  messagesEndRef: React.RefObject<HTMLDivElement | null>;
  isThinking: boolean;
  isProcessingVoice: boolean;
  isRecording: boolean;
  isSpeaking: boolean;
  audioLevel: number;
  onSend: () => void;
  onStartRecording: () => void;
  onStopRecording: () => void;
  onStopAudio: () => void;
}

function TextChatInterface({
  mode, messages, inputText, setInputText, inputRef, messagesEndRef,
  isThinking, isProcessingVoice, isRecording, isSpeaking, audioLevel,
  onSend, onStartRecording, onStopRecording, onStopAudio,
}: TextChatProps) {
  const showMic = mode === 'speech-to-text';
  const showInput = mode === 'text-to-speech' || mode === 'speech-to-text';
  const isEmpty = messages.length === 0;

  const suggested = [
    "Groceries best cashback card?",
    "Discover Debit Card cashback rate?",
    "Best overall card for general purchases?",
    "Which card to swipe at gas stations?",
  ];

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4 scrollbar-hide">
        {isEmpty && (
          <div className="flex flex-col items-center justify-center h-full gap-6 py-8">
            <div className="text-center space-y-2">
              <div className="text-4xl mb-3">{MODE_CONFIG[mode].icon}</div>
              <h2 className="text-white font-semibold text-lg">SwipeRight AI Chat</h2>
              <p className="text-white/40 text-sm max-w-xs">{MODE_CONFIG[mode].description} — ask about credit/debit rewards</p>
            </div>
            <div className="flex flex-wrap gap-2 justify-center max-w-sm">
              {suggested.map((q, i) => (
                <button key={i} onClick={() => setInputText(q)}
                  className="px-3.5 py-2 rounded-full text-xs text-cyan-300 hover:text-white hover:bg-cyan-900/30 transition-all border border-cyan-800/30"
                  style={{ background: 'rgba(255,255,255,0.02)' }}>
                  {q}
                </button>
              ))}
            </div>
          </div>
        )}

        {messages.map(msg => (
          <div key={msg.id}
            className={`flex ${msg.isUser ? 'justify-end' : 'justify-start'}`}
            style={{ animation: 'fade-up 0.25s ease-out' }}>
            <div className={`max-w-[80%] rounded-2xl px-4 py-3 ${msg.isUser ? 'rounded-br-sm' : 'rounded-bl-sm'}`}
              style={msg.isUser
                ? { background: 'rgba(20,184,166,0.25)', border: '1px solid rgba(20,184,166,0.3)' } // Teal for User
                : { background: 'rgba(14,165,233,0.12)', border: '1px solid rgba(14,165,233,0.2)' } // Sky Blue for AI
              }>
              {!msg.isUser && (
                <p className="text-xs text-cyan-400 mb-1.5 font-semibold">SwipeRight AI</p>
              )}
              <p className="text-sm text-white/85 leading-relaxed whitespace-pre-wrap">{msg.content}</p>
              <p className="text-xs text-white/30 mt-1.5">
                {msg.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
              </p>
            </div>
          </div>
        ))}

        {(isThinking || isProcessingVoice) && (
          <div className="flex justify-start" style={{ animation: 'fade-up 0.25s ease-out' }}>
            <div className="rounded-2xl rounded-bl-sm px-4 py-3"
              style={{ background: 'rgba(14,165,233,0.08)', border: '1px solid rgba(14,165,233,0.15)' }}>
              <p className="text-xs text-cyan-400 mb-2 font-semibold">SwipeRight AI</p>
              <div className="flex gap-1.5 items-center">
                {isProcessingVoice ? (
                  <>
                    <Loader2 className="w-3 h-3 text-cyan-400 animate-spin" />
                    <span className="text-xs text-cyan-400/60">Processing speech...</span>
                  </>
                ) : (
                  [0, 1, 2].map(i => (
                    <div key={i} className="w-2 h-2 rounded-full bg-cyan-400/60"
                      style={{ animation: 'sphere-pulse 1s ease-in-out infinite', animationDelay: `${i * 0.18}s` }} />
                  ))
                )}
              </div>
            </div>
          </div>
        )}

        {isSpeaking && (
          <div className="flex justify-center">
            <button onClick={onStopAudio}
              className="flex items-center gap-2 px-4 py-2 rounded-full text-xs text-cyan-400 hover:text-cyan-300 transition-all shadow-md"
              style={{ background: 'rgba(14,165,233,0.15)', border: '1px solid rgba(14,165,233,0.3)' }}>
              <Volume2 className="w-3.5 h-3.5 animate-pulse" />
              <span>Speaking — tap to stop</span>
              <X className="w-3 h-3" />
            </button>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      <div className="px-4 pb-3 pt-2 bg-black/60 backdrop-blur-md" style={{ borderTop: '1px solid rgba(255,255,255,0.05)' }}>
        <div className="flex items-center gap-2 rounded-2xl px-3 py-2"
          style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)' }}>
          {showInput && (
            <input
              ref={inputRef}
              value={inputText}
              onChange={e => setInputText(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && !e.shiftKey && onSend()}
              placeholder={showMic ? "Or type your message..." : "Ask SwipeRight Voice AI..."}
              className="flex-1 bg-transparent text-sm text-white/80 placeholder-white/20 outline-none py-1"
            />
          )}

          {showMic && (
            <button
              onClick={isRecording ? onStopRecording : onStartRecording}
              disabled={isThinking || isProcessingVoice}
              className={`flex-shrink-0 w-10 h-10 rounded-full flex items-center justify-center transition-all ${
                !showInput ? 'flex-1 w-auto px-6 h-12 rounded-2xl gap-2' : ''
              }`}
              style={isRecording
                ? { background: 'linear-gradient(135deg, #10b981, #059669)', boxShadow: '0 0 20px rgba(16,185,129,0.4)' }
                : { background: 'rgba(14,165,233,0.15)', border: '1px solid rgba(14,165,233,0.35)' }
              }>
              {isRecording ? (
                <>
                  <div className="flex items-end gap-0.5 h-5">
                    {[0.4, 0.8, 1, 0.7, 0.5].map((h, i) => (
                      <div key={i} className="w-1 rounded-full bg-white"
                        style={{ height: `${Math.max(4, (h + audioLevel * 0.4) * 20)}px`, transition: 'height 0.1s' }} />
                    ))}
                  </div>
                  {!showInput && <span className="text-white text-sm font-medium">Stop</span>}
                </>
              ) : isProcessingVoice ? (
                <Loader2 className="w-4 h-4 text-cyan-400 animate-spin" />
              ) : (
                <>
                  <Mic className="w-4 h-4 text-cyan-400" />
                  {!showInput && <span className="text-white/85 text-sm font-semibold">Tap to speak</span>}
                </>
              )}
            </button>
          )}

          {showInput && (
            <button
              onClick={onSend}
              disabled={!inputText.trim() || isThinking}
              className="flex-shrink-0 w-9 h-9 rounded-xl flex items-center justify-center transition-all disabled:opacity-30"
              style={{ background: inputText.trim() ? 'linear-gradient(135deg, #0ea5e9, #0284c7)' : 'rgba(255,255,255,0.04)' }}>
              <Send className="w-3.5 h-3.5 text-white" />
            </button>
          )}
        </div>
      </div>
    </div>
  );
}