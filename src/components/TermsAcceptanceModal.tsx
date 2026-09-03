import React, { useState } from 'react';
import { Shield, Check, ExternalLink, ArrowRight } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { Link, useLocation, useNavigate } from 'react-router-dom';

export const TermsAcceptanceModal: React.FC = () => {
  const { user, acceptTerms } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const [isAccepting, setIsAccepting] = useState(false);
  const [hasAgreed, setHasAgreed] = useState(false);

  // Only show if user is logged in but hasn't accepted terms
  // Also hide if the user is currently on the terms page to allow reading
  if (!user || user.termsAccepted || location.pathname === '/terms') return null;

  const handleAccept = async () => {
    if (!hasAgreed) return;
    setIsAccepting(true);
    try {
      await acceptTerms();
      // If we are on the AuthPage, redirect after acceptance
      if (location.pathname === '/auth') {
        const redirectPath = (location.state as any)?.from?.pathname || '/';
        navigate(redirectPath, { replace: true });
      }
    } catch (err) {
      console.error(err);
    } finally {
      setIsAccepting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 sm:p-6 bg-black/90 backdrop-blur-md animate-in fade-in duration-500">
      <div className="w-full max-w-lg bg-[#121212] border border-white/10 rounded-[2.5rem] overflow-hidden shadow-2xl animate-in zoom-in-95 slide-in-from-bottom-8 duration-500 delay-150">
        
        {/* Header Visual */}
        <div className="h-32 bg-gradient-to-br from-[#FFF6D6]/10 to-[#D4AF37]/5 flex items-center justify-center border-b border-white/5 relative overflow-hidden">
          <div className="absolute inset-0 opacity-20 bg-[radial-gradient(circle_at_center,_var(--tw-gradient-stops))] from-[#D4AF37] via-transparent to-transparent" />
          <div className="w-16 h-16 rounded-3xl bg-[#D4AF37] flex items-center justify-center text-black shadow-xl shadow-[#D4AF37]/20 relative z-10">
            <Shield className="w-8 h-8 stroke-[2.5]" />
          </div>
        </div>

        <div className="p-8 sm:p-10 space-y-6 text-center">
          <div className="space-y-2">
            <h2 className="font-heading font-extrabold text-2xl sm:text-3xl text-white tracking-tight">
              Welcome to <span className="text-[#D4AF37]">Ash-vish</span>
            </h2>
            <p className="text-gray-400 text-sm leading-relaxed">
              Before you dive into the premium entertainment ecosystem, please review and accept our updated terms of service.
            </p>
          </div>

          <div className="p-5 rounded-3xl bg-white/5 border border-white/5 text-left space-y-4">
            <div className="flex items-start gap-3">
              <div className="w-5 h-5 rounded-full bg-[#D4AF37]/20 flex items-center justify-center text-[#D4AF37] shrink-0 mt-0.5">
                <Check className="w-3 h-3 stroke-[3]" />
              </div>
              <p className="text-xs text-gray-300">I agree to the 100% verified ticket guarantee and gate entry protocols.</p>
            </div>
            <div className="flex items-start gap-3">
              <div className="w-5 h-5 rounded-full bg-[#D4AF37]/20 flex items-center justify-center text-[#D4AF37] shrink-0 mt-0.5">
                <Check className="w-3 h-3 stroke-[3]" />
              </div>
              <p className="text-xs text-gray-300">I acknowledge the strict no-refund policy for valid event bookings.</p>
            </div>
            
            <div className="pt-2">
              <Link 
                to="/terms" 
                target="_blank"
                className="inline-flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-widest text-[#D4AF37] hover:text-white transition-colors"
              >
                Read Full Terms & Conditions <ExternalLink className="w-3 h-3" />
              </Link>
            </div>
          </div>

          <div className="space-y-4 pt-2">
            <label className="flex items-center justify-center gap-3 cursor-pointer group">
              <div className="relative">
                <input 
                  type="checkbox" 
                  className="peer sr-only"
                  checked={hasAgreed}
                  onChange={(e) => setHasAgreed(e.target.checked)}
                />
                <div className="w-5 h-5 rounded-lg border-2 border-white/20 peer-checked:border-[#D4AF37] peer-checked:bg-[#D4AF37] transition-all flex items-center justify-center">
                  <Check className={`w-3 h-3 text-black stroke-[4] transition-opacity ${hasAgreed ? 'opacity-100' : 'opacity-0'}`} />
                </div>
              </div>
              <span className="text-xs font-semibold text-gray-400 group-hover:text-gray-200 transition-colors">
                I have read and agree to the Terms of Service
              </span>
            </label>

            <button
              onClick={handleAccept}
              disabled={!hasAgreed || isAccepting}
              className={`w-full py-4 rounded-2xl font-bold text-sm tracking-wide transition-all flex items-center justify-center gap-2 ${
                hasAgreed && !isAccepting
                  ? 'bg-[#D4AF37] text-black  hover:scale-[1.02] active:scale-[0.98]'
                  : 'bg-white/5 text-gray-500 cursor-not-allowed border border-white/5'
              }`}
            >
              {isAccepting ? (
                <div className="w-5 h-5 border-2 border-black/20 border-t-black rounded-full animate-spin" />
              ) : (
                <>
                  Accept & Continue <ArrowRight className="w-4 h-4" />
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
