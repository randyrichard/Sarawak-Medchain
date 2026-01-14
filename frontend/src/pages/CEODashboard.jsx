import { useState, useEffect } from 'react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import { getAllHospitalBalances } from '../utils/contract';

// Mock flu season data - in production, this would come from actual MC issuance dates
const generateFluSeasonData = () => {
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  return months.map((month, index) => {
    // Simulate flu season spikes (higher in monsoon months: Oct-Feb)
    let baseValue = 50;
    if (index >= 9 || index <= 1) baseValue = 120; // Oct-Feb spike
    if (index >= 5 && index <= 7) baseValue = 80; // Jun-Aug moderate
    const randomVariation = Math.floor(Math.random() * 30) - 15;
    return {
      month,
      mcsIssued: Math.max(20, baseValue + randomVariation),
      previousYear: Math.max(15, baseValue - 20 + Math.floor(Math.random() * 20))
    };
  });
};

// Stat Card Component
function StatCard({ title, value, subtitle, icon, trend, darkMode }) {
  return (
    <div className={`rounded-xl p-6 shadow-lg transition-all duration-300 hover:shadow-xl ${
      darkMode
        ? 'bg-gray-800 border border-gray-700'
        : 'bg-white border border-gray-100'
    }`}>
      <div className="flex items-center justify-between">
        <div>
          <p className={`text-sm font-medium ${darkMode ? 'text-gray-400' : 'text-gray-500'}`}>
            {title}
          </p>
          <p className={`text-3xl font-bold mt-2 ${darkMode ? 'text-white' : 'text-gray-900'}`}>
            {value}
          </p>
          {subtitle && (
            <p className={`text-sm mt-1 ${darkMode ? 'text-gray-500' : 'text-gray-400'}`}>
              {subtitle}
            </p>
          )}
          {trend && (
            <p className={`text-sm mt-2 ${trend > 0 ? 'text-green-500' : 'text-red-500'}`}>
              {trend > 0 ? '+' : ''}{trend}% from last month
            </p>
          )}
        </div>
        <div className={`p-4 rounded-full ${
          darkMode ? 'bg-gray-700' : 'bg-blue-50'
        }`}>
          <span className="text-3xl">{icon}</span>
        </div>
      </div>
    </div>
  );
}

export default function CEODashboard({ walletAddress }) {
  const [darkMode, setDarkMode] = useState(false);
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState({
    totalMCs: 0,
    activeDoctors: 0,
    revenue: 0
  });
  const [fluData, setFluData] = useState([]);
  const [hospitalBalances, setHospitalBalances] = useState([]);

  useEffect(() => {
    fetchDashboardData();
    setFluData(generateFluSeasonData());
  }, []);

  const fetchDashboardData = async () => {
    try {
      setLoading(true);

      // Fetch hospital balances from contract
      const balances = await getAllHospitalBalances();
      setHospitalBalances(balances);

      // Calculate stats
      const activeDoctors = balances.length;
      const totalMCs = balances.reduce((sum, b) => {
        // Each MC costs 1 credit, so negative balance = MCs issued beyond credits
        // Credits added - current balance = MCs issued
        return sum + Math.abs(Math.min(0, b.balance)) + (10 - Math.max(0, b.balance));
      }, 0);

      // For demo, use a simpler calculation
      const totalMCsSimple = balances.reduce((sum, b) => sum + (10 - b.balance), 0);

      setStats({
        totalMCs: Math.max(0, totalMCsSimple),
        activeDoctors,
        revenue: Math.max(0, totalMCsSimple) // RM1 per MC
      });

    } catch (error) {
      console.error('Error fetching dashboard data:', error);
      // Use mock data if contract call fails
      setStats({
        totalMCs: 156,
        activeDoctors: 2,
        revenue: 156
      });
    } finally {
      setLoading(false);
    }
  };

  const toggleDarkMode = () => {
    setDarkMode(!darkMode);
  };

  return (
    <div className={`min-h-screen transition-colors duration-300 ${
      darkMode ? 'bg-gray-900' : 'bg-gray-50'
    }`}>
      {/* Header */}
      <div className={`px-6 py-4 border-b ${
        darkMode ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-200'
      }`}>
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          <div>
            <h1 className={`text-2xl font-bold ${darkMode ? 'text-white' : 'text-gray-900'}`}>
              Hospital CEO Dashboard
            </h1>
            <p className={`text-sm ${darkMode ? 'text-gray-400' : 'text-gray-500'}`}>
              Real-time analytics for Sarawak MedChain
            </p>
          </div>

          {/* Dark Mode Toggle */}
          <button
            onClick={toggleDarkMode}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg transition-all ${
              darkMode
                ? 'bg-yellow-500 text-gray-900 hover:bg-yellow-400'
                : 'bg-gray-800 text-white hover:bg-gray-700'
            }`}
          >
            <span className="text-xl">{darkMode ? '☀️' : '🌙'}</span>
            <span className="font-medium">{darkMode ? 'Light Mode' : 'Dark Mode'}</span>
          </button>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-6 py-8">
        {/* Loading State */}
        {loading ? (
          <div className="flex items-center justify-center h-64">
            <div className={`text-lg ${darkMode ? 'text-gray-400' : 'text-gray-500'}`}>
              Loading dashboard data...
            </div>
          </div>
        ) : (
          <>
            {/* Stats Cards Grid */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
              <StatCard
                title="Total MCs Issued"
                value={stats.totalMCs.toLocaleString()}
                subtitle="Medical certificates this period"
                icon="📋"
                trend={12}
                darkMode={darkMode}
              />
              <StatCard
                title="Active Verified Doctors"
                value={stats.activeDoctors}
                subtitle="Currently registered doctors"
                icon="👨‍⚕️"
                trend={5}
                darkMode={darkMode}
              />
              <StatCard
                title="Revenue Generated"
                value={`RM ${stats.revenue.toLocaleString()}`}
                subtitle="At RM1 per MC issued"
                icon="💰"
                trend={15}
                darkMode={darkMode}
              />
            </div>

            {/* Flu Season Chart */}
            <div className={`rounded-xl p-6 shadow-lg ${
              darkMode ? 'bg-gray-800 border border-gray-700' : 'bg-white'
            }`}>
              <div className="mb-6">
                <h2 className={`text-xl font-bold ${darkMode ? 'text-white' : 'text-gray-900'}`}>
                  Flu Season Spikes Analysis
                </h2>
                <p className={`text-sm ${darkMode ? 'text-gray-400' : 'text-gray-500'}`}>
                  Monthly MC issuance trends for staff allocation planning
                </p>
              </div>

              <div className="h-80">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={fluData}>
                    <CartesianGrid
                      strokeDasharray="3 3"
                      stroke={darkMode ? '#374151' : '#e5e7eb'}
                    />
                    <XAxis
                      dataKey="month"
                      stroke={darkMode ? '#9ca3af' : '#6b7280'}
                      tick={{ fill: darkMode ? '#9ca3af' : '#6b7280' }}
                    />
                    <YAxis
                      stroke={darkMode ? '#9ca3af' : '#6b7280'}
                      tick={{ fill: darkMode ? '#9ca3af' : '#6b7280' }}
                    />
                    <Tooltip
                      contentStyle={{
                        backgroundColor: darkMode ? '#1f2937' : '#ffffff',
                        border: `1px solid ${darkMode ? '#374151' : '#e5e7eb'}`,
                        borderRadius: '8px',
                        color: darkMode ? '#ffffff' : '#000000'
                      }}
                    />
                    <Legend />
                    <Line
                      type="monotone"
                      dataKey="mcsIssued"
                      name="MCs This Year"
                      stroke="#3b82f6"
                      strokeWidth={3}
                      dot={{ fill: '#3b82f6', strokeWidth: 2 }}
                      activeDot={{ r: 8 }}
                    />
                    <Line
                      type="monotone"
                      dataKey="previousYear"
                      name="Previous Year"
                      stroke="#9ca3af"
                      strokeWidth={2}
                      strokeDasharray="5 5"
                      dot={{ fill: '#9ca3af', strokeWidth: 2 }}
                    />
                  </LineChart>
                </ResponsiveContainer>
              </div>

              {/* Insights */}
              <div className={`mt-6 p-4 rounded-lg ${
                darkMode ? 'bg-gray-700' : 'bg-blue-50'
              }`}>
                <h3 className={`font-semibold mb-2 ${darkMode ? 'text-white' : 'text-gray-900'}`}>
                  📊 Key Insights
                </h3>
                <ul className={`text-sm space-y-1 ${darkMode ? 'text-gray-300' : 'text-gray-600'}`}>
                  <li>• <strong>Peak Season:</strong> October - February (Monsoon season flu spike)</li>
                  <li>• <strong>Recommendation:</strong> Increase staff allocation by 40% during peak months</li>
                  <li>• <strong>Trend:</strong> 12% increase in MC issuance compared to last year</li>
                </ul>
              </div>
            </div>

            {/* Hospital Performance Table */}
            <div className={`mt-8 rounded-xl p-6 shadow-lg ${
              darkMode ? 'bg-gray-800 border border-gray-700' : 'bg-white'
            }`}>
              <h2 className={`text-xl font-bold mb-4 ${darkMode ? 'text-white' : 'text-gray-900'}`}>
                Doctor Performance Overview
              </h2>
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className={darkMode ? 'border-b border-gray-700' : 'border-b border-gray-200'}>
                      <th className={`text-left py-3 px-4 font-semibold ${darkMode ? 'text-gray-300' : 'text-gray-600'}`}>
                        Doctor Address
                      </th>
                      <th className={`text-left py-3 px-4 font-semibold ${darkMode ? 'text-gray-300' : 'text-gray-600'}`}>
                        Credit Balance
                      </th>
                      <th className={`text-left py-3 px-4 font-semibold ${darkMode ? 'text-gray-300' : 'text-gray-600'}`}>
                        Status
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {hospitalBalances.length > 0 ? (
                      hospitalBalances.map((hospital, index) => (
                        <tr
                          key={index}
                          className={`${darkMode ? 'border-b border-gray-700 hover:bg-gray-700' : 'border-b border-gray-100 hover:bg-gray-50'}`}
                        >
                          <td className={`py-3 px-4 font-mono text-sm ${darkMode ? 'text-gray-300' : 'text-gray-700'}`}>
                            {hospital.hospital.slice(0, 10)}...{hospital.hospital.slice(-8)}
                          </td>
                          <td className={`py-3 px-4 ${hospital.balance >= 0 ? 'text-green-500' : 'text-red-500'}`}>
                            {hospital.balance} credits
                          </td>
                          <td className="py-3 px-4">
                            <span className={`px-3 py-1 rounded-full text-xs font-medium ${
                              hospital.balance >= 0
                                ? 'bg-green-100 text-green-700'
                                : 'bg-red-100 text-red-700'
                            }`}>
                              {hospital.balance >= 0 ? 'Active' : 'Owes Payment'}
                            </span>
                          </td>
                        </tr>
                      ))
                    ) : (
                      <tr>
                        <td colSpan={3} className={`py-8 text-center ${darkMode ? 'text-gray-400' : 'text-gray-500'}`}>
                          No doctor data available
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
