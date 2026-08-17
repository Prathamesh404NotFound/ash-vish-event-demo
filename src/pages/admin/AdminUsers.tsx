import React, { useState, useEffect, useCallback } from 'react';
import {
  Users,
  UserPlus,
  ShieldCheck,
  ShieldAlert,
  Search,
  RefreshCw,
  AlertCircle,
  CheckCircle2,
  X,
  AlertTriangle,
  UserCheck,
  UserX,
  Lock,
  Clock,
  ChevronRight,
  Sparkles,
} from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { safeFetch } from '../../lib/api';
import { authenticatedApiHeaders } from '../../lib/authHeaders';

interface StaffMember {
  id: string; // uid
  uid?: string;
  email: string;
  role: 'admin' | 'event_manager' | 'ticket_counter' | 'auditor' | string;
  status: 'active' | 'suspended';
  createdBy?: string;
  createdAt?: string;
  updatedAt?: string;
  lastAuditAction?: {
    action: string;
    timestamp: string;
  } | null;
}

interface LookupUser {
  uid: string;
  email: string;
  displayName: string;
}

const ROLE_OPTIONS = [
  { value: 'admin', label: 'Super Admin', description: 'Full system privileges, financial auditing, staff management' },
  { value: 'event_manager', label: 'Event Manager', description: 'Create & manage events, discount overrides, organizer operations' },
  { value: 'ticket_counter', label: 'Ticket Counter Staff', description: 'Sell walk-in tickets, scan passes, execute reprints & exchanges' },
  { value: 'auditor', label: 'Compliance Auditor', description: 'Read-only access to audit logs, financial reports & shift history' },
];

export const AdminUsers: React.FC = () => {
  const { user } = useAuth();

  const [staffList, setStaffList] = useState<StaffMember[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedRoleFilter, setSelectedRoleFilter] = useState('all');
  const [selectedStatusFilter, setSelectedStatusFilter] = useState('all');

  const [errorBanner, setErrorBanner] = useState('');
  const [successBanner, setSuccessBanner] = useState('');

  // Add Staff Modal State
  const [showAddModal, setShowAddModal] = useState(false);
  const [lookupEmail, setLookupEmail] = useState('');
  const [isLookingUp, setIsLookingUp] = useState(false);
  const [resolvedUser, setResolvedUser] = useState<LookupUser | null>(null);
  const [selectedRoleForAdd, setSelectedRoleForAdd] = useState('ticket_counter');
  const [isCreatingStaff, setIsCreatingStaff] = useState(false);

  // Destructive Confirmation Modal (Suspension or Super Admin modification)
  const [confirmModal, setConfirmModal] = useState<{
    targetStaff: StaffMember;
    actionType: 'suspend' | 'activate' | 'role_change';
    newRole?: string;
  } | null>(null);
  const [isUpdatingStaff, setIsUpdatingStaff] = useState(false);

  const fetchStaffData = useCallback(async () => {
    try {
      setIsLoading(true);
      setErrorBanner('');
      const headers = await authenticatedApiHeaders();

      // 1. Fetch staff list
      const staffRes = await safeFetch<{ success: boolean; staff: StaffMember[]; error?: string }>(
        '/api/staff',
        { headers }
      );

      if (!staffRes.ok || !staffRes.data?.success) {
        setErrorBanner(staffRes.data?.error || staffRes.error || 'Failed to fetch staff members.');
        return;
      }

      const list = (staffRes.data.staff || []).map((s) => ({
        ...s,
        id: s.id || s.uid || '',
      }));

      // 2. Fetch last audit log for each staff member in parallel
      const enrichedList = await Promise.all(
        list.map(async (member) => {
          try {
            const auditRes = await safeFetch<{ success: boolean; audit_log: any[] }>(
              `/api/audit-log?actor_id=${member.id}&limit=1`,
              { headers }
            );
            if (auditRes.ok && auditRes.data?.audit_log?.[0]) {
              const latest = auditRes.data.audit_log[0];
              return {
                ...member,
                lastAuditAction: {
                  action: latest.action,
                  timestamp: latest.timestamp,
                },
              };
            }
          } catch {
            /* ignore individual audit fetch errors */
          }
          return { ...member, lastAuditAction: null };
        })
      );

      setStaffList(enrichedList);
    } catch (err: any) {
      setErrorBanner(err?.message || 'Error loading staff records.');
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchStaffData();
  }, [fetchStaffData]);

  // Lookup Firebase user by email
  const handleLookupUser = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorBanner('');
    if (!lookupEmail.trim()) return;

    try {
      setIsLookingUp(true);
      setResolvedUser(null);
      const headers = await authenticatedApiHeaders();
      const res = await safeFetch<{ success: boolean; user?: LookupUser; error?: string }>(
        `/api/staff/lookup?email=${encodeURIComponent(lookupEmail.trim())}`,
        { headers }
      );

      if (res.ok && res.data?.success && res.data.user) {
        setResolvedUser(res.data.user);
      } else {
        setErrorBanner(res.data?.error || res.error || 'Account lookup failed.');
      }
    } catch (err: any) {
      setErrorBanner(err?.message || 'Error looking up account.');
    } finally {
      setIsLookingUp(false);
    }
  };

  // Submit Add Staff
  const handleCreateStaffSubmit = async () => {
    if (!resolvedUser) return;

    try {
      setIsCreatingStaff(true);
      setErrorBanner('');
      setSuccessBanner('');
      const headers = await authenticatedApiHeaders();
      const res = await safeFetch<{ success: boolean; staff?: StaffMember; error?: string }>(
        '/api/staff',
        {
          method: 'POST',
          headers,
          body: JSON.stringify({
            uid: resolvedUser.uid,
            email: resolvedUser.email,
            role: selectedRoleForAdd,
          }),
        }
      );

      if (res.ok && res.data?.success) {
        setSuccessBanner(`Staff role successfully granted to ${resolvedUser.email}!`);
        setShowAddModal(false);
        setLookupEmail('');
        setResolvedUser(null);
        await fetchStaffData();
      } else {
        setErrorBanner(res.data?.error || res.error || 'Failed to create staff record.');
      }
    } catch (err: any) {
      setErrorBanner(err?.message || 'Error creating staff record.');
    } finally {
      setIsCreatingStaff(false);
    }
  };

  // Execute Confirmed Patch (Role change or Suspension)
  const handleExecuteConfirmedUpdate = async () => {
    if (!confirmModal) return;

    const { targetStaff, actionType, newRole } = confirmModal;
    try {
      setIsUpdatingStaff(true);
      setErrorBanner('');
      setSuccessBanner('');

      const patchPayload: Record<string, any> = {};
      if (actionType === 'suspend') patchPayload.status = 'suspended';
      if (actionType === 'activate') patchPayload.status = 'active';
      if (actionType === 'role_change' && newRole) patchPayload.role = newRole;

      const headers = await authenticatedApiHeaders();
      const res = await safeFetch<{ success: boolean; staff?: StaffMember; error?: string }>(
        `/api/staff/${targetStaff.id}`,
        {
          method: 'PATCH',
          headers,
          body: JSON.stringify(patchPayload),
        }
      );

      if (res.ok && res.data?.success) {
        setSuccessBanner(
          actionType === 'suspend'
            ? `Staff member ${targetStaff.email} suspended.`
            : actionType === 'activate'
            ? `Staff member ${targetStaff.email} reactivated.`
            : `Role updated for ${targetStaff.email}.`
        );
        setConfirmModal(null);
        await fetchStaffData();
      } else {
        setErrorBanner(res.data?.error || res.error || 'Failed to update staff record.');
      }
    } catch (err: any) {
      setErrorBanner(err?.message || 'Error updating staff.');
    } finally {
      setIsUpdatingStaff(false);
    }
  };

  // Quick Role change handler with confirmation
  const handleRoleSelectChange = (staff: StaffMember, nextRole: string) => {
    if (staff.role === nextRole) return;
    setConfirmModal({
      targetStaff: staff,
      actionType: 'role_change',
      newRole: nextRole,
    });
  };

  // Status toggle handler with confirmation
  const handleToggleStatus = (staff: StaffMember) => {
    const nextAction = staff.status === 'active' ? 'suspend' : 'activate';
    setConfirmModal({
      targetStaff: staff,
      actionType: nextAction,
    });
  };

  // Client-side filtering
  const filteredStaff = staffList.filter((s) => {
    const matchSearch =
      s.email.toLowerCase().includes(searchQuery.toLowerCase()) ||
      s.id.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (s.role || '').toLowerCase().includes(searchQuery.toLowerCase());
    const matchRole = selectedRoleFilter === 'all' || s.role === selectedRoleFilter;
    const matchStatus = selectedStatusFilter === 'all' || s.status === selectedStatusFilter;
    return matchSearch && matchRole && matchStatus;
  });

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-6 rounded-3xl bg-[#141414] border border-white/10">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-2xl bg-[#D4AF37]/10 border border-[#D4AF37]/30 flex items-center justify-center text-[#D4AF37]">
            <Users className="w-5 h-5" />
          </div>
          <div>
            <h1 className="font-heading font-extrabold text-xl text-white">Staff Accounts & RBAC Roles</h1>
            <p className="text-gray-400 text-xs mt-0.5">
              Super Admin console to grant counter, event manager, auditor, or administrative permissions.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3 self-start sm:self-auto">
          <button
            onClick={fetchStaffData}
            disabled={isLoading}
            className="inline-flex items-center gap-2 px-3.5 py-2.5 rounded-xl bg-white/5 hover:bg-white/10 text-gray-300 hover:text-white text-xs font-semibold border border-white/10 transition-all cursor-pointer"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin text-[#D4AF37]' : ''}`} />
            <span>Refresh</span>
          </button>

          <button
            onClick={() => {
              setShowAddModal(true);
              setLookupEmail('');
              setResolvedUser(null);
            }}
            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-gradient-to-r from-[#F3E5AB] to-[#D4AF37] hover:brightness-110 text-black font-extrabold text-xs shadow-lg shadow-[#D4AF37]/25 transition-all cursor-pointer"
          >
            <UserPlus className="w-4 h-4 stroke-[2.5]" />
            <span>Add Staff Member</span>
          </button>
        </div>
      </div>

      {/* Alerts */}
      {errorBanner && (
        <div className="p-4 rounded-2xl bg-red-500/10 border border-red-500/30 text-red-300 text-xs flex items-center gap-3 animate-in fade-in">
          <AlertCircle className="w-4 h-4 shrink-0" />
          <span className="flex-1 font-medium">{errorBanner}</span>
          <button onClick={() => setErrorBanner('')} className="p-1 text-red-400 hover:text-white">
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {successBanner && (
        <div className="p-4 rounded-2xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-300 text-xs flex items-center gap-3 animate-in fade-in">
          <CheckCircle2 className="w-4 h-4 shrink-0" />
          <span className="flex-1 font-medium">{successBanner}</span>
          <button onClick={() => setSuccessBanner('')} className="p-1 text-emerald-400 hover:text-white">
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* Search & Filters */}
      <div className="p-4 sm:p-5 rounded-2xl bg-[#141414] border border-white/10 grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div className="relative">
          <Search className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-500" />
          <input
            type="text"
            placeholder="Search email, UID, or role..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-9 pr-3 py-2 rounded-xl bg-[#1A1A1A] border border-white/10 text-white text-xs placeholder:text-gray-500 focus:outline-none focus:border-[#D4AF37] transition-all"
          />
        </div>

        <select
          value={selectedRoleFilter}
          onChange={(e) => setSelectedRoleFilter(e.target.value)}
          className="w-full px-3 py-2 rounded-xl bg-[#1A1A1A] border border-white/10 text-white text-xs focus:outline-none focus:border-[#D4AF37] transition-all"
        >
          <option value="all">All Roles</option>
          {ROLE_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>

        <select
          value={selectedStatusFilter}
          onChange={(e) => setSelectedStatusFilter(e.target.value)}
          className="w-full px-3 py-2 rounded-xl bg-[#1A1A1A] border border-white/10 text-white text-xs focus:outline-none focus:border-[#D4AF37] transition-all"
        >
          <option value="all">All Statuses</option>
          <option value="active">Active</option>
          <option value="suspended">Suspended</option>
        </select>
      </div>

      {/* Staff Records Table */}
      <div className="p-6 rounded-3xl bg-[#141414] border border-white/10 space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="font-heading font-extrabold text-base text-white">Staff Roster ({filteredStaff.length})</h2>
        </div>

        {isLoading ? (
          <div className="p-12 text-center space-y-3">
            <RefreshCw className="w-6 h-6 animate-spin text-[#D4AF37] mx-auto" />
            <p className="text-gray-400 text-xs font-medium">Loading staff records...</p>
          </div>
        ) : filteredStaff.length === 0 ? (
          <div className="p-10 rounded-2xl bg-black/40 border border-white/5 text-center text-gray-500 text-xs">
            No staff records found.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="border-b border-white/10 text-gray-400 uppercase tracking-wider text-[10px]">
                  <th className="py-3 px-3">Staff Identity</th>
                  <th className="py-3 px-3">Assigned Role</th>
                  <th className="py-3 px-3">Status</th>
                  <th className="py-3 px-3">Last Audit Activity</th>
                  <th className="py-3 px-3">Created</th>
                  <th className="py-3 px-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {filteredStaff.map((staff) => {
                  const isSuspended = staff.status === 'suspended';
                  const roleObj = ROLE_OPTIONS.find((r) => r.value === staff.role);

                  return (
                    <tr key={staff.id} className="hover:bg-white/[0.02] transition-colors">
                      {/* Identity */}
                      <td className="py-3.5 px-3 space-y-0.5">
                        <p className="font-bold text-white text-sm">{staff.email}</p>
                        <p className="font-mono text-[10px] text-gray-500 truncate max-w-[180px]">UID: {staff.id}</p>
                      </td>

                      {/* Role Dropdown */}
                      <td className="py-3.5 px-3">
                        <select
                          value={staff.role}
                          onChange={(e) => handleRoleSelectChange(staff, e.target.value)}
                          className="px-2.5 py-1.5 rounded-xl bg-[#1C1C1C] border border-white/10 text-white text-xs font-semibold focus:outline-none focus:border-[#D4AF37] transition-all cursor-pointer"
                        >
                          {ROLE_OPTIONS.map((opt) => (
                            <option key={opt.value} value={opt.value}>
                              {opt.label}
                            </option>
                          ))}
                        </select>
                      </td>

                      {/* Status Badge */}
                      <td className="py-3.5 px-3">
                        <span
                          className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider ${
                            isSuspended
                              ? 'bg-red-500/10 text-red-400 border border-red-500/30'
                              : 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/30'
                          }`}
                        >
                          {isSuspended ? <UserX className="w-3 h-3" /> : <UserCheck className="w-3 h-3" />}
                          <span>{staff.status}</span>
                        </span>
                      </td>

                      {/* Last Audit Activity */}
                      <td className="py-3.5 px-3">
                        {staff.lastAuditAction ? (
                          <div className="space-y-0.5">
                            <span className="font-mono font-bold text-[#D4AF37] text-[11px] block">
                              {staff.lastAuditAction.action}
                            </span>
                            <span className="text-[10px] text-gray-500">
                              {new Date(staff.lastAuditAction.timestamp).toLocaleString([], { dateStyle: 'short', timeStyle: 'short' })}
                            </span>
                          </div>
                        ) : (
                          <span className="text-gray-600 text-[11px]">No activity logged</span>
                        )}
                      </td>

                      {/* Created */}
                      <td className="py-3.5 px-3 text-gray-400 text-[11px]">
                        {staff.createdAt ? new Date(staff.createdAt).toLocaleDateString() : '—'}
                      </td>

                      {/* Actions */}
                      <td className="py-3.5 px-3 text-right">
                        <button
                          onClick={() => handleToggleStatus(staff)}
                          className={`px-3 py-1.5 rounded-xl border text-[11px] font-bold transition-all cursor-pointer ${
                            isSuspended
                              ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400 hover:bg-emerald-500/20'
                              : 'bg-red-500/10 border-red-500/30 text-red-400 hover:bg-red-500/20'
                          }`}
                        >
                          {isSuspended ? 'Reactivate' : 'Suspend'}
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ======================================================== */}
      {/* ADD STAFF MODAL (Lookup -> Role Select -> Save) */}
      {/* ======================================================== */}
      {showAddModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in">
          <div className="w-full max-w-lg p-6 rounded-3xl bg-[#141414] border border-white/10 space-y-5 shadow-2xl">
            <div className="flex items-center justify-between border-b border-white/10 pb-4">
              <div className="flex items-center gap-2.5">
                <UserPlus className="w-5 h-5 text-[#D4AF37]" />
                <h3 className="font-heading font-bold text-base text-white">Add Staff Member</h3>
              </div>
              <button
                onClick={() => setShowAddModal(false)}
                className="p-1 rounded-lg text-gray-400 hover:text-white hover:bg-white/10"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Step 1: Lookup Email */}
            <form onSubmit={handleLookupUser} className="space-y-3">
              <label className="block text-xs font-semibold text-gray-300">
                1. Lookup User Account by Email <span className="text-red-400">*</span>
              </label>
              <div className="flex items-center gap-2">
                <input
                  type="email"
                  required
                  placeholder="e.g. staff.member@example.com"
                  value={lookupEmail}
                  onChange={(e) => setLookupEmail(e.target.value)}
                  className="flex-1 px-3.5 py-2.5 rounded-xl bg-[#1A1A1A] border border-white/10 text-white text-xs focus:outline-none focus:border-[#D4AF37]"
                />
                <button
                  type="submit"
                  disabled={isLookingUp || !lookupEmail.trim()}
                  className="px-4 py-2.5 rounded-xl bg-[#222] hover:bg-[#333] border border-white/10 text-white text-xs font-bold transition-all disabled:opacity-50 cursor-pointer"
                >
                  {isLookingUp ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : 'Lookup'}
                </button>
              </div>
              <p className="text-[11px] text-gray-500">
                The person must have an existing Firebase account before being granted staff access.
              </p>
            </form>

            {/* Step 2: Resolved User Details & Role Selection */}
            {resolvedUser && (
              <div className="p-4 rounded-2xl bg-emerald-500/10 border border-emerald-500/30 space-y-4 animate-in fade-in">
                <div className="flex items-center gap-2 text-emerald-400 text-xs font-bold">
                  <CheckCircle2 className="w-4 h-4" />
                  <span>Account Found</span>
                </div>

                <div className="space-y-1 text-xs">
                  <p className="text-gray-300">Name: <strong className="text-white">{resolvedUser.displayName}</strong></p>
                  <p className="text-gray-300">Email: <strong className="text-white">{resolvedUser.email}</strong></p>
                  <p className="font-mono text-[10px] text-gray-500">UID: {resolvedUser.uid}</p>
                </div>

                <div className="space-y-2 pt-2 border-t border-emerald-500/20">
                  <label className="block text-xs font-semibold text-gray-200">
                    2. Select Staff Role to Grant:
                  </label>
                  <div className="space-y-2">
                    {ROLE_OPTIONS.map((opt) => (
                      <label
                        key={opt.value}
                        className={`p-3 rounded-xl border block cursor-pointer transition-all ${
                          selectedRoleForAdd === opt.value
                            ? 'bg-[#D4AF37]/20 border-[#D4AF37] text-white shadow-md'
                            : 'bg-black/40 border-white/10 text-gray-400 hover:border-white/20'
                        }`}
                      >
                        <div className="flex items-center justify-between">
                          <span className="font-bold text-xs text-white">{opt.label}</span>
                          <input
                            type="radio"
                            name="role_add"
                            checked={selectedRoleForAdd === opt.value}
                            onChange={() => setSelectedRoleForAdd(opt.value)}
                            className="text-[#D4AF37]"
                          />
                        </div>
                        <p className="text-[10px] text-gray-400 mt-0.5">{opt.description}</p>
                      </label>
                    ))}
                  </div>
                </div>

                <div className="flex items-center justify-end gap-3 pt-2">
                  <button
                    type="button"
                    onClick={() => setShowAddModal(false)}
                    className="px-4 py-2 rounded-xl bg-white/5 hover:bg-white/10 text-gray-300 text-xs font-semibold"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    disabled={isCreatingStaff}
                    onClick={handleCreateStaffSubmit}
                    className="px-5 py-2 rounded-xl bg-gradient-to-r from-[#F3E5AB] to-[#D4AF37] text-black font-extrabold text-xs flex items-center gap-2 hover:brightness-110 disabled:opacity-50 cursor-pointer"
                  >
                    {isCreatingStaff ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <UserPlus className="w-3.5 h-3.5" />}
                    <span>Confirm & Grant Role</span>
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ======================================================== */}
      {/* CONFIRMATION MODAL FOR DESTRUCTIVE ACTIONS */}
      {/* ======================================================== */}
      {confirmModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in">
          <div className="w-full max-w-md p-6 rounded-3xl bg-[#141414] border border-red-500/30 space-y-5 shadow-2xl">
            <div className="flex items-center gap-2.5 text-red-400 border-b border-white/10 pb-4">
              <AlertTriangle className="w-5 h-5" />
              <h3 className="font-heading font-bold text-base text-white">Confirm Permission Change</h3>
            </div>

            <div className="text-xs text-gray-300 space-y-2">
              <p>
                Target account: <strong className="text-white">{confirmModal.targetStaff.email}</strong>
              </p>
              <p className="text-gray-400">
                {confirmModal.actionType === 'suspend' && (
                  <>Suspending this user will immediately revoke their access to counter and management portals.</>
                )}
                {confirmModal.actionType === 'activate' && (
                  <>Reactivating this account will restore their staff permissions.</>
                )}
                {confirmModal.actionType === 'role_change' && (
                  <>
                    Are you sure you want to change their role from{' '}
                    <strong className="text-white uppercase">{confirmModal.targetStaff.role}</strong> to{' '}
                    <strong className="text-[#D4AF37] uppercase">{confirmModal.newRole}</strong>?
                  </>
                )}
              </p>
            </div>

            <div className="flex items-center justify-end gap-3 pt-2">
              <button
                type="button"
                onClick={() => setConfirmModal(null)}
                className="px-4 py-2 rounded-xl bg-white/5 hover:bg-white/10 text-gray-300 text-xs font-semibold"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={isUpdatingStaff}
                onClick={handleExecuteConfirmedUpdate}
                className="px-5 py-2 rounded-xl bg-red-600 hover:bg-red-500 text-white font-extrabold text-xs flex items-center gap-2 disabled:opacity-50 cursor-pointer"
              >
                {isUpdatingStaff ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <ShieldCheck className="w-3.5 h-3.5" />}
                <span>Confirm Action</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
