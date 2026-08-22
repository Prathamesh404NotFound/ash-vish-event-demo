import React, { useState } from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import {
  Ticket,
  Search,
  User as UserIcon,
  Menu,
  X,
  Compass,
  Calendar,
  Heart,
  ShieldCheck,
  LogOut,
  Sparkles,
  QrCode,
  Building2
} from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { useBooking } from '../contexts/BookingContext';
import { useRoleAuth } from '../hooks/useRoleAuth';

interface NavbarProps {
  onOpenSearch?: () => void;
}

export const Navbar: React.FC<NavbarProps> = ({ onOpenSearch }) => {
  const { user, isAuthenticated, logout } = useAuth();
  const { myTickets, favorites } = useBooking();
  const { isAdmin, isTicketCounter } = useRoleAuth();

  const navigate = useNavigate();
  const location = useLocation();

  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [userDropdownOpen, setUserDropdownOpen] = useState(false);

  const navItems = [
    { path: '/', label: 'Explore Events', icon: Compass },
    { path: '/events', label: 'Browse & Filter', icon: Calendar },
    { path: '/account/tickets', label: 'My Tickets', icon: Ticket, badge: myTickets.length },
    { path: '/account/favorites', label: 'Saved Shows', icon: Heart, badge: favorites.length },
  ];

  return (
    <>
      {/* Premium Slim Header */}
      <header className="fixed top-0 inset-x-0 z-50 transition-all duration-500">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-4">
          <nav className="bg-[#070707]/90 backdrop-blur-2xl rounded-2xl px-6 py-2.5 flex items-center justify-between shadow-2xl border border-white/5 group/nav">

            {/* Brand Logo - Minimalist */}
            <Link to="/" className="flex items-center gap-3 shrink-0 group focus:outline-none">
              <div className="relative w-9 h-9 rounded-xl bg-[#111] border border-white/10 overflow-hidden flex items-center justify-center transition-all duration-500 group-hover:border-[#D4AF37]/40 group-hover:scale-105 shadow-lg">
                <img
                  src="/favicon-192.png"
                  alt="Ash-vish Events"
                  className="w-full h-full object-cover p-1"
                />
              </div>
              <div className="flex flex-col">
                <span className="font-heading font-black text-lg tracking-tight text-white leading-none">
                  ASH-VISH<span className="text-[#D4AF37] ml-1">EVENTS</span>
                </span>
                <span className="text-[9px] text-gray-500 font-bold uppercase tracking-[0.2em] mt-0.5">Premium Experience</span>
              </div>
            </Link>

            {/* Desktop Navigation - Clean Tabs */}
            <div className="hidden lg:flex items-center gap-8">
              {navItems.map((item) => {
                const Icon = item.icon;
                const isActive = location.pathname === item.path;
                return (
                  <Link
                    key={item.path}
                    to={item.path}
                    className={`relative flex items-center gap-2 py-1 text-[11px] font-black uppercase tracking-[0.15em] transition-all duration-300 ${
                      isActive
                        ? 'text-[#D4AF37]'
                        : 'text-gray-400 hover:text-white'
                    }`}
                  >
                    <Icon className={`w-3.5 h-3.5 shrink-0 ${isActive ? 'text-[#D4AF37]' : 'text-gray-500'}`} />
                    <span>{item.label}</span>
                    {isActive && (
                      <span className="absolute -bottom-2 left-0 right-0 h-0.5 bg-[#D4AF37] rounded-full shadow-[0_0_8px_rgba(212,175,55,0.5)]" />
                    )}
                  </Link>
                );
              })}
            </div>

            {/* Right Side Utility Actions */}
            <div className="flex items-center gap-4 shrink-0">
              {onOpenSearch && (
                <button
                  onClick={onOpenSearch}
                  className="hidden sm:flex items-center gap-2 px-3 py-1.5 rounded-xl bg-white/5 border border-white/5 text-gray-400 hover:text-white hover:border-white/10 transition-all text-[10px] font-black uppercase tracking-widest"
                >
                  <Search className="w-3.5 h-3.5" />
                  <span>Search</span>
                  <span className="opacity-30 border border-white/20 rounded px-1 ml-2">⌘K</span>
                </button>
              )}

              {isAuthenticated ? (
                <div className="relative">
                  <button
                    onClick={() => setUserDropdownOpen(!userDropdownOpen)}
                    className="flex items-center gap-2 p-1 rounded-xl bg-[#111] border border-white/10 hover:border-[#D4AF37]/30 transition-all active:scale-95"
                  >
                    <img
                      src={user?.photoUrl}
                      alt="Profile"
                      className="w-8 h-8 rounded-lg object-cover"
                    />
                  </button>

                  {/* Refined Dropdown */}
                  {userDropdownOpen && (
                    <div className="absolute right-0 mt-4 w-64 bg-[#0a0a0a] border border-white/10 rounded-2xl shadow-2xl py-3 z-50 animate-in fade-in slide-in-from-top-2 overflow-hidden">
                      <div className="px-5 py-3 border-b border-white/5 bg-white/[0.02]">
                        <p className="text-xs font-black text-white uppercase tracking-wider truncate">{user?.name}</p>
                        <p className="text-[10px] text-gray-500 truncate mt-0.5">{user?.email}</p>
                      </div>

                      <div className="py-2">
                        {[
                          { to: "/account/profile", icon: UserIcon, label: "Account Profile" },
                          { to: "/account/tickets", icon: Ticket, label: `My Tickets (${myTickets.length})` },
                          { to: "/counter", icon: QrCode, label: "Counter Dashboard", show: isTicketCounter || isAdmin },
                          { to: "/admin", icon: ShieldCheck, label: "Admin Portal", show: isAdmin }
                        ].filter(item => item.show !== false).map((item, i) => (
                          <Link
                            key={i}
                            to={item.to}
                            onClick={() => setUserDropdownOpen(false)}
                            className="flex items-center gap-3 px-5 py-2.5 text-[11px] font-bold text-gray-400 hover:text-white hover:bg-white/5 transition-all"
                          >
                            <item.icon className="w-4 h-4" />
                            <span className="uppercase tracking-widest">{item.label}</span>
                          </Link>
                        ))}
                      </div>

                      <div className="border-t border-white/5 pt-2">
                        <button
                          onClick={() => { logout(); setUserDropdownOpen(false); navigate('/login'); }}
                          className="w-full flex items-center gap-3 px-5 py-3 text-[11px] font-black text-red-500 hover:bg-red-500/5 transition-all uppercase tracking-widest"
                        >
                          <LogOut className="w-4 h-4" />
                          <span>Sign Out</span>
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              ) : (
                <Link
                  to="/login"
                  className="px-6 py-2.5 rounded-xl bg-[#D4AF37] hover:bg-[#F3E5AB] text-black font-black text-[11px] uppercase tracking-[0.2em] transition-all shadow-xl shadow-[#D4AF37]/10"
                >
                  Sign In
                </Link>
              )}

              {/* Mobile Menu Toggle */}
              <button
                onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
                className="lg:hidden p-2 text-gray-400 hover:text-white"
              >
                {mobileMenuOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
              </button>
            </div>
          </nav>
        </div>
      </header>

      {/* Mobile Slide-Out Drawer */}
      {mobileMenuOpen && (
        <div className="fixed inset-0 z-40 bg-black/80 backdrop-blur-md md:hidden pt-24 px-6 flex flex-col gap-4 animate-in fade-in">
          <div className="flex flex-col gap-2">
            {navItems.map((item) => {
              const Icon = item.icon;
              const isActive = location.pathname === item.path;
              return (
                <Link
                  key={item.path}
                  to={item.path}
                  onClick={() => setMobileMenuOpen(false)}
                  className={`flex items-center justify-between p-3.5 rounded-xl text-base font-semibold transition-all ${
                    isActive
                      ? 'bg-gradient-to-r from-[#F3E5AB] to-[#D4AF37] text-black shadow-lg shadow-[#D4AF37]/20 font-bold'
                      : 'bg-[#141414] text-gray-200 border border-white/5'
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <Icon className="w-5 h-5" />
                    <span>{item.label}</span>
                  </div>
                  {!!item.badge && item.badge > 0 && (
                    <span className="px-2 py-0.5 rounded-full text-xs font-bold bg-black/30">
                      {item.badge}
                    </span>
                  )}
                </Link>
              );
            })}

            {(isTicketCounter || isAdmin) && (
              <Link
                to="/counter"
                onClick={() => setMobileMenuOpen(false)}
                className="flex items-center gap-3 p-3.5 rounded-xl text-base font-bold text-[#D4AF37] bg-[#D4AF37]/10 border border-[#D4AF37]/20"
              >
                <QrCode className="w-5 h-5" />
                <span>Ticket Counter Dashboard</span>
              </Link>
            )}

            {isAdmin && (
              <Link
                to="/admin"
                onClick={() => setMobileMenuOpen(false)}
                className="flex items-center gap-3 p-3.5 rounded-xl text-base font-bold text-[#D4AF37] bg-[#D4AF37]/10 border border-[#D4AF37]/20"
              >
                <ShieldCheck className="w-5 h-5" />
                <span>Admin Portal</span>
              </Link>
            )}
          </div>

          {!isAuthenticated && (
            <Link
              to="/login"
              onClick={() => setMobileMenuOpen(false)}
              className="mt-auto mb-8 w-full py-3.5 rounded-xl bg-gradient-to-r from-[#F3E5AB] to-[#D4AF37] text-black font-bold text-center shadow-lg shadow-[#D4AF37]/25"
            >
              Login / Sign Up
            </Link>
          )}
        </div>
      )}

      {/* Mobile Fixed Bottom Navigation Bar */}
      <div className="md:hidden fixed bottom-0 inset-x-0 z-40 bg-[#141414]/95 backdrop-blur-xl border-t border-white/10 px-4 py-2 flex items-center justify-around">
        {navItems.map((item) => {
          const Icon = item.icon;
          const isActive = location.pathname === item.path;
          return (
            <Link
              key={item.path}
              to={item.path}
              className={`flex flex-col items-center gap-1 py-1 px-3 rounded-xl transition-colors ${
                isActive ? 'text-[#D4AF37]' : 'text-gray-400 hover:text-white'
              }`}
            >
              <Icon className="w-5 h-5" />
              <span className="text-[10px] font-medium">{item.label.split(' ')[0]}</span>
            </Link>
          );
        })}
      </div>
    </>
  );
};
