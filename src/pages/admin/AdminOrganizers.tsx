import React, { useState, useEffect } from 'react';
import { Users, CheckCircle2, XCircle, ShieldAlert, Building2, Mail, Phone, Calendar, ArrowUpRight } from 'lucide-react';
import { RowActions } from '../../components/admin/RowActions';
import { useBooking } from '../../contexts/BookingContext';

export const AdminOrganizers: React.FC = () => {
  const { organizers, updateOrganizerStatus } = useBooking();

  return (
    <div className="space-y-6 animate-in fade-in">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-[#141414] border border-white/10 rounded-3xl p-6">
        <div>
          <h1 className="font-heading font-extrabold text-2xl text-white flex items-center gap-2">
            <Building2 className="w-6 h-6 text-[#D4AF37]" />
            <span>Organizer Accounts Oversight</span>
          </h1>
          <p className="text-xs text-gray-400 mt-1">
            Review and approve new organizer applications before they can publish events on the platform.
          </p>
        </div>
      </div>

      {/* Organizers Table */}
      <div className="bg-[#141414] border border-white/10 rounded-3xl overflow-hidden shadow-xl">
        <div className="p-5 border-b border-white/10 flex items-center justify-between">
          <h2 className="font-heading font-bold text-base text-white">Registered Organizers ({organizers.length})</h2>
        </div>

        <div className="responsive-table-scroll">
          <table className="w-full text-left text-xs text-gray-300">
            <thead className="bg-[#1C1C1C] text-gray-400 uppercase text-[10px] tracking-wider border-b border-white/10">
              <tr>
                <th className="px-6 py-4">Organization</th>
                <th className="px-6 py-4">Contact Person</th>
                <th className="px-6 py-4">Email / Phone</th>
                <th className="px-6 py-4">Applied Date</th>
                <th className="px-6 py-4">Status</th>
                <th className="px-6 py-4 text-right">Approval Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              {organizers.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-6 py-12 text-center text-gray-500">
                    No organizer accounts registered yet.
                  </td>
                </tr>
              ) : (
                organizers.map((org) => (
                  <tr key={org.id} className="hover:bg-white/[0.02] transition-colors">
                    <td className="px-6 py-4">
                      <div className="font-bold text-white text-sm">{org.organizationName}</div>
                      <div className="text-[11px] text-gray-400 mt-0.5 line-clamp-1">{org.description || 'No description'}</div>
                    </td>

                    <td className="px-6 py-4 font-semibold text-white">
                      {org.name}
                    </td>

                    <td className="px-6 py-4 space-y-0.5">
                      <div className="flex items-center gap-1.5 text-gray-300">
                        <Mail className="w-3 h-3 text-[#D4AF37]" />
                        <span>{org.email}</span>
                      </div>
                      <div className="flex items-center gap-1.5 text-gray-400 text-[11px]">
                        <Phone className="w-3 h-3 text-gray-500" />
                        <span>{org.phone || 'N/A'}</span>
                      </div>
                    </td>

                    <td className="px-6 py-4 font-mono text-gray-400 text-[11px]">
                      {new Date(org.appliedAt).toLocaleDateString()}
                    </td>

                    <td className="px-6 py-4">
                      <span
                        className={`px-3 py-1 rounded-full text-[10px] font-bold border ${
                          org.status === 'approved'
                            ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30'
                            : org.status === 'pending'
                            ? 'bg-amber-500/10 text-amber-400 border-amber-500/30'
                            : 'bg-red-500/10 text-red-400 border-red-500/30'
                        }`}
                      >
                        {org.status.toUpperCase()}
                      </span>
                    </td>

                    <td className="px-6 py-4 text-right">
                      <RowActions
                        closeKey={org.id + org.status}
                        actions={[
                          ...(org.status !== 'approved' ? [{
                            label: 'Approve',
                            icon: <CheckCircle2 className="w-4 h-4" />,
                            onClick: () => updateOrganizerStatus(org.id, 'approved'),
                            variant: 'success' as const,
                          }] : []),
                          ...(org.status !== 'rejected' ? [{
                            label: 'Reject',
                            icon: <XCircle className="w-4 h-4" />,
                            onClick: () => updateOrganizerStatus(org.id, 'rejected'),
                            variant: 'danger' as const,
                          }] : []),
                        ]}
                      />
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
