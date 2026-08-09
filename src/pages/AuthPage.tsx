import React, { useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { Ticket, Mail, Lock, User as UserIcon, Sparkles, ArrowRight, ShieldCheck } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';

export const AuthPage: React.FC = () => {
  const { loginWithEmail, signupWithEmail, loginWithGoogle, resetPassword, isLoading } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  const redirectPath = (location.state as any)?.from?.pathname || '/';

  const [mode, setMode] = useState<'login' | 'signup' | 'forgot'>('login');

  // Form fields
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [errorMsg, setErrorMsg] = useState('');

  const handleSuccess = () => {
    navigate(redirectPath, { replace: true });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg('');

    if (mode === 'login') {
      const ok = await loginWithEmail(email, password);
      if (ok) handleSuccess();
    } else if (mode === 'signup') {
      const ok = await signupWithEmail(name, email, password);
      if (ok) handleSuccess();
    } else {
      await resetPassword(email);
      alert(`Password reset instructions sent to ${email}`);
      setMode('login');
    }
  };

  const handleGoogleSignIn = async () => {
    const ok = await loginWithGoogle();
    if (ok) handleSuccess();
  };

  return (
    <div className="min-h-[85vh] flex items-center justify-center p-4 pt-20 pb-20 max-w-6xl mx-auto animate-in fade-in">
      
      {/* Split Card Container */}
      <div className="w-full grid grid-cols-1 lg:grid-cols-12 rounded-3xl overflow-hidden bg-[#141414] border border-white/10 shadow-2xl">
        
        {/* Left Side: Cinematic Event Graphic */}
        <div className="hidden lg:flex lg:col-span-6 relative p-12 flex-col justify-between overflow-hidden bg-[#090909]">
          <img
            src="https://images.unsplash.com/photo-1514525253161-7a46d19cd819?auto=format&fit=crop&q=80&w=1200"
            alt="Concert stage"
            className="absolute inset-0 w-full h-full object-cover filter brightness-[0.4] contrast-[1.1]"
          />
          <div className="absolute inset-0 bg-gradient-to-t from-[#090909] via-black/40 to-transparent" />

          {/* Top Logo */}
          <div className="relative z-10 flex items-center gap-2">
            <div className="w-9 h-9 rounded-xl bg-[#D4AF37] text-black font-bold flex items-center justify-center shadow-lg">
              <Ticket className="w-5 h-5 stroke-[2.5]" />
            </div>
            <span className="font-heading font-extrabold text-2xl text-white">
              Ash-vish<span className="text-[#D4AF37]"> events</span>
            </span>
          </div>

          {/* Middle Quote */}
          <div className="relative z-10 space-y-4">
            <span className="px-3 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider bg-[#D4AF37]/20 text-[#D4AF37] border border-[#D4AF37]/30 inline-flex items-center gap-1">
              <Sparkles className="w-3 h-3" /> VIP MEMBER ACCESS
            </span>
            <h2 className="font-heading font-extrabold text-3xl text-white leading-tight">
              Unlock Priority Pre-sales & Verified Pass Wallet
            </h2>
            <p className="text-xs text-gray-300 leading-relaxed max-w-md">
              Join thousands of music lovers, comedy fans, and sports enthusiasts enjoying instant mobile entry to world tours.
            </p>
          </div>

          {/* Bottom Security Badge */}
          <div className="relative z-10 flex items-center gap-2 text-xs text-gray-400">
            <ShieldCheck className="w-4 h-4 text-emerald-400" />
            <span>Firebase Authentication Secured</span>
          </div>
        </div>


        {/* Right Side: Auth Form */}
        <div className="lg:col-span-6 p-8 sm:p-12 flex flex-col justify-center bg-[#141414]">
          
          <div className="max-w-md w-full mx-auto space-y-6">
            
            {/* Header */}
            <div>
              <h2 className="font-heading font-bold text-2xl sm:text-3xl text-white">
                {mode === 'login' ? 'Welcome Back' : mode === 'signup' ? 'Create Your Account' : 'Reset Password'}
              </h2>
              <p className="text-xs sm:text-sm text-gray-400 mt-1">
                {mode === 'login'
                  ? 'Sign in to access your digital tickets and favorites'
                  : mode === 'signup'
                  ? 'Get early access to headliner pre-sales'
                  : 'Enter your email to receive a password reset link'}
              </p>
            </div>

            {/* Google Sign In Button */}
            {mode !== 'forgot' && (
              <>
                <button
                  onClick={handleGoogleSignIn}
                  disabled={isLoading}
                  className="w-full py-3 px-4 rounded-xl bg-[#1C1C1C] hover:bg-[#262626] border border-white/10 text-white font-semibold text-xs sm:text-sm flex items-center justify-center gap-3 transition-all"
                >
                  <svg className="w-4 h-4" viewBox="0 0 24 24">
                    <path
                      fill="#4285F4"
                      d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                    />
                    <path
                      fill="#34A853"
                      d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                    />
                    <path
                      fill="#FBBC05"
                      d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"
                    />
                    <path
                      fill="#EA4335"
                      d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"
                    />
                  </svg>
                  <span>Continue with Google</span>
                </button>

                <div className="flex items-center gap-3 text-xs text-gray-500">
                  <div className="flex-1 border-t border-white/10" />
                  <span>or continue with email</span>
                  <div className="flex-1 border-t border-white/10" />
                </div>
              </>
            )}

            {/* Main Email Form */}
            <form onSubmit={handleSubmit} className="space-y-4">
              
              {mode === 'signup' && (
                <div>
                  <label className="text-xs font-semibold text-gray-300 block mb-1">Full Name</label>
                  <div className="relative">
                    <UserIcon className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                    <input
                      type="text"
                      required
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      placeholder="Alex Rivera"
                      className="w-full bg-[#1C1C1C] border border-white/10 rounded-xl pl-10 pr-4 py-2.5 text-xs text-white focus:outline-none focus:border-[#D4AF37]"
                    />
                  </div>
                </div>
              )}

              <div>
                <label className="text-xs font-semibold text-gray-300 block mb-1">Email Address</label>
                <div className="relative">
                  <Mail className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                  <input
                    type="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="alex.rivera@example.com"
                    className="w-full bg-[#1C1C1C] border border-white/10 rounded-xl pl-10 pr-4 py-2.5 text-xs text-white focus:outline-none focus:border-[#D4AF37]"
                  />
                </div>
              </div>

              {mode !== 'forgot' && (
                <div>
                  <div className="flex justify-between items-center mb-1">
                    <label className="text-xs font-semibold text-gray-300">Password</label>
                    {mode === 'login' && (
                      <button
                        type="button"
                        onClick={() => setMode('forgot')}
                        className="text-[11px] text-[#D4AF37] hover:underline"
                      >
                        Forgot password?
                      </button>
                    )}
                  </div>
                  <div className="relative">
                    <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                    <input
                      type="password"
                      required
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder="••••••••"
                      className="w-full bg-[#1C1C1C] border border-white/10 rounded-xl pl-10 pr-4 py-2.5 text-xs text-white focus:outline-none focus:border-[#D4AF37]"
                    />
                  </div>
                </div>
              )}

              {errorMsg && <p className="text-xs text-red-400 font-semibold">{errorMsg}</p>}

              <button
                type="submit"
                disabled={isLoading}
                className="w-full py-3 rounded-xl bg-gradient-to-r from-[#F3E5AB] to-[#D4AF37] hover:brightness-110 text-black font-extrabold text-xs sm:text-sm flex items-center justify-center gap-2 shadow-lg shadow-[#D4AF37]/25 transition-all"
              >
                <span>
                  {mode === 'login' ? 'Sign In' : mode === 'signup' ? 'Create Account' : 'Send Reset Link'}
                </span>
                <ArrowRight className="w-4 h-4 stroke-[2.5]" />
              </button>
            </form>

            {/* Toggle Mode Footer */}
            <div className="text-center text-xs text-gray-400 pt-2 border-t border-white/10">
              {mode === 'login' ? (
                <p>
                  Don't have an account?{' '}
                  <button onClick={() => setMode('signup')} className="text-[#D4AF37] font-bold hover:underline">
                    Sign Up Free
                  </button>
                </p>
              ) : (
                <p>
                  Already registered?{' '}
                  <button onClick={() => setMode('login')} className="text-[#D4AF37] font-bold hover:underline">
                    Sign In
                  </button>
                </p>
              )}
            </div>

          </div>

        </div>

      </div>

    </div>
  );
};
