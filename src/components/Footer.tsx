import React from 'react';
import { Shield, Award, Phone, Mail, MapPin } from 'lucide-react';

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
              <img
                src="/ashvish-logo.png"
                alt="Ash-vish Events Logo"
                onError={(e) => {
                  const target = e.currentTarget;
                  if (target.src.includes('ashvish-logo.png')) {
                    target.src = '/favicon-192.png';
                  }
                }}
                className="w-9 h-9 rounded-xl object-cover shadow-lg shadow-[#D4AF37]/25"
              />
              <span className="font-heading font-extrabold text-2xl tracking-tight text-white">
                Ash-vish<span className="text-[#D4AF37]"> events</span>
              </span>
            </div>
            
            <p className="text-sm text-gray-400 max-w-sm leading-relaxed">
              The premium live entertainment ticketing ecosystem. Discover concerts, musical nights, standup comedy, and championship sports with instant digital passes.
            </p>

            {/* Contact Info */}
            <div className="mt-2 flex flex-col gap-2 text-xs">
              <a
                href="https://maps.app.goo.gl/bvBY5NKvcUiUcijD9"
                target="_blank"
                rel="noopener noreferrer"
                className="hover:text-[#D4AF37] transition-colors flex items-start gap-1.5"
              >
                <MapPin className="w-3.5 h-3.5 text-[#D4AF37] shrink-0 mt-0.5" />
                The Sayaji, Kolhapur
              </a>
              <a href="mailto:hello@ashvishevents.com" className="hover:text-[#D4AF37] transition-colors flex items-center gap-1.5">
                <Mail className="w-3.5 h-3.5 text-[#D4AF37]" /> hello@ashvishevents.com
              </a>
              <a href="tel:+91" className="hover:text-[#D4AF37] transition-colors flex items-center gap-1.5">
                <Phone className="w-3.5 h-3.5 text-[#D4AF37]" /> Booking & Support Enquiries
              </a>
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
              <li>
                <button onClick={() => setActiveTab('search')} className="hover:text-[#D4AF37] transition-colors text-left">
                  Kolhapur
                </button>
              </li>
              <li>
                <button onClick={() => setActiveTab('search')} className="hover:text-[#D4AF37] transition-colors text-left">
                  Mumbai
                </button>
              </li>
              <li>
                <button onClick={() => setActiveTab('search')} className="hover:text-[#D4AF37] transition-colors text-left">
                  Pune
                </button>
              </li>
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
                <span>Official AV Events — Direct Venue Access</span>
              </div>
            </div>
          </div>

        </div>

        {/* Bottom copyright bar */}
        <div className="pt-8 flex flex-col sm:flex-row items-center justify-between text-xs text-gray-500 gap-4">
          <p>© 2026 AV Events. All rights reserved. T&C Apply.</p>
          <div className="flex items-center gap-6">
            <button onClick={() => setActiveTab('terms')} className="hover:text-[#D4AF37] transition-colors">Terms & Conditions</button>
            <a href="mailto:hello@ashvishevents.com" className="hover:text-[#D4AF37] transition-colors">Support</a>
            <a href="mailto:hello@ashvishevents.com" className="hover:text-[#D4AF37] transition-colors">Booking Enquiries</a>
          </div>
        </div>

      </div>
    </footer>
  );
};
