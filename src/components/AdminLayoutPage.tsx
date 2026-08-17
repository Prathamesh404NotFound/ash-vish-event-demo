import React from 'react';
import { Link, NavLink, Outlet, useNavigate } from 'react-router-dom';
import { Ticket, ShieldCheck, LayoutDashboard, Calendar, Users, QrCode, Settings, ArrowLeft, Tag, MessageSquare, Armchair, Building2, BarChart3, UserCheck } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';

export const AdminLayoutPage: React.FC = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const isSuperAdmin = user?.role === 'admin' || (user as any)?.rbacRole === 'super_admin';

  const navItems = [
    {
      title: "Overview",
      path: "/admin",
      icon: LayoutDashboard,
      description: "Metrics & revenue analytics"
    },
    {
      title: "Users & Roles",
      path: "/admin/users",
      icon: UserCheck,
      description: "Manage staff accounts & RBAC",
      superAdminOnly: true,
    },
    {
      title: "Event CRUD Inventory",
      path: "/admin/events",
      icon: Calendar,
      description: "Manage live shows & tickets"
    },
    {
      title: "Organizer Accounts",
      path: "/admin/organizers",
      icon: Building2,
      description: "Approve & oversee event organizers"
    },
    {
      title: "Seat-Map Builder",
      path: "/admin/seatmap",
      icon: Armchair,
      description: "Custom layout & pricing builder"
    },
    {
      title: "Attendee Roster",
      path: "/admin/bookings",
      icon: Users,
      description: "View all booked tickets"
    },
    {
      title: "Coupons & Discounts",
      path: "/admin/coupons",
      icon: Tag,
      description: "Promos & discount codes"
    },
    {
      title: "Reports",
      path: "/admin/reports",
      icon: BarChart3,
      description: "Revenue, attendance & channels"
    },
    {
      title: "Fan Review Moderation",
      path: "/admin/reviews",
      icon: MessageSquare,
      description: "Moderate ratings & reviews"
    },
    {
      title: "Gate Pass Scanner",
      path: "/admin/scan",
      icon: QrCode,
      description: "Verify event entry tickets"
    },
    {
      title: "Ticket Counters",
      path: "/admin/counters",
      icon: Armchair,
      description: "Counter stations, staff & merchant UPI",
      superAdminOnly: true,
    },
    {
      title: "Console Settings",
      path: "/admin/settings",
      icon: Settings,
      description: "Permissions & configurations"
    }
  ].filter((item) => !item.superAdminOnly || isSuperAdmin);

  return (
    <div className="min-h-screen bg-[#0A0A0A] text-white flex flex-col md:flex-row">
      {/* Admin Persistent Sidebar */}
      <aside className="w-full lg:w-64 bg-[#121212] border-b lg:border-b-0 lg:border-r border-white/10 flex-shrink-0 p-3 sm:p-5 space-y-3 sm:space-y-6">
        <div className="flex items-center justify-between">
          <Link to="/" className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-[#FFF6D6] to-[#D4AF37] flex items-center justify-center text-black font-bold">
              <Ticket className="w-4 h-4 stroke-[2.5]" />
            </div>
            <div>
              <span className="font-heading font-extrabold text-base tracking-tight text-white block leading-none">
                Ash-vish<span className="text-[#D4AF37]"> admin</span>
              </span>
              <span className="text-[10px] uppercase tracking-widest text-gray-400 font-medium">
                Super Admin Portal
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

        {/* User Card */}
        <div className="hidden sm:flex p-3.5 rounded-2xl bg-[#1A1A1A] border border-white/10 items-center gap-3">
          <img
            src={user?.photoUrl || 'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?auto=format&fit=crop&q=80&w=300'}
            alt={user?.name}
            className="w-9 h-9 rounded-xl object-cover border border-[#D4AF37]/40"
          />
          <div className="overflow-hidden">
            <p className="text-xs font-bold text-white truncate">{user?.name || 'Administrator'}</p>
            <span className="inline-flex items-center gap-1 text-[10px] text-[#D4AF37] font-semibold uppercase tracking-wider">
              <ShieldCheck className="w-3 h-3" /> System Super Admin
            </span>
          </div>
        </div>

        {/* Navigation */}
        <nav className="flex lg:block gap-1.5 overflow-x-auto no-scrollbar lg:space-y-1.5 pb-1 lg:pb-0" aria-label="Admin sections">
          {navItems.map((item) => (
            <NavLink
              key={item.path}
              to={item.path}
              end={item.path === '/admin'}
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

        <div className="hidden lg:block pt-4 border-t border-white/10">
          <button
            onClick={() => navigate('/')}
            className="w-full py-2.5 px-3 rounded-xl bg-[#1C1C1C] hover:bg-[#262626] text-gray-300 hover:text-white text-xs font-semibold flex items-center justify-center gap-2 transition-all border border-white/5"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            <span>Return to Customer View</span>
          </button>
        </div>
      </aside>

      {/* Main Content Shell */}
      <main className="min-w-0 flex-1 p-3 sm:p-4 lg:p-8 pb-20 lg:pb-8 overflow-y-auto">
        <Outlet />
      </main>
    </div>
  );
};
