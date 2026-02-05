import { useState, useEffect } from 'react';
import { useRevenueAlert } from '../context/RevenueAlertContext';

/**
 * Revenue Alert Toast Component
 * Shows animated "Cha-Ching" notification when payments are received
 */
export default function RevenueAlertToast() {
  const { pendingAlerts, dismissAlert, isSoundEnabled, toggleSound } = useRevenueAlert();
  const [displayAlerts, setDisplayAlerts] = useState([]);

  useEffect(() => {
    // Listen for revenue alerts
    const handleAlert = (event) => {
      const alert = event.detail;
      setDisplayAlerts(prev => [alert, ...prev].slice(0, 5));

      // Auto-dismiss after 8 seconds
      setTimeout(() => {
        setDisplayAlerts(prev => prev.filter(a => a.id !== alert.id));
      }, 8000);
    };

    window.addEventListener('medchain-revenue-alert', handleAlert);
    return () => window.removeEventListener('medchain-revenue-alert', handleAlert);
  }, []);

  const handleDismiss = (alertId) => {
    setDisplayAlerts(prev => prev.filter(a => a.id !== alertId));
    dismissAlert(alertId);
  };

  if (displayAlerts.length === 0) return null;

  return (
    <div className="fixed top-4 right-4 z-[100] space-y-3 max-w-md">
      {displayAlerts.map((alert, index) => (
        <div
          key={alert.id}
          className="animate-revenue-slide-in"
          style={{ animationDelay: `${index * 100}ms` }}
        >
          <div className="relative overflow-hidden bg-gradient-to-r from-emerald-600 via-emerald-500 to-green-500 rounded-2xl shadow-2xl shadow-emerald-500/30">
            {/* Animated shine effect */}
            <div
              className="absolute inset-0 bg-gradient-to-r from-transparent via-white/30 to-transparent"
              style={{
                animation: 'revenue-shine 1.5s ease-in-out',
              }}
            />

            {/* Coin burst effect */}
            <div className="absolute -top-2 -right-2">
              <div className="relative">
                {[...Array(6)].map((_, i) => (
                  <div
                    key={i}
                    className="absolute w-3 h-3 bg-yellow-400 rounded-full animate-coin-burst"
                    style={{
                      animationDelay: `${i * 100}ms`,
                      transform: `rotate(${i * 60}deg) translateY(-20px)`,
                    }}
                  />
                ))}
              </div>
            </div>

            <div className="relative p-5">
              {/* Header */}
              <div className="flex items-start justify-between gap-4">
                <div className="flex items-center gap-3">
                  {/* Money icon with pulse */}
                  <div className="relative">
                    <div className="w-14 h-14 bg-white/20 rounded-2xl flex items-center justify-center animate-bounce-subtle">
                      <span className="text-3xl">💰</span>
                    </div>
                    <div className="absolute -top-1 -right-1 w-6 h-6 bg-yellow-400 rounded-full flex items-center justify-center animate-ping-slow">
                      <svg className="w-4 h-4 text-yellow-800" fill="currentColor" viewBox="0 0 20 20">
                        <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                      </svg>
                    </div>
                  </div>

                  <div>
                    <p className="text-emerald-100 text-xs font-semibold uppercase tracking-wider mb-1">
                      Payment Received!
                    </p>
                    <p className="text-white font-black text-2xl tracking-tight">
                      RM {alert.amount.toLocaleString()}
                    </p>
                  </div>
                </div>

                <button
                  onClick={() => handleDismiss(alert.id)}
                  className="text-white/60 hover:text-white transition-colors p-1"
                >
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>

              {/* Details */}
              <div className="mt-4 bg-white/10 rounded-xl p-3">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-white/20 rounded-lg flex items-center justify-center">
                    <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
                    </svg>
                  </div>
                  <div className="flex-1">
                    <p className="text-white font-bold text-sm">{alert.hospitalName}</p>
                    <p className="text-emerald-200 text-xs">
                      {alert.facilityType === 'hospital' ? 'Hospital' : 'Clinic'} Node Activated
                    </p>
                  </div>
                  <div className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-400/30 rounded-lg">
                    <span className="w-2 h-2 bg-emerald-300 rounded-full animate-pulse"></span>
                    <span className="text-emerald-100 text-xs font-bold">LIVE</span>
                  </div>
                </div>
              </div>

              {/* Footer */}
              <div className="flex items-center justify-between mt-3 pt-3 border-t border-white/20">
                <div className="flex items-center gap-2 text-emerald-200 text-xs">
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  <span>Just now</span>
                </div>
                <div className="flex items-center gap-1 text-white font-bold text-sm">
                  <span>+</span>
                  <span>RM {(alert.facilityType === 'hospital' ? 10000 : 2000).toLocaleString()}</span>
                  <span className="text-emerald-200 font-normal">/mo MRR</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      ))}

      {/* CSS Animations */}
      <style>{`
        @keyframes revenue-slide-in {
          0% {
            transform: translateX(120%) scale(0.8);
            opacity: 0;
          }
          50% {
            transform: translateX(-10%) scale(1.05);
          }
          100% {
            transform: translateX(0) scale(1);
            opacity: 1;
          }
        }

        @keyframes revenue-shine {
          0% {
            transform: translateX(-100%);
          }
          100% {
            transform: translateX(100%);
          }
        }

        @keyframes coin-burst {
          0% {
            opacity: 1;
            transform: scale(1) translateY(0);
          }
          100% {
            opacity: 0;
            transform: scale(0) translateY(-30px);
          }
        }

        @keyframes bounce-subtle {
          0%, 100% {
            transform: translateY(0);
          }
          50% {
            transform: translateY(-5px);
          }
        }

        @keyframes ping-slow {
          0% {
            transform: scale(1);
            opacity: 1;
          }
          75%, 100% {
            transform: scale(1.5);
            opacity: 0;
          }
        }

        .animate-revenue-slide-in {
          animation: revenue-slide-in 0.6s cubic-bezier(0.34, 1.56, 0.64, 1) forwards;
        }

        .animate-coin-burst {
          animation: coin-burst 0.8s ease-out forwards;
        }

        .animate-bounce-subtle {
          animation: bounce-subtle 2s ease-in-out infinite;
        }

        .animate-ping-slow {
          animation: ping-slow 1.5s cubic-bezier(0, 0, 0.2, 1) infinite;
        }
      `}</style>
    </div>
  );
}

/**
 * Mini Revenue Counter for Dashboard Header
 */
export function MiniRevenueCounter() {
  const { revenueData, getMRRProgress } = useRevenueAlert();
  const progress = getMRRProgress();

  return (
    <div className="flex items-center gap-4 px-4 py-2 bg-gradient-to-r from-emerald-500/20 to-green-500/20 border border-emerald-500/30 rounded-xl">
      <div className="flex items-center gap-2">
        <span className="text-2xl">💰</span>
        <div>
          <p className="text-emerald-400 text-xs font-semibold uppercase tracking-wider">Live MRR</p>
          <p className="text-slate-800 font-black text-lg">
            RM {revenueData.mrr.toLocaleString()}
          </p>
        </div>
      </div>

      <div className="h-10 w-px bg-emerald-500/30"></div>

      <div>
        <p className="text-slate-400 text-xs">Goal: RM {progress.goal.toLocaleString()}</p>
        <div className="w-24 h-2 bg-slate-200 rounded-full mt-1 overflow-hidden">
          <div
            className="h-full bg-gradient-to-r from-emerald-500 to-green-400 rounded-full transition-all duration-500"
            style={{ width: `${progress.percentage}%` }}
          />
        </div>
      </div>
    </div>
  );
}

/**
 * Sound Toggle Button
 */
export function SoundToggleButton() {
  const { isSoundEnabled, toggleSound, playChachingSound } = useRevenueAlert();

  return (
    <button
      onClick={() => {
        toggleSound();
        if (!isSoundEnabled) {
          // Play sound when enabling to test
          setTimeout(playChachingSound, 100);
        }
      }}
      className={`p-2 rounded-lg transition-colors ${
        isSoundEnabled
          ? 'bg-emerald-500/20 text-emerald-400 hover:bg-emerald-500/30'
          : 'bg-slate-100 text-slate-400 hover:bg-slate-200'
      }`}
      title={isSoundEnabled ? 'Sound On' : 'Sound Off'}
    >
      {isSoundEnabled ? (
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.536 8.464a5 5 0 010 7.072m2.828-9.9a9 9 0 010 12.728M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15z" />
        </svg>
      ) : (
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15z" />
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2" />
        </svg>
      )}
    </button>
  );
}

/**
 * Test Payment Button (for demo purposes)
 */
export function TestPaymentButton() {
  const { simulatePayment } = useRevenueAlert();
  const [isAnimating, setIsAnimating] = useState(false);

  const handleTest = (type) => {
    setIsAnimating(true);
    simulatePayment(type);
    setTimeout(() => setIsAnimating(false), 1000);
  };

  return (
    <div className="flex items-center gap-2">
      <button
        onClick={() => handleTest('hospital')}
        disabled={isAnimating}
        className={`px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white text-sm font-bold rounded-lg transition-all disabled:opacity-50 ${
          isAnimating ? 'scale-95' : ''
        }`}
      >
        Test RM 10K Payment
      </button>
      <button
        onClick={() => handleTest('clinic')}
        disabled={isAnimating}
        className={`px-4 py-2 bg-cyan-600 hover:bg-cyan-500 text-white text-sm font-bold rounded-lg transition-all disabled:opacity-50 ${
          isAnimating ? 'scale-95' : ''
        }`}
      >
        Test RM 2K Payment
      </button>
    </div>
  );
}
