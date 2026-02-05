import { useState } from 'react';
import { motion } from 'framer-motion';

/**
 * NodeStatusPanel - Blockchain node health display
 * Shows all Sarawak nodes with status, latency, and quick actions
 */

const theme = {
  success: '#10b981',
  teal: '#14b8a6',
  warning: '#f59e0b',
  danger: '#ef4444',
  textPrimary: '#1E293B',
  textSecondary: '#64748B',
  textMuted: '#94A3B8',
  border: '#E2E8F0',
};

// Default node data
const defaultNodes = [
  { id: 1, city: 'Kuching', status: 'online', latency: 12, blocks: 15847, peers: 8 },
  { id: 2, city: 'Miri', status: 'online', latency: 24, blocks: 15847, peers: 6 },
  { id: 3, city: 'Sibu', status: 'online', latency: 18, blocks: 15847, peers: 5 },
  { id: 4, city: 'Bintulu', status: 'online', latency: 31, blocks: 15846, peers: 4 },
  { id: 5, city: 'Kuching (Backup)', status: 'standby', latency: 15, blocks: 15847, peers: 3 },
];

// Status configurations
const statusConfig = {
  online: { color: theme.success, label: 'Online', pulse: true },
  standby: { color: theme.warning, label: 'Standby', pulse: false },
  offline: { color: theme.danger, label: 'Offline', pulse: false },
  syncing: { color: theme.teal, label: 'Syncing', pulse: true },
};

export default function NodeStatusPanel({
  nodes = defaultNodes,
  onNodeAction,
  onKillSwitch,
  className = '',
}) {
  const [expandedNode, setExpandedNode] = useState(null);

  const onlineNodes = nodes.filter(n => n.status === 'online').length;
  const avgLatency = Math.round(nodes.reduce((sum, n) => sum + n.latency, 0) / nodes.length);

  const handleNodeClick = (nodeId) => {
    setExpandedNode(expandedNode === nodeId ? null : nodeId);
  };

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
            style={{ backgroundColor: `${theme.teal}20` }}
          >
            <svg className="w-5 h-5" fill={theme.teal} viewBox="0 0 20 20">
              <path fillRule="evenodd" d="M2 5a2 2 0 012-2h12a2 2 0 012 2v10a2 2 0 01-2 2H4a2 2 0 01-2-2V5zm3.293 1.293a1 1 0 011.414 0l3 3a1 1 0 010 1.414l-3 3a1 1 0 01-1.414-1.414L7.586 10 5.293 7.707a1 1 0 010-1.414zM11 12a1 1 0 100 2h3a1 1 0 100-2h-3z" clipRule="evenodd" />
            </svg>
          </div>
          <div>
            <h3 className="text-lg font-bold" style={{ color: theme.textPrimary }}>
              Blockchain Nodes
            </h3>
            <p className="text-xs" style={{ color: theme.textMuted }}>
              {onlineNodes}/{nodes.length} active • {avgLatency}ms avg latency
            </p>
          </div>
        </div>

        {/* Kill Switch Button */}
        {onKillSwitch && (
          <button
            onClick={onKillSwitch}
            className="px-4 py-2 rounded-lg text-sm font-semibold transition-all hover:scale-105"
            style={{
              backgroundColor: `${theme.danger}20`,
              border: `1px solid ${theme.danger}40`,
              color: theme.danger,
            }}
          >
            <span className="flex items-center gap-2">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636" />
              </svg>
              Kill Switch
            </span>
          </button>
        )}
      </div>

      {/* Node List */}
      <div className="space-y-3">
        {nodes.map((node, index) => {
          const config = statusConfig[node.status] || statusConfig.offline;
          const isExpanded = expandedNode === node.id;

          return (
            <motion.div
              key={node.id}
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: index * 0.05 }}
              onClick={() => handleNodeClick(node.id)}
              className="cursor-pointer"
            >
              <div
                className="p-4 rounded-xl transition-all hover:bg-slate-50"
                style={{
                  background: '#F8FAFC',
                  border: `1px solid ${isExpanded ? theme.teal : '#E2E8F0'}`,
                }}
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    {/* Status Indicator */}
                    <div className="relative">
                      <span
                        className="w-3 h-3 rounded-full block"
                        style={{ backgroundColor: config.color }}
                      />
                      {config.pulse && (
                        <span
                          className="absolute inset-0 w-3 h-3 rounded-full animate-ping"
                          style={{ backgroundColor: config.color, opacity: 0.4 }}
                        />
                      )}
                    </div>

                    {/* Node Info */}
                    <div>
                      <p className="font-semibold" style={{ color: theme.textPrimary }}>
                        {node.city}
                      </p>
                      <p className="text-xs" style={{ color: theme.textMuted }}>
                        Block #{node.blocks.toLocaleString()} • {node.peers} peers
                      </p>
                    </div>
                  </div>

                  {/* Latency & Status */}
                  <div className="flex items-center gap-4">
                    <div className="text-right">
                      <p
                        className="text-sm font-bold"
                        style={{
                          color: node.latency < 20 ? theme.success :
                                 node.latency < 30 ? theme.warning : theme.danger
                        }}
                      >
                        {node.latency}ms
                      </p>
                      <p className="text-xs" style={{ color: theme.textMuted }}>latency</p>
                    </div>

                    <span
                      className="px-3 py-1 rounded-full text-xs font-semibold"
                      style={{
                        backgroundColor: `${config.color}20`,
                        color: config.color,
                      }}
                    >
                      {config.label}
                    </span>

                    {/* Expand Arrow */}
                    <svg
                      className={`w-4 h-4 transition-transform ${isExpanded ? 'rotate-180' : ''}`}
                      fill="none"
                      stroke={theme.textMuted}
                      viewBox="0 0 24 24"
                    >
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                    </svg>
                  </div>
                </div>

                {/* Expanded Actions */}
                {isExpanded && (
                  <motion.div
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: 'auto' }}
                    exit={{ opacity: 0, height: 0 }}
                    className="mt-4 pt-4 flex gap-3"
                    style={{ borderTop: `1px solid ${theme.border}` }}
                  >
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        onNodeAction?.('restart', node);
                      }}
                      className="flex-1 py-2 rounded-lg text-sm font-medium transition-all hover:scale-105"
                      style={{
                        backgroundColor: `${theme.teal}20`,
                        border: `1px solid ${theme.teal}40`,
                        color: theme.teal,
                      }}
                    >
                      Restart Node
                    </button>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        onNodeAction?.('halt', node);
                      }}
                      className="flex-1 py-2 rounded-lg text-sm font-medium transition-all hover:scale-105"
                      style={{
                        backgroundColor: `${theme.warning}20`,
                        border: `1px solid ${theme.warning}40`,
                        color: theme.warning,
                      }}
                    >
                      Halt Node
                    </button>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        onNodeAction?.('logs', node);
                      }}
                      className="flex-1 py-2 rounded-lg text-sm font-medium transition-all hover:scale-105"
                      style={{
                        backgroundColor: '#F1F5F9',
                        border: '1px solid #E2E8F0',
                        color: theme.textSecondary,
                      }}
                    >
                      View Logs
                    </button>
                  </motion.div>
                )}
              </div>
            </motion.div>
          );
        })}
      </div>

      {/* Network Stats Footer */}
      <div
        className="mt-6 pt-4 grid grid-cols-3 gap-4 text-center"
        style={{ borderTop: `1px solid ${theme.border}` }}
      >
        <div>
          <p className="text-xl font-bold" style={{ color: theme.success }}>
            99.97%
          </p>
          <p className="text-xs" style={{ color: theme.textMuted }}>Uptime (30d)</p>
        </div>
        <div>
          <p className="text-xl font-bold" style={{ color: theme.teal }}>
            {nodes[0]?.blocks?.toLocaleString() || '0'}
          </p>
          <p className="text-xs" style={{ color: theme.textMuted }}>Total Blocks</p>
        </div>
        <div>
          <p className="text-xl font-bold" style={{ color: theme.warning }}>
            {nodes.reduce((sum, n) => sum + n.peers, 0)}
          </p>
          <p className="text-xs" style={{ color: theme.textMuted }}>Total Peers</p>
        </div>
      </div>
    </motion.div>
  );
}
