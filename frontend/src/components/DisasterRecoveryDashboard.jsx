import { useState, useEffect } from 'react';
import { useDisasterRecovery } from '../context/DisasterRecoveryContext';

/**
 * Disaster Recovery Dashboard Component
 * Shows real-time DR status, replication, failover controls
 */
export default function DisasterRecoveryDashboard() {
  const {
    drState,
    alertHistory,
    isMonitoring,
    config,
    triggerFailover,
    triggerRecovery,
    triggerColdBackup,
    performReplication,
    calculateUptime,
  } = useDisasterRecovery();

  const [isReplicating, setIsReplicating] = useState(false);
  const [isBackingUp, setIsBackingUp] = useState(false);

  const handleManualReplication = async () => {
    setIsReplicating(true);
    await performReplication();
    setTimeout(() => setIsReplicating(false), 1000);
  };

  const handleManualBackup = async () => {
    setIsBackingUp(true);
    await triggerColdBackup();
    setTimeout(() => setIsBackingUp(false), 2000);
  };

  const uptime = calculateUptime();

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 bg-gradient-to-br from-purple-500 to-indigo-600 rounded-xl flex items-center justify-center">
            <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
            </svg>
          </div>
          <div>
            <h2 className="text-xl font-bold text-slate-800">Disaster Recovery Suite</h2>
            <p className="text-slate-500 text-sm">Cross-region replication & auto-failover</p>
          </div>
        </div>

        {/* System Status Badge */}
        <div className={`px-4 py-2 rounded-full flex items-center gap-2 ${
          drState.failoverActive
            ? 'bg-amber-500/20 border border-amber-500/50'
            : drState.primaryStatus === 'HEALTHY'
            ? 'bg-emerald-500/20 border border-emerald-500/50'
            : 'bg-red-500/20 border border-red-500/50'
        }`}>
          <span className={`w-2 h-2 rounded-full animate-pulse ${
            drState.failoverActive ? 'bg-amber-400' : drState.primaryStatus === 'HEALTHY' ? 'bg-emerald-400' : 'bg-red-400'
          }`}></span>
          <span className={`font-bold text-sm ${
            drState.failoverActive ? 'text-amber-600' : drState.primaryStatus === 'HEALTHY' ? 'text-emerald-600' : 'text-red-600'
          }`}>
            {drState.failoverActive ? 'FAILOVER ACTIVE' : drState.primaryStatus}
          </span>
        </div>
      </div>

      {/* Failover Alert Banner */}
      {drState.failoverActive && (
        <div className="bg-gradient-to-r from-amber-600/20 to-orange-600/20 border border-amber-500/50 rounded-xl p-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-amber-500/30 rounded-lg flex items-center justify-center animate-pulse">
                <span className="text-2xl">🚨</span>
              </div>
              <div>
                <p className="text-amber-700 font-bold">Failover Mode Active</p>
                <p className="text-amber-600/70 text-sm">
                  Traffic redirected to {config.backupNodes.find(n => n.id === drState.activeNode)?.region || 'backup'} node
                </p>
              </div>
            </div>
            <button
              onClick={triggerRecovery}
              className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white font-bold rounded-lg transition-colors"
            >
              Restore Primary
            </button>
          </div>
        </div>
      )}

      {/* Node Status Grid */}
      <div className="grid grid-cols-3 gap-4">
        {/* Primary Node */}
        <NodeStatusCard
          name="Primary Node"
          region="Sarawak"
          url={config.primaryNode}
          status={drState.primaryStatus}
          isActive={drState.activeNode === 'primary'}
          metrics={drState.nodeMetrics.primary}
          onFailover={() => triggerFailover('sg-backup')}
          isPrimary
        />

        {/* Backup Nodes */}
        {config.backupNodes.map(node => (
          <NodeStatusCard
            key={node.id}
            name={`Backup Node`}
            region={node.region}
            url={node.url}
            status="STANDBY"
            isActive={drState.activeNode === node.id}
            metrics={drState.nodeMetrics[node.id]}
            onActivate={() => triggerFailover(node.id)}
          />
        ))}
      </div>

      {/* Metrics Row */}
      <div className="grid grid-cols-4 gap-4">
        {/* Uptime */}
        <div className="bg-white rounded-xl p-4 border border-slate-200">
          <div className="flex items-center gap-2 mb-2">
            <svg className="w-5 h-5 text-emerald-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <span className="text-slate-500 text-sm">System Uptime</span>
          </div>
          <p className="text-2xl font-black text-slate-800">{uptime.toFixed(2)}%</p>
          <p className="text-emerald-400 text-xs mt-1">Last 30 days</p>
        </div>

        {/* Last Replication */}
        <div className="bg-white rounded-xl p-4 border border-slate-200">
          <div className="flex items-center gap-2 mb-2">
            <svg className="w-5 h-5 text-cyan-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
            <span className="text-slate-500 text-sm">Last Sync</span>
          </div>
          <p className="text-lg font-bold text-slate-800">
            {drState.lastReplication
              ? new Date(drState.lastReplication.timestamp).toLocaleTimeString()
              : 'Never'}
          </p>
          <p className="text-cyan-400 text-xs mt-1">
            {drState.lastReplication?.duration || 'Every 5 min'}
          </p>
        </div>

        {/* Cold Backup */}
        <div className="bg-white rounded-xl p-4 border border-slate-200">
          <div className="flex items-center gap-2 mb-2">
            <svg className="w-5 h-5 text-purple-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 8h14M5 8a2 2 0 110-4h14a2 2 0 110 4M5 8v10a2 2 0 002 2h10a2 2 0 002-2V8m-9 4h4" />
            </svg>
            <span className="text-slate-500 text-sm">Cold Backup</span>
          </div>
          <p className="text-lg font-bold text-slate-800">
            {drState.lastColdBackup
              ? new Date(drState.lastColdBackup.timestamp).toLocaleDateString()
              : 'Scheduled'}
          </p>
          <p className="text-purple-400 text-xs mt-1">Daily 2:00 AM</p>
        </div>

        {/* Failover Count */}
        <div className="bg-white rounded-xl p-4 border border-slate-200">
          <div className="flex items-center gap-2 mb-2">
            <svg className="w-5 h-5 text-amber-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
            <span className="text-slate-500 text-sm">Failovers</span>
          </div>
          <p className="text-2xl font-black text-slate-800">
            {drState.failoverHistory.filter(f => f.type === 'FAILOVER').length}
          </p>
          <p className="text-amber-400 text-xs mt-1">This month</p>
        </div>
      </div>

      {/* Replication Panel */}
      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
        <div className="p-4 border-b border-slate-200 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-cyan-500/20 rounded-lg flex items-center justify-center">
              <svg className="w-5 h-5 text-cyan-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
              </svg>
            </div>
            <div>
              <h3 className="text-slate-800 font-bold">Cross-Region Replication</h3>
              <p className="text-slate-500 text-sm">Sync every 5 minutes</p>
            </div>
          </div>
          <button
            onClick={handleManualReplication}
            disabled={isReplicating}
            className={`px-4 py-2 rounded-lg font-bold text-sm transition-all ${
              isReplicating
                ? 'bg-cyan-600/50 text-cyan-300 cursor-not-allowed'
                : 'bg-cyan-600 hover:bg-cyan-500 text-white'
            }`}
          >
            {isReplicating ? 'Syncing...' : 'Sync Now'}
          </button>
        </div>

        {/* Replication History */}
        <div className="max-h-48 overflow-y-auto">
          {drState.replicationHistory.slice(0, 5).map((repl, idx) => (
            <div key={repl.id} className={`p-3 flex items-center justify-between ${idx !== 0 ? 'border-t border-slate-200' : ''}`}>
              <div className="flex items-center gap-3">
                <span className="w-2 h-2 bg-emerald-400 rounded-full"></span>
                <span className="text-slate-600 text-sm">
                  {new Date(repl.timestamp).toLocaleTimeString()}
                </span>
              </div>
              <div className="flex items-center gap-4 text-sm">
                <span className="text-slate-500">{repl.bytesTransferred}</span>
                <span className="text-cyan-500">{repl.duration}</span>
                <span className="text-emerald-500">{repl.nodesSuccess}/{repl.nodesTotal} nodes</span>
              </div>
            </div>
          ))}
          {drState.replicationHistory.length === 0 && (
            <div className="p-4 text-center text-slate-500">No replication history</div>
          )}
        </div>
      </div>

      {/* Cold Storage Panel */}
      <div className="bg-white rounded-xl border border-slate-200 p-4">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-purple-500/20 rounded-lg flex items-center justify-center">
              <span className="text-xl">🗄️</span>
            </div>
            <div>
              <h3 className="text-slate-800 font-bold">'Black Box' Cold Storage</h3>
              <p className="text-slate-500 text-sm">AES-256-GCM encrypted daily snapshots</p>
            </div>
          </div>
          <button
            onClick={handleManualBackup}
            disabled={isBackingUp}
            className={`px-4 py-2 rounded-lg font-bold text-sm transition-all ${
              isBackingUp
                ? 'bg-purple-600/50 text-purple-300 cursor-not-allowed'
                : 'bg-purple-600 hover:bg-purple-500 text-white'
            }`}
          >
            {isBackingUp ? 'Backing up...' : 'Backup Now'}
          </button>
        </div>

        {drState.lastColdBackup && (
          <div className="bg-slate-50 rounded-lg p-4 grid grid-cols-4 gap-4">
            <div>
              <p className="text-slate-500 text-xs mb-1">Last Backup</p>
              <p className="text-slate-800 font-bold">{new Date(drState.lastColdBackup.timestamp).toLocaleDateString()}</p>
            </div>
            <div>
              <p className="text-slate-500 text-xs mb-1">Hospitals</p>
              <p className="text-slate-800 font-bold">{drState.lastColdBackup.hospitalCount}</p>
            </div>
            <div>
              <p className="text-slate-500 text-xs mb-1">Records</p>
              <p className="text-slate-800 font-bold">{drState.lastColdBackup.totalRecords?.toLocaleString()}</p>
            </div>
            <div>
              <p className="text-slate-500 text-xs mb-1">Size</p>
              <p className="text-slate-800 font-bold">{drState.lastColdBackup.encryptedSize}</p>
            </div>
          </div>
        )}
      </div>

      {/* Alert History */}
      <AlertHistoryPanel alerts={alertHistory} />
    </div>
  );
}

/**
 * Node Status Card Component
 */
function NodeStatusCard({ name, region, url, status, isActive, metrics, onFailover, onActivate, isPrimary }) {
  return (
    <div className={`relative bg-white rounded-xl border overflow-hidden transition-all ${
      isActive
        ? 'border-emerald-500/50 ring-2 ring-emerald-500/20'
        : 'border-slate-200 hover:border-slate-300'
    }`}>
      {/* Active indicator */}
      {isActive && (
        <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-emerald-500 to-green-400"></div>
      )}

      <div className="p-4">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${
              isPrimary ? 'bg-blue-500/20' : 'bg-slate-100'
            }`}>
              {isPrimary ? (
                <svg className="w-4 h-4 text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 12h14M5 12a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v4a2 2 0 01-2 2M5 12a2 2 0 00-2 2v4a2 2 0 002 2h14a2 2 0 002-2v-4a2 2 0 00-2-2m-2-4h.01M17 16h.01" />
                </svg>
              ) : (
                <svg className="w-4 h-4 text-slate-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 14v3m4-3v3m4-3v3M3 21h18M3 10h18M3 7l9-4 9 4M4 10h16v11H4V10z" />
                </svg>
              )}
            </div>
            <div>
              <p className="text-slate-800 font-bold text-sm">{name}</p>
              <p className="text-slate-500 text-xs">{region}</p>
            </div>
          </div>

          {/* Status badge */}
          <div className={`px-2 py-1 rounded-full text-xs font-bold ${
            isActive && status !== 'DOWN'
              ? 'bg-emerald-500/20 text-emerald-600'
              : status === 'DOWN'
              ? 'bg-red-500/20 text-red-500'
              : 'bg-slate-100 text-slate-500'
          }`}>
            {isActive ? 'ACTIVE' : status}
          </div>
        </div>

        {/* Metrics */}
        {metrics && (
          <div className="space-y-2 mb-3">
            <div className="flex justify-between text-xs">
              <span className="text-slate-500">Uptime</span>
              <span className="text-slate-800">{metrics.uptime}%</span>
            </div>
            <div className="flex justify-between text-xs">
              <span className="text-slate-500">Response</span>
              <span className="text-cyan-500">{metrics.responseTime}ms</span>
            </div>
            <div className="flex justify-between text-xs">
              <span className="text-slate-500">Req/min</span>
              <span className="text-slate-800">{metrics.requestsPerMin}</span>
            </div>
          </div>
        )}

        {/* Action button */}
        {isPrimary && !isActive ? (
          <button
            onClick={onFailover}
            className="w-full px-3 py-2 bg-amber-600/20 hover:bg-amber-600/30 text-amber-600 text-xs font-bold rounded-lg transition-colors"
          >
            Simulate Failover
          </button>
        ) : !isPrimary && !isActive ? (
          <button
            onClick={onActivate}
            className="w-full px-3 py-2 bg-slate-100 hover:bg-slate-200 text-slate-600 text-xs font-bold rounded-lg transition-colors"
          >
            Activate Node
          </button>
        ) : (
          <div className="w-full px-3 py-2 bg-emerald-500/10 text-emerald-600 text-xs font-bold rounded-lg text-center">
            Currently Active
          </div>
        )}
      </div>
    </div>
  );
}

/**
 * Alert History Panel
 */
function AlertHistoryPanel({ alerts }) {
  if (alerts.length === 0) return null;

  return (
    <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
      <div className="p-4 border-b border-slate-200">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-red-500/20 rounded-lg flex items-center justify-center">
            <svg className="w-5 h-5 text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
            </svg>
          </div>
          <div>
            <h3 className="text-slate-800 font-bold">Emergency Alert History</h3>
            <p className="text-slate-500 text-sm">SMS notifications sent to CEO</p>
          </div>
        </div>
      </div>

      <div className="max-h-48 overflow-y-auto divide-y divide-slate-200">
        {alerts.slice(0, 10).map(alert => (
          <div key={alert.id} className="p-3 flex items-start gap-3">
            <span className={`mt-1 w-2 h-2 rounded-full ${
              alert.severity === 'CRITICAL' ? 'bg-red-400' : 'bg-emerald-400'
            }`}></span>
            <div className="flex-1">
              <div className="flex items-center justify-between">
                <p className={`font-bold text-sm ${
                  alert.severity === 'CRITICAL' ? 'text-red-500' : 'text-emerald-500'
                }`}>
                  {alert.title}
                </p>
                <span className="text-slate-500 text-xs">
                  {new Date(alert.timestamp).toLocaleTimeString()}
                </span>
              </div>
              <p className="text-slate-500 text-xs mt-1">{alert.message}</p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

/**
 * DR Alert Toast Component
 */
export function DRAlertToast() {
  const [alerts, setAlerts] = useState([]);

  useEffect(() => {
    const handleAlert = (event) => {
      const alert = event.detail;
      setAlerts(prev => [{ ...alert, toastId: Date.now() }, ...prev].slice(0, 3));

      // Auto-dismiss after 10 seconds
      setTimeout(() => {
        setAlerts(prev => prev.filter(a => a.id !== alert.id));
      }, 10000);
    };

    window.addEventListener('medchain-dr-alert', handleAlert);
    return () => window.removeEventListener('medchain-dr-alert', handleAlert);
  }, []);

  if (alerts.length === 0) return null;

  return (
    <div className="fixed top-4 left-4 z-[100] space-y-3 max-w-md">
      {alerts.map((alert, index) => (
        <div
          key={alert.toastId}
          className="animate-slide-in-left"
          style={{ animationDelay: `${index * 100}ms` }}
        >
          <div className={`relative overflow-hidden rounded-2xl shadow-2xl ${
            alert.severity === 'CRITICAL'
              ? 'bg-gradient-to-r from-red-600 via-red-500 to-orange-500 shadow-red-500/30'
              : 'bg-gradient-to-r from-emerald-600 via-emerald-500 to-green-500 shadow-emerald-500/30'
          }`}>
            <div className="relative p-5">
              <div className="flex items-start gap-4">
                <div className={`w-14 h-14 rounded-2xl flex items-center justify-center ${
                  alert.severity === 'CRITICAL' ? 'bg-white/20' : 'bg-white/20'
                }`}>
                  <span className="text-3xl">
                    {alert.severity === 'CRITICAL' ? '🚨' : '✅'}
                  </span>
                </div>

                <div className="flex-1">
                  <p className="text-white/80 text-xs font-semibold uppercase tracking-wider mb-1">
                    {alert.severity === 'CRITICAL' ? 'Emergency Alert' : 'System Update'}
                  </p>
                  <p className="text-white font-black text-lg">{alert.title}</p>
                  <p className="text-white/70 text-sm mt-1">{alert.message}</p>
                </div>

                <button
                  onClick={() => setAlerts(prev => prev.filter(a => a.id !== alert.id))}
                  className="text-white/60 hover:text-white transition-colors"
                >
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>

              <div className="mt-4 flex items-center justify-between text-xs">
                <div className="flex items-center gap-2 text-white/60">
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 18h.01M8 21h8a2 2 0 002-2V5a2 2 0 00-2-2H8a2 2 0 00-2 2v14a2 2 0 002 2z" />
                  </svg>
                  <span>SMS sent to CEO</span>
                </div>
                <span className="text-white/60">Just now</span>
              </div>
            </div>
          </div>
        </div>
      ))}

      <style>{`
        @keyframes slide-in-left {
          0% {
            transform: translateX(-120%);
            opacity: 0;
          }
          100% {
            transform: translateX(0);
            opacity: 1;
          }
        }
        .animate-slide-in-left {
          animation: slide-in-left 0.5s cubic-bezier(0.34, 1.56, 0.64, 1) forwards;
        }
      `}</style>
    </div>
  );
}

/**
 * Mini DR Status Widget for Dashboard Header
 */
export function MiniDRStatus() {
  const { drState, calculateUptime } = useDisasterRecovery();

  return (
    <div className={`flex items-center gap-3 px-4 py-2 rounded-xl border ${
      drState.failoverActive
        ? 'bg-amber-500/10 border-amber-500/30'
        : 'bg-white border-slate-200'
    }`}>
      <div className={`w-3 h-3 rounded-full animate-pulse ${
        drState.failoverActive ? 'bg-amber-400' : 'bg-emerald-400'
      }`}></div>
      <div>
        <p className="text-xs text-slate-500">DR Status</p>
        <p className={`font-bold text-sm ${
          drState.failoverActive ? 'text-amber-500' : 'text-slate-800'
        }`}>
          {drState.failoverActive ? 'Failover Active' : `${calculateUptime().toFixed(2)}% Uptime`}
        </p>
      </div>
    </div>
  );
}
