import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { getTotalRecordStats } from '../utils/contract';

// System components to monitor
const SYSTEM_COMPONENTS = [
  {
    id: 'blockchain',
    name: 'Blockchain Nodes',
    description: 'Ethereum-based medical record storage',
    icon: (
      <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19.428 15.428a2 2 0 00-1.022-.547l-2.387-.477a6 6 0 00-3.86.517l-.318.158a6 6 0 01-3.86.517L6.05 15.21a2 2 0 00-1.806.547M8 4h8l-1 1v5.172a2 2 0 00.586 1.414l5 5c1.26 1.26.367 3.414-1.415 3.414H4.828c-1.782 0-2.674-2.154-1.414-3.414l5-5A2 2 0 009 10.172V5L8 4z" />
      </svg>
    ),
  },
  {
    id: 'ipfs',
    name: 'IPFS Storage',
    description: 'Decentralized file storage network',
    icon: (
      <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 7v10c0 2.21 3.582 4 8 4s8-1.79 8-4V7M4 7c0 2.21 3.582 4 8 4s8-1.79 8-4M4 7c0-2.21 3.582-4 8-4s8 1.79 8 4m0 5c0 2.21-3.582 4-8 4s-8-1.79-8-4" />
      </svg>
    ),
  },
  {
    id: 'backend',
    name: 'API Services',
    description: 'Backend encryption and routing',
    icon: (
      <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 12h14M5 12a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v4a2 2 0 01-2 2M5 12a2 2 0 00-2 2v4a2 2 0 002 2h14a2 2 0 002-2v-4a2 2 0 00-2-2m-2-4h.01M17 16h.01" />
      </svg>
    ),
  },
  {
    id: 'verification',
    name: 'Verification Service',
    description: 'MC verification and QR validation',
    icon: (
      <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
      </svg>
    ),
  },
];

// Sarawak node locations
const NODE_LOCATIONS = [
  { city: 'Kuching', latency: '12ms', status: 'operational' },
  { city: 'Miri', latency: '18ms', status: 'operational' },
  { city: 'Sibu', latency: '15ms', status: 'operational' },
  { city: 'Bintulu', latency: '16ms', status: 'operational' },
];

// Mock incident history
const RECENT_INCIDENTS = [
  {
    date: '2026-01-15',
    title: 'Scheduled Maintenance Completed',
    description: 'Routine system updates applied successfully.',
    status: 'resolved',
    duration: '2 hours',
  },
  {
    date: '2026-01-08',
    title: 'IPFS Gateway Optimization',
    description: 'Improved file retrieval speeds across all nodes.',
    status: 'resolved',
    duration: '45 minutes',
  },
];

export default function SystemStatus() {
  const [systemStatus, setSystemStatus] = useState({});
  const [loading, setLoading] = useState(true);
  const [lastChecked, setLastChecked] = useState(new Date());
  const [blockchainStats, setBlockchainStats] = useState(null);
  const [maintenanceSchedule, setMaintenanceSchedule] = useState(null);

  // Load maintenance schedule
  useEffect(() => {
    const stored = localStorage.getItem('medchain_maintenance');
    if (stored) {
      try {
        const data = JSON.parse(stored);
        if (data.status === 'scheduled') {
          setMaintenanceSchedule(data);
        }
      } catch (e) {
        console.error('Error loading maintenance schedule:', e);
      }
    }
  }, []);

  // Check system health
  useEffect(() => {
    const checkHealth = async () => {
      setLoading(true);

      // Simulate health checks with realistic delays
      const results = {};

      // Check each component
      for (const component of SYSTEM_COMPONENTS) {
        try {
          // Simulate API call delay
          await new Promise(resolve => setTimeout(resolve, 100 + Math.random() * 200));

          // For demo, all systems operational
          // In production, this would make actual health check calls
          results[component.id] = {
            status: 'operational',
            responseTime: Math.floor(50 + Math.random() * 100),
            uptime: (99.9 + Math.random() * 0.09).toFixed(2),
          };
        } catch (error) {
          results[component.id] = {
            status: 'degraded',
            error: error.message,
          };
        }
      }

      setSystemStatus(results);
      setLastChecked(new Date());
      setLoading(false);

      // Try to get blockchain stats
      try {
        const stats = await getTotalRecordStats();
        setBlockchainStats(stats);
      } catch (e) {
        console.log('Could not fetch blockchain stats');
      }
    };

    checkHealth();

    // Refresh every 30 seconds
    const interval = setInterval(checkHealth, 30000);
    return () => clearInterval(interval);
  }, []);

  const getOverallStatus = () => {
    const statuses = Object.values(systemStatus);
    if (statuses.length === 0) return 'checking';
    if (statuses.every(s => s.status === 'operational')) return 'operational';
    if (statuses.some(s => s.status === 'outage')) return 'outage';
    if (statuses.some(s => s.status === 'degraded')) return 'degraded';
    return 'operational';
  };

  const getStatusColor = (status) => {
    switch (status) {
      case 'operational': return 'emerald';
      case 'degraded': return 'amber';
      case 'outage': return 'red';
      case 'maintenance': return 'blue';
      default: return 'slate';
    }
  };

  const getStatusText = (status) => {
    switch (status) {
      case 'operational': return 'Operational';
      case 'degraded': return 'Degraded Performance';
      case 'outage': return 'Service Outage';
      case 'maintenance': return 'Under Maintenance';
      default: return 'Checking...';
    }
  };

  const overallStatus = getOverallStatus();
  const statusColor = getStatusColor(overallStatus);

  return (
    <div className="min-h-screen bg-white" style={{ fontFamily: "'Inter', system-ui, sans-serif" }}>
      {/* Header */}
      <header className="border-b border-slate-200">
        <div className="max-w-5xl mx-auto px-6 py-6">
          <div className="flex items-center justify-between">
            <Link to="/" className="flex items-center gap-3">
              <div className="w-10 h-10 bg-gradient-to-br from-red-500 to-red-600 rounded-xl flex items-center justify-center">
                <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
                </svg>
              </div>
              <div>
                <span className="block text-lg font-bold text-slate-800">Sarawak MedChain</span>
                <span className="block text-xs text-amber-400 font-semibold">System Status</span>
              </div>
            </Link>

            <div className="flex items-center gap-4">
              <span className="text-slate-400 text-sm">
                Last checked: {lastChecked.toLocaleTimeString()}
              </span>
              <Link
                to="/"
                className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 text-sm font-medium rounded-lg transition-colors"
              >
                Back to Home
              </Link>
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-6 py-12">
        {/* Overall Status Banner */}
        <div className={`rounded-2xl p-8 mb-12 border ${
          statusColor === 'emerald' ? 'bg-emerald-500/10 border-emerald-500/30' :
          statusColor === 'amber' ? 'bg-amber-500/10 border-amber-500/30' :
          statusColor === 'red' ? 'bg-red-500/10 border-red-500/30' :
          'bg-blue-500/10 border-blue-500/30'
        }`}>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-6">
              {/* Large status indicator */}
              <div className="relative">
                <div className={`w-20 h-20 rounded-2xl flex items-center justify-center ${
                  statusColor === 'emerald' ? 'bg-emerald-500/20' :
                  statusColor === 'amber' ? 'bg-amber-500/20' :
                  statusColor === 'red' ? 'bg-red-500/20' :
                  'bg-blue-500/20'
                }`}>
                  {loading ? (
                    <div className="w-10 h-10 border-4 border-white/20 border-t-white rounded-full animate-spin" />
                  ) : overallStatus === 'operational' ? (
                    <svg className={`w-10 h-10 text-${statusColor}-400`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                    </svg>
                  ) : (
                    <svg className={`w-10 h-10 text-${statusColor}-400`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                    </svg>
                  )}
                </div>
                {/* Pulsing indicator */}
                {overallStatus === 'operational' && (
                  <div className="absolute -top-1 -right-1">
                    <span className="relative flex h-4 w-4">
                      <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                      <span className="relative inline-flex rounded-full h-4 w-4 bg-emerald-500"></span>
                    </span>
                  </div>
                )}
              </div>

              <div>
                <h1 className={`text-3xl font-bold mb-2 ${
                  statusColor === 'emerald' ? 'text-emerald-400' :
                  statusColor === 'amber' ? 'text-amber-400' :
                  statusColor === 'red' ? 'text-red-400' :
                  'text-blue-400'
                }`}>
                  {loading ? 'Checking Systems...' : getStatusText(overallStatus)}
                </h1>
                <p className="text-slate-400">
                  {overallStatus === 'operational'
                    ? 'All systems are running smoothly across Sarawak.'
                    : 'Some systems may be experiencing issues.'}
                </p>
              </div>
            </div>

            {/* Blockchain stats */}
            {blockchainStats && (
              <div className="text-right">
                <p className="text-slate-400 text-sm mb-1">Total Records Secured</p>
                <p className="text-3xl font-bold text-slate-800">{blockchainStats.totalRecords.toLocaleString()}</p>
              </div>
            )}
          </div>
        </div>

        {/* Scheduled Maintenance Notice */}
        {maintenanceSchedule && (
          <div className="bg-amber-500/10 border border-amber-500/30 rounded-xl p-6 mb-8">
            <div className="flex items-start gap-4">
              <div className="w-12 h-12 bg-amber-500/20 rounded-xl flex items-center justify-center flex-shrink-0">
                <svg className="w-6 h-6 text-amber-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </div>
              <div>
                <h3 className="text-amber-400 font-bold text-lg mb-1">Upcoming Maintenance</h3>
                <p className="text-slate-600 mb-2">{maintenanceSchedule.description}</p>
                <p className="text-slate-400 text-sm">
                  Scheduled for {new Date(maintenanceSchedule.scheduledStart).toLocaleDateString('en-MY', {
                    weekday: 'long',
                    day: 'numeric',
                    month: 'long',
                    year: 'numeric',
                  })} from {new Date(maintenanceSchedule.scheduledStart).toLocaleTimeString('en-MY', {
                    hour: '2-digit',
                    minute: '2-digit',
                  })} to {new Date(maintenanceSchedule.scheduledEnd).toLocaleTimeString('en-MY', {
                    hour: '2-digit',
                    minute: '2-digit',
                  })} (Sarawak Time)
                </p>
              </div>
            </div>
          </div>
        )}

        {/* System Components */}
        <h2 className="text-xl font-bold text-slate-800 mb-6">System Components</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-12">
          {SYSTEM_COMPONENTS.map((component) => {
            const status = systemStatus[component.id] || { status: 'checking' };
            const color = getStatusColor(status.status);

            return (
              <div
                key={component.id}
                className={`bg-slate-50 border rounded-xl p-6 transition-all hover:bg-slate-100 ${
                  color === 'emerald' ? 'border-emerald-500/30' :
                  color === 'amber' ? 'border-amber-500/30' :
                  color === 'red' ? 'border-red-500/30' :
                  'border-slate-200'
                }`}
              >
                <div className="flex items-start justify-between">
                  <div className="flex items-start gap-4">
                    <div className={`w-12 h-12 rounded-xl flex items-center justify-center ${
                      color === 'emerald' ? 'bg-emerald-500/20 text-emerald-400' :
                      color === 'amber' ? 'bg-amber-500/20 text-amber-400' :
                      color === 'red' ? 'bg-red-500/20 text-red-400' :
                      'bg-slate-500/20 text-slate-400'
                    }`}>
                      {component.icon}
                    </div>
                    <div>
                      <h3 className="text-slate-800 font-semibold mb-1">{component.name}</h3>
                      <p className="text-slate-400 text-sm">{component.description}</p>
                    </div>
                  </div>

                  {/* Status badge */}
                  <div className={`flex items-center gap-2 px-3 py-1.5 rounded-full ${
                    color === 'emerald' ? 'bg-emerald-500/20' :
                    color === 'amber' ? 'bg-amber-500/20' :
                    color === 'red' ? 'bg-red-500/20' :
                    'bg-slate-500/20'
                  }`}>
                    <span className={`w-2 h-2 rounded-full ${
                      color === 'emerald' ? 'bg-emerald-400' :
                      color === 'amber' ? 'bg-amber-400' :
                      color === 'red' ? 'bg-red-400' :
                      'bg-slate-400'
                    } ${status.status === 'operational' ? 'animate-pulse' : ''}`} />
                    <span className={`text-xs font-semibold ${
                      color === 'emerald' ? 'text-emerald-400' :
                      color === 'amber' ? 'text-amber-400' :
                      color === 'red' ? 'text-red-400' :
                      'text-slate-400'
                    }`}>
                      {getStatusText(status.status)}
                    </span>
                  </div>
                </div>

                {/* Metrics */}
                {status.responseTime && (
                  <div className="flex gap-6 mt-4 pt-4 border-t border-slate-200">
                    <div>
                      <p className="text-slate-500 text-xs uppercase tracking-wider mb-1">Response Time</p>
                      <p className="text-slate-800 font-semibold">{status.responseTime}ms</p>
                    </div>
                    <div>
                      <p className="text-slate-500 text-xs uppercase tracking-wider mb-1">Uptime (30d)</p>
                      <p className="text-emerald-400 font-semibold">{status.uptime}%</p>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* Node Locations */}
        <h2 className="text-xl font-bold text-slate-800 mb-6">Sarawak Node Network</h2>
        <div className="bg-slate-50 border border-slate-200 rounded-xl p-6 mb-12">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {NODE_LOCATIONS.map((node) => (
              <div key={node.city} className="text-center p-4 bg-slate-50 rounded-xl">
                <div className="w-10 h-10 bg-emerald-500/20 rounded-full flex items-center justify-center mx-auto mb-3">
                  <span className="w-3 h-3 bg-emerald-400 rounded-full animate-pulse" />
                </div>
                <h3 className="text-slate-800 font-semibold mb-1">{node.city}</h3>
                <p className="text-emerald-400 text-sm font-medium">{node.latency}</p>
                <p className="text-slate-500 text-xs mt-1">Operational</p>
              </div>
            ))}
          </div>
        </div>

        {/* Recent Incidents */}
        <h2 className="text-xl font-bold text-slate-800 mb-6">Recent Incidents</h2>
        <div className="space-y-4">
          {RECENT_INCIDENTS.map((incident, index) => (
            <div key={index} className="bg-slate-50 border border-slate-200 rounded-xl p-6">
              <div className="flex items-start justify-between mb-2">
                <div>
                  <h3 className="text-slate-800 font-semibold">{incident.title}</h3>
                  <p className="text-slate-400 text-sm">{incident.description}</p>
                </div>
                <span className="px-3 py-1 bg-emerald-500/20 text-emerald-400 text-xs font-semibold rounded-full">
                  {incident.status}
                </span>
              </div>
              <div className="flex items-center gap-4 text-sm text-slate-500">
                <span>{incident.date}</span>
                <span>Duration: {incident.duration}</span>
              </div>
            </div>
          ))}
        </div>

        {/* Footer */}
        <div className="mt-12 pt-8 border-t border-slate-200 text-center">
          <p className="text-slate-500 text-sm">
            This page auto-refreshes every 30 seconds. For urgent issues, contact{' '}
            <a href="mailto:support@medchain.sarawak.gov.my" className="text-emerald-400 hover:text-emerald-300">
              support@medchain.sarawak.gov.my
            </a>
          </p>
        </div>
      </main>
    </div>
  );
}
