import React, { useState } from 'react';
import { Search, Download, CheckCircle2, Ticket } from 'lucide-react';
import { useBooking } from '../../contexts/BookingContext';

export const AdminBookings: React.FC = () => {
  const { allTickets } = useBooking();
  const [attendeeSearch, setAttendeeSearch] = useState('');

  const filtered = allTickets.filter(
    (t) =>
      t.attendeeName.toLowerCase().includes(attendeeSearch.toLowerCase()) ||
      t.ticketNumber.toLowerCase().includes(attendeeSearch.toLowerCase()) ||
      t.eventTitle.toLowerCase().includes(attendeeSearch.toLowerCase()) ||
      t.attendeePhone.toLowerCase().includes(attendeeSearch.toLowerCase())
  );

  const handleExportCSV = () => {
    const headers = 'Ticket Number,Attendee,Event,Tier,Price,Status,Purchased At\n';
    const rows = filtered
      .map(
        (t) =>
          `"${t.ticketNumber}","${t.attendeeName}","${t.eventTitle}","${t.tierName}","₹${t.totalPaid}","${t.status}","${t.purchasedAt}"`
      )
      .join('\n');

    const blob = new Blob([headers + rows], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `ash_vish_attendee_roster_${Date.now()}.csv`;
    a.click();
  };

  return (
    <div className="space-y-6 max-w-6xl mx-auto">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 p-6 rounded-3xl bg-[#141414] border border-white/10">
        <div>
          <h1 className="font-heading font-extrabold text-xl text-white">Full Bookings & Attendee Roster</h1>
          <p className="text-gray-400 text-xs mt-0.5">
            Search across all issued online and counter walk-in tickets.
          </p>
        </div>

        <div className="flex items-center gap-3 w-full sm:w-auto">
          <div className="relative flex-1 sm:w-64">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input
              type="text"
              value={attendeeSearch}
              onChange={(e) => setAttendeeSearch(e.target.value)}
              placeholder="Search by name, phone, ticket #..."
              className="w-full bg-[#1C1C1C] border border-white/10 rounded-2xl pl-10 pr-4 py-2.5 text-xs text-white focus:outline-none focus:border-[#D4AF37]"
            />
          </div>

          <button
            onClick={handleExportCSV}
            className="py-2.5 px-4 rounded-2xl bg-[#222] hover:bg-[#333] text-white font-bold text-xs flex items-center gap-2 border border-white/10 transition-all flex-shrink-0"
          >
            <Download className="w-4 h-4 text-[#D4AF37]" />
            <span>Export CSV</span>
          </button>
        </div>
      </div>

      <div className="bg-[#141414] border border-white/10 rounded-3xl overflow-hidden shadow-2xl">
        <table className="w-full text-left text-xs text-gray-300">
          <thead className="bg-[#1C1C1C] text-gray-400 uppercase font-bold text-[10px]">
            <tr>
              <th className="p-4">Ticket Ref</th>
              <th className="p-4">Attendee Name</th>
              <th className="p-4">Event Show</th>
              <th className="p-4">Tier & Price</th>
              <th className="p-4">Type</th>
              <th className="p-4">Status</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-white/5">
            {filtered.map((b) => (
              <tr key={b.id} className="hover:bg-white/5 transition-colors">
                <td className="p-4 font-mono text-[#D4AF37] font-bold">{b.ticketNumber}</td>
                <td className="p-4">
                  <span className="font-bold text-white block">{b.attendeeName}</span>
                  <span className="text-gray-400 text-[10px]">{b.attendeePhone || b.attendeeEmail}</span>
                </td>
                <td className="p-4 font-semibold text-white">{b.eventTitle}</td>
                <td className="p-4">
                  <span className="block text-white font-semibold">{b.tierName}</span>
                  <span className="text-emerald-400 font-bold">₹{b.totalPaid}</span>
                </td>
                <td className="p-4">
                  {b.isWalkIn ? (
                    <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-blue-500/10 text-blue-400 border border-blue-500/20">
                      Walk-In Counter
                    </span>
                  ) : (
                    <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-purple-500/10 text-purple-400 border border-purple-500/20">
                      Online Booking
                    </span>
                  )}
                </td>
                <td className="p-4">
                  <span
                    className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase ${
                      b.status === 'valid'
                        ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                        : b.status === 'used'
                        ? 'bg-amber-500/10 text-amber-400 border border-amber-500/20'
                        : 'bg-red-500/10 text-red-400 border border-red-500/20'
                    }`}
                  >
                    {b.status}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};
