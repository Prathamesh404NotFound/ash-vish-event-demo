import React, { useState, useEffect, useRef } from 'react';
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
  QrCode,
  Building2,
  ChevronRight,
} from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { useBooking } from '../contexts/BookingContext';
import { useRoleAuth } from '../hooks/useRoleAuth';
import { UserAvatar } from './UserAvatar';
import { LanguageToggle } from './LanguageToggle';

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
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Close dropdown on outside click
  useEffect(() => {
    if (!userDropdownOpen) return;
    const handler = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setUserDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [userDropdownOpen]);

  // Close mobile menu on route change
  useEffect(() => {
    setMobileMenuOpen(false);
    setUserDropdownOpen(false);
  }, [location.pathname]);

  const navItems = [
    { path: '/', label: 'Explore', icon: Compass },
    { path: '/events', label: 'Browse', icon: Calendar },
    { path: '/account/tickets', label: 'My Tickets', icon: Ticket, badge: myTickets.length },
    { path: '/account/favorites', label: 'Saved', icon: Heart, badge: favorites.length },
  ];

  const handleLogout = () => {
    logout();
    setUserDropdownOpen(false);
    setMobileMenuOpen(false);
    navigate('/login');
  };

  return (
    <>
      {/* ─── Top Navbar ─── */}
      <header className="fixed top-0 inset-x-0 z-50 bg-[#0A0A0C] border-b border-white/10">
        <div className="max-w-7xl mx-auto px-4 sm:px-6">
          <nav className="h-14 sm:h-16 flex items-center justify-between gap-4">

            {/* Logo — full size, no crop */}
            <Link to="/" className="flex items-center gap-3 cursor-pointer group focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#D4AF37] rounded-lg shrink-0">
              <img
                src="/ashvish-logo.png"
                alt="Ash-vish Events"
                onError={(e) => {
                  const t = e.currentTarget;
                  if (t.src.includes('ashvish-logo.png')) t.src = '/favicon-192.png';
                }}
                className="h-8 sm:h-9 w-auto object-contain"
              />
              <span className="font-heading font-bold text-sm sm:text-base tracking-tight text-white leading-tight">
                Ash-vish <span className="text-[#D4AF37]">Events</span>
              </span>
            </Link>

            {/* Desktop Nav Links */}
            <div className="hidden md:flex items-center gap-1">
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
                        ? 'bg-[#D4AF37]/15 text-[#F3E5AB]'
                        : 'text-gray-400 hover:text-gray-200 hover:bg-white/5'
                    }`}
                  >
                    <Icon className={`w-3.5 h-3.5 shrink-0 ${isActive ? 'text-[#D4AF37]' : ''}`} />
                    <span>{item.label}</span>
                    {!!item.badge && item.badge > 0 && (
                      <span className={`text-[9px] px-1.5 py-0.2 rounded-full font-bold ${isActive ? 'bg-[#D4AF37] text-black' : 'bg-white/10 text-gray-300'}`}>
                        {item.badge}
                      </span>
                    )}
                  </Link>
                );
              })}
            </div>

            {/* Right Actions */}
            <div className="flex items-center gap-2 shrink-0">
              {/* Language Toggle */}
              <div className="hidden sm:block">
                <LanguageToggle />
              </div>

              {/* Search */}
              {onOpenSearch && (
                <button
                  onClick={onOpenSearch}
                  className="p-2 rounded-lg hover:bg-white/5 text-gray-400 hover:text-white transition-all active:scale-95 cursor-pointer"
                  aria-label="Search events"
                >
                  <Search className="w-5 h-5" />
                </button>
              )}

              {/* User Menu / Auth */}
              {isAuthenticated ? (
                <div className="relative" ref={dropdownRef}>
                  {/* Desktop: avatar button → dropdown */}
                  <button
                    onClick={() => setUserDropdownOpen(!userDropdownOpen)}
                    className="hidden md:flex items-center gap-2 p-1 rounded-lg hover:bg-white/5 transition-all active:scale-95 cursor-pointer"
                    aria-label="Account menu"
                    aria-expanded={userDropdownOpen}
                  >
                    <UserAvatar src={user?.photoUrl} name={user?.name} size="w-8 h-8" className="border border-[#D4AF37]/30" />
                  </button>

                  {/* Mobile: hamburger → opens slide-in */}
                  <button
                    onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
                    className="md:hidden p-2 rounded-lg hover:bg-white/5 text-gray-300 hover:text-white active:scale-95 transition-all cursor-pointer"
                    aria-label={mobileMenuOpen ? 'Close menu' : 'Open menu'}
                  >
                    {mobileMenuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
                  </button>

                  {/* Desktop Dropdown */}
                  {userDropdownOpen && (
                    <div className="hidden md:block absolute right-0 mt-2 w-52 bg-[#121214] border border-white/10 rounded-2xl shadow-2xl py-1.5 z-50 animate-in fade-in slide-in-from-top-1">
                      <div className="px-4 py-2.5 border-b border-white/10">
                        <p className="text-xs font-semibold text-white truncate">{user?.name}</p>
                        <p className="text-[10px] text-gray-500 truncate mt-0.5">{user?.email}</p>
                      </div>

                      <Link to="/account/profile" onClick={() => setUserDropdownOpen(false)} className="w-full flex items-center gap-2.5 px-4 py-2 text-xs text-gray-300 hover:bg-white/5 hover:text-white transition-colors">
                        <UserIcon className="w-3.5 h-3.5 text-gray-500 shrink-0" />
                        <span>Profile</span>
                      </Link>

                      <Link to="/account/tickets" onClick={() => setUserDropdownOpen(false)} className="w-full flex items-center gap-2.5 px-4 py-2 text-xs text-gray-300 hover:bg-white/5 hover:text-white transition-colors">
                        <Ticket className="w-3.5 h-3.5 text-gray-500 shrink-0" />
                        <span>My Tickets</span>
                        {myTickets.length > 0 && <span className="ml-auto text-[10px] bg-white/10 text-gray-400 px-1.5 py-0.5 rounded-full">{myTickets.length}</span>}
                      </Link>

                      <Link to="/organizer" onClick={() => setUserDropdownOpen(false)} className="w-full flex items-center gap-2.5 px-4 py-2 text-xs text-[#D4AF37] hover:bg-[#D4AF37]/10 transition-colors font-semibold">
                        <Building2 className="w-3.5 h-3.5 shrink-0" />
                        <span>Organizer</span>
                        <ChevronRight className="w-3 h-3 ml-auto opacity-50" />
                      </Link>

                      {(isTicketCounter || isAdmin) && (
                        <Link to="/counter" onClick={() => setUserDropdownOpen(false)} className="w-full flex items-center gap-2.5 px-4 py-2 text-xs text-[#D4AF37] hover:bg-[#D4AF37]/10 transition-colors font-semibold">
                          <QrCode className="w-3.5 h-3.5 shrink-0" />
                          <span>Counter</span>
                          <ChevronRight className="w-3 h-3 ml-auto opacity-50" />
                        </Link>
                      )}

                      {isAdmin && (
                        <Link to="/admin" onClick={() => setUserDropdownOpen(false)} className="w-full flex items-center gap-2.5 px-4 py-2 text-xs text-[#D4AF37] hover:bg-[#D4AF37]/10 transition-colors font-semibold">
                          <ShieldCheck className="w-3.5 h-3.5 shrink-0" />
                          <span>Admin</span>
                          <ChevronRight className="w-3 h-3 ml-auto opacity-50" />
                        </Link>
                      )}

                      <div className="border-t border-white/10 my-1" />

                      <button onClick={handleLogout} className="w-full flex items-center gap-2.5 px-4 py-2 text-xs text-red-400 hover:bg-red-500/10 transition-colors cursor-pointer">
                        <LogOut className="w-3.5 h-3.5 shrink-0" />
                        <span>Sign Out</span>
                      </button>
                    </div>
                  )}
                </div>
              ) : (
                <Link to="/login" className="px-3 py-1.5 rounded-xl bg-[#D4AF37] hover:bg-[#F3E5AB] text-black font-semibold text-xs transition-all active:scale-95 whitespace-nowrap cursor-pointer">
                  Sign In
                </Link>
              )}
            </div>
          </nav>
        </div>
      </header>

      {/* ─── Mobile Slide-In Menu (user profile + admin links only) ─── */}
      {mobileMenuOpen && (
        <div className="fixed inset-0 z-40 md:hidden" onClick={() => setMobileMenuOpen(false)}>
          {/* Backdrop */}
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />

          {/* Slide-in panel from right */}
          <div
            className="absolute right-0 top-0 bottom-0 w-72 bg-[#121214] border-l border-white/10 shadow-2xl flex flex-col animate-in slide-in-from-right duration-200"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div className="p-4 border-b border-white/10 flex items-center justify-between">
              <div className="flex items-center gap-3 min-w-0">
                <UserAvatar src={user?.photoUrl} name={user?.name} size="w-9 h-9" className="border border-[#D4AF37]/30 shrink-0" />
                <div className="min-w-0">
                  <p className="text-xs font-bold text-white truncate">{user?.name}</p>
                  <p className="text-[10px] text-gray-500 truncate">{user?.email}</p>
                </div>
              </div>
              <button onClick={() => setMobileMenuOpen(false)} className="p-1.5 rounded-lg hover:bg-white/10 text-gray-400 cursor-pointer">
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Links */}
            <div className="flex-1 overflow-y-auto p-3 space-y-1">
              <Link to="/account/profile" onClick={() => setMobileMenuOpen(false)} className="flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm text-gray-300 hover:bg-white/5 hover:text-white transition-colors">
                <UserIcon className="w-4 h-4 text-gray-500" />
                <span>Profile</span>
              </Link>

              <Link to="/account/tickets" onClick={() => setMobileMenuOpen(false)} className="flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm text-gray-300 hover:bg-white/5 hover:text-white transition-colors">
                <Ticket className="w-4 h-4 text-gray-500" />
                <span>My Tickets</span>
                {myTickets.length > 0 && <span className="ml-auto text-[10px] bg-white/10 text-gray-400 px-1.5 py-0.5 rounded-full">{myTickets.length}</span>}
              </Link>

              <Link to="/account/favorites" onClick={() => setMobileMenuOpen(false)} className="flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm text-gray-300 hover:bg-white/5 hover:text-white transition-colors">
                <Heart className="w-4 h-4 text-gray-500" />
                <span>Saved Shows</span>
                {favorites.length > 0 && <span className="ml-auto text-[10px] bg-white/10 text-gray-400 px-1.5 py-0.5 rounded-full">{favorites.length}</span>}
              </Link>

              <div className="border-t border-white/10 my-2" />

              <Link to="/organizer" onClick={() => setMobileMenuOpen(false)} className="flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm text-[#D4AF37] hover:bg-[#D4AF37]/10 transition-colors font-semibold">
                <Building2 className="w-4 h-4" />
                <span>Organizer Portal</span>
              </Link>

              {(isTicketCounter || isAdmin) && (
                <Link to="/counter" onClick={() => setMobileMenuOpen(false)} className="flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm text-[#D4AF37] hover:bg-[#D4AF37]/10 transition-colors font-semibold">
                  <QrCode className="w-4 h-4" />
                  <span>Ticket Counter</span>
                </Link>
              )}

              {isAdmin && (
                <Link to="/admin" onClick={() => setMobileMenuOpen(false)} className="flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm text-[#D4AF37] hover:bg-[#D4AF37]/10 transition-colors font-semibold">
                  <ShieldCheck className="w-4 h-4" />
                  <span>Admin Portal</span>
                </Link>
              )}
            </div>

            {/* Sign Out */}
            <div className="p-3 border-t border-white/10">
              <button onClick={handleLogout} className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl bg-red-500/10 text-red-400 text-sm font-semibold hover:bg-red-500/20 transition-colors cursor-pointer">
                <LogOut className="w-4 h-4" />
                <span>Sign Out</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ─── Mobile Bottom Navigation Bar ─── */}
      <div className="md:hidden fixed bottom-0 inset-x-0 z-40 bg-[#0A0A0C]/95 backdrop-blur-xl border-t border-white/10 px-2 pb-safe">
        <div className="flex items-center justify-around py-1.5">
          {navItems.map((item) => {
            const Icon = item.icon;
            const isActive = location.pathname === item.path;
            return (
              <Link
                key={item.path}
                to={item.path}
                className={`flex flex-col items-center gap-0.5 py-1.5 px-3 rounded-xl transition-all min-w-0 ${
                  isActive ? 'text-[#D4AF37]' : 'text-gray-500 active:text-gray-300'
                }`}
              >
                <div className="relative">
                  <Icon className={`w-5 h-5 ${isActive ? 'drop-shadow-[0_0_6px_rgba(212,175,55,0.4)]' : ''}`} />
                  {!!item.badge && item.badge > 0 && (
                    <span className="absolute -top-1 -right-1.5 w-3.5 h-3.5 bg-[#D4AF37] text-black text-[8px] font-bold rounded-full flex items-center justify-center">
                      {item.badge > 9 ? '9+' : item.badge}
                    </span>
                  )}
                </div>
                <span className="text-[10px] font-medium leading-none">{item.label.split(' ')[0]}</span>
              </Link>
            );
          })}
        </div>
      </div>
    </>
  );
});
