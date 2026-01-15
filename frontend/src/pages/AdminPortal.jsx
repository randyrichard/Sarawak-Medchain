import { useState, useEffect } from 'react';
import {
  getAllHospitalBalances,
  getBillingContract,
  getAdmin,
  getPendingAdmin,
  proposeAdmin,
  acceptAdmin,
  cancelAdminTransfer,
  addVerifiedDoctor,
  removeVerifiedDoctor,
  isVerifiedDoctor
} from '../utils/contract';

export default function AdminPortal({ walletAddress }) {
  const [totalMCs, setTotalMCs] = useState(0);
  const [activeDoctors, setActiveDoctors] = useState(0);
  const [totalCredits, setTotalCredits] = useState(0);
  const [totalOwed, setTotalOwed] = useState(0);
  const [hospitalBalances, setHospitalBalances] = useState([]);
  const [loading, setLoading] = useState(true);

  // Admin state
  const [currentAdmin, setCurrentAdmin] = useState('');
  const [pendingAdminAddr, setPendingAdminAddr] = useState('');
  const [isAdmin, setIsAdmin] = useState(false);
  const [isPendingAdmin, setIsPendingAdmin] = useState(false);

  // Form state
  const [newAdminAddress, setNewAdminAddress] = useState('');
  const [newDoctorAddress, setNewDoctorAddress] = useState('');
  const [removeDoctorAddress, setRemoveDoctorAddress] = useState('');
  const [message, setMessage] = useState('');
  const [actionLoading, setActionLoading] = useState(false);

  useEffect(() => {
    fetchData();
  }, [walletAddress]);

  const fetchData = async () => {
    try {
      setLoading(true);
      const billing = getBillingContract();

      // Get total MCs
      const mcCount = await billing.getMCCount();
      setTotalMCs(Number(mcCount));

      // Get all hospital balances
      const balances = await getAllHospitalBalances();
      setHospitalBalances(balances);
      setActiveDoctors(balances.length);

      // Calculate totals
      let credits = 0;
      let owed = 0;
      balances.forEach(b => {
        if (b.balance >= 0) {
          credits += b.balance;
        } else {
          owed += Math.abs(b.balance);
        }
      });
      setTotalCredits(credits);
      setTotalOwed(owed);

      // Get admin info
      const admin = await getAdmin();
      const pending = await getPendingAdmin();
      setCurrentAdmin(admin);
      setPendingAdminAddr(pending);
      setIsAdmin(admin.toLowerCase() === walletAddress.toLowerCase());
      setIsPendingAdmin(pending.toLowerCase() === walletAddress.toLowerCase() && pending !== '0x0000000000000000000000000000000000000000');

    } catch (error) {
      console.error('Error fetching admin data:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleProposeAdmin = async () => {
    if (!newAdminAddress) {
      setMessage('Error: Please enter new admin address');
      return;
    }
    try {
      setActionLoading(true);
      setMessage('Proposing new admin...');
      await proposeAdmin(newAdminAddress);
      setMessage('New admin proposed successfully! They must call acceptAdmin() to complete transfer.');
      setNewAdminAddress('');
      await fetchData();
    } catch (error) {
      setMessage(`Error: ${error.message}`);
    } finally {
      setActionLoading(false);
    }
  };

  const handleAcceptAdmin = async () => {
    try {
      setActionLoading(true);
      setMessage('Accepting admin role...');
      await acceptAdmin();
      setMessage('You are now the admin!');
      await fetchData();
    } catch (error) {
      setMessage(`Error: ${error.message}`);
    } finally {
      setActionLoading(false);
    }
  };

  const handleCancelTransfer = async () => {
    try {
      setActionLoading(true);
      setMessage('Cancelling admin transfer...');
      await cancelAdminTransfer();
      setMessage('Admin transfer cancelled.');
      await fetchData();
    } catch (error) {
      setMessage(`Error: ${error.message}`);
    } finally {
      setActionLoading(false);
    }
  };

  const handleAddDoctor = async () => {
    if (!newDoctorAddress) {
      setMessage('Error: Please enter doctor address');
      return;
    }
    try {
      setActionLoading(true);
      setMessage('Adding verified doctor...');
      await addVerifiedDoctor(newDoctorAddress);
      setMessage('Doctor verified successfully!');
      setNewDoctorAddress('');
      await fetchData();
    } catch (error) {
      setMessage(`Error: ${error.message}`);
    } finally {
      setActionLoading(false);
    }
  };

  const handleRemoveDoctor = async () => {
    if (!removeDoctorAddress) {
      setMessage('Error: Please enter doctor address');
      return;
    }
    try {
      setActionLoading(true);
      setMessage('Removing doctor...');
      await removeVerifiedDoctor(removeDoctorAddress);
      setMessage('Doctor removed successfully!');
      setRemoveDoctorAddress('');
      await fetchData();
    } catch (error) {
      setMessage(`Error: ${error.message}`);
    } finally {
      setActionLoading(false);
    }
  };

  const formatAddress = (addr) => {
    if (!addr || addr === '0x0000000000000000000000000000000000000000') return 'None';
    return `${addr.slice(0, 6)}...${addr.slice(-4)}`;
  };

  return (
    <div className="flex-1 flex-grow w-full min-h-full bg-slate-900 px-12 py-10 font-sans">
        {/* Header - Full Width Enterprise Style */}
        <div className="mb-8 flex flex-col lg:flex-row lg:items-center justify-start gap-x-4 gap-y-2">
          <div className="flex items-center gap-x-4">
            <h1 className="text-3xl lg:text-4xl font-bold text-white">Hospital Admin Portal</h1>
            <span className={`flex px-3 py-1 rounded-full text-sm font-medium ${
              isAdmin
                ? 'bg-emerald-500/20 text-emerald-400'
                : isPendingAdmin
                  ? 'bg-yellow-500/20 text-yellow-400'
                  : 'bg-slate-500/20 text-slate-400'
            }`}>
              {isAdmin ? 'You are Admin' : isPendingAdmin ? 'Pending Admin' : 'Not Admin'}
            </span>
          </div>
          <p className="text-slate-400 lg:ml-auto">Sarawak MedChain Billing Dashboard</p>
        </div>

        {/* Message */}
        {message && (
          <div className={`mb-6 p-4 rounded-xl ${
            message.includes('Error')
              ? 'bg-red-500/10 border border-red-500/30 text-red-400'
              : 'bg-emerald-500/10 border border-emerald-500/30 text-emerald-400'
          }`}>
            {message}
          </div>
        )}

        {/* Admin Management Section - 12 Column Grid */}
        <div className="grid grid-cols-12 gap-10 w-full mb-8">
          {/* Admin Transfer Card */}
          <div className="col-span-12 lg:col-span-4 bg-slate-800/50 backdrop-blur-sm rounded-2xl border border-slate-700/50 p-6">
            <h2 className="text-xl font-semibold text-white mb-4">Admin Transfer</h2>
            <div className="space-y-4">
              <div>
                <p className="text-slate-400 text-sm mb-1">Current Admin</p>
                <code className="text-emerald-400 bg-slate-700/50 px-3 py-2 rounded block text-sm">
                  {formatAddress(currentAdmin)}
                </code>
              </div>
              <div>
                <p className="text-slate-400 text-sm mb-1">Pending Admin</p>
                <code className="text-yellow-400 bg-slate-700/50 px-3 py-2 rounded block text-sm">
                  {formatAddress(pendingAdminAddr)}
                </code>
              </div>

              {isAdmin && (
                <div className="pt-4 border-t border-slate-700">
                  <label className="text-slate-300 text-sm mb-2 block">Propose New Admin</label>
                  <input
                    type="text"
                    placeholder="0x..."
                    value={newAdminAddress}
                    onChange={(e) => setNewAdminAddress(e.target.value)}
                    className="w-full bg-slate-700/50 border border-slate-600 rounded-lg px-4 py-2 text-white placeholder-slate-500 mb-3"
                  />
                  <div className="flex gap-2">
                    <button
                      onClick={handleProposeAdmin}
                      disabled={actionLoading}
                      className="flex-1 bg-blue-600 hover:bg-blue-700 disabled:bg-slate-600 text-white px-4 py-2 rounded-lg font-medium transition-colors"
                    >
                      {actionLoading ? 'Processing...' : 'Propose Admin'}
                    </button>
                    {pendingAdminAddr !== '0x0000000000000000000000000000000000000000' && (
                      <button
                        onClick={handleCancelTransfer}
                        disabled={actionLoading}
                        className="bg-red-600 hover:bg-red-700 disabled:bg-slate-600 text-white px-4 py-2 rounded-lg font-medium transition-colors"
                      >
                        Cancel
                      </button>
                    )}
                  </div>
                </div>
              )}

              {isPendingAdmin && (
                <div className="pt-4 border-t border-slate-700">
                  <p className="text-yellow-400 text-sm mb-3">You have been proposed as the new admin!</p>
                  <button
                    onClick={handleAcceptAdmin}
                    disabled={actionLoading}
                    className="w-full bg-emerald-600 hover:bg-emerald-700 disabled:bg-slate-600 text-white px-4 py-2 rounded-lg font-medium transition-colors"
                  >
                    {actionLoading ? 'Processing...' : 'Accept Admin Role'}
                  </button>
                </div>
              )}
            </div>
          </div>

          {/* Doctor Management Card */}
          <div className="col-span-12 lg:col-span-8 bg-slate-800/50 backdrop-blur-sm rounded-2xl border border-slate-700/50 p-6">
            <h2 className="text-xl font-semibold text-white mb-4">Doctor Management</h2>

            {isAdmin ? (
              <div className="space-y-6">
                {/* Add Doctor */}
                <div>
                  <label className="text-slate-300 text-sm mb-2 block">Add Verified Doctor</label>
                  <input
                    type="text"
                    placeholder="0x..."
                    value={newDoctorAddress}
                    onChange={(e) => setNewDoctorAddress(e.target.value)}
                    className="w-full bg-slate-700/50 border border-slate-600 rounded-lg px-4 py-2 text-white placeholder-slate-500 mb-3"
                  />
                  <button
                    onClick={handleAddDoctor}
                    disabled={actionLoading}
                    className="w-full bg-emerald-600 hover:bg-emerald-700 disabled:bg-slate-600 text-white px-4 py-2 rounded-lg font-medium transition-colors"
                  >
                    {actionLoading ? 'Processing...' : 'Verify Doctor'}
                  </button>
                </div>

                {/* Remove Doctor */}
                <div className="pt-4 border-t border-slate-700">
                  <label className="text-slate-300 text-sm mb-2 block">Remove Verified Doctor</label>
                  <input
                    type="text"
                    placeholder="0x..."
                    value={removeDoctorAddress}
                    onChange={(e) => setRemoveDoctorAddress(e.target.value)}
                    className="w-full bg-slate-700/50 border border-slate-600 rounded-lg px-4 py-2 text-white placeholder-slate-500 mb-3"
                  />
                  <button
                    onClick={handleRemoveDoctor}
                    disabled={actionLoading}
                    className="w-full bg-red-600 hover:bg-red-700 disabled:bg-slate-600 text-white px-4 py-2 rounded-lg font-medium transition-colors"
                  >
                    {actionLoading ? 'Processing...' : 'Remove Doctor'}
                  </button>
                </div>
              </div>
            ) : (
              <p className="text-slate-400">Only the admin can manage doctors.</p>
            )}
          </div>
        </div>

        {/* Stats Cards - Full Width 12 Column Grid */}
        <div className="grid grid-cols-12 gap-10 w-full mb-8">
          {/* Total MCs Issued */}
          <div className="col-span-12 md:col-span-4 bg-gradient-to-br from-blue-600 to-blue-800 rounded-2xl p-6 shadow-xl shadow-blue-900/20 border border-blue-500/20">
            <div className="flex items-center justify-start gap-x-4 mb-4">
              <div className="w-12 h-12 bg-blue-500/30 rounded-xl flex items-center justify-center">
                <svg className="w-6 h-6 text-blue-200" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
              </div>
              <span className="text-blue-200 text-sm font-medium bg-blue-500/20 px-3 py-1 rounded-full">
                All Time
              </span>
            </div>
            <p className="text-blue-100 text-sm font-medium mb-1">Total MCs Issued</p>
            <p className="text-5xl font-bold text-white">
              {loading ? '...' : totalMCs.toLocaleString()}
            </p>
          </div>

          {/* Active Doctors */}
          <div className="col-span-12 md:col-span-4 bg-gradient-to-br from-emerald-600 to-emerald-800 rounded-2xl p-6 shadow-xl shadow-emerald-900/20 border border-emerald-500/20">
            <div className="flex items-center justify-start gap-x-4 mb-4">
              <div className="w-12 h-12 bg-emerald-500/30 rounded-xl flex items-center justify-center">
                <svg className="w-6 h-6 text-emerald-200" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
                </svg>
              </div>
              <span className="text-emerald-200 text-sm font-medium bg-emerald-500/20 px-3 py-1 rounded-full">
                Registered
              </span>
            </div>
            <p className="text-emerald-100 text-sm font-medium mb-1">Active Doctors</p>
            <p className="text-5xl font-bold text-white">
              {loading ? '...' : activeDoctors}
            </p>
          </div>

          {/* Available Credits */}
          <div className="col-span-12 md:col-span-4 bg-gradient-to-br from-violet-600 to-violet-800 rounded-2xl p-6 shadow-xl shadow-violet-900/20 border border-violet-500/20">
            <div className="flex items-center justify-start gap-x-4 mb-4">
              <div className="w-12 h-12 bg-violet-500/30 rounded-xl flex items-center justify-center">
                <svg className="w-6 h-6 text-violet-200" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </div>
              <span className="text-violet-200 text-sm font-medium bg-violet-500/20 px-3 py-1 rounded-full">
                Prepaid
              </span>
            </div>
            <p className="text-violet-100 text-sm font-medium mb-1">Available Credits</p>
            <p className="text-5xl font-bold text-white">
              {loading ? '...' : totalCredits}
            </p>
          </div>
        </div>

        {/* Outstanding Balance Card - Full Width */}
        {totalOwed > 0 && (
          <div className="bg-gradient-to-r from-amber-500/10 to-orange-500/10 border border-amber-500/30 rounded-2xl p-6 mb-8">
            <div className="flex items-center justify-start gap-x-4">
              <div className="w-14 h-14 bg-amber-500/20 rounded-xl flex items-center justify-center">
                <svg className="w-7 h-7 text-amber-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                </svg>
              </div>
              <div>
                <p className="text-amber-200 text-sm font-medium">Outstanding Balance</p>
                <p className="text-3xl font-bold text-amber-400">{totalOwed} credits owed</p>
              </div>
            </div>
          </div>
        )}

        {/* Hospital Balances Table */}
        <div className="bg-slate-800/50 backdrop-blur-sm rounded-2xl border border-slate-700/50 overflow-hidden">
          <div className="px-6 py-4 border-b border-slate-700/50">
            <h2 className="text-xl font-semibold text-white">Hospital Balances</h2>
            <p className="text-slate-400 text-sm">Detailed breakdown by hospital/doctor</p>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="bg-slate-700/30">
                  <th className="text-left px-6 py-4 text-slate-300 font-medium text-sm">Hospital Address</th>
                  <th className="text-right px-6 py-4 text-slate-300 font-medium text-sm">Balance</th>
                  <th className="text-right px-6 py-4 text-slate-300 font-medium text-sm">Status</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr>
                    <td colSpan={3} className="px-6 py-8 text-center text-slate-400">
                      Loading...
                    </td>
                  </tr>
                ) : hospitalBalances.length === 0 ? (
                  <tr>
                    <td colSpan={3} className="px-6 py-8 text-center text-slate-400">
                      No hospitals registered yet
                    </td>
                  </tr>
                ) : (
                  hospitalBalances.map((item, index) => (
                    <tr key={index} className="border-t border-slate-700/30 hover:bg-slate-700/20 transition-colors">
                      <td className="px-6 py-4">
                        <code className="text-slate-200 bg-slate-700/50 px-2 py-1 rounded text-sm">
                          {formatAddress(item.hospital)}
                        </code>
                      </td>
                      <td className="px-6 py-4 text-right">
                        <span className={`text-lg font-semibold ${item.balance >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                          {item.balance >= 0 ? '+' : ''}{item.balance}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-right">
                        {item.balance >= 0 ? (
                          <span className="inline-flex items-center gap-1 text-emerald-400 bg-emerald-500/10 px-3 py-1 rounded-full text-sm font-medium">
                            <span className="w-2 h-2 bg-emerald-400 rounded-full"></span>
                            Good Standing
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 text-red-400 bg-red-500/10 px-3 py-1 rounded-full text-sm font-medium">
                            <span className="w-2 h-2 bg-red-400 rounded-full"></span>
                            Payment Due
                          </span>
                        )}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Footer */}
        <div className="mt-8 flex justify-start text-slate-500 text-sm">
          <p>Sarawak MedChain Admin Portal</p>
        </div>
    </div>
  );
}
