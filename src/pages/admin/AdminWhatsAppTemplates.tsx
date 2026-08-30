import React, { useState } from 'react';
import { MessageSquare, Plus, Trash2, Edit3, Check, X, ToggleLeft, ToggleRight, Tag, HelpCircle } from 'lucide-react';
import { useBooking } from '../../contexts/BookingContext';
import { useAuth } from '../../contexts/AuthContext';

const VARIABLE_HELP = [
  { key: '{{eventTitle}}', desc: 'Event name' },
  { key: '{{attendeeName}}', desc: 'Guest name' },
  { key: '{{quantity}}', desc: 'Number of tickets' },
  { key: '{{date}}', desc: 'Event date' },
  { key: '{{time}}', desc: 'Event time' },
  { key: '{{venue}}', desc: 'Venue name' },
  { key: '{{city}}', desc: 'City' },
  { key: '{{tierName}}', desc: 'Ticket tier name' },
  { key: '{{seatLabel}}', desc: 'Seat(s) assigned' },
  { key: '{{ticketRef}}', desc: 'Ticket reference number' },
  { key: '{{passUrl}}', desc: 'Digital pass link' },
  { key: '{{mapsUrl}}', desc: 'Google Maps link' },
  { key: '{{totalPaid}}', desc: 'Total amount paid' },
  { key: '{{bookingId}}', desc: 'Booking ID' },
];

const DEFAULT_TEMPLATE_BODY = `🎟️ *TICKET CONFIRMED — You're In!*
━━━━━━━━━━━━━━━
🎬 *{{eventTitle}}*
━━━━━━━━━━━━━━━

👤 *Attendee:* {{attendeeName}}
🎟️ *Tickets:* {{quantity}}
📅 *Date:* {{date}}
🕗 *Time:* {{time}}
📍 *Venue:* {{venue}}, {{city}}
🪑 *Tier:* {{tierName}}
💺 *Seat:* {{seatLabel}}
🧾 *Ticket Ref:* \`ASH-{{ticketRef}}\`

🔗 *Your Digital Pass*
👉 {{passUrl}}
_Scan at the gate — no printing needed_

🗺️ *Get Directions*
👉 {{mapsUrl}}

✨ *Thank you for booking with Ash-vish Events!*`;

export const AdminWhatsAppTemplates: React.FC = () => {
  const { whatsappTemplates, createWhatsAppTemplate, updateWhatsAppTemplate, deleteWhatsAppTemplate, events } = useBooking();
  const { user } = useAuth();
  const [showCreate, setShowCreate] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [formName, setFormName] = useState('');
  const [formBody, setFormBody] = useState('');
  const [formEventIds, setFormEventIds] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const [showVarHelp, setShowVarHelp] = useState(false);

  const resetForm = () => {
    setFormName('');
    setFormBody('');
    setFormEventIds([]);
    setEditingId(null);
    setShowCreate(false);
  };

  const handleCreate = async () => {
    if (!formName.trim() || !formBody.trim()) return;
    setSaving(true);
    const ok = await createWhatsAppTemplate({ name: formName.trim(), body: formBody.trim(), assignedEventIds: formEventIds });
    setSaving(false);
    if (ok) resetForm();
  };

  const handleUpdate = async () => {
    if (!editingId || !formName.trim() || !formBody.trim()) return;
    setSaving(true);
    const ok = await updateWhatsAppTemplate(editingId, { name: formName.trim(), body: formBody.trim(), assignedEventIds: formEventIds });
    setSaving(false);
    if (ok) resetForm();
  };

  const handleEdit = (tpl: any) => {
    setEditingId(tpl.id);
    setFormName(tpl.name);
    setFormBody(tpl.body);
    setFormEventIds(tpl.assignedEventIds || []);
    setShowCreate(true);
  };

  const handleDelete = async (id: string, name: string) => {
    if (!confirm(`Delete template "${name}"? This cannot be undone.`)) return;
    await deleteWhatsAppTemplate(id);
  };

  const toggleActive = async (tpl: any) => {
    await updateWhatsAppTemplate(tpl.id, { isActive: !tpl.isActive });
  };

  const toggleEventAssignment = (eventId: string) => {
    setFormEventIds(prev =>
      prev.includes(eventId) ? prev.filter(id => id !== eventId) : [...prev, eventId]
    );
  };

  return (
    <div className="space-y-6 max-w-4xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-2xl bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center text-emerald-400">
            <MessageSquare className="w-5 h-5" />
          </div>
          <div>
            <h1 className="font-heading font-extrabold text-xl text-white">WhatsApp Templates</h1>
            <p className="text-gray-400 text-xs mt-0.5">Create and manage message templates sent after ticket booking.</p>
          </div>
        </div>
        <button
          onClick={() => { resetForm(); setShowCreate(true); }}
          className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-gradient-to-r from-[#F3E5AB] to-[#D4AF37] text-black font-bold text-xs hover:brightness-110 transition-all cursor-pointer"
        >
          <Plus className="w-4 h-4" /> New Template
        </button>
      </div>

      {/* Create/Edit Form */}
      {showCreate && (
        <div className="p-5 rounded-3xl bg-[#141414] border border-[#D4AF37]/30 space-y-4 animate-in fade-in">
          <div className="flex items-center justify-between">
            <h3 className="font-heading font-bold text-sm text-white">
              {editingId ? 'Edit Template' : 'New Template'}
            </h3>
            <button onClick={resetForm} className="p-1 rounded-lg hover:bg-white/10 text-gray-400 hover:text-white cursor-pointer">
              <X className="w-4 h-4" />
            </button>
          </div>

          <div>
            <label className="text-xs font-bold text-gray-300 block mb-1">Template Name</label>
            <input
              type="text"
              value={formName}
              onChange={e => setFormName(e.target.value)}
              placeholder="e.g. Default Booking Confirmation"
              className="w-full bg-[#1C1C1C] border border-white/10 rounded-xl px-4 py-2.5 text-sm text-white focus:outline-none focus:border-[#D4AF37]"
              maxLength={100}
            />
          </div>

          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="text-xs font-bold text-gray-300">Message Body</label>
              <button
                onClick={() => setShowVarHelp(!showVarHelp)}
                className="flex items-center gap-1 text-[10px] text-[#D4AF37] hover:text-[#F3E5AB] cursor-pointer"
              >
                <HelpCircle className="w-3 h-3" /> Variables
              </button>
            </div>
            {showVarHelp && (
              <div className="mb-2 p-3 rounded-xl bg-[#1C1C1C] border border-white/10 space-y-1">
                <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-1">Available Variables</p>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-1">
                  {VARIABLE_HELP.map(v => (
                    <button
                      key={v.key}
                      onClick={() => setFormBody(prev => prev + v.key)}
                      className="text-left px-2 py-1 rounded-lg bg-white/5 hover:bg-[#D4AF37]/10 text-[10px] cursor-pointer"
                    >
                      <span className="text-[#D4AF37] font-mono font-bold">{v.key}</span>
                      <span className="text-gray-500 ml-1">{v.desc}</span>
                    </button>
                  ))}
                </div>
              </div>
            )}
            <textarea
              value={formBody}
              onChange={e => setFormBody(e.target.value)}
              placeholder="Type your WhatsApp message template here..."
              rows={12}
              className="w-full bg-[#1C1C1C] border border-white/10 rounded-xl px-4 py-3 text-sm text-white font-mono focus:outline-none focus:border-[#D4AF37] resize-y"
              maxLength={4000}
            />
            <p className="text-[10px] text-gray-500 mt-1">{formBody.length}/4000 characters</p>
          </div>

          <div>
            <label className="text-xs font-bold text-gray-300 block mb-2">Assign to Events (leave empty for default template)</label>
            {events.length > 0 ? (
              <div className="max-h-48 overflow-y-auto space-y-1 p-3 rounded-xl bg-[#1C1C1C] border border-white/10">
                {events.map(evt => (
                  <label key={evt.id} className="flex items-center gap-2 px-2 py-1.5 rounded-lg hover:bg-white/5 cursor-pointer text-xs">
                    <input
                      type="checkbox"
                      checked={formEventIds.includes(evt.id)}
                      onChange={() => toggleEventAssignment(evt.id)}
                      className="accent-[#D4AF37]"
                    />
                    <span className="text-white truncate">{evt.title}</span>
                    <span className="text-gray-500 text-[10px] ml-auto">{evt.date}</span>
                  </label>
                ))}
              </div>
            ) : (
              <p className="text-xs text-gray-500">No events available.</p>
            )}
          </div>

          <div className="flex gap-3 pt-2">
            <button
              onClick={editingId ? handleUpdate : handleCreate}
              disabled={saving || !formName.trim() || !formBody.trim()}
              className="flex-1 py-3 rounded-xl bg-gradient-to-r from-[#F3E5AB] to-[#D4AF37] text-black font-bold text-xs hover:brightness-110 disabled:opacity-50 cursor-pointer flex items-center justify-center gap-2"
            >
              {saving ? 'Saving...' : editingId ? 'Update Template' : 'Create Template'}
            </button>
            <button
              onClick={resetForm}
              className="px-6 py-3 rounded-xl bg-white/10 text-white font-bold text-xs hover:bg-white/15 cursor-pointer"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Template List */}
      {whatsappTemplates.length === 0 && !showCreate ? (
        <div className="p-12 rounded-3xl bg-[#141414] border border-white/10 text-center space-y-3">
          <MessageSquare className="w-10 h-10 text-gray-600 mx-auto" />
          <p className="text-sm font-bold text-gray-400">No Templates Yet</p>
          <p className="text-xs text-gray-500">Create a WhatsApp message template to send custom confirmations after booking.</p>
          <button
            onClick={() => setShowCreate(true)}
            className="px-4 py-2 rounded-xl bg-[#D4AF37]/20 text-[#D4AF37] text-xs font-bold hover:bg-[#D4AF37]/30 cursor-pointer"
          >
            Create First Template
          </button>
        </div>
      ) : (
        <div className="space-y-3">
          {whatsappTemplates.map(tpl => (
            <div
              key={tpl.id}
              className={`p-4 sm:p-5 rounded-2xl border transition-all ${
                tpl.isActive
                  ? 'bg-[#141414] border-emerald-500/20 hover:border-emerald-500/40'
                  : 'bg-[#141414] border-white/5 opacity-60'
              }`}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <h3 className="font-heading font-bold text-sm text-white">{tpl.name}</h3>
                    {tpl.isActive ? (
                      <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">Active</span>
                    ) : (
                      <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-gray-500/10 text-gray-400 border border-gray-500/20">Inactive</span>
                    )}
                  </div>
                  <p className="text-xs text-gray-500 mt-1 line-clamp-2">{tpl.body}</p>
                  {tpl.assignedEventIds && tpl.assignedEventIds.length > 0 && (
                    <div className="flex items-center gap-1 mt-2 flex-wrap">
                      <Tag className="w-3 h-3 text-[#D4AF37]" />
                      <span className="text-[10px] text-gray-400">
                        Assigned to {tpl.assignedEventIds.length} event(s)
                      </span>
                    </div>
                  )}
                  {!tpl.assignedEventIds || tpl.assignedEventIds.length === 0 ? (
                    <div className="flex items-center gap-1 mt-2">
                      <Tag className="w-3 h-3 text-gray-500" />
                      <span className="text-[10px] text-gray-500">Default template (all events)</span>
                    </div>
                  ) : null}
                </div>

                <div className="flex items-center gap-1.5 flex-shrink-0">
                  <button
                    onClick={() => toggleActive(tpl)}
                    className="p-1.5 rounded-lg hover:bg-white/10 transition-colors cursor-pointer"
                    title={tpl.isActive ? 'Deactivate' : 'Activate'}
                  >
                    {tpl.isActive ? (
                      <ToggleRight className="w-5 h-5 text-emerald-400" />
                    ) : (
                      <ToggleLeft className="w-5 h-5 text-gray-500" />
                    )}
                  </button>
                  <button
                    onClick={() => handleEdit(tpl)}
                    className="p-1.5 rounded-lg hover:bg-white/10 text-gray-400 hover:text-white transition-colors cursor-pointer"
                    title="Edit"
                  >
                    <Edit3 className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => handleDelete(tpl.id, tpl.name)}
                    className="p-1.5 rounded-lg hover:bg-red-500/10 text-gray-400 hover:text-red-400 transition-colors cursor-pointer"
                    title="Delete"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
