import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { User, Mail, Phone, Shield, ShieldCheck, Ticket, Heart, LogOut, CheckCircle, Save, ArrowRight, QrCode } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { useBooking } from '../contexts/BookingContext';
import { useRoleAuth } from '../hooks/useRoleAuth';
import { UserAvatar } from '../components/UserAvatar';

export const ProfilePage: React.FC = () => {
  const { user, updateProfile, logout } = useAuth();
  const { myTickets, favorites } = useBooking();
  const { isAdmin, isTicketCounter } = useRoleAuth();
  const navigate = useNavigate();

  const [name, setName] = useState(user?.name || '');
  const [phone, setPhone] = useState(user?.phone || '');
  const [photoUrl, setPhotoUrl] = useState(user?.photoUrl || '');
  const [isSaved, setIsSaved] = useState(false);

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    updateProfile({ name, phone, photoUrl });
    setIsSaved(true);
    setTimeout(() => setIsSaved(false), 2000);
  };

  return (
    <div className="pb-16 pt-20 max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 space-y-8 animate-in fade-in">
      
      {/* Page Title */}
      <div className="border-b border-white/10 pb-6">
        <h1 className="font-heading font-extrabold text-3xl text-white">
          Account Profile & Settings
        </h1>
        <p className="text-xs sm:text-sm text-gray-400 mt-1">
          Manage your contact details, connected accounts, and VIP preferences.
        </p>
      </div>

      {/* Main Grid */}
      <div className="grid grid-cols-1 md:grid-cols-12 gap-8">
        
        {/* Left Column: Avatar & Overview */}
        <div className="md:col-span-5 bg-[#141414] border border-white/10 rounded-3xl p-6 flex flex-col items-center text-center space-y-4">
          <div className="relative">
            <UserAvatar
              src={photoUrl || undefined}
              name={user?.name}
              size="w-28 h-28"
              className="border-4 border-[#D4AF37]"
            />
          </div>

          <div>
            <h2 className="font-heading font-bold text-xl text-white">{user?.name}</h2>
            <p className="text-xs text-gray-400">{user?.email}</p>
            <span className="mt-1.5 inline-block px-3 py-0.5 text-[10px] bg-[#D4AF37]/10 text-[#D4AF37] rounded-full border border-[#D4AF37]/20 font-bold uppercase tracking-wider">
              Role: {user?.role || 'Customer'}
            </span>
          </div>

          <div className="w-full pt-4 border-t border-white/10 grid grid-cols-2 gap-3 text-center">
            <Link to="/account/tickets" className="p-3 rounded-2xl bg-[#1C1C1C] hover:bg-[#262626] border border-white/5 transition-all">
              <Ticket className="w-4 h-4 text-[#D4AF37] mx-auto mb-1" />
              <span className="font-heading font-bold text-lg text-white">{myTickets.length}</span>
              <span className="text-[10px] text-gray-400 block font-medium">Tickets</span>
            </Link>

            <Link to="/account/favorites" className="p-3 rounded-2xl bg-[#1C1C1C] hover:bg-[#262626] border border-white/5 transition-all">
              <Heart className="w-4 h-4 text-[#D4AF37] mx-auto mb-1 fill-[#D4AF37]" />
              <span className="font-heading font-bold text-lg text-white">{favorites.length}</span>
              <span className="text-[10px] text-gray-400 block font-medium">Favorites</span>
            </Link>
          </div>

          {/* Ticket Counter Staff Portal Access Card */}
          {(isTicketCounter || isAdmin) && (
            <div className="w-full pt-2">
              <div className="p-4 rounded-2xl bg-gradient-to-br from-[#1C1C1C] to-[#141414] border border-[#D4AF37]/30 text-left space-y-2 shadow-lg">
                <div className="flex items-center gap-2">
                  <QrCode className="w-5 h-5 text-[#D4AF37]" />
                  <span className="font-heading font-bold text-xs text-white uppercase tracking-wider">
                    Ticket Counter Portal
                  </span>
                </div>
                <p className="text-[11px] text-gray-400 leading-normal">
                  Live gate check-ins, QR scanning, and walk-in ticket sales.
                </p>
                <Link
                  to="/counter"
                  className="w-full py-2 px-3 rounded-xl bg-[#D4AF37] hover:bg-[#E3C456] text-black font-extrabold text-xs flex items-center justify-center gap-1.5 transition-all"
                >
                  <span>Launch Ticket Counter</span>
                  <ArrowRight className="w-3.5 h-3.5 stroke-[2.5]" />
                </Link>
              </div>
            </div>
          )}

          {/* Admin Management Console Button Card for Profile */}
          {isAdmin && (
            <div className="w-full pt-2">
              <div className="p-4 rounded-2xl bg-gradient-to-br from-[#1C1C1C] to-[#141414] border border-[#D4AF37]/30 text-left space-y-2 shadow-lg">
                <div className="flex items-center gap-2">
                  <ShieldCheck className="w-5 h-5 text-[#D4AF37]" />
                  <span className="font-heading font-bold text-xs text-white uppercase tracking-wider">
                    Admin Portal Access
                  </span>
                </div>
                <p className="text-[11px] text-gray-400 leading-normal">
                  Manage events, scan gate passes, and export attendee rosters.
                </p>
                <Link
                  to="/admin"
                  className="w-full py-2 px-3 rounded-xl bg-[#D4AF37] hover:bg-[#E3C456] text-black font-extrabold text-xs flex items-center justify-center gap-1.5 transition-all"
                >
                  <span>Launch Admin Console</span>
                  <ArrowRight className="w-3.5 h-3.5 stroke-[2.5]" />
                </Link>
              </div>
            </div>
          )}

          {/* Connected Account Tag */}
          <div className="w-full pt-1">
            <span className="w-full py-2 px-3 rounded-xl bg-[#1C1C1C] border border-white/10 text-xs text-gray-300 flex items-center justify-center gap-2">
              <Shield className="w-4 h-4 text-emerald-400" />
              <span>Auth via Google / Firebase</span>
            </span>
          </div>

          <button
            onClick={() => {
              logout();
              navigate('/login');
            }}
            className="w-full mt-auto py-2.5 rounded-xl bg-red-500/10 hover:bg-red-500/20 text-red-400 border border-red-500/20 font-bold text-xs flex items-center justify-center gap-2 transition-all"
          >
            <LogOut className="w-4 h-4" />
            <span>Sign Out</span>
          </button>
        </div>


        {/* Right Column: Editable Profile Form */}
        <div className="md:col-span-7 bg-[#141414] border border-white/10 rounded-3xl p-6 space-y-6">
          <h3 className="font-heading font-bold text-lg text-white border-b border-white/10 pb-4">
            Edit Details
          </h3>

          <form onSubmit={handleSave} className="space-y-4">
            <div>
              <label className="text-xs font-bold text-gray-300 block mb-1">
                Full Display Name
              </label>
              <div className="relative">
                <User className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="w-full bg-[#1C1C1C] border border-white/10 rounded-xl pl-10 pr-4 py-2.5 text-xs text-white focus:outline-none focus:border-[#D4AF37]"
                />
              </div>
            </div>

            <div>
              <label className="text-xs font-bold text-gray-300 block mb-1">
                Email Address (Read only)
              </label>
              <div className="relative">
                <Mail className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                <input
                  type="email"
                  disabled
                  value={user?.email || ''}
                  className="w-full bg-[#1C1C1C]/50 border border-white/5 rounded-xl pl-10 pr-4 py-2.5 text-xs text-gray-400 cursor-not-allowed"
                />
              </div>
            </div>

            <div>
              <label className="text-xs font-bold text-gray-300 block mb-1">
                WhatsApp Mobile Number (Mandatory for QR Pass Delivery) <span className="text-amber-400">*</span>
              </label>
              <div className="relative">
                <Phone className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-emerald-400" />
                <input
                  type="tel"
                  required
                  placeholder="+91 98200 12345"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  className="w-full bg-[#1C1C1C] border border-white/10 rounded-xl pl-10 pr-4 py-2.5 text-xs text-white focus:outline-none focus:border-[#D4AF37]"
                />
              </div>
            </div>

            <div>
              <label className="text-xs font-bold text-gray-300 block mb-1">
                Avatar Image URL
              </label>
              <input
                type="url"
                value={photoUrl}
                onChange={(e) => setPhotoUrl(e.target.value)}
                className="w-full bg-[#1C1C1C] border border-white/10 rounded-xl px-4 py-2.5 text-xs text-white focus:outline-none focus:border-[#D4AF37]"
              />
            </div>

            <button
              type="submit"
              className="w-full py-3 rounded-xl bg-[#D4AF37] hover:bg-[#E3C456] text-black font-extrabold text-xs flex items-center justify-center gap-2 transition-all"
            >
              {isSaved ? (
                <>
                  <CheckCircle className="w-4 h-4" />
                  <span>Profile Saved!</span>
                </>
              ) : (
                <>
                  <Save className="w-4 h-4" />
                  <span>Save Changes</span>
                </>
              )}
            </button>
          </form>
        </div>

      </div>

    </div>
  );
};
