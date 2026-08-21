import React, { useEffect, useState } from 'react';
import { Navigate, useLocation, Link } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { UserRole } from '../types';
import { ShieldAlert, LogIn, Sparkles, RefreshCw } from 'lucide-react';
import { safeFetch } from '../lib/api';

interface RoleRouteProps {
  allow: UserRole[];
  children: React.ReactNode;
}

export const RoleRoute: React.FC<RoleRouteProps> = ({ allow, children }) => {
  const { user, firebaseUser, isAuthenticated, isLoading: authLoading } = useAuth();
  const location = useLocation();
  const [isVerifying, setIsVerifying] = useState(true);
  const [serverRole, setServerRole] = useState<UserRole | null>(null);

  useEffect(() => {
    let active = true;
    const verifyServerRole = async () => {
      if (authLoading) return;
      
      if (!isAuthenticated || !firebaseUser) {
        if (active) {
          setIsVerifying(false);
          setServerRole(null);
        }
        return;
      }

      try {
        const token = await firebaseUser.getIdToken();
        const headers: Record<string, string> = {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        };
        
        // Pass testing role as header in non-production for local convenience/testing sync
        if (process.env.NODE_ENV !== 'production' && user?.role) {
          headers['x-user-role'] = user.role;
          headers['x-user-id'] = user.id;
        }

        const res = await safeFetch('/api/auth/verify', {
          method: 'POST',
          headers,
        });

        if (res.ok && res.data?.role) {
          if (active) {
            setServerRole(res.data.role as UserRole);
          }
        } else {
          if (active) {
            setServerRole(null);
          }
        }
      } catch (err) {
        console.error('Failed to verify role with server:', err);
        if (active) {
          setServerRole(null);
        }
      } finally {
        if (active) {
          setIsVerifying(false);
        }
      }
    };

    verifyServerRole();

    return () => {
      active = false;
    };
  }, [firebaseUser, isAuthenticated, authLoading, user?.role, user?.id]);

  // 1. Loading/Verifying state
  if (authLoading || isVerifying) {
    return (
      <div className="min-h-[70vh] flex flex-col items-center justify-center p-6 text-center">
        <div className="w-12 h-12 rounded-2xl bg-[#D4AF37]/10 border border-[#D4AF37]/30 flex items-center justify-center animate-spin mb-4 text-[#D4AF37]">
          <RefreshCw className="w-6 h-6" />
        </div>
        <p className="text-gray-400 text-sm font-medium">Verifying access credentials on the server...</p>
      </div>
    );
  }

  // 2. Sign-in required state
  if (!isAuthenticated || !user) {
    return (
      <div className="min-h-[75vh] flex items-center justify-center p-4">
        <div className="max-w-md w-full p-8 rounded-3xl bg-[#141414] border border-white/10 text-center space-y-6 shadow-2xl">
          <div className="w-16 h-16 rounded-2xl bg-[#D4AF37]/10 border border-[#D4AF37]/30 flex items-center justify-center mx-auto text-[#D4AF37]">
            <LogIn className="w-8 h-8" />
          </div>
          <div>
            <h2 className="font-heading font-extrabold text-2xl text-white">Sign In Required</h2>
            <p className="text-gray-400 text-sm mt-2 leading-relaxed">
              You must be logged in to access this portal or view account bookings.
            </p>
          </div>
          <Link
            to="/login"
            state={{ from: location }}
            className="w-full py-3 px-6 rounded-xl bg-gradient-to-r from-[#F3E5AB] to-[#D4AF37] hover:brightness-110 text-black font-extrabold text-sm flex items-center justify-center gap-2 transition-all shadow-lg shadow-[#D4AF37]/25"
          >
            <LogIn className="w-4 h-4 stroke-[2.5]" />
            <span>Go to Sign In</span>
          </Link>
        </div>
      </div>
    );
  }

  // 3. Access denied state (logged in, but role not allowed or verification failed)
  const resolvedRole = serverRole || user.role;
  const rbacRole = (user as any)?.rbacRole;

  // Role aliasing for legacy checks
  const roleAliases: Record<string, string[]> = {
    admin: ['admin', 'super_admin'],
    super_admin: ['admin', 'super_admin'],
    organizer: ['organizer', 'event_manager'],
    event_manager: ['organizer', 'event_manager'],
    ticket_counter: ['ticket_counter', 'counter_staff'],
    counter_staff: ['ticket_counter', 'counter_staff'],
  };

  const isAllowed = allow.some((a) => {
    if (resolvedRole === a) return true;
    if (rbacRole === a) return true;
    const aliases = roleAliases[a] || [a];
    if (aliases.includes(resolvedRole)) return true;
    if (rbacRole && aliases.includes(rbacRole)) return true;
    // Admins/Super-admins are allowed everywhere
    if (resolvedRole === 'admin' || resolvedRole === 'super_admin' || rbacRole === 'super_admin') return true;
    return false;
  });

  if (!isAllowed) {
    return (
      <div className="min-h-[75vh] flex items-center justify-center p-4">
        <div className="max-w-md w-full p-8 rounded-3xl bg-[#141414] border border-red-500/20 text-center space-y-6 shadow-2xl">
          <div className="w-16 h-16 rounded-2xl bg-red-500/10 border border-red-500/30 flex items-center justify-center mx-auto text-red-500">
            <ShieldAlert className="w-8 h-8" />
          </div>
          <div>
            <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-red-500/10 text-red-400 border border-red-500/20 text-xs font-semibold uppercase tracking-wider mb-2">
              Restricted Area
            </div>
            <h2 className="font-heading font-extrabold text-2xl text-white">Access Denied</h2>
            <p className="text-gray-400 text-sm mt-2 leading-relaxed">
              Your server-verified account role (<strong className="text-white uppercase">{resolvedRole}</strong>) does not have permission to view this section.
            </p>
          </div>
          <div className="flex items-center gap-3 mt-6">
            <Link
              to="/"
              className="flex-1 py-2.5 px-4 rounded-xl bg-[#222] hover:bg-[#333] text-gray-200 font-bold text-xs transition-all border border-white/10"
            >
              Return Home
            </Link>
          </div>
        </div>
      </div>
    );
  }

  // Authorized -> render protected children
  return <>{children}</>;
};
