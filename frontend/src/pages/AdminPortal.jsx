import { useState, useEffect } from 'react';
import { getAllHospitalBalances, getBillingContract } from '../utils/contract';

export default function AdminPortal({ walletAddress }) {
  const [totalMCs, setTotalMCs] = useState(0);
  const [activeDoctors, setActiveDoctors] = useState(0);
  const [totalCredits, setTotalCredits] = useState(0);
  const [totalOwed, setTotalOwed] = useState(0);
  const [hospitalBalances, setHospitalBalances] = useState([]);
  const [loading, setLoading] = useState(true);

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

    } catch (error) {
      console.error('Error fetching admin data:', error);
    } finally {
      setLoading(false);
    }
  };

  const formatAddress = (addr) => {
    return `${addr.slice(0, 6)}...${addr.slice(-4)}`;
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 p-8">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="mb-10">
          <h1 className="text-4xl font-bold text-white mb-2">Hospital Admin Portal</h1>
          <p className="text-slate-400">Sarawak MedChain Billing Dashboard</p>
        </div>

        {/* Stats Cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-10">
          {/* Total MCs Issued */}
          <div className="bg-gradient-to-br from-blue-600 to-blue-800 rounded-2xl p-6 shadow-xl shadow-blue-900/20 border border-blue-500/20">
            <div className="flex items-center justify-between mb-4">
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
          <div className="bg-gradient-to-br from-emerald-600 to-emerald-800 rounded-2xl p-6 shadow-xl shadow-emerald-900/20 border border-emerald-500/20">
            <div className="flex items-center justify-between mb-4">
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
          <div className="bg-gradient-to-br from-violet-600 to-violet-800 rounded-2xl p-6 shadow-xl shadow-violet-900/20 border border-violet-500/20">
            <div className="flex items-center justify-between mb-4">
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

        {/* Outstanding Balance Card */}
        {totalOwed > 0 && (
          <div className="bg-gradient-to-r from-amber-500/10 to-orange-500/10 border border-amber-500/30 rounded-2xl p-6 mb-10">
            <div className="flex items-center gap-4">
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
        <div className="mt-8 text-center text-slate-500 text-sm">
          <p>Sarawak MedChain Admin Portal &copy; 2026</p>
        </div>
      </div>
    </div>
  );
}
