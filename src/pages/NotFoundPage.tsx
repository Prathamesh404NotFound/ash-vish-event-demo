import React from 'react';
import { useNavigate } from 'react-router-dom';
import { MapPin, ArrowRight, Home } from 'lucide-react';

export const NotFoundPage: React.FC = () => {
  const navigate = useNavigate();

  return (
    <div className="min-h-[80vh] flex items-center justify-center px-4">
      <div className="max-w-md w-full text-center space-y-8">
        {/* Large 404 */}
        <div className="relative">
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="w-48 h-48 rounded-full bg-[#D4AF37]/[0.04] blur-3xl" />
          </div>
          <div className="relative">
            <span className="font-heading font-black text-[120px] sm:text-[160px] leading-none text-white/[0.03] select-none">
              404
            </span>
            <div className="absolute inset-0 flex items-center justify-center">
              <div className="w-16 h-16 rounded-2xl bg-[#1A1A1C] border border-white/[0.08] flex items-center justify-center">
                <MapPin className="w-7 h-7 text-[#D4AF37]" strokeWidth={1.5} />
              </div>
            </div>
          </div>
        </div>

        {/* Message */}
        <div className="space-y-2">
          <h1 className="font-heading font-bold text-2xl text-white">
            Page not found
          </h1>
          <p className="text-sm text-gray-500 leading-relaxed max-w-xs mx-auto">
            The page you're looking for doesn't exist or has been moved. Let's get you back on track.
          </p>
        </div>

        {/* Actions */}
        <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
          <button
            onClick={() => navigate('/')}
            className="group w-full sm:w-auto px-6 py-3 rounded-xl bg-gradient-to-r from-[#F3E5AB] to-[#D4AF37] text-black font-bold text-sm flex items-center justify-center gap-2 shadow-lg shadow-[#D4AF37]/15 transition-all duration-200 hover:shadow-[#D4AF37]/25 hover:scale-[1.02] active:scale-[0.98]"
          >
            <Home className="w-4 h-4" />
            Go to Homepage
          </button>
          <button
            onClick={() => navigate(-1)}
            className="w-full sm:w-auto px-6 py-3 rounded-xl bg-white/[0.05] hover:bg-white/[0.08] text-gray-300 font-semibold text-sm flex items-center justify-center gap-2 border border-white/[0.08] transition-all duration-200"
          >
            Go Back
            <ArrowRight className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  );
};
