import React from 'react';
import { Settings, ShieldCheck, Key, Database, Globe } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';

export const AdminSettings: React.FC = () => {
  const { user } = useAuth();

  return (
    <div className="space-y-6 max-w-4xl mx-auto">
      <div className="p-6 rounded-3xl bg-[#141414] border border-white/10 flex items-center gap-3">
        <div className="w-10 h-10 rounded-2xl bg-[#D4AF37]/10 border border-[#D4AF37]/30 flex items-center justify-center text-[#D4AF37]">
          <Settings className="w-5 h-5" />
        </div>
        <div>
          <h1 className="font-heading font-extrabold text-xl text-white">System & Platform Settings</h1>
          <p className="text-gray-400 text-xs mt-0.5">Firebase Realtime Database nodes, API credentials, and role policies.</p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="p-6 rounded-3xl bg-[#141414] border border-white/10 space-y-3">
          <div className="flex items-center gap-2 text-white font-bold text-sm">
            <Database className="w-4 h-4 text-[#D4AF37]" />
            <span>Firebase Security Rule Boundary</span>
          </div>
          <p className="text-xs text-gray-400 leading-relaxed">
            Staff roles are loaded directly from <code className="text-[#D4AF37] font-mono">staff/{'{uid}'}</code> in the Realtime Database with write disabled.
          </p>
          <span className="inline-block px-2.5 py-1 rounded-lg bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 text-[11px] font-semibold">
            Status: Active & Enforced
          </span>
        </div>

        <div className="p-6 rounded-3xl bg-[#141414] border border-white/10 space-y-3">
          <div className="flex items-center gap-2 text-white font-bold text-sm">
            <Globe className="w-4 h-4 text-[#D4AF37]" />
            <span>Organization Branding</span>
          </div>
          <p className="text-xs text-gray-400 leading-relaxed">
            Primary Platform Identity: <strong className="text-white">Ash-vish events</strong>
          </p>
          <span className="inline-block px-2.5 py-1 rounded-lg bg-[#D4AF37]/10 text-[#D4AF37] border border-[#D4AF37]/20 text-[11px] font-semibold">
            Theme: Professional Polish
          </span>
        </div>
      </div>
    </div>
  );
};
