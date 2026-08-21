import React from 'react';
import { Link, NavLink, Outlet, useNavigate, useLocation } from 'react-router-dom';
import { Ticket, QrCode, UserPlus, LogOut, ArrowLeft, ShieldCheck, Sparkles, Clock, ShoppingBag, TrendingUp, Lock } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { useBooking } from '../contexts/BookingContext';

export const CounterLayout: React.FC = () => {
  const { user, logout } = useAuth();
  const { activeShift } = useBooking();
  const navigate = useNavigate();
  const location = useLocation();

  const navItems = [
    {
      title: "Gate Check-In Summary",
      path: "/counter",
      icon: Ticket,
      description: "Live entry counts and event status"
    },
    {
      title: "Shift Management",
      path: "/counter/shift",
      icon: Clock,
      description: "Drawer float & cash reconciliation"
    },
    {
      title: "My Sales Log",
      path: "/counter/my-sales",
      icon: TrendingUp,
      description: "Track your personal walk-in sales"
    },
    {
      title: "Scan Ticket QR",
      path: "/counter/scan",
      icon: QrCode,
      description: "Verify physical/mobile passes"
    },
    {
      title: "Walk-In Ticket Issuance",
      path: "/counter/walk-in",
      icon: UserPlus,
      description: "Manual cash & counter bookings"
    },
    {
      title: "Orders & Actions",
      path: "/counter/orders",
      icon: ShoppingBag,
      description: "Reprint, void & exchange seats"
    }
  ];

  // Mandatory Sub-User Session Guard
  // Only the /counter/shift page is allowed if no shift is active
  const isShiftPage = location.pathname === '/counter/shift';
  if (!activeShift && !isShiftPage) {
    return (
      <div className="min-h-screen bg-[#0A0A0A] flex items-center justify-center p-4">
        <div className="max-w-md w-full p-8 rounded-3xl bg-[#141414] border border-amber-500/20 text-center space-y-6 shadow-2xl">
          <div className="w-16 h-16 rounded-2xl bg-amber-500/10 border border-amber-500/30 flex items-center justify-center mx-auto text-amber-500">
            <Lock className="w-8 h-8" />
          </div>
          <div>
            <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-amber-500/10 text-amber-400 border border-amber-500/20 text-xs font-semibold uppercase tracking-wider mb-2">
              Terminal Locked
            </div>
            <h2 className="font-heading font-extrabold text-2xl text-white">Sub-User Login Required</h2>
            <p className="text-gray-400 text-sm mt-2 leading-relaxed">
              You must activate your session with your <strong className="text-white">Staff PIN</strong> before you can access the ticket terminal or issue passes.
            </p>
          </div>
          <button
            onClick={() => navigate('/counter/shift')}
            className="w-full py-3 px-6 rounded-xl bg-gradient-to-r from-[#F3E5AB] to-[#D4AF37] hover:brightness-110 text-black font-extrabold text-sm flex items-center justify-center gap-2 transition-all shadow-lg shadow-[#D4AF37]/25 cursor-pointer"
          >
            <Clock className="w-4 h-4 stroke-[2.5]" />
            <span>Go to Shift Activation</span>
          </button>
          <button
            onClick={() => navigate('/')}
            className="w-full py-2.5 text-gray-500 hover:text-white text-xs font-bold transition-colors cursor-pointer"
          >
            Return to Storefront
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#0A0A0A] text-white flex flex-col md:flex-row">
      {/* Sidebar */}
      <aside className="w-full lg:w-64 bg-[#121212] border-b lg:border-b-0 lg:border-r border-white/10 flex-shrink-0 p-3 sm:p-5 space-y-3 sm:space-y-6">
        <div className="flex items-center justify-between">
          <Link to="/" className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-[#FFF6D6] to-[#D4AF37] flex items-center justify-center text-black font-bold">
              <Ticket className="w-4 h-4 stroke-[2.5]" />
            </div>
            <div>
              <span className="font-heading font-extrabold text-base tracking-tight text-white block leading-none">
                Ash-vish<span className="text-[#D4AF37]"> counter</span>
              </span>
              <span className="text-[10px] uppercase tracking-widest text-gray-400 font-medium">
                Gate Pass Terminal
              </span>
            </div>
          </Link>
          <button
            onClick={() => navigate('/')}
            className="md:hidden p-2 rounded-lg bg-white/5 text-gray-400 hover:text-white"
            title="Exit to Main Website"
          >
            <ArrowLeft className="w-4 h-4" />
          </button>
        </div>

        {/* Counter Staff Info Card */}
        <div className="hidden sm:flex p-3.5 rounded-2xl bg-[#1A1A1A] border border-white/10 items-center gap-3">
          <div className="relative">
            <img
              src={user?.photoUrl || 'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?auto=format&fit=crop&q=80&w=300'}
              alt={user?.name}
              className="w-9 h-9 rounded-xl object-cover border border-[#D4AF37]/40"
            />
            {activeShift && (
              <div className="absolute -bottom-1 -right-1 w-4 h-4 rounded-full bg-emerald-500 border-2 border-[#1A1A1A] flex items-center justify-center">
                <ShieldCheck className="w-2 h-2 text-white" />
              </div>
            )}
          </div>
          <div className="overflow-hidden">
            <p className="text-xs font-bold text-white truncate">
              {activeShift ? activeShift.subUserName : (user?.name || 'Counter Operator')}
            </p>
            <span className="inline-flex items-center gap-1 text-[10px] text-[#D4AF37] font-semibold uppercase tracking-wider">
              {activeShift ? (
                <>
                  <Clock className="w-3 h-3" /> Session Active
                </>
              ) : (
                <>
                  <Lock className="w-3 h-3" /> Login Required
                </>
              )}
            </span>
          </div>
        </div>

        {/* Navigation Items */}
        <nav className="flex lg:block gap-1.5 overflow-x-auto no-scrollbar lg:space-y-1.5 pb-1 lg:pb-0" aria-label="Counter sections">
          {navItems.map((item) => (
            <NavLink
              key={item.path}
              to={item.path}
              end={item.path === '/counter'}
              className={({ isActive }) =>
                `shrink-0 flex items-center gap-2 lg:gap-3 px-3 py-2.5 lg:p-3 rounded-xl lg:rounded-2xl transition-all text-xs font-bold ${
                  isActive
                    ? 'bg-gradient-to-r from-[#F3E5AB] to-[#D4AF37] text-black shadow-lg shadow-[#D4AF37]/20'
                    : 'text-gray-400 hover:text-white hover:bg-[#1C1C1C]'
                }`
              }
            >
              <item.icon className="w-4 h-4 stroke-[2.5]" />
              <div className="whitespace-nowrap">
                <span className="block leading-tight">{item.title}</span>
              </div>
            </NavLink>
          ))}
        </nav>

        <div className="hidden lg:block pt-4 border-t border-white/10 space-y-2">
          <button
            onClick={() => navigate('/')}
            className="w-full py-2.5 px-3 rounded-xl bg-[#1C1C1C] hover:bg-[#262626] text-gray-300 hover:text-white text-xs font-semibold flex items-center justify-center gap-2 transition-all border border-white/5"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            <span>Return to Event Store</span>
          </button>
        </div>
      </aside>

      {/* Main Content Area */}
      <main className="min-w-0 flex-1 p-3 sm:p-4 lg:p-8 pb-20 lg:pb-8 overflow-y-auto">
        <Outlet />
      </main>
    </div>
  );
};
