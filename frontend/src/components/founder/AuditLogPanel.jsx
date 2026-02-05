import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { format } from 'date-fns';

/**
 * AuditLogPanel - Collapsible sidebar showing admin action history
 * Features: Filter by type, date, and export audit trail
 */

// Action type configurations
const actionTypes = {
  login: { icon: '🔐', color: '#3b82f6', label: 'Login' },
  logout: { icon: '🚪', color: '#64748b', label: 'Logout' },
  export: { icon: '📄', color: '#8b5cf6', label: 'Export' },
  deal_closed: { icon: '🤝', color: '#10b981', label: 'Deal Closed' },
  invoice_sent: { icon: '📧', color: '#f59e0b', label: 'Invoice Sent' },
  node_action: { icon: '🖥️', color: '#14b8a6', label: 'Node Action' },
  settings: { icon: '⚙️', color: '#6366f1', label: 'Settings' },
  alert: { icon: '🚨', color: '#ef4444', label: 'Alert' },
  automation: { icon: '🤖', color: '#22d3ee', label: 'Automation' },
};

export default function AuditLogPanel({
  isOpen,
  onClose,
  logs = [],
  onExport,
}) {
  const [filter, setFilter] = useState('all');
  const [searchQuery, setSearchQuery] = useState('');

  // Generate mock logs if none provided
  const [auditLogs, setAuditLogs] = useState(logs.length > 0 ? logs : generateMockLogs());

  useEffect(() => {
    if (logs.length > 0) {
      setAuditLogs(logs);
    }
  }, [logs]);

  // Filter logs
  const filteredLogs = auditLogs.filter(log => {
    const matchesFilter = filter === 'all' || log.type === filter;
    const matchesSearch = searchQuery === '' ||
      log.action.toLowerCase().includes(searchQuery.toLowerCase()) ||
      log.details?.toLowerCase().includes(searchQuery.toLowerCase());
    return matchesFilter && matchesSearch;
  });

  // Group logs by date
  const groupedLogs = filteredLogs.reduce((groups, log) => {
    const date = format(new Date(log.timestamp), 'yyyy-MM-dd');
    if (!groups[date]) groups[date] = [];
    groups[date].push(log);
    return groups;
  }, {});

  const handleExport = () => {
    const csvContent = [
      ['Timestamp', 'Type', 'Action', 'Details', 'User'].join(','),
      ...filteredLogs.map(log => [
        log.timestamp,
        log.type,
        `"${log.action}"`,
        `"${log.details || ''}"`,
        log.user || 'Admin'
      ].join(','))
    ].join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `audit-log-${format(new Date(), 'yyyy-MM-dd')}.csv`;
    a.click();
    window.URL.revokeObjectURL(url);

    if (onExport) onExport(filteredLogs);
  };

  return (
    <>
      {/* Toggle Button (when closed) */}
      {!isOpen && (
        <motion.button
          initial={{ scale: 0 }}
          animate={{ scale: 1 }}
          className="audit-panel-toggle"
          onClick={() => onClose && onClose()}
          title="Open Audit Log"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
          </svg>
        </motion.button>
      )}

      {/* Panel */}
      <AnimatePresence>
        {isOpen && (
          <>
            {/* Backdrop */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 bg-black/30 z-[99]"
              onClick={onClose}
            />

            {/* Panel */}
            <motion.div
              initial={{ x: '100%' }}
              animate={{ x: 0 }}
              exit={{ x: '100%' }}
              transition={{ type: 'spring', damping: 25, stiffness: 300 }}
              className="fixed right-0 top-0 bottom-0 w-[380px] z-[100] flex flex-col"
              style={{
                background: '#FFFFFF',
                borderLeft: '1px solid #E2E8F0',
                boxShadow: '-4px 0 20px rgba(0, 0, 0, 0.08)',
              }}
            >
              {/* Header */}
              <div className="p-4 border-b border-slate-200">
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center gap-3">
                    <div
                      className="w-10 h-10 rounded-xl flex items-center justify-center"
                      style={{
                        background: 'rgba(20, 184, 166, 0.1)',
                        border: '1px solid rgba(20, 184, 166, 0.2)',
                      }}
                    >
                      <svg className="w-5 h-5 text-teal-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                      </svg>
                    </div>
                    <div>
                      <h2 className="text-lg font-bold text-slate-800">Audit Log</h2>
                      <p className="text-xs text-slate-500">{filteredLogs.length} entries</p>
                    </div>
                  </div>
                  <button
                    onClick={onClose}
                    className="w-8 h-8 rounded-lg bg-slate-100 hover:bg-slate-200 flex items-center justify-center transition-colors"
                  >
                    <svg className="w-4 h-4 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                </div>

                {/* Search */}
                <div className="relative mb-3">
                  <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                  </svg>
                  <input
                    type="text"
                    placeholder="Search logs..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="w-full pl-10 pr-4 py-2 rounded-lg bg-slate-50 border border-slate-200 text-slate-800 placeholder-slate-400 text-sm focus:outline-none focus:border-teal-500 transition-colors"
                  />
                </div>

                {/* Filter Pills */}
                <div className="flex flex-wrap gap-2">
                  <button
                    onClick={() => setFilter('all')}
                    className={`px-3 py-1 rounded-full text-xs font-medium transition-colors ${
                      filter === 'all'
                        ? 'bg-teal-500/10 text-teal-600 border border-teal-500/30'
                        : 'bg-slate-100 text-slate-500 hover:bg-slate-200'
                    }`}
                  >
                    All
                  </button>
                  {Object.entries(actionTypes).slice(0, 5).map(([key, config]) => (
                    <button
                      key={key}
                      onClick={() => setFilter(key)}
                      className={`px-3 py-1 rounded-full text-xs font-medium transition-colors ${
                        filter === key
                          ? 'text-slate-800 border'
                          : 'bg-slate-100 text-slate-500 hover:bg-slate-200'
                      }`}
                      style={filter === key ? {
                        backgroundColor: `${config.color}20`,
                        borderColor: `${config.color}50`,
                        color: config.color,
                      } : {}}
                    >
                      {config.icon} {config.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Log List */}
              <div className="flex-1 overflow-y-auto p-4">
                {Object.entries(groupedLogs).map(([date, logs]) => (
                  <div key={date} className="mb-6">
                    <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-3">
                      {format(new Date(date), 'EEEE, MMM d, yyyy')}
                    </p>
                    <div className="space-y-2">
                      {logs.map((log, index) => {
                        const config = actionTypes[log.type] || { icon: '📋', color: '#64748b', label: 'Action' };
                        return (
                          <motion.div
                            key={log.id || index}
                            initial={{ opacity: 0, x: 20 }}
                            animate={{ opacity: 1, x: 0 }}
                            transition={{ delay: index * 0.05 }}
                            className="p-3 rounded-xl transition-colors hover:bg-slate-50"
                            style={{
                              background: '#F8FAFC',
                              border: '1px solid #E2E8F0',
                            }}
                          >
                            <div className="flex items-start gap-3">
                              <span
                                className="w-8 h-8 rounded-lg flex items-center justify-center text-sm flex-shrink-0"
                                style={{
                                  backgroundColor: `${config.color}20`,
                                  border: `1px solid ${config.color}30`,
                                }}
                              >
                                {config.icon}
                              </span>
                              <div className="flex-1 min-w-0">
                                <p className="text-sm font-medium text-slate-800 truncate">{log.action}</p>
                                {log.details && (
                                  <p className="text-xs text-slate-500 mt-0.5 truncate">{log.details}</p>
                                )}
                                <p className="text-[10px] text-slate-600 mt-1">
                                  {format(new Date(log.timestamp), 'h:mm a')}
                                </p>
                              </div>
                            </div>
                          </motion.div>
                        );
                      })}
                    </div>
                  </div>
                ))}

                {filteredLogs.length === 0 && (
                  <div className="text-center py-12">
                    <div className="w-16 h-16 mx-auto mb-4 rounded-2xl bg-slate-100 flex items-center justify-center">
                      <svg className="w-8 h-8 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                      </svg>
                    </div>
                    <p className="text-slate-500 text-sm">No audit logs found</p>
                    <p className="text-slate-600 text-xs mt-1">Try adjusting your filters</p>
                  </div>
                )}
              </div>

              {/* Footer */}
              <div className="p-4 border-t border-slate-200">
                <button
                  onClick={handleExport}
                  className="w-full flex items-center justify-center gap-2 px-4 py-3 rounded-xl font-semibold text-sm transition-all hover:scale-[1.02]"
                  style={{
                    background: 'rgba(20, 184, 166, 0.15)',
                    border: '1px solid rgba(20, 184, 166, 0.3)',
                    color: '#14b8a6',
                  }}
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                  </svg>
                  Export Audit Trail (CSV)
                </button>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </>
  );
}

// Generate mock audit logs for demonstration
function generateMockLogs() {
  const actions = [
    { type: 'login', action: 'Admin logged in', details: 'IP: 192.168.1.1' },
    { type: 'export', action: 'Exported Investor Deck PDF', details: 'Q1 2026 Report' },
    { type: 'deal_closed', action: 'Closed deal with Normah Hospital', details: 'MRR: RM 10,000' },
    { type: 'invoice_sent', action: 'Invoice sent to Sarawak General', details: 'Invoice #INV-2026-001' },
    { type: 'node_action', action: 'Kuching node restarted', details: 'Scheduled maintenance' },
    { type: 'automation', action: 'AI Assistant enabled', details: 'Lead scoring active' },
    { type: 'settings', action: 'Updated notification preferences', details: 'Email alerts enabled' },
    { type: 'alert', action: 'Revenue target 80% achieved', details: 'RM 400,000 / RM 500,000' },
  ];

  const logs = [];
  const now = new Date();

  for (let i = 0; i < 20; i++) {
    const action = actions[Math.floor(Math.random() * actions.length)];
    const hoursAgo = Math.floor(Math.random() * 72);
    const timestamp = new Date(now.getTime() - hoursAgo * 60 * 60 * 1000);

    logs.push({
      id: `log-${i}`,
      ...action,
      timestamp: timestamp.toISOString(),
      user: 'Super Admin',
    });
  }

  return logs.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
}
