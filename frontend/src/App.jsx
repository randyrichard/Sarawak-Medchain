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
      <div className="app">
        <nav className="navbar">
          <h1>Sarawak MedChain</h1>
          <div className="nav-links">
            <Link to="/patient">Patient Portal</Link>
            <Link to="/doctor">Doctor Portal</Link>
            <Link to="/admin">Admin Portal</Link>
            <Link to="/ceo">CEO Dashboard</Link>
          </div>
          <div className="wallet-info">
            <span>{walletAddress.slice(0, 6)}...{walletAddress.slice(-4)}</span>
            <button onClick={handleDisconnect} className="disconnect-btn">
              Disconnect
            </button>
          </div>
        </nav>

        <div className="main-content">
          <Routes>
            <Route path="/" element={<Navigate to="/patient" replace />} />
            <Route path="/patient" element={<PatientPortal walletAddress={walletAddress} />} />
            <Route path="/doctor" element={<DoctorPortal walletAddress={walletAddress} />} />
            <Route path="/admin" element={<AdminPortal walletAddress={walletAddress} />} />
            <Route path="/ceo" element={<CEODashboard walletAddress={walletAddress} />} />
          </Routes>
        </div>
      </div>
    </BrowserRouter>
  );
}

export default App;
