import React, { useEffect, useState } from 'react';
import {
  ShieldCheck,
  ShieldAlert,
  CheckCircle2,
  XCircle,
  RefreshCw,
  Download,
  Search,
  Filter,
  AlertTriangle,
  Layers,
  MapPin,
  Ticket,
  Sparkles,
  Info,
  ChevronRight,
  Zap,
} from 'lucide-react';
import { EventComplianceReport, ComplianceSummary } from '../../types';
import { useToast } from '../../contexts/ToastContext';
import { downloadTable } from '../../lib/exportFile';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '../../components/Dialog/Dialog';
import { Button } from '../../components/Button';

export const AdminCompliance: React.FC = () => {
  const { showToast } = useToast();
  const [reports, setReports] = useState<EventComplianceReport[]>([]);
  const [summary, setSummary] = useState<ComplianceSummary | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [remediating, setRemediating] = useState<boolean>(false);
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'compliant' | 'non-compliant'>('all');
  const [selectedReport, setSelectedReport] = useState<EventComplianceReport | null>(null);
  const [remediationLogs, setRemediationLogs] = useState<string[]>([]);
  const [logModalOpen, setLogModalOpen] = useState<boolean>(false);

  const fetchComplianceReport = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/admin/compliance/report');
      const data = await res.json();
      if (data.success) {
        setReports(data.reports || []);
        setSummary(data.summary || null);
      } else {
        showToast(data.error || 'Failed to load compliance report.', 'error');
      }
    } catch (err: any) {
      showToast(err.message || 'Error connecting to compliance server.', 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchComplianceReport();
  }, []);

  const handleAutoRemediate = async () => {
    setRemediating(true);
    try {
      const res = await fetch('/api/admin/compliance/remediate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });
      const data = await res.json();
      if (data.success) {
        showToast(data.message || 'Policy auto-remediation completed successfully.', 'success');
        setRemediationLogs(data.logs || []);
        if (data.logs && data.logs.length > 0) {
          setLogModalOpen(true);
        }
        await fetchComplianceReport();
      } else {
        showToast(data.error || 'Remediation failed.', 'error');
      }
    } catch (err: any) {
      showToast(err.message || 'Failed to trigger remediation.', 'error');
    } finally {
      setRemediating(false);
    }
  };

  const exportReport = () => {
    if (!reports.length) return;
    const headers = [
      'Event ID',
      'Event Title',
      'Event Date',
      'Venue',
      'City',
      'Total Tickets',
      'Manual Entry Check',
      'Counter Placement Check',
      'Unnecessary Placement Check',
      'Overall Compliance Status',
      'Audit Timestamp',
    ];

    const rows = reports.map((r) => [
      r.eventId,
      r.eventTitle,
      r.eventDate,
      r.eventVenue,
      r.eventCity,
      r.totalTickets,
      r.checks.manualEntry.status,
      r.checks.counterPlacement.status,
      r.checks.unnecessaryPlacement.status,
      r.overallStatus,
      r.lastAuditedAt,
    ]);

    downloadTable(headers, rows, 'csv', `ticket-compliance-report-${new Date().toISOString().slice(0, 10)}`);
  };

  const filteredReports = reports.filter((r) => {
    const matchesSearch =
      r.eventTitle.toLowerCase().includes(searchQuery.toLowerCase()) ||
      r.eventVenue.toLowerCase().includes(searchQuery.toLowerCase()) ||
      r.eventCity.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesStatus =
      statusFilter === 'all'
        ? true
        : statusFilter === 'compliant'
        ? r.overallStatus === 'Compliant'
        : r.overallStatus === 'Non-compliant';
    return matchesSearch && matchesStatus;
  });

  return (
    <div className="space-y-8 animate-in fade-in duration-300">
      {/* Top Banner Header */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 border-b border-white/10 pb-6">
        <div>
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-amber-500/10 border border-amber-500/30 text-amber-400">
              <ShieldCheck className="w-7 h-7" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-2xl font-bold text-white tracking-tight">Ticket Compliance Assistant</h1>
                <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 uppercase tracking-wider">
                  Policy Enforced
                </span>
              </div>
              <p className="text-xs text-gray-400 mt-0.5">
                Enforcing ticket-handling policy: Prevent manual entry, counter display, and unrequired placement of completed event tickets.
              </p>
            </div>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <button
            onClick={fetchComplianceReport}
            disabled={loading}
            className="flex items-center gap-2 px-3.5 py-2 rounded-xl bg-white/5 hover:bg-white/10 text-gray-300 font-semibold text-xs border border-white/10 transition-colors disabled:opacity-50 cursor-pointer"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
            <span>Audit Check</span>
          </button>

          <button
            onClick={handleAutoRemediate}
            disabled={remediating || loading}
            className="flex items-center gap-2 px-4 py-2 rounded-xl bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-400 hover:to-amber-500 text-black font-bold text-xs shadow-lg shadow-amber-500/20 transition-all disabled:opacity-50 cursor-pointer"
          >
            <Zap className="w-3.5 h-3.5 fill-black" />
            <span>{remediating ? 'Remediating…' : 'Auto-Remediate Policy'}</span>
          </button>

          <button
            onClick={exportReport}
            disabled={!reports.length}
            className="flex items-center gap-2 px-3.5 py-2 rounded-xl bg-white/5 hover:bg-white/10 text-white font-semibold text-xs border border-white/10 transition-colors disabled:opacity-50 cursor-pointer"
          >
            <Download className="w-3.5 h-3.5" />
            <span>Export CSV</span>
          </button>
        </div>
      </div>

      {/* Summary KPI Cards */}
      {summary && (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3 sm:gap-4">
          <SummaryWidget
            icon={<Layers className="w-4 h-4 text-sky-400" />}
            label="Completed Events"
            value={summary.totalCompletedEvents}
            badge="Audited"
            color="sky"
          />
          <SummaryWidget
            icon={<CheckCircle2 className="w-4 h-4 text-emerald-400" />}
            label="Fully Compliant"
            value={summary.compliantEventsCount}
            badge={`${summary.totalCompletedEvents ? Math.round((summary.compliantEventsCount / summary.totalCompletedEvents) * 100) : 0}%`}
            color="emerald"
          />
          <SummaryWidget
            icon={<XCircle className="w-4 h-4 text-rose-400" />}
            label="Non-compliant"
            value={summary.nonCompliantEventsCount}
            badge="Action Required"
            color="rose"
          />
          <SummaryWidget
            icon={<ShieldAlert className="w-4 h-4 text-amber-400" />}
            label="Manual Entry Check"
            value={summary.manualEntryViolationsCount}
            badge={summary.manualEntryViolationsCount === 0 ? 'Pass' : 'Violations'}
            color={summary.manualEntryViolationsCount === 0 ? 'emerald' : 'amber'}
          />
          <SummaryWidget
            icon={<AlertTriangle className="w-4 h-4 text-purple-400" />}
            label="Counter Placement Check"
            value={summary.counterPlacementViolationsCount}
            badge={summary.counterPlacementViolationsCount === 0 ? 'Pass' : 'Violations'}
            color={summary.counterPlacementViolationsCount === 0 ? 'emerald' : 'purple'}
          />
          <SummaryWidget
            icon={<MapPin className="w-4 h-4 text-cyan-400" />}
            label="Unnecessary Placement Check"
            value={summary.unnecessaryPlacementViolationsCount}
            badge={summary.unnecessaryPlacementViolationsCount === 0 ? 'Pass' : 'Violations'}
            color={summary.unnecessaryPlacementViolationsCount === 0 ? 'emerald' : 'cyan'}
          />
        </div>
      )}

      {/* Policy Rules Callout */}
      <div className="p-4 rounded-xl bg-white/[0.03] border border-white/10 flex flex-col md:flex-row items-start md:items-center justify-between gap-4 text-xs">
        <div className="flex items-start gap-3">
          <Info className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
          <div className="space-y-1">
            <span className="font-semibold text-white">Compliance Standard Policy Checklist</span>
            <p className="text-gray-400 text-[11px]">
              1. <strong>Manual Entry Prohibition:</strong> Completed events generate tickets automatically; manual ticket entry is strictly blocked.<br />
              2. <strong>Counter Display Prohibition:</strong> Completed event tickets must never appear on physical sales counters.<br />
              3. <strong>Unnecessary Placement Prohibition:</strong> Tickets for completed events must never be placed in unrequired locations.
            </p>
          </div>
        </div>
      </div>

      {/* Controls Bar: Search & Filter */}
      <div className="flex flex-col sm:flex-row items-center justify-between gap-3">
        <div className="relative w-full sm:w-80">
          <Search className="w-4 h-4 text-gray-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            placeholder="Search completed events, venues..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full bg-white/5 border border-white/10 rounded-xl pl-10 pr-4 py-2 text-xs text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-amber-500/40"
          />
        </div>

        <div className="flex items-center gap-2 w-full sm:w-auto justify-end">
          <Filter className="w-3.5 h-3.5 text-gray-400" />
          <div className="flex items-center bg-white/5 border border-white/10 rounded-xl p-1 text-xs">
            {(['all', 'compliant', 'non-compliant'] as const).map((filterOption) => (
              <button
                key={filterOption}
                onClick={() => setStatusFilter(filterOption)}
                className={`px-3 py-1 rounded-lg font-semibold capitalize transition-all cursor-pointer ${
                  statusFilter === filterOption
                    ? 'bg-amber-500 text-black shadow-sm'
                    : 'text-gray-400 hover:text-white'
                }`}
              >
                {filterOption}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Compliance Reports Table */}
      <div className="rounded-xl border border-white/10 bg-white/5 overflow-hidden shadow-2xl">
        <div className="px-5 py-4 border-b border-white/10 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Ticket className="w-4 h-4 text-amber-400" />
            <h2 className="font-semibold text-sm text-white">Completed Events Compliance Checklist ({filteredReports.length})</h2>
          </div>
        </div>

        {loading ? (
          <div className="p-12 text-center text-gray-400 text-xs">
            <RefreshCw className="w-6 h-6 animate-spin mx-auto text-amber-400 mb-2" />
            Auditing completed event tickets & placement policies…
          </div>
        ) : filteredReports.length === 0 ? (
          <div className="p-12 text-center text-gray-400 text-xs space-y-2">
            <ShieldCheck className="w-10 h-10 text-emerald-400/40 mx-auto" />
            <p className="font-semibold text-white">No Completed Event Records Match Your Criteria</p>
            <p className="text-[11px] text-gray-500">All completed event ticket checks are in compliance or no completed events exist.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs text-gray-300">
              <thead className="bg-white/5 border-b border-white/10 text-gray-400 uppercase font-semibold text-[10px] tracking-wider">
                <tr>
                  <th className="px-4 py-3.5">Completed Event</th>
                  <th className="px-4 py-3.5">Venue & Date</th>
                  <th className="px-4 py-3.5">Total Tickets</th>
                  <th className="px-4 py-3.5">Check 1: Manual Entry</th>
                  <th className="px-4 py-3.5">Check 2: Counter Placement</th>
                  <th className="px-4 py-3.5">Check 3: Unnecessary Location</th>
                  <th className="px-4 py-3.5 text-center">Overall Compliance</th>
                  <th className="px-4 py-3.5 text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {filteredReports.map((report) => (
                  <tr key={report.eventId} className="hover:bg-white/[0.02] transition-colors">
                    <td className="px-4 py-3.5">
                      <span className="font-bold text-white block text-sm">{report.eventTitle}</span>
                      <span className="text-[10px] text-gray-500 font-mono">ID: {report.eventId}</span>
                    </td>
                    <td className="px-4 py-3.5">
                      <span className="text-gray-200 font-medium block">{report.eventVenue}</span>
                      <span className="text-[10px] text-gray-400">{report.eventCity} · {report.eventDate}</span>
                    </td>
                    <td className="px-4 py-3.5 font-mono font-semibold text-gray-200">
                      {report.totalTickets}
                    </td>
                    <td className="px-4 py-3.5">
                      <StatusBadge status={report.checks.manualEntry.status} violations={report.checks.manualEntry.violationsCount} />
                    </td>
                    <td className="px-4 py-3.5">
                      <StatusBadge status={report.checks.counterPlacement.status} violations={report.checks.counterPlacement.violationsCount} />
                    </td>
                    <td className="px-4 py-3.5">
                      <StatusBadge status={report.checks.unnecessaryPlacement.status} violations={report.checks.unnecessaryPlacement.violationsCount} />
                    </td>
                    <td className="px-4 py-3.5 text-center">
                      <span
                        className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[11px] font-extrabold uppercase tracking-wide border ${
                          report.overallStatus === 'Compliant'
                            ? 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30'
                            : 'bg-rose-500/15 text-rose-400 border-rose-500/30 animate-pulse'
                        }`}
                      >
                        {report.overallStatus === 'Compliant' ? (
                          <>
                            <CheckCircle2 className="w-3.5 h-3.5" /> Compliant
                          </>
                        ) : (
                          <>
                            <XCircle className="w-3.5 h-3.5" /> Non-compliant
                          </>
                        )}
                      </span>
                    </td>
                    <td className="px-4 py-3.5 text-right">
                      <button
                        onClick={() => setSelectedReport(report)}
                        className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-white/5 hover:bg-white/10 text-amber-400 font-semibold text-xs border border-amber-500/20 transition-colors cursor-pointer"
                      >
                        <span>Inspect</span>
                        <ChevronRight className="w-3.5 h-3.5" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Inspection Modal */}
      {selectedReport && (
        <Dialog open={Boolean(selectedReport)} onOpenChange={() => setSelectedReport(null)}>
          <DialogContent className="max-w-2xl bg-[#121212] border-white/10 text-white">
            <DialogHeader>
              <DialogTitle className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <ShieldCheck className="w-5 h-5 text-amber-400" />
                  <span>Compliance Inspection: {selectedReport.eventTitle}</span>
                </div>
              </DialogTitle>
            </DialogHeader>

            <div className="space-y-4 py-3 text-xs">
              <div className="grid grid-cols-2 gap-3 p-3 rounded-xl bg-white/5 border border-white/10">
                <div>
                  <span className="text-gray-400 block text-[10px] uppercase font-bold">Venue & Date</span>
                  <span className="font-semibold text-gray-200">{selectedReport.eventVenue}, {selectedReport.eventCity}</span>
                  <span className="text-gray-400 block text-[11px]">{selectedReport.eventDate}</span>
                </div>
                <div>
                  <span className="text-gray-400 block text-[10px] uppercase font-bold">Audit Status</span>
                  <span
                    className={`inline-block px-2.5 py-0.5 rounded-md font-bold uppercase text-[10px] ${
                      selectedReport.overallStatus === 'Compliant' ? 'bg-emerald-500/20 text-emerald-400' : 'bg-rose-500/20 text-rose-400'
                    }`}
                  >
                    {selectedReport.overallStatus}
                  </span>
                  <span className="text-gray-400 block text-[10px] mt-0.5">Total Tickets: {selectedReport.totalTickets}</span>
                </div>
              </div>

              {/* Inspection Details by Check */}
              <div className="space-y-3">
                <CheckDetailCard
                  number="1"
                  title="Manual Entry Check"
                  rule="Verify that none of completed event tickets were entered manually."
                  result={selectedReport.checks.manualEntry}
                />
                <CheckDetailCard
                  number="2"
                  title="Counter Placement Check"
                  rule="Verify that none of completed event tickets appear on counters."
                  result={selectedReport.checks.counterPlacement}
                />
                <CheckDetailCard
                  number="3"
                  title="Unnecessary Location Placement Check"
                  rule="Verify that none of completed event tickets are placed in unnecessary locations."
                  result={selectedReport.checks.unnecessaryPlacement}
                />
              </div>
            </div>

            <DialogFooter>
              {selectedReport.overallStatus === 'Non-compliant' && (
                <Button
                  onClick={async () => {
                    setSelectedReport(null);
                    await handleAutoRemediate();
                  }}
                  className="bg-amber-500 text-black hover:bg-amber-400 font-bold"
                >
                  <Zap className="w-3.5 h-3.5 fill-black mr-1" />
                  Auto-Remediate This Event
                </Button>
              )}
              <Button variant="outline" onClick={() => setSelectedReport(null)}>
                Close
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}

      {/* Remediation Log Modal */}
      <Dialog open={logModalOpen} onOpenChange={setLogModalOpen}>
        <DialogContent className="max-w-xl bg-[#121212] border-white/10 text-white">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Sparkles className="w-5 h-5 text-amber-400" />
              <span>Remediation Activity Log</span>
            </DialogTitle>
          </DialogHeader>

          <div className="py-2 space-y-2 text-xs max-h-80 overflow-y-auto">
            {remediationLogs.map((log, index) => (
              <div key={index} className="p-2.5 rounded-lg bg-white/5 border border-white/10 font-mono text-[11px] text-gray-300 flex items-start gap-2">
                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0 mt-0.5" />
                <span>{log}</span>
              </div>
            ))}
          </div>

          <DialogFooter>
            <Button onClick={() => setLogModalOpen(false)}>Done</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

const SummaryWidget: React.FC<{
  icon: React.ReactNode;
  label: string;
  value: number;
  badge: string;
  color: string;
}> = ({ icon, label, value, badge }) => (
  <div className="rounded-xl border border-white/10 bg-white/5 p-3.5 flex flex-col justify-between space-y-2">
    <div className="flex items-center justify-between">
      <div className="w-8 h-8 rounded-lg bg-white/5 flex items-center justify-center">{icon}</div>
      <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider bg-white/5 px-2 py-0.5 rounded-md">
        {badge}
      </span>
    </div>
    <div>
      <div className="text-[11px] text-gray-400">{label}</div>
      <div className="text-xl font-extrabold text-white mt-0.5">{value}</div>
    </div>
  </div>
);

const StatusBadge: React.FC<{ status: 'Compliant' | 'Non-compliant'; violations: number }> = ({ status, violations }) => (
  <div className="flex items-center gap-1.5">
    {status === 'Compliant' ? (
      <span className="inline-flex items-center gap-1 text-emerald-400 font-semibold">
        <CheckCircle2 className="w-3.5 h-3.5" /> Compliant
      </span>
    ) : (
      <span className="inline-flex items-center gap-1 text-rose-400 font-semibold" title={`${violations} violation(s)`}>
        <XCircle className="w-3.5 h-3.5" /> Non-compliant ({violations})
      </span>
    )}
  </div>
);

const CheckDetailCard: React.FC<{
  number: string;
  title: string;
  rule: string;
  result: { status: 'Compliant' | 'Non-compliant'; violationsCount: number; details: string[] };
}> = ({ number, title, rule, result }) => (
  <div className={`p-3 rounded-xl border ${result.status === 'Compliant' ? 'bg-emerald-950/20 border-emerald-500/20' : 'bg-rose-950/20 border-rose-500/20'} space-y-1.5`}>
    <div className="flex items-center justify-between">
      <div className="flex items-center gap-2">
        <span className="w-5 h-5 rounded-full bg-white/10 flex items-center justify-center font-bold text-[10px]">
          {number}
        </span>
        <span className="font-bold text-white">{title}</span>
      </div>
      <span
        className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase ${
          result.status === 'Compliant' ? 'bg-emerald-500/20 text-emerald-300' : 'bg-rose-500/20 text-rose-300'
        }`}
      >
        {result.status}
      </span>
    </div>
    <p className="text-[11px] text-gray-400">{rule}</p>

    <div className="pt-1 space-y-1">
      {result.details.map((detail, idx) => (
        <div key={idx} className="text-[11px] text-gray-300 flex items-start gap-1.5">
          <span className="text-gray-500">•</span>
          <span>{detail}</span>
        </div>
      ))}
    </div>
  </div>
);
