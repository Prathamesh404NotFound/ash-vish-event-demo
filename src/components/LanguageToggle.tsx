import React from 'react';
import { Globe } from 'lucide-react';
import { useLocale, LOCALES } from '../contexts/LocaleContext';

export function LanguageToggle() {
  const { locale, setLocale } = useLocale();

  return (
    <div className="flex items-center gap-1 p-0.5 bg-white/5 rounded-lg border border-white/10">
      <Globe className="w-3.5 h-3.5 text-gray-500 ml-1.5" />
      {LOCALES.map((l) => (
        <button
          key={l.code}
          onClick={() => setLocale(l.code)}
          className={`px-2.5 py-1 rounded-md text-[10px] font-bold transition-all cursor-pointer ${
            locale === l.code
              ? 'bg-[#D4AF37] text-black'
              : 'text-gray-400 hover:text-white'
          }`}
          aria-label={`Switch to ${l.label}`}
        >
          {l.nativeLabel}
        </button>
      ))}
    </div>
  );
}
