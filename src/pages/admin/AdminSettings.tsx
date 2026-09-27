import React, { useEffect, useState } from 'react';
import { Settings, ShieldCheck, Key, Database, Globe, Users, Loader2 } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { authenticatedApiHeaders } from '../../lib/authHeaders';

export const AdminSettings: React.FC = () => {
  const { user } = useAuth();
  const [allowPartialEntry, setAllowPartialEntry] = useState<boolean | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch('/api/settings/entry', { headers: await authenticatedApiHeaders() });
        const data = await res.json();
        if (data.success) setAllowPartialEntry(Boolean(data.allowPartialEntry));
      } catch {
        setAllowPartialEntry(true);
      }
    })();
  }, []);

  const togglePartialEntry = async () => {
    if (allowPartialEntry === null || saving) return;
    setSaving(true);
    const next = !allowPartialEntry;
    try {
      const res = await fetch('/api/settings/entry', {
        method: 'POST',
        headers: await authenticatedApiHeaders(),
        body: JSON.stringify({ allowPartialEntry: next }),
      });
      const data = await res.json();
      if (data.success) setAllowPartialEntry(Boolean(data.allowPartialEntry));
    } finally {
      setSaving(false);
    }
  };

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

      <div className="p-6 rounded-3xl bg-[#141414] border border-white/10 space-y-4">
        <div className="flex items-center gap-2 text-white font-bold text-sm">
          <Users className="w-4 h-4 text-[#D4AF37]" />
          <span>Multi-Entry / Partial Check-In</span>
        </div>
        <p className="text-xs text-gray-400 leading-relaxed">
          When enabled, staff can admit fewer guests than a group ticket's quantity. Remaining guests can reuse the same QR code later, and every admission is recorded in an entry audit trail. When disabled, scanning a ticket redeems its full entitlement at once.
        </p>
        <div className="flex items-center justify-between p-3.5 rounded-2xl bg-[#1C1C1C] border border-white/10">
          <div>
            <p className="text-xs font-bold text-white">Allow partial check-in for group tickets</p>
            <p className={`text-[11px] font-bold mt-0.5 ${allowPartialEntry ? 'text-emerald-400' : 'text-amber-400'}`}>
              {allowPartialEntry === null ? 'Loading…' : allowPartialEntry ? 'ON — partial arrivals allowed' : 'OFF — full redemption per scan'}
            </p>
          </div>
          <button
            onClick={togglePartialEntry}
            disabled={saving || allowPartialEntry === null}
            className={`relative w-14 h-8 rounded-full transition-all cursor-pointer disabled:opacity-50 shrink-0 ${allowPartialEntry ? 'bg-emerald-500' : 'bg-[#3a3a3a]'}`}
            aria-label="Toggle partial check-in"
          >
            {saving
              ? <Loader2 className="absolute inset-0 m-auto w-4 h-4 text-white animate-spin" />
              : <span className={`absolute top-1 w-6 h-6 rounded-full bg-white shadow transition-all ${allowPartialEntry ? 'left-7' : 'left-1'}`} />}
          </button>
        </div>
      </div>
    </div>
  );
};
