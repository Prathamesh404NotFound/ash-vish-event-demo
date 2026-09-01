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
import { UserAvatar } from './UserAvatar';

interface NavbarProps {
  onOpenSearch?: () => void;
}

export const Navbar: React.FC<NavbarProps> = React.memo(({ onOpenSearch }) => {
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
      {/* Floating Top Navbar */}
      <header className="fixed top-0 inset-x-0 z-50 transition-all duration-300">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-2 sm:pt-3">
          <nav className="bg-[#0A0A0C]/80 backdrop-blur-md rounded-2xl px-3 py-2 sm:px-5 sm:py-2.5 flex items-center justify-between shadow-[0_8px_30px_rgba(0,0,0,0.75)] border border-white/10 hover:border-white/15 transition-all duration-300">

            {/* Logo & Brand Container */}
            <Link to="/" className="flex items-center gap-3 cursor-pointer group focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#D4AF37] rounded-xl p-0.5 shrink-0">
              <div className="relative">
                <div className="absolute -inset-1 bg-gradient-to-r from-[#F3E5AB] via-[#D4AF37] to-[#C5A059] rounded-xl opacity-20 group-hover:opacity-60 blur-[4px] transition-opacity duration-300"></div>
                <div className="relative w-10 h-10 sm:w-11 sm:h-11 rounded-xl bg-[#141417] border border-white/10 overflow-hidden shadow-2xl flex items-center justify-center group-hover:scale-105 transition-transform duration-300">
                  <img
                    src="/ashvish-logo.png"
                    alt="Ash-vish Events Logo"
                    onError={(e) => {
                      const target = e.currentTarget;
                      if (target.src.includes('ashvish-logo.png')) {
                        target.src = '/favicon-192.png';
                      }
                    }}
                    className="w-full h-full object-cover"
                  />
                </div>
              </div>
              <div className="flex flex-col">
                <span className="font-heading font-bold text-base sm:text-lg tracking-tight text-white leading-tight group-hover:text-[#F3E5AB] transition-colors">
                  Ash-vish <span className="text-[#D4AF37] font-semibold">Events</span>
                </span>
              </div>
            </Link>

            {/* Desktop Navigation Links */}
            <div className="hidden md:flex items-center gap-2 bg-[#121214]/60 px-2 py-1 rounded-xl border border-white/5">
              {navItems.map((item) => {
                const Icon = item.icon;
                const isActive = location.pathname === item.path;
                return (
                  <Link
                    key={item.path}
                    to={item.path}
                    aria-current={isActive ? 'page' : undefined}
                    className={`relative flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all duration-200 ${
                      isActive
                        ? 'bg-[#D4AF37]/15 text-[#F3E5AB] border border-[#D4AF37]/30 font-semibold'
                        : 'text-gray-400 hover:text-gray-200 hover:bg-white/5 border border-transparent'
                    }`}
                  >
                    <Icon className={`w-3.5 h-3.5 shrink-0 ${isActive ? 'text-[#D4AF37]' : 'text-gray-400'}`} />
                    <span>{item.label}</span>
                    {!!item.badge && item.badge > 0 && (
                      <span
                        className={`text-[9px] px-1.5 py-0.2 rounded-full font-bold ${
                          isActive ? 'bg-[#D4AF37] text-black' : 'bg-white/10 text-gray-300'
                        }`}
                      >
                        {item.badge}
                      </span>
                    )}
                  </Link>
                );
              })}
            </div>

            {/* Right Actions: Search trigger & Auth / User Profile */}
            <div className="flex items-center gap-2 sm:gap-2.5 shrink-0">
              {/* Search Button */}
              {onOpenSearch && (
                <button
                  onClick={onOpenSearch}
                  className="flex items-center gap-2 px-2.5 py-1.5 rounded-xl bg-[#141417]/80 hover:bg-[#1C1C20] border border-white/10 text-gray-400 hover:text-gray-200 text-xs transition-all duration-200 active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#D4AF37] cursor-pointer"
                  aria-label="Search events"
                >
                  <Search className="w-3.5 h-3.5 text-[#D4AF37] shrink-0" />
                  <span className="hidden sm:inline font-normal">Search</span>
                  <kbd className="hidden md:inline-flex items-center px-1.5 py-0.5 text-[9px] font-mono text-gray-500 bg-white/5 rounded border border-white/10">
                    ⌘K
                  </kbd>
                </button>
              )}

              {/* User Profile or Auth */}
              {isAuthenticated ? (
                <div className="relative">
                  <button
                    onClick={() => setUserDropdownOpen(!userDropdownOpen)}
                    className="flex items-center gap-2 p-1 rounded-xl bg-[#141417] hover:bg-[#1E1E22] border border-white/10 transition-all active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#D4AF37] cursor-pointer"
                    aria-label="User account menu"
                    aria-expanded={userDropdownOpen}
                  >
                    <UserAvatar
                      src={user?.photoUrl}
                      name={user?.name}
                      size="w-7 h-7"
                      className="border border-[#D4AF37]/30"
                    />
                  </button>

                  {/* Profile Dropdown Menu */}
                  {userDropdownOpen && (
                    <div className="absolute right-0 mt-2 w-56 bg-[#121214] border border-white/10 rounded-2xl shadow-2xl py-2 z-50 animate-in fade-in slide-in-from-top-2">
                      <div className="px-4 py-2 border-b border-white/10">
                        <p className="text-xs font-semibold text-white truncate">{user?.name}</p>
                        <p className="text-[11px] text-gray-400 truncate">{user?.email}</p>
                        <span className="mt-1.5 inline-flex items-center gap-1 px-2 py-0.5 text-[9px] bg-[#D4AF37]/15 text-[#F3E5AB] rounded-full border border-[#D4AF37]/20 font-medium uppercase tracking-wider">
                          <Sparkles className="w-2.5 h-2.5" /> {user?.role || 'Customer'}
                        </span>
                      </div>

                      <Link
                        to="/account/profile"
                        onClick={() => setUserDropdownOpen(false)}
                        className="w-full flex items-center gap-2.5 px-4 py-2 text-xs text-gray-300 hover:bg-white/5 hover:text-white text-left transition-colors"
                      >
                        <UserIcon className="w-3.5 h-3.5 text-gray-400 shrink-0" />
                        <span>Account Profile</span>
                      </Link>

                      <Link
                        to="/account/tickets"
                        onClick={() => setUserDropdownOpen(false)}
                        className="w-full flex items-center gap-2.5 px-4 py-2 text-xs text-gray-300 hover:bg-white/5 hover:text-white text-left transition-colors"
                      >
                        <Ticket className="w-3.5 h-3.5 text-gray-400 shrink-0" />
                        <span>My Tickets ({myTickets.length})</span>
                      </Link>

                      {/* Organizer Portal Link */}
                      <Link
                        to="/organizer"
                        onClick={() => setUserDropdownOpen(false)}
                        className="w-full flex items-center gap-2.5 px-4 py-2 text-xs text-[#D4AF37] hover:bg-[#D4AF37]/10 text-left transition-colors font-semibold"
                      >
                        <Building2 className="w-3.5 h-3.5 text-[#D4AF37] shrink-0" />
                        <span>Organizer Portal</span>
                      </Link>

                      {/* Ticket Counter Staff Link */}
                      {(isTicketCounter || isAdmin) && (
                        <Link
                          to="/counter"
                          onClick={() => setUserDropdownOpen(false)}
                          className="w-full flex items-center gap-2.5 px-4 py-2 text-xs text-[#D4AF37] hover:bg-[#D4AF37]/10 text-left transition-colors font-semibold"
                        >
                          <QrCode className="w-3.5 h-3.5 text-[#D4AF37] shrink-0" />
                          <span>Ticket Counter</span>
                        </Link>
                      )}

                      {/* Admin Portal Link */}
                      {isAdmin && (
                        <Link
                          to="/admin"
                          onClick={() => setUserDropdownOpen(false)}
                          className="w-full flex items-center gap-2.5 px-4 py-2 text-xs text-[#D4AF37] hover:bg-[#D4AF37]/10 text-left transition-colors font-semibold"
                        >
                          <ShieldCheck className="w-3.5 h-3.5 text-[#D4AF37] shrink-0" />
                          <span>Admin Portal</span>
                        </Link>
                      )}

                      <div className="border-t border-white/10 my-1"></div>

                      <button
                        onClick={() => {
                          logout();
                          setUserDropdownOpen(false);
                          navigate('/login');
                        }}
                        className="w-full flex items-center gap-2.5 px-4 py-2 text-xs text-red-400 hover:bg-red-500/10 text-left transition-colors cursor-pointer"
                      >
                        <LogOut className="w-3.5 h-3.5 text-red-400 shrink-0" />
                        <span>Sign Out</span>
                      </button>
                    </div>
                  )}
                </div>
              ) : (
                <Link
                  to="/login"
                  className="px-3 py-1.5 rounded-xl bg-[#D4AF37] hover:bg-[#F3E5AB] text-black font-semibold text-xs shadow-sm transition-all duration-200 active:scale-95 whitespace-nowrap cursor-pointer flex items-center justify-center"
                >
                  Sign In
                </Link>
              )}

              {/* Mobile Drawer Hamburger */}
              <button
                onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
                className="md:hidden w-8 h-8 flex items-center justify-center rounded-xl bg-[#141417] text-gray-300 hover:text-white border border-white/10 active:scale-95 transition-all cursor-pointer"
                aria-label={mobileMenuOpen ? "Close menu" : "Open navigation menu"}
              >
                {mobileMenuOpen ? <X className="w-4 h-4 text-white" /> : <Menu className="w-4 h-4 text-gray-300" />}
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
});
