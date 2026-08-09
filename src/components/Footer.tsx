import React from 'react';
import { Ticket, Send, Shield, Globe, Award, Sparkles } from 'lucide-react';

interface FooterProps {
  setActiveTab: (tab: string) => void;
}

export const Footer: React.FC<FooterProps> = ({ setActiveTab }) => {
  return (
    <footer className="bg-[#141414] border-t border-white/10 text-gray-400 mt-20 pt-16 pb-12 transition-all">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        
        {/* Main Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-10 pb-12 border-b border-white/10">
          
          {/* Brand & Newsletter Column */}
          <div className="lg:col-span-2 flex flex-col gap-4">
            <div
              onClick={() => setActiveTab('home')}
              className="flex items-center gap-2.5 cursor-pointer"
            >
              <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-[#FFF6D6] to-[#D4AF37] flex items-center justify-center text-black font-bold shadow-lg shadow-[#D4AF37]/25">
                <Ticket className="w-5 h-5 stroke-[2.5]" />
              </div>
              <span className="font-heading font-extrabold text-2xl tracking-tight text-white">
                Ash-vish<span className="text-[#D4AF37]"> events</span>
              </span>
            </div>
            
            <p className="text-sm text-gray-400 max-w-sm leading-relaxed">
              The premium live entertainment ticketing ecosystem. Discover world tour concerts, intimate acoustic sessions, standup comedy, and championship sports with instant digital passes.
            </p>

            {/* Newsletter Input */}
            <div className="mt-2 flex flex-col gap-2">
              <label className="text-xs font-semibold text-white uppercase tracking-wider flex items-center gap-1.5">
                <Sparkles className="w-3.5 h-3.5 text-[#D4AF37]" />
                Get VIP Early Pass Access
              </label>
              <div className="flex gap-2 max-w-md">
                <input
                  type="email"
                  placeholder="Enter your email address"
                  className="flex-1 bg-[#1C1C1C] border border-white/10 rounded-xl px-4 py-2.5 text-xs text-white placeholder-gray-500 focus:outline-none focus:border-[#D4AF37] transition-colors"
                />
                <button className="px-4 py-2.5 bg-gradient-to-r from-[#F3E5AB] to-[#D4AF37] text-black font-bold text-xs rounded-xl flex items-center gap-1.5 shadow-md shadow-[#D4AF37]/20 transition-all hover:brightness-110">
                  <span>Subscribe</span>
                  <Send className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          </div>

          {/* Column 2: Event Categories */}
          <div className="flex flex-col gap-3">
            <h4 className="font-heading text-sm font-bold text-white uppercase tracking-wider">
              Categories
            </h4>
            <ul className="space-y-2 text-xs">
              <li>
                <button onClick={() => setActiveTab('search')} className="hover:text-[#D4AF37] transition-colors">
                  Music Concerts
                </button>
              </li>
              <li>
                <button onClick={() => setActiveTab('search')} className="hover:text-[#D4AF37] transition-colors">
                  Standup Comedy
                </button>
              </li>
              <li>
                <button onClick={() => setActiveTab('search')} className="hover:text-[#D4AF37] transition-colors">
                  Sports & Championship
                </button>
              </li>
              <li>
                <button onClick={() => setActiveTab('search')} className="hover:text-[#D4AF37] transition-colors">
                  Theatre & Musicals
                </button>
              </li>
              <li>
                <button onClick={() => setActiveTab('search')} className="hover:text-[#D4AF37] transition-colors">
                  EDM & Festivals
                </button>
              </li>
            </ul>
          </div>

          {/* Column 3: Popular Cities */}
          <div className="flex flex-col gap-3">
            <h4 className="font-heading text-sm font-bold text-white uppercase tracking-wider">
              Top Cities
            </h4>
            <ul className="space-y-2 text-xs">
              <li className="hover:text-white cursor-pointer">New York</li>
              <li className="hover:text-white cursor-pointer">Los Angeles</li>
              <li className="hover:text-white cursor-pointer">Chicago</li>
              <li className="hover:text-white cursor-pointer">Miami</li>
              <li className="hover:text-white cursor-pointer">London & Europe</li>
            </ul>
          </div>

          {/* Column 4: Guarantees */}
          <div className="flex flex-col gap-3">
            <h4 className="font-heading text-sm font-bold text-white uppercase tracking-wider">
              Trust & Security
            </h4>
            <div className="space-y-3 text-xs">
              <div className="flex items-start gap-2.5">
                <Shield className="w-4 h-4 text-[#D4AF37] shrink-0 mt-0.5" />
                <span>100% Verified Ticket Guarantee</span>
              </div>
              <div className="flex items-start gap-2.5">
                <Award className="w-4 h-4 text-[#D4AF37] shrink-0 mt-0.5" />
                <span>Official Partner Venue Direct Access</span>
              </div>
              <div className="flex items-start gap-2.5">
                <Globe className="w-4 h-4 text-[#D4AF37] shrink-0 mt-0.5" />
                <span>Global Multi-Currency Pass Support</span>
              </div>
            </div>
          </div>

        </div>

        {/* Bottom copyright bar */}
        <div className="pt-8 flex flex-col sm:flex-row items-center justify-between text-xs text-gray-500 gap-4">
          <p>© 2026 Ash-vish Events Inc. All rights reserved. Crafted with precision.</p>
          <div className="flex items-center gap-6">
            <span className="hover:text-gray-300 cursor-pointer">Privacy Policy</span>
            <span className="hover:text-gray-300 cursor-pointer">Terms of Service</span>
            <span className="hover:text-gray-300 cursor-pointer">Support Center</span>
          </div>
        </div>

      </div>
    </footer>
  );
};
