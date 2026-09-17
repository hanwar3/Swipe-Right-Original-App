import React, { useState } from 'react';
import { Mail, Lock, Eye, EyeOff } from 'lucide-react';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useToast } from '@/components/ui/use-toast';
import { useAuth } from '../contexts/AuthContext';

interface AuthModalProps {
  isOpen: boolean;
  onClose: () => void;
  initialMode?: 'signin' | 'signup';
}

type Mode = 'signin' | 'signup' | 'forgot';

const COPY: Record<Mode, { title: string; description: string; submit: string; busy: string }> = {
  signin: {
    title: 'Sign in',
    description: 'Welcome back. Your cards are saved to your account.',
    submit: 'Sign in',
    busy: 'Signing in',
  },
  signup: {
    title: 'Create your account',
    description: 'Save your cards so they are there on every device.',
    submit: 'Create account',
    busy: 'Creating account',
  },
  forgot: {
    title: 'Reset your password',
    description: 'Enter your email and we will send you a reset link.',
    submit: 'Send reset link',
    busy: 'Sending link',
  },
};

const inputClass =
  'h-11 rounded-xl border-white/[0.1] bg-white/[0.03] pl-10 text-[15px] text-[#F3EBF8] placeholder:text-[#8A7E95] focus-visible:border-[#E64BD4]/60 focus-visible:ring-[#E64BD4]/25';
const labelClass = 'text-[13px] font-medium text-[#DDD0E6]';
const iconClass = 'pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-[#8A7E95]';
const linkClass = 'font-semibold text-[#E64BD4] hover:text-[#F06BDD]';

export default function AuthModal({ isOpen, onClose, initialMode = 'signin' }: AuthModalProps) {
  const [mode, setMode] = useState<Mode>(initialMode);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  const { login, register, forgotPassword } = useAuth();
  const { toast } = useToast();
  const copy = COPY[mode];

  const resetForm = () => {
    setEmail('');
    setPassword('');
    setFirstName('');
    setLastName('');
    setShowPassword(false);
  };

  const handleClose = () => {
    resetForm();
    setMode('signin');
    onClose();
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);

    try {
      if (mode === 'signin') {
        await login(email, password);
        toast({ title: 'Welcome back', description: 'You are signed in.' });
        handleClose();
      } else if (mode === 'signup') {
        await register(email, password, firstName, lastName);
        toast({ title: 'Account created', description: 'Welcome to SwipeRight.' });
        handleClose();
      } else {
        await forgotPassword(email);
        toast({ title: 'Reset link sent', description: 'Check your email for the link.' });
        setMode('signin');
      }
    } catch (error: any) {
      toast({ title: 'That did not work', description: error.message, variant: 'destructive' });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={handleClose}>
      <DialogContent className="gap-5 rounded-3xl border-white/[0.08] bg-[#0E0A11] p-6 sm:max-w-sm">
        <DialogHeader className="text-left">
          <DialogTitle className="text-[22px] font-bold leading-tight tracking-[-0.01em] text-[#F3EBF8]">
            {copy.title}
          </DialogTitle>
          <DialogDescription className="text-[13.5px] text-[#A99DB3]">{copy.description}</DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          {mode === 'signup' && (
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label htmlFor="firstName" className={labelClass}>First name</Label>
                <Input
                  id="firstName"
                  type="text"
                  autoComplete="given-name"
                  value={firstName}
                  onChange={(e) => setFirstName(e.target.value)}
                  className={`${inputClass} pl-3.5`}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="lastName" className={labelClass}>Last name</Label>
                <Input
                  id="lastName"
                  type="text"
                  autoComplete="family-name"
                  value={lastName}
                  onChange={(e) => setLastName(e.target.value)}
                  className={`${inputClass} pl-3.5`}
                />
              </div>
            </div>
          )}

          <div className="space-y-2">
            <Label htmlFor="email" className={labelClass}>Email</Label>
            <div className="relative">
              <Mail className={iconClass} />
              <Input
                id="email"
                type="email"
                autoComplete="email"
                placeholder="you@email.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className={inputClass}
                required
              />
            </div>
          </div>

          {mode !== 'forgot' && (
            <div className="space-y-2">
              <div className="flex items-baseline justify-between">
                <Label htmlFor="password" className={labelClass}>Password</Label>
                {mode === 'signin' && (
                  <button type="button" onClick={() => setMode('forgot')} className={`text-[12.5px] ${linkClass}`}>
                    Forgot password?
                  </button>
                )}
              </div>
              <div className="relative">
                <Lock className={iconClass} />
                <Input
                  id="password"
                  type={showPassword ? 'text' : 'password'}
                  autoComplete={mode === 'signup' ? 'new-password' : 'current-password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className={`${inputClass} pr-11`}
                  required
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                  className="absolute right-1.5 top-1/2 grid h-8 w-8 -translate-y-1/2 place-items-center rounded-lg text-[#8A7E95] hover:text-[#DDD0E6]"
                >
                  {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>
          )}

          <Button
            type="submit"
            disabled={isLoading}
            className="h-11 w-full rounded-full bg-[#E64BD4] text-[15px] font-semibold text-[#14000F] transition hover:bg-[#F06BDD] active:scale-[0.98] disabled:opacity-60"
          >
            {isLoading ? copy.busy : copy.submit}
          </Button>

          <p className="text-center text-[13.5px] text-[#A99DB3]">
            {mode === 'signin' ? (
              <>
                New to SwipeRight?{' '}
                <button type="button" onClick={() => setMode('signup')} className={linkClass}>
                  Create an account
                </button>
              </>
            ) : (
              <>
                {mode === 'signup' ? 'Already have an account?' : 'Remember it after all?'}{' '}
                <button type="button" onClick={() => setMode('signin')} className={linkClass}>
                  Sign in
                </button>
              </>
            )}
          </p>
        </form>
      </DialogContent>
    </Dialog>
  );
}
