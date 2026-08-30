import React from 'react';
import { Link, NavLink, Outlet, useNavigate } from 'react-router-dom';
import { Ticket, QrCode, UserPlus, LogOut, ArrowLeft, ShieldCheck, Sparkles, Clock, ShoppingBag, TrendingUp, RefreshCw } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { ErrorBoundary } from './ErrorBoundary';

export const CounterLayout: React.FC = () => {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  const navItems = [
    {
      title: "Gate Check-In Summary",
      path: "/counter",
      icon: Ticket,
      description: "Live entry counts and event status"
    },
    {
      title: "Counter Sign-In",
      path: "/counter/shift",
      icon: Clock,
      description: "PIN sign-in & automatic totals"
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
      description: "Issue tickets after PIN sign-in"
    },
    {
      title: "Orders & Actions",
      path: "/counter/orders",
      icon: ShoppingBag,
      description: "Reprint, void & exchange seats"
    }
  ];

  return (
    <div className="min-h-screen bg-[#0A0A0A] text-white flex flex-col md:flex-row">
      {/* Sidebar */}
      <aside className="w-full lg:w-64 bg-[#121212] border-b lg:border-b-0 lg:border-r border-white/10 flex-shrink-0 p-3 sm:p-5 space-y-3 sm:space-y-6">
        <div className="flex items-center justify-between">
          <Link to="/" className="flex items-center gap-2.5">
            <img
              src="/ashvish-logo.png"
              alt="Ash-vish Events Logo"
              onError={(e) => {
                const target = e.currentTarget;
                if (target.src.includes('ashvish-logo.png')) {
                  target.src = '/favicon-192.png';
                }
              }}
              className="w-8 h-8 rounded-lg object-cover shadow-lg shadow-[#D4AF37]/25"
            />
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
          <img
            src={user?.photoUrl || 'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?auto=format&fit=crop&q=80&w=300'}
            alt={user?.name}
            className="w-9 h-9 rounded-xl object-cover border border-[#D4AF37]/40"
          />
          <div className="overflow-hidden">
            <p className="text-xs font-bold text-white truncate">{user?.name || 'Counter Operator'}</p>
            <span className="inline-flex items-center gap-1 text-[10px] text-[#D4AF37] font-semibold uppercase tracking-wider">
              <ShieldCheck className="w-3 h-3" /> Ticket Counter Staff
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
        <ErrorBoundary>
          <Outlet />
        </ErrorBoundary>
      </main>
    </div>
  );
};
