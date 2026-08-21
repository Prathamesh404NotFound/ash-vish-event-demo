import React, { useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { Sparkles, ShieldCheck, Mail, Lock, User, ArrowRight, MessageCircle } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { sanitizeString, validateEmail, validatePhone } from '../lib/sanitizer';
import { TermsAcceptanceModal } from '../components/TermsAcceptanceModal';

type AuthMode = 'login' | 'signup' | 'forgot-password';

export const AuthPage: React.FC = () => {
  const { loginWithGoogle, loginWithEmail, signupWithEmail, isLoading } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  const redirectPath = (location.state as any)?.from?.pathname || '/';

  const [mode, setMode] = useState<AuthMode>('login');
  const [errorMsg, setErrorMsg] = useState('');
  const [successMsg, setSuccessMsg] = useState('');
  
  // Form fields
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [phone, setPhone] = useState('');
  const [otp, setOtp] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [otpSent, setOtpSent] = useState(false);
  const [resendTimer, setResendTimer] = useState(0);
  const [showTerms, setShowTerms] = useState(false);

  const handleSuccess = (userProfile?: any) => {
    // Check if user needs to accept terms
    const targetUser = userProfile || useAuth().user;
    if (targetUser && !targetUser.termsAccepted) {
      setShowTerms(true);
      return;
    }
    navigate(redirectPath, { replace: true });
  };

  const { user: authUser } = useAuth();
  const handleGoogleSignIn = async () => {
    setErrorMsg('');
    const ok = await loginWithGoogle();
    if (ok) {
      // We need the user profile to check terms
      // The user state in AuthContext might not be updated yet, so we'll wait a bit or use a flag
      setShowTerms(true); 
    }
    else setErrorMsg('Google sign-in did not complete. Please try again.');
  };

  const handleEmailSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg('');
    
    const sanitizedEmail = email.trim();
    if (!validateEmail(sanitizedEmail)) {
      setErrorMsg('Please enter a valid email address.');
      return;
    }

    if (mode === 'login') {
      const ok = await loginWithEmail(sanitizedEmail, password);
      if (ok) setShowTerms(true);
      else setErrorMsg('Invalid email or password.');
    } else {
      const sanitizedName = sanitizeString(name, 100);
      if (sanitizedName.length < 2) {
        setErrorMsg('Please enter a valid name.');
        return;
      }
      if (password.length < 8) {
        setErrorMsg('Password must be at least 8 characters.');
        return;
      }
      const result = await signupWithEmail(sanitizedName, sanitizedEmail, password);
      if (result.success) setShowTerms(true);
      else setErrorMsg(result.error || 'Signup failed. Please try again.');
    }
  };

  const handleSendOTP = async () => {
    setErrorMsg('');
    const sanitizedPhone = phone.trim();
    if (!validatePhone(sanitizedPhone)) {
      setErrorMsg('Please enter a valid phone number with country code (e.g., +919876543210).');
      return;
    }

    const auth = useAuth();
    const ok = await auth.sendOtp(sanitizedPhone);
    if (ok) {
      setOtpSent(true);
      setSuccessMsg('OTP sent to your WhatsApp!');
      setResendTimer(60);
      const timer = setInterval(() => {
        setResendTimer(prev => {
          if (prev <= 1) {
            clearInterval(timer);
            return 0;
          }
          return prev - 1;
        });
      }, 1000);
    } else {
      setErrorMsg('Could not send OTP. Make sure your number is registered.');
    }
  };

  const handleResetPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg('');
    if (otp.length !== 6) {
      setErrorMsg('Please enter a valid 6-digit OTP.');
      return;
    }
    if (newPassword.length < 8) {
      setErrorMsg('New password must be at least 8 characters.');
      return;
    }

    const auth = useAuth();
    const ok = await auth.resetPasswordWithOtp(phone, otp, newPassword);
    if (ok) {
      setSuccessMsg('Password reset successful! You can now log in.');
      setMode('login');
      setOtpSent(false);
      setPhone('');
      setOtp('');
      setNewPassword('');
    } else {
      setErrorMsg('Invalid or expired OTP. Please try again.');
    }
  };

  return (
    <div className="min-h-[85vh] flex items-center justify-center p-4 pt-20 pb-20 max-w-6xl mx-auto animate-in fade-in">
      {showTerms && <TermsAcceptanceModal />}
      <div className="w-full grid grid-cols-1 lg:grid-cols-12 rounded-3xl overflow-hidden bg-[#141414] border border-white/10 shadow-2xl">
        
        {/* Left Side: Cinematic Event Graphic */}
        <div className="hidden lg:flex lg:col-span-6 relative p-12 flex-col justify-between overflow-hidden bg-[#090909]">
          <img
            src="/og-image.jpg"
            alt="AV Events branding"
            className="absolute inset-0 w-full h-full object-cover filter brightness-[0.4] contrast-[1.1]"
          />
          <div className="absolute inset-0 bg-gradient-to-t from-[#090909] via-black/40 to-transparent" />

          <div className="relative z-10 flex items-center gap-2">
            <img src="/logo-tiny.webp" alt="Logo" className="w-9 h-9 rounded-xl object-cover shadow-lg" />
            <span className="font-heading font-extrabold text-2xl text-white">
              Ash-vish<span className="text-[#D4AF37]"> events</span>
            </span>
          </div>

          <div className="relative z-10 space-y-4">
            <span className="px-3 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider bg-[#D4AF37]/20 text-[#D4AF37] border border-[#D4AF37]/30 inline-flex items-center gap-1">
              <Sparkles className="w-3 h-3" /> VIP MEMBER ACCESS
            </span>
            <h2 className="font-heading font-extrabold text-3xl text-white leading-tight">
              {mode === 'forgot-password' ? 'Secure Account Recovery' : 'Unlock Priority Pre-sales & Verified Pass Wallet'}
            </h2>
            <p className="text-xs text-gray-300 leading-relaxed max-w-md">
              {mode === 'forgot-password' 
                ? 'Use your registered WhatsApp number to receive a secure one-time password and regain access to your tickets.'
                : 'Join thousands of music lovers, comedy fans, and sports enthusiasts enjoying instant mobile entry to world tours.'}
            </p>
          </div>

          <div className="relative z-10 flex items-center gap-2 text-xs text-gray-400">
            <ShieldCheck className="w-4 h-4 text-emerald-400" />
            <span>Firebase Authentication Secured</span>
          </div>
        </div>

        {/* Right Side: Auth Form */}
        <div className="lg:col-span-6 p-8 sm:p-12 flex flex-col justify-center bg-[#141414]">
          <div className="max-w-md w-full mx-auto space-y-6">
            
            <div>
              <h2 className="font-heading font-bold text-2xl sm:text-3xl text-white">
                {mode === 'login' ? 'Welcome Back' : mode === 'signup' ? 'Create Account' : 'Reset Password'}
              </h2>
              <p className="text-xs sm:text-sm text-gray-400 mt-1">
                {mode === 'login' ? 'Sign in to access your digital tickets' : mode === 'signup' ? 'Join Ash-vish Events today' : 'Recover your account via WhatsApp OTP'}
              </p>
            </div>

            {mode !== 'forgot-password' && (
              <>
                <button
                  onClick={handleGoogleSignIn}
                  disabled={isLoading}
                  className="w-full py-3 px-4 rounded-xl bg-[#1C1C1C] hover:bg-[#262626] border border-white/10 text-white font-semibold text-xs sm:text-sm flex items-center justify-center gap-3 transition-all"
                >
                  <svg className="w-5 h-5" viewBox="0 0 24 24">
                    <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
                    <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
                    <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z" />
                    <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z" />
                  </svg>
                  <span>Continue with Google</span>
                </button>

                <div className="relative py-2">
                  <div className="absolute inset-0 flex items-center"><div className="w-full border-t border-white/10"></div></div>
                  <div className="relative flex justify-center text-xs uppercase"><span className="bg-[#141414] px-2 text-gray-500">Or continue with email</span></div>
                </div>
              </>
            )}

            <form onSubmit={mode === 'forgot-password' ? handleResetPassword : handleEmailSubmit} className="space-y-4">
              {mode === 'signup' && (
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-gray-400 ml-1">Full Name</label>
                  <div className="relative">
                    <User className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
                    <input
                      type="text"
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      placeholder="John Doe"
                      className="w-full bg-[#1C1C1C] border border-white/10 rounded-xl py-3 pl-10 pr-4 text-white text-sm focus:border-[#D4AF37] focus:ring-1 focus:ring-[#D4AF37] outline-none transition-all"
                      required
                    />
                  </div>
                </div>
              )}

              {mode !== 'forgot-password' && (
                <>
                  <div className="space-y-1.5">
                    <label className="text-xs font-semibold text-gray-400 ml-1">Email Address</label>
                    <div className="relative">
                      <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
                      <input
                        type="email"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        placeholder="name@example.com"
                        className="w-full bg-[#1C1C1C] border border-white/10 rounded-xl py-3 pl-10 pr-4 text-white text-sm focus:border-[#D4AF37] focus:ring-1 focus:ring-[#D4AF37] outline-none transition-all"
                        required
                      />
                    </div>
                  </div>

                  <div className="space-y-1.5">
                    <div className="flex justify-between items-center">
                      <label className="text-xs font-semibold text-gray-400 ml-1">Password</label>
                      {mode === 'login' && (
                        <button 
                          type="button" 
                          onClick={() => { setMode('forgot-password'); setErrorMsg(''); setSuccessMsg(''); }}
                          className="text-[10px] text-[#D4AF37] hover:underline"
                        >
                          Forgot Password?
                        </button>
                      )}
                    </div>
                    <div className="relative">
                      <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
                      <input
                        type="password"
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        placeholder="••••••••"
                        className="w-full bg-[#1C1C1C] border border-white/10 rounded-xl py-3 pl-10 pr-4 text-white text-sm focus:border-[#D4AF37] focus:ring-1 focus:ring-[#D4AF37] outline-none transition-all"
                        required
                      />
                    </div>
                  </div>
                </>
              )}

              {mode === 'forgot-password' && (
                <div className="space-y-4">
                  <div className="space-y-1.5">
                    <label className="text-xs font-semibold text-gray-400 ml-1">WhatsApp Phone Number</label>
                    <div className="relative flex gap-2">
                      <div className="relative flex-1">
                        <MessageCircle className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
                        <input
                          type="tel"
                          value={phone}
                          onChange={(e) => setPhone(e.target.value)}
                          placeholder="+91 98765 43210"
                          disabled={otpSent}
                          className="w-full bg-[#1C1C1C] border border-white/10 rounded-xl py-3 pl-10 pr-4 text-white text-sm focus:border-[#D4AF37] focus:ring-1 focus:ring-[#D4AF37] outline-none transition-all disabled:opacity-50"
                          required
                        />
                      </div>
                      {!otpSent && (
                        <button
                          type="button"
                          onClick={handleSendOTP}
                          disabled={isLoading || !phone}
                          className="bg-[#D4AF37] hover:bg-[#B8962E] text-black font-bold px-4 rounded-xl text-xs transition-colors disabled:opacity-50 whitespace-nowrap"
                        >
                          Send OTP
                        </button>
                      )}
                    </div>
                  </div>

                  {otpSent && (
                    <>
                      <div className="space-y-1.5">
                        <label className="text-xs font-semibold text-gray-400 ml-1">6-Digit OTP</label>
                        <input
                          type="text"
                          value={otp}
                          onChange={(e) => setOtp(e.target.value.replace(/\D/g, '').slice(0, 6))}
                          placeholder="000000"
                          className="w-full bg-[#1C1C1C] border border-white/10 rounded-xl py-3 px-4 text-white text-center text-xl tracking-[0.5em] font-mono focus:border-[#D4AF37] focus:ring-1 focus:ring-[#D4AF37] outline-none transition-all"
                          required
                        />
                        <div className="flex justify-between items-center px-1">
                           <button 
                            type="button" 
                            onClick={() => { setOtpSent(false); setOtp(''); }}
                            className="text-[10px] text-gray-500 hover:underline"
                           >
                            Change Number
                           </button>
                           {resendTimer > 0 ? (
                             <span className="text-[10px] text-gray-500">Resend in {resendTimer}s</span>
                           ) : (
                             <button type="button" onClick={handleSendOTP} className="text-[10px] text-[#D4AF37] hover:underline">Resend OTP</button>
                           )}
                        </div>
                      </div>

                      <div className="space-y-1.5">
                        <label className="text-xs font-semibold text-gray-400 ml-1">New Password</label>
                        <input
                          type="password"
                          value={newPassword}
                          onChange={(e) => setNewPassword(e.target.value)}
                          placeholder="At least 8 characters"
                          className="w-full bg-[#1C1C1C] border border-white/10 rounded-xl py-3 px-4 text-white text-sm focus:border-[#D4AF37] focus:ring-1 focus:ring-[#D4AF37] outline-none transition-all"
                          required
                        />
                      </div>
                    </>
                  )}
                </div>
              )}

              {errorMsg && <div className="p-3 rounded-lg bg-red-500/10 border border-red-500/20 text-[11px] text-red-400 font-medium">{errorMsg}</div>}
              {successMsg && <div className="p-3 rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-[11px] text-emerald-400 font-medium">{successMsg}</div>}

              <button
                type="submit"
                disabled={isLoading || (mode === 'forgot-password' && !otpSent)}
                className="w-full py-3.5 px-4 rounded-xl bg-[#D4AF37] hover:bg-[#B8962E] text-black font-bold text-sm flex items-center justify-center gap-2 transition-all shadow-lg shadow-[#D4AF37]/10 disabled:opacity-50"
              >
                {isLoading ? (
                  <div className="w-5 h-5 border-2 border-black/20 border-t-black rounded-full animate-spin" />
                ) : (
                  <>
                    <span>{mode === 'login' ? 'Sign In' : mode === 'signup' ? 'Create Account' : 'Reset Password'}</span>
                    <ArrowRight className="w-4 h-4" />
                  </>
                )}
              </button>
            </form>

            <div className="text-center space-y-3 pt-4 border-t border-white/10">
              <button
                type="button"
                onClick={() => {
                  setMode(mode === 'login' ? 'signup' : 'login');
                  setErrorMsg('');
                  setSuccessMsg('');
                }}
                className="text-xs text-gray-400 hover:text-white transition-colors"
              >
                {mode === 'login' ? "Don't have an account? " : "Already have an account? "}
                <span className="text-[#D4AF37] font-bold">{mode === 'login' ? 'Sign Up' : 'Sign In'}</span>
              </button>
              
              {mode === 'forgot-password' && (
                <div>
                  <button
                    type="button"
                    onClick={() => { setMode('login'); setErrorMsg(''); setSuccessMsg(''); }}
                    className="text-[10px] text-gray-500 hover:text-white transition-colors"
                  >
                    Back to Sign In
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
