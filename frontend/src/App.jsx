import { useState, useEffect } from 'react';
import { BrowserRouter, Routes, Route, Link, Navigate } from 'react-router-dom';
import { connectWallet } from './utils/contract';
import PatientPortal from './pages/PatientPortal';
import DoctorPortal from './pages/DoctorPortal';
import AdminPortal from './pages/AdminPortal';
import CEODashboard from './pages/CEODashboard';
import './App.css';

function App() {
  const [walletAddress, setWalletAddress] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleConnectWallet = async () => {
    try {
      setLoading(true);
      setError('');
      const { address } = await connectWallet();
      setWalletAddress(address);
    } catch (err) {
      console.error('Wallet connection error:', err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleDisconnect = () => {
    setWalletAddress(null);
    setError('');
    // Reload page to fully reset state
    window.location.reload();
  };

  // Auto-connect if already connected
  useEffect(() => {
    if (window.ethereum) {
      window.ethereum.request({ method: 'eth_accounts' })
        .then(accounts => {
          if (accounts.length > 0) {
            handleConnectWallet();
          }
        });
    }
  }, []);

  if (!walletAddress) {
    return (
      <div className="connect-container">
        <div className="connect-card">
          <h1>Sarawak MedChain MVP</h1>
          <p>Patient-Controlled Medical Records</p>

          {error && <div className="message error">{error}</div>}

          <button onClick={handleConnectWallet} disabled={loading}>
            {loading ? 'Connecting...' : 'Connect MetaMask Wallet'}
          </button>

          <div className="info-box">
            <h3>What is this?</h3>
            <p>This MVP demonstrates:</p>
            <ul>
              <li>Only verified doctors can write medical records</li>
              <li>Patients explicitly control who can read their records</li>
              <li>Access revocation is enforced by code</li>
              <li>Every action is auditable on the blockchain</li>
            </ul>
          </div>
        </div>
      </div>
    );
  }

  return (
    <BrowserRouter>
      <div className="flex h-screen w-full overflow-hidden">
        {/* Fixed Sidebar */}
        <aside className="w-72 h-full bg-slate-900 text-white flex flex-col flex-shrink-0">
          {/* Logo & Title */}
          <div className="p-6 border-b border-slate-800">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-sarawak-red-500 rounded-lg flex items-center justify-center">
                <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
                </svg>
              </div>
              <div>
                <h1 className="text-lg font-bold text-white">Sarawak</h1>
                <p className="text-xs text-sarawak-yellow-500 font-semibold">MedChain</p>
              </div>
            </div>
          </div>

          {/* Navigation Links */}
          <nav className="flex-1 p-4">
            <ul className="space-y-1">
              <li>
                <Link to="/patient" className="flex items-center gap-3 px-4 py-3 rounded-lg hover:bg-slate-800 transition-colors group">
                  <svg className="w-5 h-5 text-slate-400 group-hover:text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                  </svg>
                  <span className="text-slate-300 group-hover:text-white">Patient Portal</span>
                </Link>
              </li>
              <li>
                <Link to="/doctor" className="flex items-center gap-3 px-4 py-3 rounded-lg hover:bg-slate-800 transition-colors group">
                  <svg className="w-5 h-5 text-slate-400 group-hover:text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5.121 17.804A13.937 13.937 0 0112 16c2.5 0 4.847.655 6.879 1.804M15 10a3 3 0 11-6 0 3 3 0 016 0zm6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  <span className="text-slate-300 group-hover:text-white">Doctor Portal</span>
                </Link>
              </li>
              <li>
                <Link to="/admin" className="flex items-center gap-3 px-4 py-3 rounded-lg hover:bg-slate-800 transition-colors group">
                  <svg className="w-5 h-5 text-slate-400 group-hover:text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                  </svg>
                  <span className="text-slate-300 group-hover:text-white">Admin Portal</span>
                </Link>
              </li>
              <li>
                <Link to="/ceo" className="flex items-center gap-3 px-4 py-3 rounded-lg hover:bg-slate-800 transition-colors group">
                  <svg className="w-5 h-5 text-slate-400 group-hover:text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                  </svg>
                  <span className="text-slate-300 group-hover:text-white">CEO Dashboard</span>
                </Link>
              </li>
            </ul>
          </nav>

          {/* Verified Badge */}
          <div className="p-4 border-t border-slate-800">
            <div className="bg-gradient-to-r from-blue-600 to-blue-700 rounded-xl p-4">
              <div className="flex items-center gap-3 mb-2">
                <div className="w-8 h-8 bg-white/20 rounded-full flex items-center justify-center flex-shrink-0">
                  <svg className="w-5 h-5 text-white" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M6.267 3.455a3.066 3.066 0 001.745-.723 3.066 3.066 0 013.976 0 3.066 3.066 0 001.745.723 3.066 3.066 0 012.812 2.812c.051.643.304 1.254.723 1.745a3.066 3.066 0 010 3.976 3.066 3.066 0 00-.723 1.745 3.066 3.066 0 01-2.812 2.812 3.066 3.066 0 00-1.745.723 3.066 3.066 0 01-3.976 0 3.066 3.066 0 00-1.745-.723 3.066 3.066 0 01-2.812-2.812 3.066 3.066 0 00-.723-1.745 3.066 3.066 0 010-3.976 3.066 3.066 0 00.723-1.745 3.066 3.066 0 012.812-2.812zm7.44 5.252a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                  </svg>
                </div>
                <div>
                  <p className="text-xs text-blue-200 font-medium uppercase tracking-wide">Verified by</p>
                  <p className="text-sm font-bold text-white">Sarawak MedChain</p>
                </div>
              </div>
              <p className="text-xs text-blue-200/70">Blockchain-secured medical records</p>
            </div>
          </div>

          {/* Wallet Info */}
          <div className="p-4 border-t border-slate-800">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="w-2 h-2 bg-emerald-400 rounded-full animate-pulse"></div>
                <span className="text-xs text-slate-400 font-mono">{walletAddress.slice(0, 6)}...{walletAddress.slice(-4)}</span>
              </div>
              <button
                onClick={handleDisconnect}
                className="text-xs text-slate-400 hover:text-red-400 transition-colors"
              >
                Disconnect
              </button>
            </div>
          </div>
        </aside>

        {/* Main Content - Fluid, Scrolls Independently, Edge-to-Edge */}
        <main className="flex-1 flex flex-col w-full overflow-y-auto bg-slate-100">
          <Routes>
            <Route path="/" element={<Navigate to="/patient" replace />} />
            <Route path="/patient" element={<PatientPortal walletAddress={walletAddress} />} />
            <Route path="/doctor" element={<DoctorPortal walletAddress={walletAddress} />} />
            <Route path="/admin" element={<AdminPortal walletAddress={walletAddress} />} />
            <Route path="/ceo" element={<CEODashboard walletAddress={walletAddress} />} />
          </Routes>
        </main>
      </div>
    </BrowserRouter>
  );
}

export default App;
