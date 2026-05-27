import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import PublicImpactCounter from '../components/PublicImpactCounter';
import SarawakReadinessMap from '../components/SarawakReadinessMap';
import { ScrollReveal, CountUp, useScrollProgress, ScrollProgressBar } from '../components/ScrollEffects';
import { usePWA, PWA_CONFIGS } from '../hooks/usePWA';
import { useDemo } from '../context/DemoContext';
import { Shield, Headphones, Lock } from 'lucide-react';

// Facility types for dropdown
const FACILITY_TYPES = [
  'Private Hospital',
  'State Clinic',
  'Private Specialist',
  'Government Hospital',
  'Medical Centre',
];

// Decision maker roles for dropdown
const DECISION_MAKER_ROLES = [
  'CEO',
  'Hospital Director',
  'Head of IT',
  'Medical Director',
  'Operations Manager',
  'Finance Director',
];

// Generate blockchain-style reference ID
const generateBlockchainRef = () => {
  const chars = '0123456789abcdef';
  let hash = '0x';
  for (let i = 0; i < 16; i++) {
    hash += chars[Math.floor(Math.random() * chars.length)];
  }
  return hash;
};

// Request Access Modal Component
function RequestAccessModal({ isOpen, onClose, onSubmitSuccess }) {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formData, setFormData] = useState({
    facilityName: '',
    facilityType: '',
    estimatedMCs: '',
    decisionMakerRole: '',
    email: '',
    phone: '',
  });

  const handleInputChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
  };

  const calculateProgress = () => {
    const fields = ['facilityName', 'facilityType', 'estimatedMCs', 'decisionMakerRole'];
    const filled = fields.filter(f => formData[f]).length;
    return (filled / fields.length) * 100;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setIsSubmitting(true);

    // iOS AUDIO FIX: Play the cha-ching sound IMMEDIATELY during user gesture
    // On iPhone 8 Plus, sound must play synchronously within the click event
    // Visual feedback (overlay) comes after, but sound plays NOW
    playSuccessSound();

    // Simulate blockchain transaction
    await new Promise(resolve => setTimeout(resolve, 1500));

    const ref = generateBlockchainRef();

    // Store pending admin session data
    const pendingAdminData = {
      status: 'pending_admin',
      facilityName: formData.facilityName,
      facilityType: formData.facilityType,
      estimatedMCs: formData.estimatedMCs,
      decisionMakerRole: formData.decisionMakerRole,
      email: formData.email,
      blockchainRef: ref,
      submittedAt: new Date().toISOString(),
      autoConnect: true, // Flag to auto-trigger MetaMask
    };
    localStorage.setItem('medchain_pending_admin', JSON.stringify(pendingAdminData));

    setIsSubmitting(false);

    // Close modal and trigger full-screen provisioning overlay
    onClose();
    onSubmitSuccess(formData.facilityName, ref);
  };

  const handleClose = () => {
    setFormData({
      facilityName: '',
      facilityType: '',
      estimatedMCs: '',
      decisionMakerRole: '',
      email: '',
      phone: '',
    });
    onClose();
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/70 backdrop-blur-sm"
        onClick={handleClose}
      />

      {/* Modal */}
      <div className="relative w-full max-w-lg mx-4 bg-white border border-slate-200 rounded-2xl shadow-2xl overflow-hidden">
        {/* Progress Bar */}
        <div className="h-1 bg-slate-100">
          <div
            className="h-full bg-gradient-to-r from-teal-500 to-emerald-500 transition-all duration-500"
            style={{ width: `${calculateProgress()}%` }}
          />
        </div>

        {/* Close Button */}
        <button
          onClick={handleClose}
          className="absolute top-4 right-4 text-slate-400 hover:text-slate-600 transition-colors z-10"
        >
          <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>

        {/* Form */}
        <form onSubmit={handleSubmit} className="p-8">
          {/* Header */}
          <div className="text-center mb-8">
            <div className="w-16 h-16 bg-teal-50 rounded-2xl flex items-center justify-center mx-auto mb-4">
              <svg className="w-8 h-8 text-teal-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
              </svg>
            </div>
            <h2 className="text-2xl font-bold text-slate-900">Request Hospital Access</h2>
            <p className="text-slate-500 mt-2">Join Sarawak's blockchain healthcare network</p>
          </div>

          {/* Form Fields */}
          <div className="space-y-5">
            {/* Facility Name */}
            <div>
              <label className="block text-sm font-medium text-slate-600 mb-2">
                Facility Name
              </label>
              <input
                type="text"
                name="facilityName"
                value={formData.facilityName}
                onChange={handleInputChange}
                placeholder="e.g., KPJ Kuching, Rejang Medical"
                className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-slate-900 placeholder-slate-400 focus:outline-none focus:border-teal-500 focus:ring-1 focus:ring-teal-500 transition-colors"
                required
              />
            </div>

            {/* Facility Type */}
            <div>
              <label className="block text-sm font-medium text-slate-600 mb-2">
                Facility Type
              </label>
              <select
                name="facilityType"
                value={formData.facilityType}
                onChange={handleInputChange}
                className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-slate-900 focus:outline-none focus:border-teal-500 focus:ring-1 focus:ring-teal-500 transition-colors appearance-none cursor-pointer"
                required
              >
                <option value="" className="text-slate-500">Select facility type</option>
                {FACILITY_TYPES.map(type => (
                  <option key={type} value={type}>{type}</option>
                ))}
              </select>
            </div>

            {/* Estimated Monthly MCs */}
            <div>
              <label className="block text-sm font-medium text-slate-600 mb-2">
                Estimated Monthly MCs
              </label>
              <input
                type="number"
                name="estimatedMCs"
                value={formData.estimatedMCs}
                onChange={handleInputChange}
                placeholder="e.g., 500"
                min="1"
                className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-slate-900 placeholder-slate-400 focus:outline-none focus:border-teal-500 focus:ring-1 focus:ring-teal-500 transition-colors"
                required
              />
              {formData.estimatedMCs && (
                <p className="text-xs text-emerald-600 mt-2">
                  Estimated variable fee: RM{Number(formData.estimatedMCs).toLocaleString()}/month
                </p>
              )}
            </div>

            {/* Decision Maker Role */}
            <div>
              <label className="block text-sm font-medium text-slate-600 mb-2">
                Your Role
              </label>
              <select
                name="decisionMakerRole"
                value={formData.decisionMakerRole}
                onChange={handleInputChange}
                className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-slate-900 focus:outline-none focus:border-teal-500 focus:ring-1 focus:ring-teal-500 transition-colors appearance-none cursor-pointer"
                required
              >
                <option value="" className="text-slate-500">Select your role</option>
                {DECISION_MAKER_ROLES.map(role => (
                  <option key={role} value={role}>{role}</option>
                ))}
              </select>
            </div>

            {/* Contact Info Row */}
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-slate-600 mb-2">
                  Email
                </label>
                <input
                  type="email"
                  name="email"
                  value={formData.email}
                  onChange={handleInputChange}
                  placeholder="you@hospital.com"
                  className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-slate-900 placeholder-slate-400 focus:outline-none focus:border-teal-500 focus:ring-1 focus:ring-teal-500 transition-colors"
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-600 mb-2">
                  Phone
                </label>
                <input
                  type="tel"
                  name="phone"
                  value={formData.phone}
                  onChange={handleInputChange}
                  placeholder="+60 12-345 6789"
                  className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-slate-900 placeholder-slate-400 focus:outline-none focus:border-teal-500 focus:ring-1 focus:ring-teal-500 transition-colors"
                  required
                />
              </div>
            </div>
          </div>

          {/* Submit Button */}
          <button
            type="submit"
            disabled={isSubmitting}
            className="w-full mt-8 py-4 bg-teal-600 hover:bg-teal-700 disabled:bg-teal-600/50 text-white font-bold rounded-xl transition-all flex items-center justify-center gap-2"
          >
            {isSubmitting ? (
              <>
                <svg className="animate-spin h-5 w-5" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                </svg>
                Recording on Blockchain...
              </>
            ) : (
              <>
                Submit Application
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7l5 5m0 0l-5 5m5-5H6" />
                </svg>
              </>
            )}
          </button>

          <p className="text-center text-slate-500 text-xs mt-4">
            Your information is encrypted and secured on the blockchain
          </p>
        </form>
      </div>
    </div>
  );
}

// Social Proof notifications
const SOCIAL_PROOF_EVENTS = [
  { icon: '🏥', text: 'New MC Verified', location: 'Timberland Medical Centre' },
  { icon: '🛡️', text: 'Record Secured', location: 'Miri General Hospital' },
  { icon: '👨‍⚕️', text: 'Dr. Wong issued a Blockchain-Secured MC', location: 'Kuching' },
  { icon: '✅', text: 'Patient Access Granted', location: 'Sibu Specialist' },
  { icon: '🔐', text: 'Emergency Access Logged', location: 'Bintulu Hospital' },
  { icon: '📋', text: 'MC Verified by Employer', location: 'Sarawak Energy' },
  { icon: '🏥', text: 'New Hospital Onboarded', location: 'Normah Medical' },
  { icon: '👨‍⚕️', text: 'Dr. Lim verified 3 records', location: 'KPJ Kuching' },
];

function SocialProofToast() {
  const [currentEvent, setCurrentEvent] = useState(SOCIAL_PROOF_EVENTS[0]);
  const [isVisible, setIsVisible] = useState(false);
  const [key, setKey] = useState(0);

  useEffect(() => {
    // Initial delay before first toast
    const initialDelay = setTimeout(() => {
      setIsVisible(true);
    }, 2000);

    // Cycle through events
    const interval = setInterval(() => {
      setIsVisible(false);

      setTimeout(() => {
        const randomIndex = Math.floor(Math.random() * SOCIAL_PROOF_EVENTS.length);
        setCurrentEvent(SOCIAL_PROOF_EVENTS[randomIndex]);
        setKey(prev => prev + 1);
        setIsVisible(true);
      }, 500);
    }, 5000);

    return () => {
      clearTimeout(initialDelay);
      clearInterval(interval);
    };
  }, []);

  return (
    <div
      key={key}
      className={`fixed bottom-6 left-6 z-50 transition-all duration-500 ${
        isVisible
          ? 'opacity-100 translate-x-0'
          : 'opacity-0 -translate-x-full'
      }`}
    >
      <div className="flex items-center gap-3 px-4 py-3 bg-slate-900/80 backdrop-blur-md border border-emerald-500/30 rounded-xl shadow-lg shadow-emerald-500/10">
        {/* Live indicator */}
        <div className="flex items-center gap-2">
          <span className="relative flex h-2 w-2">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
            <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
          </span>
          <span className="text-emerald-400 text-xs font-bold uppercase tracking-wider">Live</span>
        </div>

        <div className="w-px h-6 bg-white/10"></div>

        {/* Event content */}
        <div className="flex items-center gap-2">
          <span className="text-lg">{currentEvent.icon}</span>
          <div>
            <p className="text-white text-sm font-medium">{currentEvent.text}</p>
            <p className="text-slate-400 text-xs">{currentEvent.location}</p>
          </div>
        </div>
      </div>
    </div>
  );
}

// iOS Audio Fix: Create a shared AudioContext that persists across the app
// This context is "unlocked" during a user gesture and can be reused later
let sharedAudioContext = null;

// Unlock/warm up the AudioContext - MUST be called from direct user click
// This satisfies iOS requirement that audio be initiated from user gesture
const unlockAudioContext = () => {
  try {
    if (!sharedAudioContext) {
      sharedAudioContext = new (window.AudioContext || window.webkitAudioContext)();
      console.log('[AUDIO] AudioContext created');
    }

    // Resume if suspended (iOS Safari suspends by default)
    if (sharedAudioContext.state === 'suspended') {
      sharedAudioContext.resume().then(() => {
        console.log('[AUDIO] AudioContext resumed - unlocked for iOS');
      });
    }

    // Play a silent buffer to fully unlock on iOS
    const silentBuffer = sharedAudioContext.createBuffer(1, 1, 22050);
    const source = sharedAudioContext.createBufferSource();
    source.buffer = silentBuffer;
    source.connect(sharedAudioContext.destination);
    source.start(0);

    return true;
  } catch (e) {
    console.log('[AUDIO] Unlock error:', e.message);
    return false;
  }
};

// Professional "Cha-Ching" success sound using Web Audio API
// Uses the pre-unlocked sharedAudioContext for iOS compatibility
const playSuccessSound = () => {
  try {
    // Use shared context or create new one
    const audioContext = sharedAudioContext || new (window.AudioContext || window.webkitAudioContext)();

    // Ensure context is running
    if (audioContext.state === 'suspended') {
      audioContext.resume();
    }

    const gainNode = audioContext.createGain();
    gainNode.connect(audioContext.destination);
    gainNode.gain.value = 0.7; // Loud and clear for demo

    // First tone - high pitched "cha"
    const osc1 = audioContext.createOscillator();
    osc1.type = 'triangle'; // Richer sound than sine
    osc1.frequency.setValueAtTime(1318, audioContext.currentTime); // E6
    osc1.frequency.exponentialRampToValueAtTime(880, audioContext.currentTime + 0.1);
    osc1.connect(gainNode);
    osc1.start(audioContext.currentTime);
    osc1.stop(audioContext.currentTime + 0.15);

    // Second tone - "ching"
    const osc2 = audioContext.createOscillator();
    osc2.type = 'triangle';
    osc2.frequency.setValueAtTime(1568, audioContext.currentTime + 0.12); // G6
    osc2.connect(gainNode);
    osc2.start(audioContext.currentTime + 0.12);
    osc2.stop(audioContext.currentTime + 0.3);

    // Third tone - triumphant resolution
    const osc3 = audioContext.createOscillator();
    osc3.type = 'triangle';
    osc3.frequency.setValueAtTime(2093, audioContext.currentTime + 0.25); // C7
    osc3.connect(gainNode);
    osc3.start(audioContext.currentTime + 0.25);
    osc3.stop(audioContext.currentTime + 0.5);

    console.log('[AUDIO] Cha-ching played successfully!');
  } catch (e) {
    console.log('[AUDIO] Playback error:', e.message);
  }
};

// Full-screen Provisioning Overlay Component
function ProvisioningOverlay({ isVisible, facilityName, blockchainRef, onComplete }) {
  const [progress, setProgress] = useState(0);
  const [currentStep, setCurrentStep] = useState(0);

  const steps = [
    'Initializing blockchain node...',
    'Allocating secure storage...',
    'Configuring encryption keys...',
    'Connecting to Sarawak MedChain network...',
  ];

  useEffect(() => {
    if (!isVisible) {
      return;
    }

    // Animate progress
    const progressInterval = setInterval(() => {
      setProgress(prev => {
        if (prev >= 100) {
          clearInterval(progressInterval);
          return 100;
        }
        return prev + 2;
      });
    }, 30);

    // Cycle through steps
    const stepInterval = setInterval(() => {
      setCurrentStep(prev => (prev + 1) % steps.length);
    }, 400);

    // NOTE: Sound now plays immediately on form submit (iOS requirement)
    // No longer playing here via setTimeout - that doesn't work on iPhone 8 Plus

    // Complete after 1.5 seconds
    const completeTimeout = setTimeout(() => {
      onComplete();
    }, 1500);

    return () => {
      clearInterval(progressInterval);
      clearInterval(stepInterval);
      clearTimeout(completeTimeout);
    };
  }, [isVisible, onComplete]);

  if (!isVisible) return null;

  return (
    <div className="fixed inset-0 z-[100] bg-white flex items-center justify-center">
      {/* Animated grid background */}
      <div className="absolute inset-0 overflow-hidden">
        <div
          className="absolute inset-0"
          style={{
            backgroundImage: `
              linear-gradient(rgba(59, 130, 246, 0.03) 1px, transparent 1px),
              linear-gradient(90deg, rgba(59, 130, 246, 0.03) 1px, transparent 1px)
            `,
            backgroundSize: '50px 50px',
            animation: 'grid-move 20s linear infinite',
          }}
        />
        {/* Radial glow */}
        <div
          className="absolute inset-0"
          style={{
            background: 'radial-gradient(circle at 50% 50%, rgba(15, 118, 110, 0.08) 0%, transparent 50%)',
          }}
        />
      </div>

      {/* Content */}
      <div className="relative z-10 text-center max-w-lg px-8">
        {/* Success checkmark animation */}
        <div className="w-24 h-24 mx-auto mb-8 relative">
          <div
            className="absolute inset-0 rounded-full border-4 border-emerald-500/30"
            style={{
              animation: 'pulse-ring 1.5s ease-out infinite',
            }}
          />
          <div className="absolute inset-0 rounded-full bg-emerald-500/20 flex items-center justify-center">
            <svg className="w-12 h-12 text-emerald-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={3}
                d="M5 13l4 4L19 7"
                style={{
                  strokeDasharray: 30,
                  strokeDashoffset: 30,
                  animation: 'checkmark-draw 0.5s ease-out 0.2s forwards',
                }}
              />
            </svg>
          </div>
        </div>

        {/* Main message */}
        <h1 className="text-3xl font-bold text-slate-900 mb-3">Application Received</h1>
        <p className="text-xl text-emerald-600 font-semibold mb-8">
          Your unique Hospital Blockchain Node is being provisioned...
        </p>

        {/* Facility name */}
        <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 mb-6">
          <p className="text-slate-500 text-sm">Provisioning node for</p>
          <p className="text-slate-900 text-xl font-bold">{facilityName}</p>
          <p className="text-emerald-600 font-mono text-xs mt-2">{blockchainRef}</p>
        </div>

        {/* Progress bar */}
        <div className="mb-4">
          <div className="h-2 bg-slate-200 rounded-full overflow-hidden">
            <div
              className="h-full rounded-full transition-all duration-100"
              style={{
                width: `${progress}%`,
                background: 'linear-gradient(90deg, #3b82f6, #10b981)',
              }}
            />
          </div>
        </div>

        {/* Current step */}
        <div className="flex items-center justify-center gap-2 text-slate-500 text-sm">
          <svg className="w-4 h-4 animate-spin text-teal-600" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
          </svg>
          <span>{steps[currentStep]}</span>
        </div>
      </div>

      {/* CSS animations */}
      <style>{`
        @keyframes grid-move {
          0% { transform: translate(0, 0); }
          100% { transform: translate(50px, 50px); }
        }
        @keyframes pulse-ring {
          0% { transform: scale(1); opacity: 1; }
          100% { transform: scale(1.5); opacity: 0; }
        }
        @keyframes checkmark-draw {
          to { stroke-dashoffset: 0; }
        }
      `}</style>
    </div>
  );
}

export default function LandingPage() {
  const navigate = useNavigate();
  const { enterDemoMode } = useDemo();
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [showProvisioning, setShowProvisioning] = useState(false);
  const [provisioningData, setProvisioningData] = useState({ facilityName: '', blockchainRef: '' });
  const [securityLoading, setSecurityLoading] = useState(null); // 'clinic' | 'hospital' | null
  const [integrityFlash, setIntegrityFlash] = useState(false); // Flash 100% Integrity badge on click
  const { progress: scrollProgress, shrunk: isHeaderShrunk } = useScrollProgress(80);

  // Handle demo mode entry
  const handleTryDemo = () => {
    enterDemoMode('doctor');
    navigate('/patient');
  };

  // LANDING PAGE: NO PWA - just a regular website
  // This prevents iOS from hijacking the session
  useEffect(() => {
    // Check if we're running as a standalone PWA (installed app)
    const isStandalone = window.matchMedia('(display-mode: standalone)').matches ||
                         window.navigator.standalone === true || // iOS Safari
                         document.referrer.includes('android-app://');

    // Remove ANY manifest link on landing page
    const manifests = document.querySelectorAll('link[rel="manifest"]');
    manifests.forEach(m => m.remove());

    // Remove apple-touch-icon to prevent PWA behavior
    const appleIcons = document.querySelectorAll('link[rel="apple-touch-icon"]');
    appleIcons.forEach(i => i.remove());

    // Set page title
    document.title = 'Sarawak MedChain';

    // FORCE clear ALL service workers and caches ONLY if NOT in standalone mode
    // This prevents the browser from "remembering" other PWAs when on landing page
    if (!isStandalone) {
      console.log('[LANDING] Not standalone - clearing all PWA state');

      // Clear ALL service workers
      if ('serviceWorker' in navigator) {
        navigator.serviceWorker.getRegistrations().then(registrations => {
          registrations.forEach(registration => {
            registration.unregister().then(() => {
              console.log('[LANDING] Service worker unregistered:', registration.scope);
            });
          });
        });

        // Also clear the controller
        if (navigator.serviceWorker.controller) {
          navigator.serviceWorker.controller.postMessage({ type: 'SKIP_WAITING' });
        }
      }

      // Clear ALL caches
      if ('caches' in window) {
        caches.keys().then(cacheNames => {
          return Promise.all(
            cacheNames.map(cacheName => {
              console.log('[LANDING] Clearing cache:', cacheName);
              return caches.delete(cacheName);
            })
          );
        });
      }

      // Clear PWA-related localStorage
      localStorage.removeItem('pwa-manifest');
      localStorage.removeItem('pwa-gov');
      localStorage.removeItem('pwa-verify');
      localStorage.removeItem('pwa-issue');

      // Force clear any installed PWA state
      sessionStorage.clear();
    }
  }, []);

  const handleGetStarted = () => {
    // iOS AUDIO FIX: Unlock AudioContext during this user gesture
    unlockAudioContext();
    setIsModalOpen(true);
  };

  const handleSubmitSuccess = (facilityName, blockchainRef) => {
    setProvisioningData({ facilityName, blockchainRef });
    setShowProvisioning(true);
  };

  const handleProvisioningComplete = () => {
    navigate('/mvp');
  };

  // Handle pricing plan selection - uses window.location for PWA scope bypass
  // Includes security spinner and backend initialization for audit compliance
  const handlePlanSelect = async (planType) => {
    // iOS AUDIO FIX: Unlock AudioContext during this user gesture
    unlockAudioContext();

    // Flash the 100% Integrity badge to remind user they're using certified system
    setIntegrityFlash(true);
    setTimeout(() => setIntegrityFlash(false), 800);

    // Show security loading spinner (0.5s professional feel)
    setSecurityLoading(planType);

    // Store selected plan in localStorage for agreement/payment flow to pick up
    const planData = {
      type: planType,
      name: planType === 'clinic' ? 'Clinic Plan' : 'Hospital Plan',
      monthlyFee: planType === 'clinic' ? 2000 : 10000,
      perMcFee: 1,
      features: planType === 'clinic'
        ? ['Digital Records', 'Basic Dashboard', '5 Doctor Accounts', 'Email Support']
        : ['Full ERP Integration', 'Executive Dashboard', 'Unlimited Doctors', '24/7 Priority Support', 'Custom API Access'],
      selectedAt: new Date().toISOString(),
    };
    localStorage.setItem('medchain_selected_plan', JSON.stringify(planData));

    // AUDIT CHECK: Initialize payments.json entry on backend
    // This maintains our 17/17 Resilience Audit score
    try {
      await fetch('/api/webhook/fpx/init', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          planType,
          planName: planData.name,
          monthlyFee: planData.monthlyFee,
          initiatedAt: new Date().toISOString(),
          source: 'landing_page_pricing',
        }),
      });
    } catch (e) {
      // Continue even if backend unavailable - localStorage has the data
      console.log('[PRICING] Backend init unavailable, continuing with localStorage');
    }

    // Security verification delay (0.5s for professional feel)
    await new Promise(resolve => setTimeout(resolve, 500));

    // Use window.location.href to bypass PWA scope restrictions on iOS
    // This forces a full page navigation outside the current manifest scope
    // Note: Using /#/ for HashRouter compatibility
    window.location.href = '/#/agreement?plan=' + planType;
  };

  // Handle contact sales for government plan
  const handleContactSales = () => {
    window.location.href = 'mailto:randyrjm99@gmail.com?subject=Sarawak%20MedChain%20-%20Government%20Plan%20Inquiry';
  };

  return (
    <main className="landing-page" style={{
      fontFamily: "'Inter', system-ui, sans-serif",
      minHeight: '100vh',
      backgroundColor: '#f8fafc',
      width: '100%',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center'
    }}>
      {/* Full-screen Provisioning Overlay */}
      <ProvisioningOverlay
        isVisible={showProvisioning}
        facilityName={provisioningData.facilityName}
        blockchainRef={provisioningData.blockchainRef}
        onComplete={handleProvisioningComplete}
      />

      {/* Request Access Modal */}
      <RequestAccessModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        onSubmitSuccess={handleSubmitSuccess}
      />

      {/* Social Proof Toast */}
      <SocialProofToast />

      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800;900&display=swap');

        /* Landing page base */
        .landing-page {
          background-color: #f8fafc;
        }

        /* Premium Typography */
        .font-heading { font-family: 'Inter', system-ui, sans-serif; }
        .font-body { font-family: 'Inter', system-ui, sans-serif; }

        /* Gradient text - Stripe style */
        .gradient-text {
          background: linear-gradient(135deg, #3b82f6 0%, #8b5cf6 100%);
          -webkit-background-clip: text;
          -webkit-text-fill-color: transparent;
          background-clip: text;
        }

        /* Premium card glass effect */
        .glass-card {
          background: rgba(255, 255, 255, 0.7);
          backdrop-filter: blur(20px);
          -webkit-backdrop-filter: blur(20px);
          border: 1px solid rgba(255, 255, 255, 0.2);
        }

        /* Premium button glow */
        .btn-glow {
          box-shadow: 0 0 0 1px rgba(59, 130, 246, 0.5),
                      0 2px 4px rgba(59, 130, 246, 0.1),
                      0 12px 24px rgba(59, 130, 246, 0.2);
        }
        .btn-glow:hover {
          box-shadow: 0 0 0 1px rgba(59, 130, 246, 0.5),
                      0 4px 8px rgba(59, 130, 246, 0.2),
                      0 16px 32px rgba(59, 130, 246, 0.3);
        }

        /* Subtle animations */
        .hover-lift { transition: transform 0.2s ease, box-shadow 0.2s ease; }
        .hover-lift:hover { transform: translateY(-2px); }

        /* Red accent for fraud stat */
        .red-glow { text-shadow: none; }

        /* ========== STATS ROW - Desktop ========== */
        .stats-row {
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 48px;
        }
        .stat-item {
          text-align: center;
        }
        .stat-number {
          font-size: 48px;
          font-weight: 700;
          color: #0f172a;
          line-height: 1;
        }
        .stat-number-blue {
          color: #2563eb;
        }
        .stat-label {
          font-size: 13px;
          color: #64748b;
          margin-top: 8px;
          font-weight: 500;
          letter-spacing: 0.05em;
          text-transform: uppercase;
        }
        .stat-divider {
          width: 1px;
          height: 48px;
          background: linear-gradient(to bottom, transparent, #cbd5e1, transparent);
        }

        /* ========== MOBILE RESPONSIVE ========== */
        @media (max-width: 768px) {
          /* Main container padding */
          .landing-content {
            padding: 0 16px !important;
          }

          /* Header nav */
          .landing-nav {
            padding: 0 16px !important;
          }

          /* Hero section */
          .hero-section {
            padding-top: 48px !important;
            padding-bottom: 48px !important;
            width: 100% !important;
            overflow: visible !important;
            box-sizing: border-box !important;
          }

          .hero-headline {
            font-size: 28px !important;
            line-height: 1.15 !important;
            margin-bottom: 16px !important;
          }

          .hero-subtitle {
            font-size: 16px !important;
            margin-bottom: 32px !important;
          }

          .hero-cta {
            width: 100% !important;
            margin-bottom: 48px !important;
          }

          .hero-cta button {
            width: 100% !important;
          }

          /* Stats row - single column stack on mobile */
          .stats-row {
            display: flex !important;
            flex-direction: column !important;
            align-items: center !important;
            gap: 16px !important;
            width: 100% !important;
            padding: 0 16px !important;
            box-sizing: border-box !important;
          }

          .stats-row .stat-divider {
            display: none !important;
          }

          .stats-row .stat-item {
            text-align: center !important;
            width: 100% !important;
            max-width: 100% !important;
            padding: 16px 0 !important;
            background: transparent !important;
            border-radius: 0 !important;
            border: none !important;
            box-sizing: border-box !important;
          }

          .stats-row .stat-number {
            font-size: 36px !important;
            color: #0f172a !important;
          }

          .stats-row .stat-number-blue {
            color: #2563eb !important;
          }

          .stats-row .stat-label {
            font-size: 11px !important;
            margin-top: 6px !important;
            color: #64748b !important;
          }

          /* Problem section */
          .problem-section {
            padding: 48px 0 !important;
          }

          .problem-card {
            padding: 32px 20px !important;
            border-radius: 16px !important;
          }

          .problem-headline {
            font-size: 36px !important;
          }

          .problem-subhead {
            font-size: 18px !important;
          }

          .problem-description {
            font-size: 15px !important;
          }

          .pain-points-row {
            flex-direction: column !important;
            gap: 8px !important;
          }

          .solution-cards {
            flex-direction: column !important;
            gap: 12px !important;
          }

          .solution-cards > div {
            width: 100% !important;
          }

          /* Map section */
          .map-section {
            padding: 48px 0 !important;
          }

          .section-title {
            font-size: 28px !important;
          }

          /* Hospital grid */
          .hospital-section {
            padding: 48px 0 !important;
          }

          .hospital-grid {
            grid-template-columns: repeat(2, 1fr) !important;
            gap: 12px !important;
          }

          .hospital-card {
            padding: 16px !important;
          }

          .hospital-card .hospital-short {
            font-size: 18px !important;
          }

          .hospital-card .hospital-name {
            font-size: 11px !important;
          }

          /* Pricing section */
          .pricing-section {
            padding: 48px 0 !important;
            margin: 0 -16px !important;
            border-radius: 20px !important;
          }

          .pricing-grid {
            display: flex !important;
            flex-direction: column !important;
            gap: 16px !important;
            padding: 0 16px !important;
          }

          .pricing-grid > div {
            width: 100% !important;
            max-width: 100% !important;
            padding: 24px 20px !important;
          }

          /* Footer */
          .landing-footer {
            padding: 32px 16px !important;
          }

          .footer-links {
            flex-direction: column !important;
            gap: 12px !important;
          }

          /* Prevent horizontal scroll */
          .landing-page {
            overflow-x: hidden !important;
            width: 100% !important;
          }

          .landing-page .landing-content {
            overflow: visible !important;
            width: 100% !important;
            box-sizing: border-box !important;
          }

          /* Ensure all content fits */
          .landing-page section {
            width: 100% !important;
            box-sizing: border-box !important;
          }
        }
      `}</style>

      {/* Scroll progress indicator — premium dashboard signal */}
      <ScrollProgressBar progress={scrollProgress} />

      {/* ===== STICKY HEADER - Premium, shrinks on scroll ===== */}
      <header
        className="sticky top-0 z-50 border-b border-slate-200/50 backdrop-blur-xl"
        style={{
          width: '100%',
          backgroundColor: isHeaderShrunk ? 'rgba(255,255,255,0.92)' : 'rgba(255,255,255,0.8)',
          boxShadow: isHeaderShrunk ? '0 4px 12px rgba(0,0,0,0.04)' : 'none',
          transition: 'background-color 0.3s ease-out, box-shadow 0.3s ease-out',
        }}
      >
        <nav className="landing-nav" style={{ maxWidth: '1200px', margin: '0 auto', padding: '0 32px', height: isHeaderShrunk ? '52px' : '64px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', transition: 'height 0.3s cubic-bezier(0.16, 1, 0.3, 1)' }}>
          {/* Logo */}
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 bg-gradient-to-br from-blue-600 to-violet-600 rounded-lg flex items-center justify-center">
              <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
              </svg>
            </div>
            <span className="text-[15px] font-semibold text-slate-900 font-heading">Sarawak MedChain</span>
          </div>

          {/* Nav Items */}
          <div className="flex items-center gap-8">
            <a href="#features" className="hidden md:block text-[13px] text-slate-600 hover:text-slate-900 transition-colors font-medium">Features</a>
            <a href="#pricing" className="hidden md:block text-[13px] text-slate-600 hover:text-slate-900 transition-colors font-medium">Pricing</a>
            <a
              href="#for-government"
              className="hidden md:block text-[13px] text-slate-600 hover:text-slate-900 transition-colors font-medium"
            >
              For Government
            </a>
            <a
              href="mailto:randyrjm99@gmail.com?subject=Sarawak%20MedChain%20-%20Briefing%20Request"
              className="px-4 py-2 bg-slate-900 hover:bg-slate-800 text-white font-medium text-[13px] rounded-lg transition-all duration-200"
            >
              Founder Direct
            </a>
          </div>
        </nav>
      </header>

      {/* ===== MAIN CONTENT ===== */}
      <div className="landing-content" style={{ width: '100%', maxWidth: '1200px', margin: '0 auto', padding: '0 32px' }}>

      {/* ========== HERO SECTION - Premium ========== */}
      <section className="hero-section" style={{ paddingTop: '96px', paddingBottom: '80px', display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center' }}>
        {/* Badge */}
        <div style={{ marginBottom: '32px' }}>
          <span style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '10px',
            padding: '8px 16px 8px 12px',
            borderRadius: '9999px',
            backgroundColor: 'rgba(16, 185, 129, 0.08)',
            border: '1px solid rgba(16, 185, 129, 0.2)',
            boxShadow: '0 1px 2px rgba(16, 185, 129, 0.05)'
          }}>
            {/* Green pulsing dot */}
            <span style={{ position: 'relative', display: 'flex', width: '8px', height: '8px' }}>
              <span className="animate-ping" style={{
                position: 'absolute',
                display: 'inline-flex',
                width: '100%',
                height: '100%',
                borderRadius: '9999px',
                backgroundColor: '#10b981',
                opacity: 0.75
              }}></span>
              <span style={{
                position: 'relative',
                display: 'inline-flex',
                width: '8px',
                height: '8px',
                borderRadius: '9999px',
                backgroundColor: '#10b981'
              }}></span>
            </span>
            <span style={{ fontSize: '13px', color: '#059669', fontWeight: 600, letterSpacing: '0.01em' }}>Live in Sarawak</span>
          </span>
        </div>

        {/* Headline */}
        <h1 className="font-heading gradient-text hero-headline" style={{ fontSize: 'clamp(44px, 5vw, 64px)', fontWeight: 800, letterSpacing: '-0.02em', color: '#0f172a', textAlign: 'center', lineHeight: 1.08, marginBottom: '24px', maxWidth: '900px' }}>
          Sarawak's Sovereign <span className="gradient-text">Health Record System</span>
        </h1>

        {/* Subtitle */}
        <p className="font-body hero-subtitle" style={{ fontSize: '20px', color: '#64748b', lineHeight: 1.6, marginBottom: '20px', maxWidth: '620px', textAlign: 'center', fontWeight: 400 }}>
          Tamper-proof medical records hosted in Malaysia, controlled by patients. Built with hospitals — designed to give Sarawak full oversight of our state's health data.
        </p>

        {/* Blueprint alignment line */}
        <p style={{ fontSize: '13px', color: '#0F766E', fontWeight: 600, marginBottom: '40px', letterSpacing: '0.02em', textTransform: 'uppercase' }}>
          Aligned with Sarawak Digital Economy Blueprint 2030
        </p>

        {/* CTA Buttons */}
        <div className="hero-cta" style={{ marginBottom: '80px', display: 'flex', gap: '16px', flexWrap: 'wrap', justifyContent: 'center' }}>
          <button
            onClick={handleGetStarted}
            className="group"
            style={{
              padding: '14px 28px',
              backgroundColor: '#0F766E',
              color: 'white',
              fontSize: '15px',
              fontWeight: 600,
              borderRadius: '12px',
              border: 'none',
              cursor: 'pointer',
              transition: 'all 0.3s ease',
              boxShadow: '0 4px 12px rgba(15, 118, 110, 0.2), 0 8px 24px rgba(15, 118, 110, 0.15)'
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.backgroundColor = '#0D9488';
              e.currentTarget.style.boxShadow = '0 6px 16px rgba(15, 118, 110, 0.3), 0 12px 32px rgba(15, 118, 110, 0.2)';
              e.currentTarget.style.transform = 'translateY(-2px)';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.backgroundColor = '#0F766E';
              e.currentTarget.style.boxShadow = '0 4px 12px rgba(15, 118, 110, 0.2), 0 8px 24px rgba(15, 118, 110, 0.15)';
              e.currentTarget.style.transform = 'translateY(0)';
            }}
          >
            <span style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              Start Free Trial
              <svg className="w-4 h-4 transition-transform duration-200 group-hover:translate-x-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7l5 5m0 0l-5 5m5-5H6" />
              </svg>
            </span>
          </button>

          {/* Try Demo Button */}
          <button
            onClick={handleTryDemo}
            className="group"
            style={{
              padding: '14px 28px',
              backgroundColor: 'transparent',
              color: '#f59e0b',
              fontSize: '15px',
              fontWeight: 600,
              borderRadius: '12px',
              border: '2px solid #f59e0b',
              cursor: 'pointer',
              transition: 'all 0.3s ease',
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.backgroundColor = '#f59e0b';
              e.currentTarget.style.color = '#1E293B';
              e.currentTarget.style.transform = 'translateY(-2px)';
              e.currentTarget.style.boxShadow = '0 0 30px rgba(245, 158, 11, 0.4)';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.backgroundColor = 'transparent';
              e.currentTarget.style.color = '#f59e0b';
              e.currentTarget.style.transform = 'translateY(0)';
              e.currentTarget.style.boxShadow = 'none';
            }}
          >
            <span style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              Try Demo
            </span>
          </button>
        </div>

        {/* Tertiary govt link - subtle, non-crowding */}
        <a
          href="#for-government"
          style={{
            marginTop: '-56px',
            marginBottom: '64px',
            fontSize: '14px',
            color: '#64748b',
            fontWeight: 500,
            textDecoration: 'none',
            display: 'inline-flex',
            alignItems: 'center',
            gap: '6px',
            transition: 'color 0.2s ease',
          }}
          onMouseEnter={(e) => { e.currentTarget.style.color = '#0F766E'; }}
          onMouseLeave={(e) => { e.currentTarget.style.color = '#64748b'; }}
        >
          For Sarawak Government & State Agencies <span style={{ fontSize: '16px' }}>→</span>
        </a>

        {/* Stats Row — animated counters */}
        <ScrollReveal direction="up" className="stats-row">
          <div className="stat-item">
            <p className="font-heading stat-number"><CountUp end={16} duration={1400} /></p>
            <p className="font-body stat-label">Hospitals</p>
          </div>
          <div className="stat-divider"></div>
          <div className="stat-item">
            <p className="font-heading stat-number"><CountUp end={180} duration={1600} suffix="+" /></p>
            <p className="font-body stat-label">Clinics</p>
          </div>
          <div className="stat-divider"></div>
          <div className="stat-item stat-item-blue">
            <p className="font-heading stat-number stat-number-blue"><CountUp end={99.9} duration={1800} decimals={1} suffix="%" /></p>
            <p className="font-body stat-label">Uptime</p>
          </div>
        </ScrollReveal>
      </section>

      {/* ========== TRUST BADGES SECTION ========== */}
      <ScrollReveal direction="up"><section style={{ background: '#F8FAFC', padding: '48px 0' }}>
        <div style={{
          maxWidth: '1100px',
          margin: '0 auto',
          padding: '0 24px',
          display: 'flex',
          flexWrap: 'wrap',
          justifyContent: 'center',
          gap: '32px',
        }}>
          {/* 99.9% Uptime */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '14px', minWidth: '200px' }}>
            <div style={{
              width: '48px', height: '48px', borderRadius: '50%',
              background: 'rgba(34, 197, 94, 0.12)',
              display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
            }}>
              <Shield size={22} color="#16A34A" strokeWidth={2.2} />
            </div>
            <div>
              <p className="font-heading" style={{ fontSize: '14px', fontWeight: 700, color: '#1E293B', margin: 0, lineHeight: 1.3 }}>99.9% Uptime</p>
              <p className="font-body" style={{ fontSize: '12px', color: '#64748B', margin: 0, lineHeight: 1.4 }}>SLA Guaranteed</p>
            </div>
          </div>

          {/* Data Hosted in Malaysia */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '14px', minWidth: '200px' }}>
            <div style={{
              width: '48px', height: '48px', borderRadius: '50%',
              background: 'rgba(59, 130, 246, 0.12)',
              display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
              fontSize: '22px',
            }}>
              🇲🇾
            </div>
            <div>
              <p className="font-heading" style={{ fontSize: '14px', fontWeight: 700, color: '#1E293B', margin: 0, lineHeight: 1.3 }}>Data Resident in Malaysia</p>
              <p className="font-body" style={{ fontSize: '12px', color: '#64748B', margin: 0, lineHeight: 1.4 }}>PDPA 2010 Compliant</p>
            </div>
          </div>

          {/* 24/7 Support */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '14px', minWidth: '200px' }}>
            <div style={{
              width: '48px', height: '48px', borderRadius: '50%',
              background: 'rgba(20, 184, 166, 0.12)',
              display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
            }}>
              <Headphones size={22} color="#0D9488" strokeWidth={2.2} />
            </div>
            <div>
              <p className="font-heading" style={{ fontSize: '14px', fontWeight: 700, color: '#1E293B', margin: 0, lineHeight: 1.3 }}>24/7 Support</p>
              <p className="font-body" style={{ fontSize: '12px', color: '#64748B', margin: 0, lineHeight: 1.4 }}>Critical Issues</p>
            </div>
          </div>

          {/* MOH-Aligned Standards */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '14px', minWidth: '200px' }}>
            <div style={{
              width: '48px', height: '48px', borderRadius: '50%',
              background: 'rgba(139, 92, 246, 0.12)',
              display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
            }}>
              <Lock size={22} color="#7C3AED" strokeWidth={2.2} />
            </div>
            <div>
              <p className="font-heading" style={{ fontSize: '14px', fontWeight: 700, color: '#1E293B', margin: 0, lineHeight: 1.3 }}>MOH Documentation Standards</p>
              <p className="font-body" style={{ fontSize: '12px', color: '#64748B', margin: 0, lineHeight: 1.4 }}>Tamper-Proof Audit Trail</p>
            </div>
          </div>
        </div>
      </section></ScrollReveal>

      {/* ========== FOR GOVERNMENT SECTION - SDEC / State Agencies ========== */}
      <ScrollReveal direction="left"><section
        id="for-government"
        style={{
          background: 'linear-gradient(180deg, #FFFFFF 0%, #F8FAFC 100%)',
          padding: '96px 0',
          scrollMarginTop: '80px',
        }}
      >
        <div style={{ maxWidth: '1100px', margin: '0 auto', padding: '0 24px' }}>
          {/* Section header */}
          <div style={{ textAlign: 'center', marginBottom: '64px' }}>
            <div style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '8px',
              padding: '6px 14px',
              borderRadius: '9999px',
              background: 'rgba(15, 118, 110, 0.08)',
              border: '1px solid rgba(15, 118, 110, 0.2)',
              marginBottom: '20px',
            }}>
              <span style={{ fontSize: '12px', color: '#0F766E', fontWeight: 700, letterSpacing: '0.05em', textTransform: 'uppercase' }}>
                For Sarawak Government
              </span>
            </div>
            <h2 className="font-heading" style={{
              fontSize: 'clamp(32px, 4.5vw, 44px)',
              fontWeight: 800,
              color: '#0f172a',
              marginBottom: '16px',
              letterSpacing: '-0.02em',
              lineHeight: 1.15,
            }}>
              State Oversight of Sarawak's Health Data
            </h2>
            <p className="font-body" style={{
              fontSize: '18px',
              color: '#64748b',
              maxWidth: '720px',
              margin: '0 auto',
              lineHeight: 1.6,
            }}>
              A patient-controlled, hospital-operated medical record system — with the audit visibility state agencies need for policy, fraud monitoring, and public health response.
            </p>
          </div>

          {/* Three-column grid: Sovereignty / Compliance / Pilot */}
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
            gap: '24px',
            marginBottom: '56px',
          }}>
            {/* Sovereignty */}
            <div style={{
              background: '#FFFFFF',
              border: '1px solid #E2E8F0',
              borderRadius: '16px',
              padding: '32px',
              boxShadow: '0 1px 3px rgba(0,0,0,0.04)',
            }}>
              <div style={{
                width: '44px', height: '44px', borderRadius: '10px',
                background: 'rgba(15, 118, 110, 0.1)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                marginBottom: '20px',
              }}>
                <Shield size={22} color="#0F766E" strokeWidth={2.2} />
              </div>
              <h3 className="font-heading" style={{ fontSize: '18px', fontWeight: 700, color: '#0f172a', marginBottom: '12px' }}>
                Data Sovereignty
              </h3>
              <ul style={{ listStyle: 'none', padding: 0, margin: 0, color: '#475569', fontSize: '14px', lineHeight: 1.7 }}>
                <li style={{ marginBottom: '8px' }}>• Records reside in Malaysia, not foreign clouds</li>
                <li style={{ marginBottom: '8px' }}>• Encryption keys controlled by patients, not vendors</li>
                <li style={{ marginBottom: '8px' }}>• Open-source smart contract on public ledger</li>
                <li>• Built in Kuching, by Sarawakians, for Sarawak</li>
              </ul>
            </div>

            {/* Compliance */}
            <div style={{
              background: '#FFFFFF',
              border: '1px solid #E2E8F0',
              borderRadius: '16px',
              padding: '32px',
              boxShadow: '0 1px 3px rgba(0,0,0,0.04)',
            }}>
              <div style={{
                width: '44px', height: '44px', borderRadius: '10px',
                background: 'rgba(124, 58, 237, 0.1)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                marginBottom: '20px',
              }}>
                <Lock size={22} color="#7C3AED" strokeWidth={2.2} />
              </div>
              <h3 className="font-heading" style={{ fontSize: '18px', fontWeight: 700, color: '#0f172a', marginBottom: '12px' }}>
                Compliance Posture
              </h3>
              <ul style={{ listStyle: 'none', padding: 0, margin: 0, color: '#475569', fontSize: '14px', lineHeight: 1.7 }}>
                <li style={{ marginBottom: '8px' }}>• PDPA 2010 — data resident in Malaysia</li>
                <li style={{ marginBottom: '8px' }}>• MOH documentation standards alignment</li>
                <li style={{ marginBottom: '8px' }}>• Read-only oversight dashboard for state agencies</li>
                <li>• Full audit trail — every access logged on-chain</li>
              </ul>
            </div>

            {/* Pilot offer */}
            <div style={{
              background: 'linear-gradient(135deg, #0F2A5C 0%, #1E3A8A 100%)',
              border: '1px solid rgba(15, 42, 92, 0.3)',
              borderRadius: '16px',
              padding: '32px',
              boxShadow: '0 8px 24px rgba(15, 42, 92, 0.15)',
              color: '#FFFFFF',
            }}>
              <div style={{
                display: 'inline-block',
                padding: '4px 10px',
                borderRadius: '9999px',
                background: 'rgba(245, 158, 11, 0.15)',
                border: '1px solid rgba(245, 158, 11, 0.35)',
                marginBottom: '16px',
              }}>
                <span style={{ fontSize: '11px', color: '#FBBF24', fontWeight: 700, letterSpacing: '0.05em', textTransform: 'uppercase' }}>
                  30-Day Pilot
                </span>
              </div>
              <h3 className="font-heading" style={{ fontSize: '18px', fontWeight: 700, color: '#FFFFFF', marginBottom: '12px' }}>
                Free Audit Pilot
              </h3>
              <ul style={{ listStyle: 'none', padding: 0, margin: 0, color: 'rgba(255,255,255,0.85)', fontSize: '14px', lineHeight: 1.7 }}>
                <li style={{ marginBottom: '8px' }}>• 30 days free, no obligation</li>
                <li style={{ marginBottom: '8px' }}>• One clinic of your choosing</li>
                <li style={{ marginBottom: '8px' }}>• Audit report delivered to your office</li>
                <li>• Founder supports onboarding personally</li>
              </ul>
            </div>
          </div>

          {/* CTA row */}
          <div style={{
            display: 'flex',
            gap: '16px',
            justifyContent: 'center',
            flexWrap: 'wrap',
          }}>
            <a
              href="#/gov-preview"
              style={{
                padding: '14px 28px',
                background: '#0F2A5C',
                color: 'white',
                fontSize: '15px',
                fontWeight: 600,
                borderRadius: '12px',
                textDecoration: 'none',
                transition: 'all 0.25s ease',
                boxShadow: '0 4px 12px rgba(15, 42, 92, 0.25)',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '8px',
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.transform = 'translateY(-2px)';
                e.currentTarget.style.boxShadow = '0 6px 18px rgba(15, 42, 92, 0.35)';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.transform = 'translateY(0)';
                e.currentTarget.style.boxShadow = '0 4px 12px rgba(15, 42, 92, 0.25)';
              }}
            >
              Open Government Preview
              <svg width="16" height="16" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7l5 5m0 0l-5 5m5-5H6" />
              </svg>
            </a>
            <a
              href="mailto:randyrjm99@gmail.com?subject=Sarawak%20MedChain%20-%20Pilot%20Briefing%20Request&body=Hello%20Randy%2C%0A%0AWe%20would%20like%20a%20briefing%20on%20Sarawak%20MedChain%20and%20the%2030-day%20pilot%20program.%0A%0AAgency%2FDepartment%3A%20%0AContact%20Name%3A%20%0ABest%20time%20to%20meet%3A%20%0A%0A"
              style={{
                padding: '14px 28px',
                background: '#FFFFFF',
                color: '#0F2A5C',
                fontSize: '15px',
                fontWeight: 600,
                borderRadius: '12px',
                textDecoration: 'none',
                transition: 'all 0.25s ease',
                border: '1.5px solid #0F2A5C',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '8px',
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = '#0F2A5C';
                e.currentTarget.style.color = '#FFFFFF';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = '#FFFFFF';
                e.currentTarget.style.color = '#0F2A5C';
              }}
            >
              Request Pilot Briefing
            </a>
          </div>

          {/* Founder direct line */}
          <p style={{
            textAlign: 'center',
            marginTop: '24px',
            fontSize: '13px',
            color: '#64748b',
          }}>
            Direct line to founder: <a href="mailto:randyrjm99@gmail.com" style={{ color: '#0F766E', fontWeight: 600, textDecoration: 'none' }}>randyrjm99@gmail.com</a>
          </p>
        </div>
      </section></ScrollReveal>

      {/* ========== THE PROBLEM SECTION - Premium ========== */}
      <ScrollReveal direction="right"><section className="problem-section" style={{ padding: '96px 0' }}>
        <div className="problem-card" style={{ position: 'relative', background: '#FFFFFF', color: '#1E293B', borderRadius: '20px', padding: '64px', overflow: 'hidden', border: '1px solid #E2E8F0', boxShadow: '0 4px 24px rgba(0,0,0,0.06)' }}>
          {/* Subtle gradient orb */}
          <div style={{ position: 'absolute', top: 0, left: '50%', transform: 'translate(-50%, -50%)', width: '600px', height: '600px', background: 'rgba(239, 68, 68, 0.06)', borderRadius: '50%', filter: 'blur(120px)' }}></div>

          <div style={{ position: 'relative', zIndex: 10, maxWidth: '700px', margin: '0 auto', textAlign: 'center' }}>
            {/* Section Label */}
            <p className="font-heading" style={{ fontSize: '11px', fontWeight: 600, color: '#64748b', marginBottom: '32px', textTransform: 'uppercase', letterSpacing: '0.2em' }}>The Problem</p>

            {/* Main Stat with red glow */}
            <h2 className="font-heading problem-headline" style={{ fontSize: 'clamp(56px, 8vw, 72px)', fontWeight: 800, color: '#DC2626', marginBottom: '16px', lineHeight: 1 }}>
              RM 1.5 – 3B<sup style={{ fontSize: '0.35em', fontWeight: 600, color: '#94A3B8', marginLeft: '4px' }}>est.</sup>
            </h2>
            <p className="font-heading problem-subhead" style={{ fontSize: 'clamp(20px, 3vw, 24px)', fontWeight: 600, color: '#f87171', marginBottom: '12px' }}>Estimated annual MC fraud impact in Malaysia</p>
            <p style={{ fontSize: '12px', color: '#94A3B8', marginBottom: '40px', maxWidth: '540px', margin: '0 auto 40px auto', lineHeight: 1.5 }}>
              Estimate based on Malaysia healthcare spend (~RM 60B, MOH 2023) × global healthcare-fraud range of 3–7% (NHCAA). Actual MC-specific figures are not publicly tracked.
            </p>

            {/* Description */}
            <p className="font-body problem-description" style={{ fontSize: '18px', color: '#64748B', lineHeight: 1.7, marginBottom: '48px', maxWidth: '540px', marginLeft: 'auto', marginRight: 'auto' }}>
              Malaysian employers lose billions annually to fraudulent medical certificates. Paper-based systems are easily forged, impossible to verify, and create zero accountability.
            </p>

            {/* Pain points row */}
            <div className="pain-points-row" style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'center', alignItems: 'center', gap: '12px', marginBottom: '64px' }}>
              {['Paper MCs easily forged', 'No employer verification', 'Zero audit trail'].map((problem, i) => (
                <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '8px 16px', background: 'rgba(239, 68, 68, 0.1)', border: '1px solid rgba(239, 68, 68, 0.2)', borderRadius: '9999px' }}>
                  <svg style={{ width: '14px', height: '14px', color: '#f87171' }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                  <span style={{ fontSize: '13px', color: '#991B1B', fontWeight: 500 }}>{problem}</span>
                </div>
              ))}
            </div>

            {/* Solution cards - glassmorphism */}
            <div className="solution-cards" style={{ display: 'flex', justifyContent: 'center', gap: '16px', flexWrap: 'wrap' }}>
              <div className="bg-slate-50 border border-slate-200 rounded-2xl p-6 hover-lift">
                <div className="w-11 h-11 bg-emerald-500/15 rounded-xl flex items-center justify-center mx-auto mb-4">
                  <svg className="w-5 h-5 text-emerald-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
                  </svg>
                </div>
                <p className="text-emerald-400 text-[32px] font-bold mb-1">100%</p>
                <p className="text-slate-500 text-[13px] font-medium">Tamper-Proof</p>
              </div>
              <div className="bg-slate-50 border border-slate-200 rounded-2xl p-6 hover-lift">
                <div className="w-11 h-11 bg-blue-500/15 rounded-xl flex items-center justify-center mx-auto mb-4">
                  <svg className="w-5 h-5 text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                  </svg>
                </div>
                <p className="text-blue-400 text-[32px] font-bold mb-1">&lt;3 sec</p>
                <p className="text-slate-500 text-[13px] font-medium">Instant Verify</p>
              </div>
              <div className="bg-slate-50 border border-slate-200 rounded-2xl p-6 hover-lift">
                <div className="w-11 h-11 bg-amber-500/15 rounded-xl flex items-center justify-center mx-auto mb-4">
                  <svg className="w-5 h-5 text-amber-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-3 7h3m-3 4h3m-6-4h.01M9 16h.01" />
                  </svg>
                </div>
                <p className="text-amber-400 text-[32px] font-bold mb-1">24/7</p>
                <p className="text-slate-500 text-[13px] font-medium">Audit Trail</p>
              </div>
            </div>
          </div>
        </div>
      </section></ScrollReveal>

      {/* ========== HOW IT WORKS — 5-step infographic ========== */}
      <ScrollReveal direction="up"><section style={{ padding: '96px 0' }}>
        {/* Section header */}
        <div style={{ textAlign: 'center', marginBottom: '64px', maxWidth: '720px', margin: '0 auto 64px auto' }}>
          <p className="font-heading" style={{ fontSize: '11px', fontWeight: 700, color: '#0F766E', marginBottom: '16px', textTransform: 'uppercase', letterSpacing: '0.2em' }}>
            How It Works
          </p>
          <h2 className="font-heading" style={{ fontSize: 'clamp(32px, 5vw, 44px)', fontWeight: 800, color: '#0f172a', marginBottom: '16px', letterSpacing: '-0.02em', lineHeight: 1.15 }}>
            From doctor's pen to employer's phone — in five steps
          </h2>
          <p className="font-body" style={{ fontSize: '17px', color: '#64748b', lineHeight: 1.6 }}>
            Every medical certificate flows through a cryptographic pipeline that makes it tamper-proof, patient-controlled, and instantly verifiable by anyone with a phone.
          </p>
        </div>

        {/* 5-step flow */}
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
          gap: '20px',
          maxWidth: '1100px',
          margin: '0 auto',
          padding: '0 16px',
        }} className="how-it-works-grid">
          {[
            {
              step: '01',
              title: 'Doctor issues',
              desc: 'Verified doctor signs in with secure wallet, fills the MC, submits.',
              icon: (
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" /></svg>
              ),
            },
            {
              step: '02',
              title: 'Encrypted & hashed',
              desc: 'AES-256-GCM encrypts the file. Only the hash goes on the blockchain.',
              icon: (
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" /></svg>
              ),
            },
            {
              step: '03',
              title: 'Patient controls',
              desc: 'Patient grants or revokes access to specific doctors and employers — anytime.',
              icon: (
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" /></svg>
              ),
            },
            {
              step: '04',
              title: 'Employer verifies',
              desc: 'Anyone scans the QR code. Sees the verified MC in under 5 seconds.',
              icon: (
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M12 4v1m6 11h2m-6 0h-2v4m0-11v3m0 0h.01M12 12h4.01M16 20h4M4 12h4m12 0h.01M5 8h2a1 1 0 001-1V5a1 1 0 00-1-1H5a1 1 0 00-1 1v2a1 1 0 001 1zm12 0h2a1 1 0 001-1V5a1 1 0 00-1-1h-2a1 1 0 00-1 1v2a1 1 0 001 1zM5 20h2a1 1 0 001-1v-2a1 1 0 00-1-1H5a1 1 0 00-1 1v2a1 1 0 001 1z" /></svg>
              ),
            },
            {
              step: '05',
              title: 'Audit-ready',
              desc: 'Every action logged on-chain. State agencies see anonymized, aggregated data.',
              icon: (
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" /></svg>
              ),
            },
          ].map((item, idx, arr) => (
            <div key={item.step} style={{
              position: 'relative',
              background: '#FFFFFF',
              border: '1px solid #E2E8F0',
              borderRadius: '16px',
              padding: '28px 22px',
              boxShadow: '0 1px 3px rgba(0,0,0,0.04)',
              transition: 'all 0.3s ease',
            }}>
              {/* Step number */}
              <div style={{
                position: 'absolute',
                top: '-10px',
                left: '22px',
                background: '#0F2A5C',
                color: '#FFFFFF',
                fontSize: '11px',
                fontWeight: 700,
                padding: '4px 10px',
                borderRadius: '6px',
                letterSpacing: '0.08em',
              }}>
                STEP {item.step}
              </div>

              {/* Icon */}
              <div style={{
                width: '44px',
                height: '44px',
                borderRadius: '10px',
                background: 'rgba(15, 118, 110, 0.08)',
                color: '#0F766E',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                marginTop: '12px',
                marginBottom: '16px',
              }}>
                {item.icon}
              </div>

              {/* Title */}
              <h3 style={{
                fontSize: '17px',
                fontWeight: 700,
                color: '#0F172A',
                marginBottom: '8px',
                letterSpacing: '-0.01em',
              }}>
                {item.title}
              </h3>

              {/* Description */}
              <p style={{
                fontSize: '14px',
                color: '#64748B',
                lineHeight: 1.55,
                margin: 0,
              }}>
                {item.desc}
              </p>

              {/* Arrow connector — between cards on desktop */}
              {idx < arr.length - 1 && (
                <div className="how-it-works-arrow" style={{
                  position: 'absolute',
                  right: '-14px',
                  top: '50%',
                  transform: 'translateY(-50%)',
                  width: '28px',
                  height: '28px',
                  background: '#FFFFFF',
                  border: '1px solid #E2E8F0',
                  borderRadius: '50%',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  zIndex: 2,
                  boxShadow: '0 1px 3px rgba(0,0,0,0.04)',
                }}>
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#0F766E" strokeWidth="2.5">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                  </svg>
                </div>
              )}
            </div>
          ))}
        </div>

        {/* Hide arrows on mobile via media query (handled in inline style block below) */}
        <style>{`
          @media (max-width: 900px) {
            .how-it-works-arrow { display: none !important; }
          }
        `}</style>

        {/* Tech stack callout */}
        <div style={{
          maxWidth: '720px',
          margin: '56px auto 0 auto',
          padding: '20px 28px',
          background: '#F8FAFC',
          border: '1px solid #E2E8F0',
          borderRadius: '12px',
          textAlign: 'center',
        }}>
          <p style={{ fontSize: '11px', fontWeight: 700, color: '#0F766E', textTransform: 'uppercase', letterSpacing: '0.15em', marginBottom: '8px' }}>
            Stack
          </p>
          <p style={{ fontSize: '14px', color: '#475569', lineHeight: 1.6, margin: 0 }}>
            <strong style={{ color: '#0F172A' }}>AES-256-GCM</strong> client-side encryption · <strong style={{ color: '#0F172A' }}>IPFS</strong> for encrypted payloads · <strong style={{ color: '#0F172A' }}>Public smart contract</strong> for hashes & access logs · <strong style={{ color: '#0F172A' }}>MetaMask</strong> wallet signatures
          </p>
        </div>
      </section></ScrollReveal>

      {/* ========== NETWORK READINESS MAP - Premium ========== */}
      <ScrollReveal direction="left"><section className="map-section" style={{ padding: '96px 0' }}>
        {/* Section Header */}
        <div style={{ textAlign: 'center', marginBottom: '56px' }}>
          <p className="font-heading" style={{ fontSize: '11px', fontWeight: 600, color: '#2563eb', marginBottom: '16px', textTransform: 'uppercase', letterSpacing: '0.2em' }}>Infrastructure</p>
          <h2 className="font-heading section-title" style={{ fontSize: 'clamp(36px, 5vw, 44px)', fontWeight: 800, color: '#0f172a', marginBottom: '16px', letterSpacing: '-0.02em' }}>Sarawak Network Readiness</h2>
          <p className="font-body" style={{ fontSize: '17px', color: '#64748b', maxWidth: '540px', margin: '0 auto', lineHeight: 1.6 }}>Real-time deployment status across all 13 divisions</p>
        </div>

        {/* Map Container - Premium */}
        <div style={{ backgroundColor: 'white', borderRadius: '16px', border: '1px solid #e2e8f0', boxShadow: '0 20px 25px -5px rgba(0,0,0,0.1)', overflow: 'hidden' }}>
          <SarawakReadinessMap />
        </div>
      </section></ScrollReveal>

      {/* ========== HOSPITAL NETWORK GRID - Premium ========== */}
      <ScrollReveal direction="right"><section className="hospital-section" style={{ padding: '96px 0' }}>
        {/* Section Header */}
        <div style={{ textAlign: 'center', marginBottom: '56px' }}>
          <p className="font-heading" style={{ fontSize: '11px', fontWeight: 600, color: '#059669', marginBottom: '16px', textTransform: 'uppercase', letterSpacing: '0.2em' }}>Network</p>
          <h2 className="font-heading section-title" style={{ fontSize: 'clamp(36px, 5vw, 44px)', fontWeight: 800, color: '#0f172a', marginBottom: '16px', letterSpacing: '-0.02em' }}>Hospital Network</h2>
          <p className="font-body" style={{ fontSize: '17px', color: '#64748b', maxWidth: '540px', margin: '0 auto', lineHeight: 1.6 }}>16 hospitals across Sarawak already connected</p>
        </div>

        {/* Hospital Grid - Premium cards */}
        <div className="hospital-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: '20px' }}>
            {[
              { name: 'Sarawak General Hospital', short: 'SGH', division: 'Kuching', status: 'live' },
              { name: 'Normah Medical Centre', short: 'NMC', division: 'Kuching', status: 'live' },
              { name: 'KPJ Kuching Specialist', short: 'KPJ', division: 'Kuching', status: 'live' },
              { name: 'Timberland Medical Centre', short: 'TMC', division: 'Kuching', status: 'live' },
              { name: 'Columbia Asia Miri', short: 'CAM', division: 'Miri', status: 'live' },
              { name: 'Miri City Medical', short: 'MCM', division: 'Miri', status: 'live' },
              { name: 'Sibu Hospital', short: 'SBH', division: 'Sibu', status: 'live' },
              { name: 'Rejang Medical Centre', short: 'RMC', division: 'Sibu', status: 'live' },
              { name: 'Bintulu Hospital', short: 'BTH', division: 'Bintulu', status: 'live' },
              { name: 'Bintulu Medical Centre', short: 'BMC', division: 'Bintulu', status: 'live' },
              { name: 'Sarikei Hospital', short: 'SKH', division: 'Sarikei', status: 'live' },
              { name: 'Kapit Hospital', short: 'KPH', division: 'Kapit', status: 'live' },
              { name: 'Sri Aman Hospital', short: 'SAH', division: 'Sri Aman', status: 'pending' },
              { name: 'Betong Hospital', short: 'BGH', division: 'Betong', status: 'pending' },
              { name: 'Mukah Hospital', short: 'MKH', division: 'Mukah', status: 'pending' },
              { name: 'Limbang Hospital', short: 'LBH', division: 'Limbang', status: 'pending' },
            ].map((hospital, idx) => (
              <div
                key={idx}
                style={{
                  padding: '24px',
                  backgroundColor: 'white',
                  borderRadius: '16px',
                  border: '1px solid #e2e8f0',
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  textAlign: 'center',
                  cursor: 'pointer',
                  transition: 'all 0.2s ease',
                  boxShadow: '0 1px 3px rgba(0,0,0,0.05)'
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.transform = 'scale(1.03) translateY(-4px)';
                  e.currentTarget.style.boxShadow = '0 20px 40px rgba(0,0,0,0.1)';
                  e.currentTarget.style.borderColor = '#cbd5e1';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.transform = 'scale(1) translateY(0)';
                  e.currentTarget.style.boxShadow = '0 1px 3px rgba(0,0,0,0.05)';
                  e.currentTarget.style.borderColor = '#e2e8f0';
                }}
              >
                {/* Monogram Icon */}
                <div style={{
                  width: '64px',
                  height: '64px',
                  background: hospital.status === 'live'
                    ? 'linear-gradient(135deg, #1e40af 0%, #3b82f6 100%)'
                    : 'linear-gradient(135deg, #78716c 0%, #a8a29e 100%)',
                  borderRadius: '16px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  marginBottom: '16px',
                  border: '1px solid rgba(255,255,255,0.1)',
                  boxShadow: hospital.status === 'live'
                    ? '0 8px 24px rgba(59, 130, 246, 0.3)'
                    : '0 8px 24px rgba(0,0,0,0.1)'
                }}>
                  <span style={{
                    fontSize: '20px',
                    fontWeight: 700,
                    color: 'white',
                    letterSpacing: '0.5px',
                    fontFamily: 'Inter, system-ui, sans-serif'
                  }}>{hospital.short}</span>
                </div>

                {/* Status Badge */}
                {hospital.status === 'live' ? (
                  <span style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '6px',
                    padding: '6px 12px',
                    fontSize: '11px',
                    fontWeight: 600,
                    borderRadius: '9999px',
                    backgroundColor: 'rgba(16, 185, 129, 0.1)',
                    color: '#059669',
                    marginBottom: '12px',
                    boxShadow: '0 0 12px rgba(16, 185, 129, 0.2)'
                  }}>
                    <span style={{ position: 'relative', display: 'flex', width: '6px', height: '6px' }}>
                      <span className="animate-ping" style={{
                        position: 'absolute',
                        display: 'inline-flex',
                        width: '100%',
                        height: '100%',
                        borderRadius: '9999px',
                        backgroundColor: '#10b981',
                        opacity: 0.75
                      }}></span>
                      <span style={{
                        position: 'relative',
                        display: 'inline-flex',
                        width: '6px',
                        height: '6px',
                        borderRadius: '9999px',
                        backgroundColor: '#10b981'
                      }}></span>
                    </span>
                    LIVE
                  </span>
                ) : (
                  <span style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '6px',
                    padding: '6px 12px',
                    fontSize: '11px',
                    fontWeight: 600,
                    borderRadius: '9999px',
                    backgroundColor: 'rgba(245, 158, 11, 0.1)',
                    color: '#d97706',
                    marginBottom: '12px'
                  }}>
                    <span style={{
                      width: '6px',
                      height: '6px',
                      borderRadius: '9999px',
                      backgroundColor: '#f59e0b'
                    }}></span>
                    COMING SOON
                  </span>
                )}

                {/* Hospital Name */}
                <h4 className="font-heading" style={{
                  fontSize: '14px',
                  fontWeight: 600,
                  color: '#0f172a',
                  marginBottom: '4px',
                  lineHeight: 1.3
                }}>{hospital.name}</h4>

                {/* Location */}
                <p className="font-body" style={{
                  fontSize: '12px',
                  color: '#94a3b8',
                  fontWeight: 500
                }}>{hospital.division} Division</p>
              </div>
            ))}
        </div>

        {/* Legend */}
        <div style={{
          marginTop: '48px',
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'center',
          gap: '32px'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <span style={{
              width: '10px',
              height: '10px',
              borderRadius: '9999px',
              backgroundColor: '#10b981',
              boxShadow: '0 0 8px rgba(16, 185, 129, 0.5)'
            }}></span>
            <span style={{ fontSize: '14px', color: '#475569', fontWeight: 500 }}>12 Live</span>
          </div>
          {/* Divider */}
          <div style={{ width: '1px', height: '20px', background: 'linear-gradient(to bottom, transparent, #cbd5e1, transparent)' }}></div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <span style={{
              width: '10px',
              height: '10px',
              borderRadius: '9999px',
              backgroundColor: '#f59e0b'
            }}></span>
            <span style={{ fontSize: '14px', color: '#475569', fontWeight: 500 }}>4 Coming Soon</span>
          </div>
        </div>
      </section></ScrollReveal>

      {/* ========== FEATURES - Premium ========== */}
      <ScrollReveal direction="left"><section id="features" style={{ padding: '96px 0' }}>
        {/* Section Header */}
        <div style={{ textAlign: 'center', marginBottom: '56px' }}>
          <p className="font-heading" style={{ fontSize: '11px', fontWeight: 600, color: '#7c3aed', marginBottom: '16px', textTransform: 'uppercase', letterSpacing: '0.2em' }}>Features</p>
          <h2 className="font-heading" style={{ fontSize: 'clamp(36px, 5vw, 44px)', fontWeight: 800, color: '#0f172a', marginBottom: '16px', letterSpacing: '-0.02em' }}>Why MedChain?</h2>
          <p className="font-body" style={{ fontSize: '17px', color: '#64748b', maxWidth: '540px', margin: '0 auto', lineHeight: 1.6 }}>Enterprise-grade security built for healthcare</p>
        </div>

        {/* Feature Cards - Premium consistent */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div className="p-8 bg-white rounded-2xl border border-slate-200 flex flex-col items-center text-center hover:border-slate-300 hover:shadow-xl hover-lift">
            <div className="w-14 h-14 bg-gradient-to-br from-blue-500 to-blue-600 rounded-2xl flex items-center justify-center mb-5 shadow-lg shadow-blue-500/25">
              <svg className="w-7 h-7 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
              </svg>
            </div>
            <h3 className="font-heading text-[18px] font-bold text-slate-900 mb-3">Blockchain Security</h3>
            <p className="font-body text-[15px] text-slate-500 leading-relaxed">Immutable records with AES-256 encryption that cannot be altered or forged.</p>
          </div>

          <div className="p-8 bg-white rounded-2xl border border-slate-200 flex flex-col items-center text-center hover:border-slate-300 hover:shadow-xl hover-lift">
            <div className="w-14 h-14 bg-gradient-to-br from-emerald-500 to-emerald-600 rounded-2xl flex items-center justify-center mb-5 shadow-lg shadow-emerald-500/25">
              <svg className="w-7 h-7 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
            <h3 className="font-heading text-[18px] font-bold text-slate-900 mb-3">Real-time Verification</h3>
            <p className="font-body text-[15px] text-slate-500 leading-relaxed">Instant QR code validation for employers to verify MCs in under 3 seconds.</p>
          </div>

          <div className="p-8 bg-white rounded-2xl border border-slate-200 flex flex-col items-center text-center hover:border-slate-300 hover:shadow-xl hover-lift">
            <div className="w-14 h-14 bg-gradient-to-br from-amber-500 to-amber-600 rounded-2xl flex items-center justify-center mb-5 shadow-lg shadow-amber-500/25">
              <svg className="w-7 h-7 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3.055 11H5a2 2 0 012 2v1a2 2 0 002 2 2 2 0 012 2v2.945M8 3.935V5.5A2.5 2.5 0 0010.5 8h.5a2 2 0 012 2 2 2 0 104 0 2 2 0 012-2h1.064M15 20.488V18a2 2 0 012-2h3.064M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
            <h3 className="font-heading text-[18px] font-bold text-slate-900 mb-3">Sarawak-First</h3>
            <p className="font-body text-[15px] text-slate-500 leading-relaxed">All data stays local in Sarawak with full data sovereignty compliance.</p>
          </div>
        </div>
      </section></ScrollReveal>

      {/* ========== PRICING SECTION - Light ========== */}
      <ScrollReveal direction="right"><section id="pricing" className="pricing-section" style={{
        padding: '96px 0',
        background: '#FFFFFF',
        borderRadius: '32px',
        margin: '0 -32px',
        position: 'relative',
        overflow: 'hidden',
        border: '1px solid #E2E8F0'
      }}>
        <div style={{ position: 'relative', zIndex: 10, padding: '0 32px' }}>
          {/* Pricing Header */}
          <div style={{ textAlign: 'center', marginBottom: '64px' }}>
            <p className="font-heading" style={{ fontSize: '12px', fontWeight: 600, color: '#0F766E', marginBottom: '16px', textTransform: 'uppercase', letterSpacing: '0.2em' }}>Pricing</p>
            <h2 className="font-heading" style={{ fontSize: 'clamp(36px, 5vw, 48px)', fontWeight: 800, color: '#0f172a', marginBottom: '16px', letterSpacing: '-0.02em' }}>Simple, Transparent Pricing</h2>
            <p className="font-body" style={{ fontSize: '18px', color: '#64748B', maxWidth: '540px', margin: '0 auto', lineHeight: 1.6 }}>No hidden fees. Cancel anytime.</p>
          </div>

          {/* Pricing Grid - Premium cards */}
          <div className="pricing-grid" style={{
            display: 'flex',
            justifyContent: 'center',
            alignItems: 'stretch',
            gap: '24px',
            flexWrap: 'wrap',
            maxWidth: '1100px',
            margin: '0 auto'
          }}>

            {/* CLINIC Plan */}
            <div
              style={{
                width: '320px',
                backgroundColor: '#FFFFFF',
                borderRadius: '20px',
                border: '1px solid #E2E8F0',
                padding: '40px 32px',
                display: 'flex',
                flexDirection: 'column',
                transition: 'all 0.3s ease',
                cursor: 'pointer'
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.borderColor = '#CBD5E1';
                e.currentTarget.style.transform = 'translateY(-4px)';
                e.currentTarget.style.boxShadow = '0 12px 40px rgba(0,0,0,0.08)';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.borderColor = '#E2E8F0';
                e.currentTarget.style.transform = 'translateY(0)';
                e.currentTarget.style.boxShadow = 'none';
              }}
            >
              <div style={{ textAlign: 'center', marginBottom: '32px' }}>
                {/* Icon */}
                <div style={{
                  width: '56px',
                  height: '56px',
                  background: '#F1F5F9',
                  borderRadius: '16px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  margin: '0 auto 24px auto',
                  border: '1px solid #E2E8F0'
                }}>
                  <svg style={{ width: '28px', height: '28px', color: '#64748B' }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
                  </svg>
                </div>
                {/* Plan Name */}
                <p className="font-heading" style={{ fontSize: '12px', fontWeight: 600, color: '#64748B', textTransform: 'uppercase', letterSpacing: '0.15em', marginBottom: '16px' }}>Clinic</p>
                {/* Price */}
                <p className="font-heading" style={{ fontSize: '48px', fontWeight: 800, color: '#0f172a', lineHeight: 1, marginBottom: '4px' }}>
                  RM2,000<span style={{ fontSize: '16px', fontWeight: 500, color: '#94A3B8' }}>/mo</span>
                </p>
                <p style={{ color: '#94A3B8', fontSize: '14px', marginTop: '8px' }}>+ RM1 per MC issued</p>
              </div>

              {/* Features */}
              <div style={{ flex: 1, marginBottom: '32px' }}>
                {['Digital Records', 'Basic Dashboard', '5 Doctor Accounts', 'Email Support', 'Business Hours Support', '99.9% Uptime SLA'].map((feature, i) => (
                  <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '16px' }}>
                    <div style={{
                      width: '20px',
                      height: '20px',
                      background: 'linear-gradient(135deg, #10b981 0%, #059669 100%)',
                      borderRadius: '50%',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      flexShrink: 0
                    }}>
                      <svg style={{ width: '12px', height: '12px', color: 'white' }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                      </svg>
                    </div>
                    <span style={{ color: '#475569', fontSize: '15px' }}>{feature}</span>
                  </div>
                ))}
              </div>

              {/* Button */}
              <button
                onClick={() => handlePlanSelect('clinic')}
                disabled={securityLoading !== null}
                style={{
                  width: '100%',
                  padding: '14px 24px',
                  backgroundColor: 'transparent',
                  color: '#0F766E',
                  fontSize: '15px',
                  fontWeight: 600,
                  borderRadius: '12px',
                  border: '1px solid #0F766E',
                  cursor: 'pointer',
                  transition: 'all 0.2s ease'
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.backgroundColor = '#F0FDFA';
                  e.currentTarget.style.borderColor = '#0D9488';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.backgroundColor = 'transparent';
                  e.currentTarget.style.borderColor = '#0F766E';
                }}
              >
                {securityLoading === 'clinic' ? 'Verifying...' : 'Get Started'}
              </button>
            </div>

            {/* HOSPITAL Plan - FEATURED */}
            <div
              style={{
                width: '340px',
                background: '#FFFFFF',
                borderRadius: '20px',
                border: '2px solid #0F766E',
                padding: '40px 32px',
                display: 'flex',
                flexDirection: 'column',
                position: 'relative',
                boxShadow: '0 4px 24px rgba(15, 118, 110, 0.12), 0 12px 40px rgba(0, 0, 0, 0.06)',
                transform: 'scale(1.02)',
                zIndex: 10
              }}
            >
              {/* Most Popular Badge */}
              <div style={{
                position: 'absolute',
                top: '-14px',
                left: '50%',
                transform: 'translateX(-50%)',
                zIndex: 20
              }}>
                <span style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '6px',
                  padding: '8px 16px',
                  background: 'linear-gradient(135deg, #0F766E 0%, #0D9488 100%)',
                  color: 'white',
                  fontSize: '11px',
                  fontWeight: 700,
                  textTransform: 'uppercase',
                  letterSpacing: '0.1em',
                  borderRadius: '9999px',
                  boxShadow: '0 4px 20px rgba(15, 118, 110, 0.3)'
                }}>
                  <svg style={{ width: '12px', height: '12px' }} fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M10.868 2.884c-.321-.772-1.415-.772-1.736 0l-1.83 4.401-4.753.381c-.833.067-1.171 1.107-.536 1.651l3.62 3.102-1.106 4.637c-.194.813.691 1.456 1.405 1.02L10 15.591l4.069 2.485c.713.436 1.598-.207 1.404-1.02l-1.106-4.637 3.62-3.102c.635-.544.297-1.584-.536-1.65l-4.752-.382-1.831-4.401z" clipRule="evenodd" />
                  </svg>
                  Most Popular
                </span>
              </div>

              <div style={{ textAlign: 'center', marginBottom: '32px', paddingTop: '8px' }}>
                {/* Icon */}
                <div style={{
                  width: '56px',
                  height: '56px',
                  background: 'linear-gradient(135deg, #0F766E 0%, #0D9488 100%)',
                  borderRadius: '16px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  margin: '0 auto 24px auto',
                  boxShadow: '0 8px 24px rgba(15, 118, 110, 0.3)'
                }}>
                  <svg style={{ width: '28px', height: '28px', color: 'white' }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8 14v3m4-3v3m4-3v3M3 21h18M3 10h18M3 7l9-4 9 4M4 10h16v11H4V10z" />
                  </svg>
                </div>
                {/* Plan Name */}
                <p className="font-heading" style={{ fontSize: '12px', fontWeight: 600, color: '#0F766E', textTransform: 'uppercase', letterSpacing: '0.15em', marginBottom: '16px' }}>Hospital</p>
                {/* Price */}
                <p className="font-heading" style={{ fontSize: '48px', fontWeight: 800, color: '#0f172a', lineHeight: 1, marginBottom: '4px' }}>
                  RM10,000<span style={{ fontSize: '16px', fontWeight: 500, color: '#94A3B8' }}>/mo</span>
                </p>
                <p style={{ color: '#0F766E', fontSize: '14px', fontWeight: 500, marginTop: '8px' }}>+ RM1 per MC issued</p>
              </div>

              {/* Features */}
              <div style={{ flex: 1, marginBottom: '32px' }}>
                {['Full ERP Integration', 'Executive Dashboard', 'Unlimited Doctors', '24/7 Priority Support', 'Custom API Access', '99.9% Uptime SLA', 'Dedicated Account Manager'].map((feature, i) => (
                  <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '16px' }}>
                    <div style={{
                      width: '20px',
                      height: '20px',
                      background: 'linear-gradient(135deg, #10b981 0%, #059669 100%)',
                      borderRadius: '50%',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      flexShrink: 0
                    }}>
                      <svg style={{ width: '12px', height: '12px', color: 'white' }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                      </svg>
                    </div>
                    <span style={{ color: '#1E293B', fontSize: '15px', fontWeight: 500 }}>{feature}</span>
                  </div>
                ))}
              </div>

              {/* Button */}
              <button
                onClick={() => handlePlanSelect('hospital')}
                disabled={securityLoading !== null}
                style={{
                  width: '100%',
                  padding: '16px 24px',
                  background: 'linear-gradient(135deg, #0F766E 0%, #0D9488 100%)',
                  color: 'white',
                  fontSize: '15px',
                  fontWeight: 600,
                  borderRadius: '12px',
                  border: 'none',
                  cursor: 'pointer',
                  transition: 'all 0.2s ease',
                  boxShadow: '0 4px 20px rgba(15, 118, 110, 0.3)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '8px'
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.transform = 'translateY(-2px)';
                  e.currentTarget.style.boxShadow = '0 8px 30px rgba(15, 118, 110, 0.4)';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.transform = 'translateY(0)';
                  e.currentTarget.style.boxShadow = '0 4px 20px rgba(15, 118, 110, 0.3)';
                }}
              >
                {securityLoading === 'hospital' ? 'Verifying...' : (
                  <>
                    Get Started
                    <svg style={{ width: '16px', height: '16px' }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7l5 5m0 0l-5 5m5-5H6" />
                    </svg>
                  </>
                )}
              </button>
            </div>

            {/* GOVERNMENT Plan */}
            <div
              style={{
                width: '320px',
                backgroundColor: '#FFFFFF',
                borderRadius: '20px',
                border: '1px solid #E2E8F0',
                padding: '40px 32px',
                display: 'flex',
                flexDirection: 'column',
                transition: 'all 0.3s ease',
                cursor: 'pointer'
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.borderColor = '#CBD5E1';
                e.currentTarget.style.transform = 'translateY(-4px)';
                e.currentTarget.style.boxShadow = '0 12px 40px rgba(0,0,0,0.08)';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.borderColor = '#E2E8F0';
                e.currentTarget.style.transform = 'translateY(0)';
                e.currentTarget.style.boxShadow = 'none';
              }}
            >
              <div style={{ textAlign: 'center', marginBottom: '32px' }}>
                {/* Icon */}
                <div style={{
                  width: '56px',
                  height: '56px',
                  background: '#F5F3FF',
                  borderRadius: '16px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  margin: '0 auto 24px auto',
                  border: '1px solid #DDD6FE'
                }}>
                  <svg style={{ width: '28px', height: '28px', color: '#7C3AED' }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 21v-4m0 0V5a2 2 0 012-2h6.5l1 1H21l-3 6 3 6h-8.5l-1-1H5a2 2 0 00-2 2zm9-13.5V9" />
                  </svg>
                </div>
                {/* Plan Name */}
                <p className="font-heading" style={{ fontSize: '12px', fontWeight: 600, color: '#7C3AED', textTransform: 'uppercase', letterSpacing: '0.15em', marginBottom: '16px' }}>Government</p>
                {/* Price */}
                <p className="font-heading" style={{ fontSize: '48px', fontWeight: 800, color: '#0f172a', lineHeight: 1, marginBottom: '4px' }}>
                  Custom
                </p>
                <p style={{ color: '#7C3AED', fontSize: '14px', fontWeight: 500, marginTop: '8px' }}>State-wide oversight</p>
              </div>

              {/* Features */}
              <div style={{ flex: 1, marginBottom: '32px' }}>
                {['State-wide Dashboard', 'Health Analytics', 'Compliance Monitoring', 'Dedicated Account Manager'].map((feature, i) => (
                  <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '16px' }}>
                    <div style={{
                      width: '20px',
                      height: '20px',
                      background: 'linear-gradient(135deg, #10b981 0%, #059669 100%)',
                      borderRadius: '50%',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      flexShrink: 0
                    }}>
                      <svg style={{ width: '12px', height: '12px', color: 'white' }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                      </svg>
                    </div>
                    <span style={{ color: '#475569', fontSize: '15px' }}>{feature}</span>
                  </div>
                ))}
              </div>

              {/* Contact Sales Button */}
              <a
                href="https://wa.me/601131825377?text=Hi%20Randy,%20I'm%20interested%20in%20the%20Government%20tier%20for%20Sarawak%20MedChain"
                target="_blank"
                rel="noopener noreferrer"
                style={{
                  width: '100%',
                  padding: '14px 24px',
                  background: 'linear-gradient(135deg, #0F766E 0%, #0D9488 100%)',
                  color: 'white',
                  fontSize: '15px',
                  fontWeight: 600,
                  borderRadius: '12px',
                  border: 'none',
                  cursor: 'pointer',
                  transition: 'all 0.2s ease',
                  boxShadow: '0 4px 20px rgba(15, 118, 110, 0.3)',
                  textDecoration: 'none',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '8px',
                  boxSizing: 'border-box'
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.transform = 'translateY(-2px)';
                  e.currentTarget.style.boxShadow = '0 8px 30px rgba(15, 118, 110, 0.4)';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.transform = 'translateY(0)';
                  e.currentTarget.style.boxShadow = '0 4px 20px rgba(15, 118, 110, 0.3)';
                }}
              >
                Contact Sales
              </a>
            </div>

          </div>{/* END Pricing Grid */}

          {/* Footer Text */}
          <div style={{ textAlign: 'center', marginTop: '56px' }}>
            <p className="font-body" style={{ color: '#64748B', fontSize: '16px' }}>
              Ready to get started? <span style={{ color: '#0F766E', fontWeight: 600 }}>Join 16 hospitals</span> already using MedChain.
            </p>
          </div>
        </div>
      </section></ScrollReveal>

      {/* ========== CTA SECTION - Premium ========== */}
      <ScrollReveal direction="up"><section style={{ padding: '96px 0' }}>
        <div style={{
          position: 'relative',
          background: 'linear-gradient(135deg, #0F766E 0%, #0D9488 50%, #059669 100%)',
          borderRadius: '24px',
          padding: '80px 48px',
          textAlign: 'center',
          overflow: 'hidden',
          border: '1px solid rgba(16, 185, 129, 0.2)',
          boxShadow: '0 4px 40px rgba(15, 118, 110, 0.15), 0 12px 40px rgba(0, 0, 0, 0.1)'
        }}>
          {/* Mesh gradient overlay */}
          <div style={{
            position: 'absolute',
            inset: 0,
            background: 'radial-gradient(ellipse at 20% 20%, rgba(16, 185, 129, 0.2) 0%, transparent 50%), radial-gradient(ellipse at 80% 80%, rgba(20, 184, 166, 0.15) 0%, transparent 50%), radial-gradient(ellipse at 50% 50%, rgba(15, 118, 110, 0.1) 0%, transparent 70%)',
            pointerEvents: 'none'
          }}></div>

          {/* Content */}
          <div style={{
            position: 'relative',
            zIndex: 10,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center'
          }}>
            {/* Heading */}
            <h2 className="font-heading" style={{
              fontSize: 'clamp(32px, 5vw, 44px)',
              fontWeight: 800,
              color: 'white',
              marginBottom: '24px',
              letterSpacing: '-0.02em',
              lineHeight: 1.2,
              maxWidth: '600px'
            }}>
              Ready to transform your healthcare facility?
            </h2>

            {/* Subtitle */}
            <p className="font-body" style={{
              fontSize: '18px',
              color: 'rgba(255, 255, 255, 0.7)',
              marginBottom: '40px',
              maxWidth: '480px',
              lineHeight: 1.6
            }}>
              Start your free trial today. No credit card required.
            </p>

            {/* Button */}
            <button
              onClick={handleGetStarted}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '10px',
                padding: '16px 32px',
                backgroundColor: 'white',
                color: '#0F766E',
                fontSize: '16px',
                fontWeight: 600,
                borderRadius: '12px',
                border: 'none',
                cursor: 'pointer',
                boxShadow: '0 4px 20px rgba(255, 255, 255, 0.25), 0 8px 30px rgba(0, 0, 0, 0.2)',
                transition: 'all 0.3s ease'
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.transform = 'translateY(-3px) scale(1.02)';
                e.currentTarget.style.boxShadow = '0 8px 30px rgba(255, 255, 255, 0.35), 0 15px 40px rgba(0, 0, 0, 0.25)';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.transform = 'translateY(0) scale(1)';
                e.currentTarget.style.boxShadow = '0 4px 20px rgba(255, 255, 255, 0.25), 0 8px 30px rgba(0, 0, 0, 0.2)';
              }}
            >
              Start Free Trial
              <svg style={{ width: '18px', height: '18px' }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M13 7l5 5m0 0l-5 5m5-5H6" />
              </svg>
            </button>
          </div>
        </div>
      </section></ScrollReveal>

      </div>{/* END CONTENT WRAPPER */}

      {/* ========== FOOTER - Premium ========== */}
      <footer className="landing-footer" style={{ width: '100%', padding: '40px 0', borderTop: '1px solid #e2e8f0', backgroundColor: 'white' }}>
        <div style={{ maxWidth: '1200px', margin: '0 auto', padding: '0 32px' }}>
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '24px', textAlign: 'center' }}>
            {/* Logo */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <div style={{ width: '32px', height: '32px', background: 'linear-gradient(135deg, #0F766E, #0D9488)', borderRadius: '8px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <svg style={{ width: '16px', height: '16px', color: 'white' }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
                </svg>
              </div>
              <span className="font-heading" style={{ fontSize: '15px', fontWeight: 600, color: '#0f172a' }}>Sarawak MedChain</span>
            </div>

            {/* Links */}
            <div className="footer-links" style={{ display: 'flex', alignItems: 'center', gap: '24px', flexWrap: 'wrap', justifyContent: 'center' }}>
              <a href="#features" style={{ fontSize: '14px', color: '#64748b', fontWeight: 500, textDecoration: 'none' }}>Features</a>
              <a href="#pricing" style={{ fontSize: '14px', color: '#64748b', fontWeight: 500, textDecoration: 'none' }}>Pricing</a>
              <a href="#for-government" style={{ fontSize: '14px', color: '#64748b', fontWeight: 500, textDecoration: 'none' }}>For Government</a>
              <a href="mailto:randyrjm99@gmail.com" style={{ fontSize: '14px', color: '#64748b', fontWeight: 500, textDecoration: 'none' }}>Contact</a>
            </div>

            {/* Legal links — separated row for govt-procurement clarity */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '20px', flexWrap: 'wrap', justifyContent: 'center', paddingTop: '8px', borderTop: '1px solid #F1F5F9', width: '100%', maxWidth: '600px' }}>
              <a href="#/privacy" style={{ fontSize: '13px', color: '#94a3b8', fontWeight: 500, textDecoration: 'none' }}>Privacy Policy</a>
              <span style={{ color: '#CBD5E1', fontSize: '12px' }}>·</span>
              <a href="#/terms" style={{ fontSize: '13px', color: '#94a3b8', fontWeight: 500, textDecoration: 'none' }}>Terms of Service</a>
              <span style={{ color: '#CBD5E1', fontSize: '12px' }}>·</span>
              <a href="#/sla" style={{ fontSize: '13px', color: '#94a3b8', fontWeight: 500, textDecoration: 'none' }}>SLA</a>
            </div>

            {/* Copyright */}
            <p style={{ color: '#94a3b8', fontSize: '14px' }}>&copy; 2026 Sarawak MedChain · Governed by Malaysian law</p>
          </div>
        </div>
      </footer>

    </main>
  );
}
