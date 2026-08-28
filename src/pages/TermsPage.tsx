import React, { useEffect } from 'react';
import { Shield, Info, AlertCircle, RefreshCcw, Lock, CreditCard, Mail } from 'lucide-react';

export const TermsPage: React.FC = () => {
  useEffect(() => {
    window.scrollTo(0, 0);
  }, []);

  return (
    <div className="max-w-4xl mx-auto px-4 py-12 sm:px-6 lg:px-8 space-y-12 animate-in fade-in slide-in-from-bottom-4 duration-700">
      {/* Header */}
      <div className="text-center space-y-4">
        <div className="inline-flex items-center justify-center w-16 h-16 rounded-3xl bg-[#D4AF37]/10 border border-[#D4AF37]/20 text-[#D4AF37] mb-4">
          <Shield className="w-8 h-8" />
        </div>
        <h1 className="font-heading font-extrabold text-4xl sm:text-5xl text-white tracking-tight">
          Terms & <span className="text-[#D4AF37]">Conditions</span>
        </h1>
        <p className="text-gray-400 text-sm max-w-lg mx-auto leading-relaxed">
          Please read these terms carefully before using the Ash-vish Events platform. By accessing our services, you agree to be bound by these policies.
        </p>
        <div className="flex items-center justify-center gap-2 text-[10px] font-bold uppercase tracking-widest text-gray-500 pt-2">
          <span>Last Updated: August 20, 2026</span>
          <span className="w-1 h-1 rounded-full bg-gray-700" />
          <span>Version 2.4.0</span>
        </div>
      </div>

      {/* Navigation Shortcuts */}
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        {['Ticketing', 'Refunds', 'Privacy', 'Conduct', 'Payments', 'Liability'].map((item) => (
          <a
            key={item}
            href={`#${item.toLowerCase()}`}
            className="p-3 rounded-2xl bg-[#141414] border border-white/5 hover:border-[#D4AF37]/30 text-gray-400 hover:text-white text-xs font-bold text-center transition-all"
          >
            {item}
          </a>
        ))}
      </div>

      <div className="space-y-10">
        {/* Section 1: Ticketing & Entry */}
        <section id="ticketing" className="space-y-4 group">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-xl bg-white/5 flex items-center justify-center text-[#D4AF37] group-hover:bg-[#D4AF37] group-hover:text-black transition-all">
              <Info className="w-4 h-4" />
            </div>
            <h2 className="font-heading text-xl font-bold text-white tracking-wide uppercase">1. Ticketing & Entry Policy</h2>
          </div>
          <div className="pl-11 space-y-4 text-sm text-gray-400 leading-relaxed">
            <p>
              All tickets issued through the Ash-vish Events platform (ashvishevents.com) are unique digital assets secured by encrypted QR codes. Each ticket grants a one-time entry to the specified event for the designated attendee.
            </p>
            <ul className="list-disc pl-5 space-y-2">
              <li>Digital passes must be presented at the gate for instant QR verification.</li>
              <li>Duplicate or tampered QR codes will be automatically voided by the scanning system.</li>
              <li>Admission is subject to the venue's age restrictions and security protocols.</li>
              <li>Ash-vish Events acts as a ticketing facilitator; event content and scheduling are the responsibility of the organizers.</li>
            </ul>
          </div>
        </section>

        {/* Section 2: Refund & Cancellation */}
        <section id="refunds" className="space-y-4 group">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-xl bg-white/5 flex items-center justify-center text-[#D4AF37] group-hover:bg-[#D4AF37] group-hover:text-black transition-all">
              <RefreshCcw className="w-4 h-4" />
            </div>
            <h2 className="font-heading text-xl font-bold text-white tracking-wide uppercase">2. Refund & Cancellation</h2>
          </div>
          <div className="pl-11 space-y-4 text-sm text-gray-400 leading-relaxed">
            <div className="p-4 rounded-2xl bg-red-500/5 border border-red-500/20 text-red-200/80 text-xs italic">
              "All sales are final. Ash-vish Events operates a strict no-refund policy unless an event is cancelled or rescheduled by the organizer."
            </div>
            <p>
              In the event of a cancellation, refunds will be processed automatically to the original payment method within 7-10 business days. Convenience fees and platform service charges are non-refundable.
            </p>
          </div>
        </section>

        {/* Section 3: Privacy & Data */}
        <section id="privacy" className="space-y-4 group">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-xl bg-white/5 flex items-center justify-center text-[#D4AF37] group-hover:bg-[#D4AF37] group-hover:text-black transition-all">
              <Lock className="w-4 h-4" />
            </div>
            <h2 className="font-heading text-xl font-bold text-white tracking-wide uppercase">3. Privacy & Data Protection</h2>
          </div>
          <div className="pl-11 space-y-4 text-sm text-gray-400 leading-relaxed">
            <p>
              Your privacy is paramount. We collect only necessary information (Name, Email, Phone) to facilitate ticket issuance and security verification.
            </p>
            <ul className="list-disc pl-5 space-y-2">
              <li>We do not share your personal data with third-party advertisers.</li>
              <li>WhatsApp notifications are used exclusively for ticket delivery and event updates via enotify.app.</li>
              <li>Payment information is processed securely through PhonePe; we do not store full credit card or bank details on our servers.</li>
            </ul>
          </div>
        </section>

        {/* Section 4: Payments */}
        <section id="payments" className="space-y-4 group">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-xl bg-white/5 flex items-center justify-center text-[#D4AF37] group-hover:bg-[#D4AF37] group-hover:text-black transition-all">
              <CreditCard className="w-4 h-4" />
            </div>
            <h2 className="font-heading text-xl font-bold text-white tracking-wide uppercase">4. Payments & Transactions</h2>
          </div>
          <div className="pl-11 space-y-4 text-sm text-gray-400 leading-relaxed">
            <p>
              All online transactions are processed in INR (Indian Rupees). For walk-in bookings at the venue, we accept Cash, UPI, and Credit/Debit cards via our integrated counter terminals.
            </p>
            <p>
              If a transaction fails but the amount is debited, the payment gateway will automatically initiate a reversal. Please contact our support team at hello@ashvishevents.com for assistance with transaction disputes.
            </p>
          </div>
        </section>

        {/* Section 5: User Conduct */}
        <section id="conduct" className="space-y-4 group">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-xl bg-white/5 flex items-center justify-center text-[#D4AF37] group-hover:bg-[#D4AF37] group-hover:text-black transition-all">
              <AlertCircle className="w-4 h-4" />
            </div>
            <h2 className="font-heading text-xl font-bold text-white tracking-wide uppercase">5. User Conduct & Prohibited Acts</h2>
          </div>
          <div className="pl-11 space-y-4 text-sm text-gray-400 leading-relaxed">
            <p>
              Reselling tickets for profit (scalping) is strictly prohibited. Ash-vish Events reserves the right to void tickets found on secondary marketplaces without notice or refund.
            </p>
            <p>
              Any attempt to bypass security protocols, reverse-engineer the QR system, or perform unauthorized access to the admin/counter panels will result in immediate account termination and potential legal action.
            </p>
          </div>
        </section>

        {/* Section 6: Shipping & Delivery */}
        <section id="shipping" className="space-y-4 group">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-xl bg-white/5 flex items-center justify-center text-[#D4AF37] group-hover:bg-[#D4AF37] group-hover:text-black transition-all">
              <Info className="w-4 h-4" />
            </div>
            <h2 className="font-heading text-xl font-bold text-white tracking-wide uppercase">6. Shipping & Delivery</h2>
          </div>
          <div className="pl-11 space-y-4 text-sm text-gray-400 leading-relaxed">
            <p>
              Ash-vish Events is a digital-first platform. All tickets are delivered instantly via electronic means.
            </p>
            <ul className="list-disc pl-5 space-y-2">
              <li>Digital passes are sent to the registered WhatsApp number and email address immediately after payment confirmation.</li>
              <li>Physical shipping of tickets is not supported unless explicitly stated for a specific event.</li>
              <li>Attendees are responsible for ensuring they have access to their digital tickets at the time of entry.</li>
            </ul>
          </div>
        </section>

        {/* Section 7: Contact Us */}
        <section id="contact" className="space-y-4 group">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-xl bg-white/5 flex items-center justify-center text-[#D4AF37] group-hover:bg-[#D4AF37] group-hover:text-black transition-all">
              <Mail className="w-4 h-4" />
            </div>
            <h2 className="font-heading text-xl font-bold text-white tracking-wide uppercase">7. Contact Information</h2>
          </div>
          <div className="pl-11 space-y-4 text-sm text-gray-400 leading-relaxed">
            <p>
              For any support, enquiries, or legal concerns, please contact us using the details below:
            </p>
            <ul className="list-none space-y-2">
              <li><strong>Email:</strong> hello@ashvishevents.com</li>
              <li><strong>Support Hours:</strong> Monday to Saturday, 10:00 AM - 7:00 PM</li>
              <li><strong>Office:</strong> The Sayaji, Kolhapur, Maharashtra, India</li>
            </ul>
          </div>
        </section>
      </div>

      {/* Footer Note */}
      <div className="pt-12 border-t border-white/10 text-center space-y-4">
        <p className="text-xs text-gray-500 italic">
          For any questions regarding these terms, please reach out to our legal department at legal@ashvishevents.com
        </p>
        <div className="flex flex-wrap justify-center gap-4 text-[10px] font-bold text-gray-400 uppercase tracking-tighter">
          <a href="/terms#ticketing" className="px-4 py-2 rounded-xl bg-white/5 hover:bg-[#D4AF37]/10 hover:text-[#D4AF37] transition-all">Terms & Conditions</a>
          <a href="/terms#privacy" className="px-4 py-2 rounded-xl bg-white/5 hover:bg-[#D4AF37]/10 hover:text-[#D4AF37] transition-all">Privacy Policy</a>
          <a href="/terms#refunds" className="px-4 py-2 rounded-xl bg-white/5 hover:bg-[#D4AF37]/10 hover:text-[#D4AF37] transition-all">Refund Policy</a>
          <a href="/terms#shipping" className="px-4 py-2 rounded-xl bg-white/5 hover:bg-[#D4AF37]/10 hover:text-[#D4AF37] transition-all">Shipping Policy</a>
          <a href="/terms#contact" className="px-4 py-2 rounded-xl bg-white/5 hover:bg-[#D4AF37]/10 hover:text-[#D4AF37] transition-all">Contact Us</a>
        </div>
      </div>
    </div>
  );
};
