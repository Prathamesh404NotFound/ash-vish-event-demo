import React, { useState } from 'react';
import { Link, NavLink, Outlet, useNavigate, useLocation } from 'react-router-dom';
import { Ticket, ShieldCheck, LayoutDashboard, Calendar, Users, QrCode, Settings, ArrowLeft, Tag, MessageSquare, Armchair, Building2, BarChart3, UserCheck, Clock, ChevronLeft, ChevronRight, Menu, X } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';

export const AdminLayoutPage: React.FC = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [mobileNavOpen, setMobileNavOpen] = useState(false);

  const isSuperAdmin = user?.role === 'admin' || user?.role === 'super_admin' || (user as any)?.rbacRole === 'super_admin';

  const navItems = [
    { title: 'Overview', path: '/admin', icon: LayoutDashboard },
    { title: 'Users', path: '/admin/users', icon: UserCheck, superAdminOnly: true },
    { title: 'Events', path: '/admin/events', icon: Calendar },
    { title: 'Organizers', path: '/admin/organizers', icon: Building2 },
    { title: 'Seat Map', path: '/admin/seatmap', icon: Armchair },
    { title: 'Bookings', path: '/admin/bookings', icon: Users },
    { title: 'Shifts', path: '/admin/shifts', icon: Clock },
    { title: 'Coupons', path: '/admin/coupons', icon: Tag },
    { title: 'Reports', path: '/admin/reports', icon: BarChart3 },
    { title: 'Reviews', path: '/admin/reviews', icon: MessageSquare },
    { title: 'Scanner', path: '/admin/scan', icon: QrCode },
    { title: 'Counters', path: '/admin/counters', icon: Armchair, superAdminOnly: true },
    { title: 'Settings', path: '/admin/settings', icon: Settings },
  ].filter((item) => !item.superAdminOnly || isSuperAdmin);

  const currentTitle = navItems.find((item) =>
    item.path === '/admin' ? location.pathname === '/admin' : location.pathname.startsWith(item.path)
  )?.title || 'Admin';

  return (
    <div className="min-h-screen bg-[#0A0A0A] text-white">

      {/* ─── Mobile Top Bar ─── */}
      <div className="lg:hidden fixed top-0 inset-x-0 z-50 bg-[#121212] border-b border-white/10 px-3 py-2.5 flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <button
            onClick={() => setMobileNavOpen(!mobileNavOpen)}
            className="p-2 rounded-lg bg-white/5 text-gray-400 hover:text-white cursor-pointer"
          >
            {mobileNavOpen ? <X className="w-4 h-4" /> : <Menu className="w-4 h-4" />}
          </button>
          <Link to="/" className="flex items-center gap-2">
            <img
              src="/ashvish-logo.png"
              alt="Ash-vish"
              onError={(e) => { if (e.currentTarget.src.includes('ashvish-logo.png')) e.currentTarget.src = '/favicon-192.png'; }}
              className="w-7 h-7 rounded-lg object-cover"
            />
            <div>
              <span className="font-heading font-bold text-xs text-white leading-none block">
                Ash-vish <span className="text-[#D4AF37]">admin</span>
              </span>
            </div>
          </Link>
        </div>
        <span className="text-[10px] font-bold text-[#D4AF37] uppercase tracking-wider">{currentTitle}</span>
      </div>

      {/* ─── Mobile Slide-Down Nav ─── */}
      {mobileNavOpen && (
        <div className="lg:hidden fixed inset-0 z-40 bg-black/60 backdrop-blur-sm" onClick={() => setMobileNavOpen(false)}>
          <div className="absolute top-12 inset-x-0 bg-[#121212] border-b border-white/10 max-h-[70vh] overflow-y-auto shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <div className="p-2 space-y-0.5">
              {navItems.map((item) => {
                const isActive = item.path === '/admin' ? location.pathname === '/admin' : location.pathname.startsWith(item.path);
                return (
                  <NavLink
                    key={item.path}
                    to={item.path}
                    end={item.path === '/admin'}
                    onClick={() => setMobileNavOpen(false)}
                    className={`flex items-center gap-3 px-3 py-2.5 rounded-xl text-xs font-semibold transition-all ${
                      isActive
                        ? 'bg-[#D4AF37] text-black'
                        : 'text-gray-400 hover:text-white hover:bg-white/5'
                    }`}
                  >
                    <item.icon className="w-4 h-4" />
                    <span>{item.title}</span>
                  </NavLink>
                );
              })}
            </div>
            <div className="p-2 border-t border-white/10">
              <button onClick={() => { setMobileNavOpen(false); navigate('/'); }} className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl bg-white/5 text-gray-400 text-xs font-semibold hover:bg-white/10 transition-colors cursor-pointer">
                <ArrowLeft className="w-3.5 h-3.5" />
                <span>Back to Site</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ─── Desktop Layout ─── */}
      <div className="hidden lg:flex min-h-screen">
        {/* Sidebar */}
        <aside className={`flex-shrink-0 bg-[#121212] border-r border-white/10 flex flex-col transition-all duration-300 ${sidebarOpen ? 'w-60' : 'w-16'}`}>
          {/* Sidebar Header */}
          <div className={`p-3 border-b border-white/10 flex items-center ${sidebarOpen ? 'justify-between' : 'justify-center'}`}>
            {sidebarOpen ? (
              <>
                <Link to="/" className="flex items-center gap-2.5 min-w-0">
                  <img
                    src="/ashvish-logo.png"
                    alt="Ash-vish"
                    onError={(e) => { if (e.currentTarget.src.includes('ashvish-logo.png')) e.currentTarget.src = '/favicon-192.png'; }}
                    className="w-8 h-8 rounded-lg object-cover shrink-0"
                  />
                  <div className="min-w-0">
                    <span className="font-heading font-bold text-xs text-white block leading-none truncate">
                      Ash-vish <span className="text-[#D4AF37]">admin</span>
                    </span>
                    <span className="text-[9px] uppercase tracking-widest text-gray-500 font-medium">Portal</span>
                  </div>
                </Link>
                <button onClick={() => setSidebarOpen(false)} className="p-1.5 rounded-lg hover:bg-white/10 text-gray-500 hover:text-white transition-colors cursor-pointer" title="Collapse sidebar">
                  <ChevronLeft className="w-4 h-4" />
                </button>
              </>
            ) : (
              <button onClick={() => setSidebarOpen(true)} className="p-1.5 rounded-lg hover:bg-white/10 text-gray-500 hover:text-white transition-colors cursor-pointer" title="Expand sidebar">
                <ChevronRight className="w-4 h-4" />
              </button>
            )}
          </div>

          {/* User Card (collapsed state) */}
          {!sidebarOpen && (
            <div className="p-2 flex justify-center border-b border-white/10">
              <img
                src={user?.photoUrl || 'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?auto=format&fit=crop&q=80&w=300'}
                alt={user?.name}
                className="w-8 h-8 rounded-lg object-cover border border-[#D4AF37]/40"
              />
            </div>
          )}

          {/* User Card (expanded) */}
          {sidebarOpen && (
            <div className="p-3 border-b border-white/10">
              <div className="flex items-center gap-2.5 p-2.5 rounded-xl bg-[#1A1A1A] border border-white/5">
                <img
                  src={user?.photoUrl || 'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?auto=format&fit=crop&q=80&w=300'}
                  alt={user?.name}
                  className="w-8 h-8 rounded-lg object-cover border border-[#D4AF37]/40 shrink-0"
                />
                <div className="min-w-0">
                  <p className="text-[11px] font-bold text-white truncate">{user?.name || 'Admin'}</p>
                  <span className="text-[9px] text-[#D4AF37] font-semibold uppercase tracking-wider">Super Admin</span>
                </div>
              </div>
            </div>
          )}

          {/* Nav Items */}
          <nav className="flex-1 overflow-y-auto p-2 space-y-0.5" aria-label="Admin sections">
            {navItems.map((item) => (
              <NavLink
                key={item.path}
                to={item.path}
                end={item.path === '/admin'}
                className={({ isActive }) =>
                  `flex items-center gap-2.5 rounded-xl transition-all text-xs font-semibold ${
                    sidebarOpen ? 'px-3 py-2.5' : 'justify-center px-0 py-2.5'
                  } ${
                    isActive
                      ? 'bg-[#D4AF37] text-black'
                      : 'text-gray-400 hover:text-white hover:bg-[#1C1C1C]'
                  }`
                }
                title={item.title}
              >
                <item.icon className="w-4 h-4 shrink-0" />
                {sidebarOpen && <span className="truncate">{item.title}</span>}
              </NavLink>
            ))}
          </nav>

          {/* Footer */}
          <div className="p-2 border-t border-white/10">
            <button
              onClick={() => navigate('/')}
              className={`w-full rounded-xl bg-[#1C1C1C] hover:bg-[#262626] text-gray-400 hover:text-white text-xs font-semibold transition-all border border-white/5 cursor-pointer ${
                sidebarOpen ? 'flex items-center justify-center gap-2 py-2.5 px-3' : 'flex items-center justify-center py-2.5'
              }`}
              title="Return to Site"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              {sidebarOpen && <span>Back to Site</span>}
            </button>
          </div>
        </aside>

        {/* Main Content */}
        <main className="flex-1 min-w-0 p-6 lg:p-8 overflow-y-auto">
          <Outlet />
        </main>
      </div>

      {/* ─── Tablet/Mobile Content ─── */}
      <main className="lg:hidden min-h-screen pt-12 pb-4 px-3 sm:px-4 overflow-y-auto">
        <Outlet />
      </main>
    </div>
  );
};
