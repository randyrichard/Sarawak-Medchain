import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { format } from 'date-fns';

/**
 * SalesPipeline - High-value hospital leads table with actions
 * Shows leads from Request Access modal submissions with estimated value
 */

const theme = {
  success: '#10b981',
  teal: '#14b8a6',
  warning: '#f59e0b',
  purple: '#8b5cf6',
  danger: '#ef4444',
  textPrimary: '#1E293B',
  textSecondary: '#64748B',
  textMuted: '#94A3B8',
  border: '#E2E8F0',
};

// Default leads data
const defaultLeads = [
  { id: 1, facilityName: 'KPJ Kuching Specialist Hospital', facilityType: 'Private Hospital', estimatedMCs: 850, decisionMaker: 'CEO', email: 'ceo@kpjkuching.com', submittedAt: '2026-01-15', status: 'new' },
  { id: 2, facilityName: 'Normah Medical Specialist Centre', facilityType: 'Private Specialist', estimatedMCs: 620, decisionMaker: 'Hospital Director', email: 'director@normah.com', submittedAt: '2026-01-14', status: 'contacted' },
  { id: 3, facilityName: 'Rejang Medical Centre', facilityType: 'Private Hospital', estimatedMCs: 480, decisionMaker: 'Head of IT', email: 'it@rejangmedical.com', submittedAt: '2026-01-14', status: 'demo_scheduled' },
  { id: 4, facilityName: 'Borneo Medical Centre', facilityType: 'Private Hospital', estimatedMCs: 720, decisionMaker: 'CEO', email: 'ceo@borneomedical.com', submittedAt: '2026-01-13', status: 'negotiating' },
  { id: 5, facilityName: 'Timberland Medical Centre', facilityType: 'Medical Centre', estimatedMCs: 390, decisionMaker: 'Operations Manager', email: 'ops@timberland.com', submittedAt: '2026-01-12', status: 'new' },
  { id: 6, facilityName: 'Columbia Asia Hospital Miri', facilityType: 'Private Hospital', estimatedMCs: 550, decisionMaker: 'Hospital Director', email: 'director@columbiaasia.com', submittedAt: '2026-01-11', status: 'contacted' },
];

// Status configurations
const statusConfig = {
  new: { color: theme.teal, label: 'New', icon: '✨' },
  contacted: { color: theme.warning, label: 'Contacted', icon: '📞' },
  demo_scheduled: { color: theme.purple, label: 'Demo Scheduled', icon: '📅' },
  negotiating: { color: theme.success, label: 'Negotiating', icon: '🤝' },
  closed: { color: theme.success, label: 'Closed', icon: '✅' },
  lost: { color: theme.danger, label: 'Lost', icon: '❌' },
};

// Calculate Lead Value: (Monthly MCs * RM1.00) + RM10,000 subscription
const calculateLeadValue = (estimatedMCs) => {
  return (estimatedMCs * 1.00) + 10000;
};

export default function SalesPipeline({
  leads = defaultLeads,
  onOpenProposal,
  onSendEmail,
  onCallLead,
  closedDeals = [],
  className = '',
}) {
  const [sortBy, setSortBy] = useState('value'); // 'value', 'date', 'status'
  const [filterStatus, setFilterStatus] = useState('all');

  // Filter and sort leads
  const filteredLeads = leads.filter(lead => {
    if (filterStatus === 'all') return true;
    return lead.status === filterStatus;
  });

  const sortedLeads = [...filteredLeads].sort((a, b) => {
    if (sortBy === 'value') {
      return calculateLeadValue(b.estimatedMCs) - calculateLeadValue(a.estimatedMCs);
    }
    if (sortBy === 'date') {
      return new Date(b.submittedAt) - new Date(a.submittedAt);
    }
    return 0;
  });

  // Calculate pipeline stats
  const totalPipelineValue = leads.reduce((sum, l) => sum + calculateLeadValue(l.estimatedMCs), 0);
  const totalMCs = leads.reduce((sum, l) => sum + l.estimatedMCs, 0);
  const closedValue = closedDeals.reduce((sum, d) => sum + calculateLeadValue(d.estimatedMCs), 0);

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className={`pro-card ${className}`}
    >
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <div
            className="w-10 h-10 rounded-lg flex items-center justify-center"
            style={{ backgroundColor: `${theme.purple}20` }}
          >
            <svg className="w-5 h-5" fill={theme.purple} viewBox="0 0 20 20">
              <path d="M9 2a1 1 0 000 2h2a1 1 0 100-2H9z" />
              <path fillRule="evenodd" d="M4 5a2 2 0 012-2 3 3 0 003 3h2a3 3 0 003-3 2 2 0 012 2v11a2 2 0 01-2 2H6a2 2 0 01-2-2V5zm3 4a1 1 0 000 2h.01a1 1 0 100-2H7zm3 0a1 1 0 000 2h3a1 1 0 100-2h-3zm-3 4a1 1 0 100 2h.01a1 1 0 100-2H7zm3 0a1 1 0 100 2h3a1 1 0 100-2h-3z" clipRule="evenodd" />
            </svg>
          </div>
          <div>
            <h3 className="text-lg font-bold" style={{ color: theme.textPrimary }}>
              Sales Pipeline
            </h3>
            <p className="text-xs" style={{ color: theme.textMuted }}>
              High-value hospital leads • {leads.length} prospects
            </p>
          </div>
        </div>

        {/* Filter/Sort Controls */}
        <div className="flex items-center gap-2">
          <select
            value={filterStatus}
            onChange={(e) => setFilterStatus(e.target.value)}
            className="px-3 py-1.5 rounded-lg text-sm bg-white border border-slate-200 text-slate-800 focus:outline-none focus:border-teal-500"
          >
            <option value="all">All Status</option>
            {Object.entries(statusConfig).map(([key, config]) => (
              <option key={key} value={key}>{config.label}</option>
            ))}
          </select>
          <select
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value)}
            className="px-3 py-1.5 rounded-lg text-sm bg-white border border-slate-200 text-slate-800 focus:outline-none focus:border-teal-500"
          >
            <option value="value">Sort by Value</option>
            <option value="date">Sort by Date</option>
          </select>
        </div>
      </div>

      {/* Leads Table */}
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr style={{ borderBottom: `1px solid ${theme.border}` }}>
              <th className="text-left py-3 px-4 text-xs font-semibold uppercase tracking-wider" style={{ color: theme.textMuted }}>
                Facility
              </th>
              <th className="text-left py-3 px-4 text-xs font-semibold uppercase tracking-wider" style={{ color: theme.textMuted }}>
                Est. MCs
              </th>
              <th className="text-left py-3 px-4 text-xs font-semibold uppercase tracking-wider" style={{ color: theme.textMuted }}>
                Value
              </th>
              <th className="text-left py-3 px-4 text-xs font-semibold uppercase tracking-wider" style={{ color: theme.textMuted }}>
                Status
              </th>
              <th className="text-right py-3 px-4 text-xs font-semibold uppercase tracking-wider" style={{ color: theme.textMuted }}>
                Actions
              </th>
            </tr>
          </thead>
          <tbody>
            <AnimatePresence>
              {sortedLeads.map((lead, index) => {
                const config = statusConfig[lead.status] || statusConfig.new;
                const value = calculateLeadValue(lead.estimatedMCs);
                const isClosed = closedDeals.some(d => d.id === lead.id);

                return (
                  <motion.tr
                    key={lead.id}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: isClosed ? 0.5 : 1, y: 0 }}
                    exit={{ opacity: 0, y: -10 }}
                    transition={{ delay: index * 0.03 }}
                    className="group hover:bg-slate-50 transition-colors"
                    style={{ borderBottom: `1px solid ${theme.border}` }}
                  >
                    <td className="py-4 px-4">
                      <div>
                        <p className="font-semibold" style={{ color: theme.textPrimary }}>
                          {lead.facilityName}
                        </p>
                        <p className="text-xs" style={{ color: theme.textMuted }}>
                          {lead.facilityType} • {lead.decisionMaker}
                        </p>
                      </div>
                    </td>
                    <td className="py-4 px-4">
                      <span className="font-bold" style={{ color: theme.teal }}>
                        {lead.estimatedMCs.toLocaleString()}
                      </span>
                      <span className="text-xs ml-1" style={{ color: theme.textMuted }}>/mo</span>
                    </td>
                    <td className="py-4 px-4">
                      <span className="font-bold" style={{ color: theme.success }}>
                        RM {value.toLocaleString()}
                      </span>
                      <span className="text-xs ml-1" style={{ color: theme.textMuted }}>MRR</span>
                    </td>
                    <td className="py-4 px-4">
                      <span
                        className="px-3 py-1 rounded-full text-xs font-semibold inline-flex items-center gap-1"
                        style={{
                          backgroundColor: `${config.color}20`,
                          color: config.color,
                        }}
                      >
                        <span>{config.icon}</span>
                        {config.label}
                      </span>
                    </td>
                    <td className="py-4 px-4">
                      <div className="flex items-center justify-end gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                        {onCallLead && (
                          <button
                            onClick={() => onCallLead(lead)}
                            className="w-8 h-8 rounded-lg flex items-center justify-center transition-colors hover:bg-slate-100"
                            style={{ color: theme.textSecondary }}
                            title="Call"
                          >
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
                            </svg>
                          </button>
                        )}
                        {onSendEmail && (
                          <button
                            onClick={() => onSendEmail(lead)}
                            className="w-8 h-8 rounded-lg flex items-center justify-center transition-colors hover:bg-slate-100"
                            style={{ color: theme.textSecondary }}
                            title="Email"
                          >
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                            </svg>
                          </button>
                        )}
                        {onOpenProposal && !isClosed && (
                          <button
                            onClick={() => onOpenProposal(lead)}
                            className="px-3 py-1.5 rounded-lg text-xs font-semibold transition-all hover:scale-105"
                            style={{
                              background: `linear-gradient(135deg, ${theme.warning}, #d97706)`,
                              color: '#000',
                            }}
                          >
                            Send Proposal
                          </button>
                        )}
                        {isClosed && (
                          <span
                            className="px-3 py-1.5 rounded-lg text-xs font-semibold"
                            style={{
                              backgroundColor: `${theme.success}20`,
                              color: theme.success,
                            }}
                          >
                            ✓ Closed
                          </span>
                        )}
                      </div>
                    </td>
                  </motion.tr>
                );
              })}
            </AnimatePresence>
          </tbody>
        </table>
      </div>

      {/* Pipeline Summary */}
      <div
        className="mt-6 pt-6 grid grid-cols-4 gap-4"
        style={{ borderTop: `1px solid ${theme.border}` }}
      >
        <div className="text-center">
          <p className="text-2xl font-black" style={{ color: theme.teal }}>
            {leads.filter(l => l.facilityType === 'Private Hospital').length}
          </p>
          <p className="text-xs" style={{ color: theme.textMuted }}>Private Hospitals</p>
        </div>
        <div className="text-center">
          <p className="text-2xl font-black" style={{ color: theme.purple }}>
            {leads.filter(l => l.facilityType === 'Private Specialist').length}
          </p>
          <p className="text-xs" style={{ color: theme.textMuted }}>Specialists</p>
        </div>
        <div className="text-center">
          <p className="text-2xl font-black" style={{ color: theme.warning }}>
            {totalMCs.toLocaleString()}
          </p>
          <p className="text-xs" style={{ color: theme.textMuted }}>Total Est. MCs</p>
        </div>
        <div className="text-center">
          <p className="text-2xl font-black" style={{ color: theme.success }}>
            RM {totalPipelineValue.toLocaleString()}
          </p>
          <p className="text-xs" style={{ color: theme.textMuted }}>Total Pipeline MRR</p>
        </div>
      </div>
    </motion.div>
  );
}
