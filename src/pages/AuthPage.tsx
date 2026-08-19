import React from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { Sparkles, ShieldCheck } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';

export const AuthPage: React.FC = () => {
  const { loginWithGoogle, isLoading } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  const redirectPath = (location.state as any)?.from?.pathname || '/';

  const [errorMsg, setErrorMsg] = React.useState('');

  const handleSuccess = () => {
    navigate(redirectPath, { replace: true });
  };

  const handleGoogleSignIn = async () => {
    const ok = await loginWithGoogle();
    if (ok) handleSuccess();
    else setErrorMsg('Google sign-in did not complete. Please try again.');
  };

  return (
    <div className="min-h-[85vh] flex items-center justify-center p-4 pt-20 pb-20 max-w-6xl mx-auto animate-in fade-in">
      
      {/* Split Card Container */}
      <div className="w-full grid grid-cols-1 lg:grid-cols-12 rounded-3xl overflow-hidden bg-[#141414] border border-white/10 shadow-2xl">
        
        {/* Left Side: Cinematic Event Graphic */}
        <div className="hidden lg:flex lg:col-span-6 relative p-12 flex-col justify-between overflow-hidden bg-[#090909]">
          <img
            src="/og-image.jpg"
            alt="AV Events branding"
            className="absolute inset-0 w-full h-full object-cover filter brightness-[0.4] contrast-[1.1]"
          />
          <div className="absolute inset-0 bg-gradient-to-t from-[#090909] via-black/40 to-transparent" />

          {/* Top Logo */}
          <div className="relative z-10 flex items-center gap-2">
            <img
              src="/logo-tiny.webp"
              srcSet="/logo-tiny.webp 1x, /logo-small.webp 2x"
              alt="Ash-vish Events Logo"
              onError={(e) => {
                const target = e.currentTarget;
                if (target.src.includes('.webp')) {
                  target.srcset = '';
                  target.src = '/ash-vish-events-logo.png';
                } else if (target.src.includes('ash-vish-events-logo.png')) {
                  target.src = '/av-logo.png';
                }
              }}
              className="w-9 h-9 rounded-xl object-cover shadow-lg"
            />
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
                Welcome Back
              </h2>
              <p className="text-xs sm:text-sm text-gray-400 mt-1">
                Sign in to access your digital tickets and favorites
              </p>
            </div>

            {/* Google Sign In Button */}
            <button
              onClick={handleGoogleSignIn}
              disabled={isLoading}
              className="w-full py-3.5 px-4 rounded-xl bg-[#1C1C1C] hover:bg-[#262626] border border-white/10 text-white font-semibold text-xs sm:text-sm flex items-center justify-center gap-3 transition-all"
            >
              <svg className="w-5 h-5" viewBox="0 0 24 24">
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
              <span>Sign In with Google</span>
            </button>

            {errorMsg && <p className="text-xs text-red-400 font-semibold">{errorMsg}</p>}

            {/* Info Footer */}
            <div className="text-center text-xs text-gray-400 pt-4 border-t border-white/10">
              <p>
                New here? Signing in with Google automatically creates your account and saves your preferences.
              </p>
            </div>

          </div>

        </div>

      </div>

    </div>
  );
};
