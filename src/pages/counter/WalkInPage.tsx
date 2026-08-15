import React, { useState } from 'react';
import { UserPlus, Ticket, CheckCircle2, DollarSign, Phone, User, Calendar, ArrowRight, Printer, Search, CreditCard, QrCode, Armchair } from 'lucide-react';
import { useBooking } from '../../contexts/BookingContext';
import { useAuth } from '../../contexts/AuthContext';
import { Ticket as TicketType } from '../../types';
import { SeatMap } from '../../components/SeatMap';

export const WalkInPage: React.FC = () => {
  const { events, createWalkInBooking } = useBooking();
  const { user } = useAuth();

  const [searchQuery, setSearchQuery] = useState('');
  const [selectedEventId, setSelectedEventId] = useState(events[0]?.id || '');
  const [selectedTierId, setSelectedTierId] = useState(events[0]?.ticketTiers[0]?.id || '');
  const [quantity, setQuantity] = useState(1);
  const [selectedSeats, setSelectedSeats] = useState<string[]>([]);

  const [attendeeName, setAttendeeName] = useState('');
  const [attendeePhone, setAttendeePhone] = useState('');
  const [paymentMode, setPaymentMode] = useState<'cash' | 'card' | 'counter_upi'>('cash');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [issuedTicket, setIssuedTicket] = useState<TicketType | null>(null);

  const filteredEvents = events.filter((e) =>
    e.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
    e.city.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const selectedEvent = events.find((e) => e.id === selectedEventId) || events[0];
  const selectedTier = selectedEvent?.ticketTiers.find((t) => t.id === selectedTierId) || selectedEvent?.ticketTiers[0];

  const handleIssueWalkIn = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!attendeeName.trim() || !attendeePhone.trim()) return;

    if (selectedEvent?.seatMap && selectedSeats.length === 0) {
      alert('Please select seats on the seat map for this walk-in booking.');
      return;
    }

    setIsSubmitting(true);
    try {
      const ticket = await createWalkInBooking(
        selectedEventId,
        selectedTierId,
        attendeeName,
        attendeePhone,
        user?.name || 'Counter Operator',
        selectedSeats.length > 0 ? selectedSeats : undefined,
        paymentMode
      );
      setIssuedTicket(ticket);
    } catch (err) {
      console.error('Walk-in ticket issue error:', err);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleReset = () => {
    setIssuedTicket(null);
    setAttendeeName('');
    setAttendeePhone('');
    setSelectedSeats([]);
  };

  const totalPrice = (selectedTier?.price || 0) * (selectedSeats.length || quantity);

  return (
    <div className="space-y-6 max-w-5xl mx-auto">
      {/* Header */}
      <div className="flex items-center gap-3 p-6 rounded-3xl bg-[#141414] border border-white/10">
        <div className="w-10 h-10 rounded-2xl bg-[#D4AF37]/10 border border-[#D4AF37]/30 flex items-center justify-center text-[#D4AF37]">
          <UserPlus className="w-5 h-5" />
        </div>
        <div>
          <h1 className="font-heading font-extrabold text-xl text-white">Counter Walk-In Ticket Issuance</h1>
          <p className="text-gray-400 text-xs mt-0.5">
            Issue physical passes & live seat reservations directly for walk-in guests with cash, card, or UPI.
          </p>
        </div>
      </div>

      {issuedTicket ? (
        /* Success Issued Ticket Card */
        <div className="p-8 rounded-3xl bg-gradient-to-br from-[#1C1C1C] via-[#141414] to-[#0E0E0E] border border-emerald-500/40 text-center space-y-6 shadow-2xl">
          <div className="w-16 h-16 rounded-2xl bg-emerald-500/20 border border-emerald-500/40 flex items-center justify-center mx-auto text-emerald-400">
            <CheckCircle2 className="w-8 h-8" />
          </div>

          <div>
            <span className="px-3 py-1 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 text-xs font-bold uppercase tracking-wider">
              Walk-In Booking Confirmed & Locked
            </span>
            <h2 className="font-heading font-extrabold text-2xl text-white mt-3">
              Ticket #{issuedTicket.ticketNumber}
            </h2>
            <p className="text-gray-400 text-xs mt-1">
              Issued for <strong className="text-white">{issuedTicket.attendeeName}</strong> ({issuedTicket.attendeePhone})
            </p>
          </div>

          <div className="max-w-md mx-auto p-4 rounded-2xl bg-black/60 border border-white/10 text-left space-y-2 text-xs">
            <div className="flex justify-between text-gray-400">
              <span>Event:</span>
              <span className="font-semibold text-white">{issuedTicket.eventTitle}</span>
            </div>
            <div className="flex justify-between text-gray-400">
              <span>Tier / Category:</span>
              <span className="font-bold text-[#D4AF37]">{issuedTicket.tierName}</span>
            </div>
            <div className="flex justify-between text-gray-400">
              <span>Seats:</span>
              <span className="font-bold text-white">{issuedTicket.seatNumber}</span>
            </div>
            <div className="flex justify-between text-gray-400">
              <span>Payment Mode:</span>
              <span className="font-bold text-emerald-400">₹{issuedTicket.totalPaid} ({paymentMode.toUpperCase()})</span>
            </div>
            <div className="flex justify-between text-gray-400 pt-2 border-t border-white/10">
              <span>QR Security Payload:</span>
              <span className="font-mono text-[10px] text-gray-300 truncate max-w-[180px]">{issuedTicket.qrCodeValue}</span>
            </div>
          </div>

          <div className="flex items-center justify-center gap-4">
            <button
              onClick={() => window.print()}
              className="py-3 px-6 rounded-xl bg-[#222] hover:bg-[#333] text-white font-bold text-xs flex items-center gap-2 border border-white/10 transition-all cursor-pointer"
            >
              <Printer className="w-4 h-4 text-[#D4AF37]" />
              <span>Print Gate Receipt</span>
            </button>
            <button
              onClick={handleReset}
              className="py-3 px-6 rounded-xl bg-gradient-to-r from-[#F3E5AB] to-[#D4AF37] hover:brightness-110 text-black font-extrabold text-xs flex items-center gap-2 transition-all shadow-lg shadow-[#D4AF37]/25 cursor-pointer"
            >
              <span>Issue Next Walk-In Ticket</span>
              <ArrowRight className="w-4 h-4 stroke-[2.5]" />
            </button>
          </div>
        </div>
      ) : (
        /* Booking Form */
        <form onSubmit={handleIssueWalkIn} className="p-6 md:p-8 rounded-3xl bg-[#141414] border border-white/10 space-y-6">
          {/* 1. Search & Select Event */}
          <div className="space-y-3">
            <label className="block text-xs font-bold text-gray-300 uppercase tracking-wider">
              1. Select Event
            </label>
            <div className="relative">
              <input
                type="text"
                placeholder="Filter events by title or city..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-10 pr-4 py-2.5 rounded-xl bg-[#1C1C1C] border border-white/10 text-white text-xs focus:outline-none focus:border-[#D4AF37]"
              />
              <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            </div>

            <select
              value={selectedEventId}
              onChange={(e) => {
                setSelectedEventId(e.target.value);
                setSelectedSeats([]);
                const evt = events.find((item) => item.id === e.target.value);
                if (evt && evt.ticketTiers[0]) {
                  setSelectedTierId(evt.ticketTiers[0].id);
                }
              }}
              className="w-full py-3.5 px-4 rounded-2xl bg-[#1C1C1C] border border-white/10 text-white font-semibold text-sm focus:outline-none focus:border-[#D4AF37] transition-colors"
            >
              {filteredEvents.map((evt) => (
                <option key={evt.id} value={evt.id}>
                  {evt.title} ({evt.city} • {evt.date})
                </option>
              ))}
            </select>
          </div>

          {/* 2. Select Tier & Quantity */}
          {selectedEvent && (
            <div className="space-y-3">
              <label className="block text-xs font-bold text-gray-300 uppercase tracking-wider">
                2. Select Ticket Category
              </label>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                {selectedEvent.ticketTiers.map((tier) => (
                  <button
                    type="button"
                    key={tier.id}
                    onClick={() => {
                      setSelectedTierId(tier.id);
                      setSelectedSeats([]);
                    }}
                    className={`p-4 rounded-2xl border text-left transition-all cursor-pointer ${
                      selectedTierId === tier.id
                        ? 'bg-[#D4AF37]/10 border-[#D4AF37] text-white shadow-lg'
                        : 'bg-[#1C1C1C] border-white/5 text-gray-400 hover:border-white/20'
                    }`}
                  >
                    <span className="block font-bold text-sm text-white">{tier.name}</span>
                    <span className="font-heading font-extrabold text-base text-[#D4AF37] mt-1 block">
                      ₹{tier.price}
                    </span>
                    <span className="text-[10px] text-gray-400 block mt-1">
                      {tier.remainingInventory} passes remaining
                    </span>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* 3. Seat Map Selection (If Event has SeatMap) */}
          {selectedEvent?.seatMap ? (
            <div className="space-y-3 p-4 rounded-2xl bg-black/40 border border-white/10">
              <div className="flex items-center justify-between">
                <label className="block text-xs font-bold text-[#D4AF37] uppercase tracking-wider flex items-center gap-2">
                  <Armchair className="w-4 h-4" />
                  <span>3. Interactive Counter Seat Map</span>
                </label>
                <div className="flex items-center gap-2 text-xs">
                  <span className="text-gray-400">Quantity:</span>
                  <select
                    value={quantity}
                    onChange={(e) => {
                      setQuantity(Number(e.target.value));
                      setSelectedSeats([]);
                    }}
                    className="bg-[#1C1C1C] border border-white/10 rounded-lg px-2 py-1 text-white text-xs font-bold"
                  >
                    {[1, 2, 3, 4, 5, 6, 8, 10].map((n) => (
                      <option key={n} value={n}>{n} seat{n > 1 ? 's' : ''}</option>
                    ))}
                  </select>
                </div>
              </div>

              <SeatMap
                eventId={selectedEvent.id}
                seatMapConfig={selectedEvent.seatMap}
                requiredQuantity={quantity}
                selectedSeatIds={selectedSeats}
                onSeatsSelected={(seatIds) => setSelectedSeats(seatIds)}
                currentUserId="walkin_counter_staff"
                ticketTiers={selectedEvent.ticketTiers}
                eventDate={selectedEvent.date}
                eventTime={selectedEvent.time}
              />
            </div>
          ) : (
            /* General Admission Quantity Selector */
            <div className="space-y-2">
              <label className="block text-xs font-bold text-gray-300 uppercase tracking-wider">
                3. Pass Quantity
              </label>
              <div className="flex items-center gap-4">
                <button
                  type="button"
                  onClick={() => setQuantity((q) => Math.max(1, q - 1))}
                  className="w-10 h-10 rounded-xl bg-[#1C1C1C] border border-white/10 text-white font-bold text-lg hover:border-[#D4AF37]"
                >
                  -
                </button>
                <span className="text-white font-extrabold text-lg">{quantity}</span>
                <button
                  type="button"
                  onClick={() => setQuantity((q) => Math.min(10, q + 1))}
                  className="w-10 h-10 rounded-xl bg-[#1C1C1C] border border-white/10 text-white font-bold text-lg hover:border-[#D4AF37]"
                >
                  +
                </button>
              </div>
            </div>
          )}

          {/* 4. Attendee Contact Info */}
          <div className="space-y-3">
            <label className="block text-xs font-bold text-gray-300 uppercase tracking-wider">
              4. Customer Details (Walk-In)
            </label>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="relative">
                <input
                  type="text"
                  required
                  value={attendeeName}
                  onChange={(e) => setAttendeeName(e.target.value)}
                  placeholder="Guest Full Name *"
                  className="w-full pl-10 pr-4 py-3 rounded-xl bg-[#1C1C1C] border border-white/10 text-white text-sm focus:outline-none focus:border-[#D4AF37]"
                />
                <User className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              </div>

              <div className="relative">
                <input
                  type="tel"
                  required
                  value={attendeePhone}
                  onChange={(e) => setAttendeePhone(e.target.value)}
                  placeholder="Guest Mobile Number *"
                  className="w-full pl-10 pr-4 py-3 rounded-xl bg-[#1C1C1C] border border-white/10 text-white text-sm focus:outline-none focus:border-[#D4AF37]"
                />
                <Phone className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              </div>
            </div>
          </div>

          {/* 5. Payment Mode Selection */}
          <div className="space-y-2">
            <label className="block text-xs font-bold text-gray-300 uppercase tracking-wider">
              5. Payment Method Received
            </label>
            <div className="grid grid-cols-3 gap-3">
              <label
                className={`flex items-center justify-center gap-2 text-xs font-bold py-3.5 px-3 rounded-xl border cursor-pointer transition-all ${
                  paymentMode === 'cash'
                    ? 'bg-[#D4AF37]/20 border-[#D4AF37] text-white shadow-lg'
                    : 'bg-[#1C1C1C] border-white/10 text-gray-400 hover:border-white/20'
                }`}
              >
                <input
                  type="radio"
                  name="paymentMode"
                  checked={paymentMode === 'cash'}
                  onChange={() => setPaymentMode('cash')}
                  className="hidden"
                />
                <DollarSign className="w-4 h-4 text-[#D4AF37]" />
                <span>Cash</span>
              </label>

              <label
                className={`flex items-center justify-center gap-2 text-xs font-bold py-3.5 px-3 rounded-xl border cursor-pointer transition-all ${
                  paymentMode === 'card'
                    ? 'bg-[#D4AF37]/20 border-[#D4AF37] text-white shadow-lg'
                    : 'bg-[#1C1C1C] border-white/10 text-gray-400 hover:border-white/20'
                }`}
              >
                <input
                  type="radio"
                  name="paymentMode"
                  checked={paymentMode === 'card'}
                  onChange={() => setPaymentMode('card')}
                  className="hidden"
                />
                <CreditCard className="w-4 h-4 text-sky-400" />
                <span>Card Terminal</span>
              </label>

              <label
                className={`flex items-center justify-center gap-2 text-xs font-bold py-3.5 px-3 rounded-xl border cursor-pointer transition-all ${
                  paymentMode === 'counter_upi'
                    ? 'bg-[#D4AF37]/20 border-[#D4AF37] text-white shadow-lg'
                    : 'bg-[#1C1C1C] border-white/10 text-gray-400 hover:border-white/20'
                }`}
              >
                <input
                  type="radio"
                  name="paymentMode"
                  checked={paymentMode === 'counter_upi'}
                  onChange={() => setPaymentMode('counter_upi')}
                  className="hidden"
                />
                <QrCode className="w-4 h-4 text-emerald-400" />
                <span>Counter UPI</span>
              </label>
            </div>
          </div>

          {/* Submit Action */}
          <div className="pt-4 border-t border-white/10 flex items-center justify-between">
            <div>
              <span className="text-xs text-gray-400 block">Total Due:</span>
              <span className="font-heading font-extrabold text-2xl text-[#D4AF37]">
                ₹{totalPrice}
              </span>
            </div>

            <button
              type="submit"
              disabled={isSubmitting || !attendeeName || !attendeePhone || (selectedEvent?.seatMap && selectedSeats.length === 0)}
              className="py-3.5 px-8 rounded-2xl bg-gradient-to-r from-[#F3E5AB] to-[#D4AF37] hover:brightness-110 disabled:opacity-50 text-black font-extrabold text-sm shadow-lg shadow-[#D4AF37]/25 transition-all flex items-center gap-2 cursor-pointer"
            >
              <span>{isSubmitting ? 'Processing Booking...' : 'Confirm Walk-In Pass'}</span>
              <ArrowRight className="w-4 h-4 stroke-[2.5]" />
            </button>
          </div>
        </form>
      )}
    </div>
  );
};
