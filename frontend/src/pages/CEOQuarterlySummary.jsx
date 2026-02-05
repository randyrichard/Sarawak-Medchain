/**
 * Private CEO Quarterly Summary
 * Comprehensive analytics dashboard for founder/CEO
 */

import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';

// Sarawak regions for heatmap
const SARAWAK_REGIONS = [
  { id: 'kuching', name: 'Kuching Division', color: '#10b981' },
  { id: 'bintulu', name: 'Bintulu Division', color: '#3b82f6' },
  { id: 'miri', name: 'Miri Division', color: '#8b5cf6' },
  { id: 'sibu', name: 'Sibu Division', color: '#f59e0b' },
  { id: 'kapit', name: 'Kapit Division', color: '#ef4444' },
];

// Generate mock quarterly data
const generateQuarterlyData = () => {
  const currentQuarter = Math.ceil((new Date().getMonth() + 1) / 3);
  const currentYear = new Date().getFullYear();

  // Previous quarter MRR
  const prevQuarterMRR = 180000 + Math.floor(Math.random() * 20000);
  // Current quarter MRR (with growth)
  const currentMRR = prevQuarterMRR * (1 + 0.15 + Math.random() * 0.1);

  // Facility breakdown
  const hospitals = 24;
  const clinics = 186;
  const totalFacilities = hospitals + clinics;

  // Transaction data by region
  const regionData = {
    kuching: {
      hospitals: 12,
      clinics: 85,
      transactions: 15420 + Math.floor(Math.random() * 2000),
      revenue: 0,
    },
    bintulu: {
      hospitals: 5,
      clinics: 42,
      transactions: 6850 + Math.floor(Math.random() * 1000),
      revenue: 0,
    },
    miri: {
      hospitals: 4,
      clinics: 38,
      transactions: 5920 + Math.floor(Math.random() * 800),
      revenue: 0,
    },
    sibu: {
      hospitals: 2,
      clinics: 15,
      transactions: 2340 + Math.floor(Math.random() * 500),
      revenue: 0,
    },
    kapit: {
      hospitals: 1,
      clinics: 6,
      transactions: 890 + Math.floor(Math.random() * 200),
      revenue: 0,
    },
  };

  // Calculate revenue per region
  Object.keys(regionData).forEach(key => {
    regionData[key].revenue = regionData[key].transactions * 1; // RM 1.00 per MC
  });

  // Total transactions
  const totalTransactions = Object.values(regionData).reduce((sum, r) => sum + r.transactions, 0);
  const totalTransactionRevenue = totalTransactions * 1; // RM 1.00 per MC

  // Subscription revenue
  const hospitalSubscriptions = hospitals * 10000; // RM 10,000/month
  const clinicSubscriptions = clinics * 2000; // RM 2,000/month
  const totalSubscriptionRevenue = (hospitalSubscriptions + clinicSubscriptions) * 3; // Quarterly

  // Operating costs (estimated)
  const serverCosts = 15000 * 3; // RM 15,000/month
  const blockchainCosts = 8000 * 3; // RM 8,000/month
  const staffCosts = 45000 * 3; // RM 45,000/month
  const otherCosts = 12000 * 3; // RM 12,000/month
  const totalOperatingCosts = serverCosts + blockchainCosts + staffCosts + otherCosts;

  // Gross revenue
  const grossRevenue = totalSubscriptionRevenue + totalTransactionRevenue;
  const netProfit = grossRevenue - totalOperatingCosts;
  const profitMargin = (netProfit / grossRevenue) * 100;

  // Churn risk facilities (low balance for 7+ days)
  const churnRiskFacilities = [
    { name: 'Klinik Harmoni Bintulu', type: 'Clinic', balance: 45, lowSinceDays: 12, region: 'Bintulu' },
    { name: 'Klinik Sihat Miri', type: 'Clinic', balance: 28, lowSinceDays: 9, region: 'Miri' },
    { name: 'Pusat Perubatan Kapit', type: 'Clinic', balance: 67, lowSinceDays: 8, region: 'Kapit' },
    { name: 'Klinik Mesra Sibu', type: 'Clinic', balance: 12, lowSinceDays: 15, region: 'Sibu' },
  ];

  return {
    quarter: `Q${currentQuarter}`,
    year: currentYear,
    prevQuarterMRR,
    currentMRR,
    mrrGrowth: ((currentMRR - prevQuarterMRR) / prevQuarterMRR) * 100,
    hospitals,
    clinics,
    totalFacilities,
    totalTransactions,
    regionData,
    grossRevenue,
    totalSubscriptionRevenue,
    totalTransactionRevenue,
    totalOperatingCosts,
    operatingCostBreakdown: {
      server: serverCosts,
      blockchain: blockchainCosts,
      staff: staffCosts,
      other: otherCosts,
    },
    netProfit,
    profitMargin,
    churnRiskFacilities,
  };
};

export default function CEOQuarterlySummary() {
  const navigate = useNavigate();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [selectedRegion, setSelectedRegion] = useState(null);

  useEffect(() => {
    // Simulate loading
    setTimeout(() => {
      setData(generateQuarterlyData());
      setLoading(false);
    }, 1000);
  }, []);

  if (loading) {
    return (
      <div className="min-h-screen bg-white flex items-center justify-center">
        <div className="text-center">
          <div className="w-16 h-16 border-4 border-teal-500 border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
          <p className="text-slate-800 font-semibold">Generating Quarterly Report...</p>
        </div>
      </div>
    );
  }

  const maxRegionTransactions = Math.max(...Object.values(data.regionData).map(r => r.transactions));

  return (
    <div className="min-h-screen bg-white p-6">
      {/* Header */}
      <div className="max-w-7xl mx-auto mb-8">
        <div className="flex items-center justify-between">
          <div>
            <div className="flex items-center gap-3 mb-2">
              <span className="px-3 py-1 bg-amber-500/20 border border-amber-500/30 rounded-full text-amber-400 text-xs font-bold">
                PRIVATE & CONFIDENTIAL
              </span>
            </div>
            <h1 className="text-3xl font-black text-slate-800">
              CEO Quarterly Summary
            </h1>
            <p className="text-slate-400 mt-1">
              {data.quarter} {data.year} Performance Report
            </p>
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={() => window.print()}
              className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg transition-colors flex items-center gap-2"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z" />
              </svg>
              Print Report
            </button>
            <button
              onClick={() => navigate('/ceo')}
              className="px-4 py-2 bg-teal-600 hover:bg-teal-500 text-white rounded-lg transition-colors"
            >
              Back to Dashboard
            </button>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto space-y-6">
        {/* Growth Tracker */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* MRR Growth Card */}
          <div className="bg-gradient-to-br from-emerald-600 to-teal-700 rounded-2xl p-6 text-white">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-emerald-100 font-medium">MRR Growth</h3>
              <span className="px-2 py-1 bg-white/20 rounded-full text-xs font-bold">
                vs Last Quarter
              </span>
            </div>
            <div className="flex items-end gap-3">
              <span className="text-5xl font-black">+{data.mrrGrowth.toFixed(1)}%</span>
              <svg className="w-8 h-8 text-emerald-300 mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" />
              </svg>
            </div>
            <div className="mt-4 pt-4 border-t border-white/20">
              <div className="flex justify-between text-sm">
                <span className="text-emerald-200">Previous Quarter</span>
                <span className="font-bold">RM {data.prevQuarterMRR.toLocaleString()}</span>
              </div>
              <div className="flex justify-between text-sm mt-1">
                <span className="text-emerald-200">Current MRR</span>
                <span className="font-bold">RM {Math.round(data.currentMRR).toLocaleString()}</span>
              </div>
            </div>
          </div>

          {/* Transaction Volume Card */}
          <div className="bg-gradient-to-br from-blue-600 to-indigo-700 rounded-2xl p-6 text-white">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-blue-100 font-medium">Transaction Volume</h3>
              <span className="px-2 py-1 bg-white/20 rounded-full text-xs font-bold">
                This Quarter
              </span>
            </div>
            <div className="text-5xl font-black">{data.totalTransactions.toLocaleString()}</div>
            <p className="text-blue-200 text-sm mt-1">MCs Issued</p>
            <div className="mt-4 pt-4 border-t border-white/20">
              <div className="flex justify-between text-sm">
                <span className="text-blue-200">24 Hospitals</span>
                <span className="font-bold">{Math.round(data.totalTransactions * 0.45).toLocaleString()}</span>
              </div>
              <div className="flex justify-between text-sm mt-1">
                <span className="text-blue-200">186 Clinics</span>
                <span className="font-bold">{Math.round(data.totalTransactions * 0.55).toLocaleString()}</span>
              </div>
            </div>
          </div>

          {/* Network Stats Card */}
          <div className="bg-gradient-to-br from-purple-600 to-pink-700 rounded-2xl p-6 text-white">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-purple-100 font-medium">Network Size</h3>
              <span className="px-2 py-1 bg-white/20 rounded-full text-xs font-bold">
                Active
              </span>
            </div>
            <div className="text-5xl font-black">{data.totalFacilities}</div>
            <p className="text-purple-200 text-sm mt-1">Total Facilities</p>
            <div className="mt-4 pt-4 border-t border-white/20 grid grid-cols-2 gap-4">
              <div>
                <p className="text-purple-200 text-xs">Hospitals</p>
                <p className="text-2xl font-bold">{data.hospitals}</p>
              </div>
              <div>
                <p className="text-purple-200 text-xs">Clinics</p>
                <p className="text-2xl font-bold">{data.clinics}</p>
              </div>
            </div>
          </div>
        </div>

        {/* Profit Analysis */}
        <div className="bg-white rounded-2xl p-6 border border-slate-200">
          <h2 className="text-xl font-bold text-slate-800 mb-6 flex items-center gap-2">
            <svg className="w-6 h-6 text-emerald-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
            </svg>
            Profit Analysis - {data.quarter} {data.year}
          </h2>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Revenue Breakdown */}
            <div>
              <h3 className="text-slate-400 text-sm font-semibold mb-4 uppercase tracking-wider">Gross Revenue</h3>
              <div className="space-y-4">
                <div className="bg-slate-50 rounded-xl p-4">
                  <div className="flex justify-between items-center mb-2">
                    <span className="text-slate-600">Subscription Revenue</span>
                    <span className="text-slate-800 font-bold">RM {data.totalSubscriptionRevenue.toLocaleString()}</span>
                  </div>
                  <div className="w-full bg-slate-200 rounded-full h-2">
                    <div
                      className="bg-blue-500 h-2 rounded-full"
                      style={{ width: `${(data.totalSubscriptionRevenue / data.grossRevenue) * 100}%` }}
                    ></div>
                  </div>
                  <p className="text-slate-500 text-xs mt-2">
                    {data.hospitals} hospitals @ RM 10,000 + {data.clinics} clinics @ RM 2,000 (x3 months)
                  </p>
                </div>

                <div className="bg-slate-50 rounded-xl p-4">
                  <div className="flex justify-between items-center mb-2">
                    <span className="text-slate-600">Transaction Fees (RM 1.00/MC)</span>
                    <span className="text-slate-800 font-bold">RM {data.totalTransactionRevenue.toLocaleString()}</span>
                  </div>
                  <div className="w-full bg-slate-200 rounded-full h-2">
                    <div
                      className="bg-emerald-500 h-2 rounded-full"
                      style={{ width: `${(data.totalTransactionRevenue / data.grossRevenue) * 100}%` }}
                    ></div>
                  </div>
                  <p className="text-slate-500 text-xs mt-2">
                    {data.totalTransactions.toLocaleString()} MCs issued @ RM 1.00 each
                  </p>
                </div>

                <div className="bg-emerald-500/20 border border-emerald-500/30 rounded-xl p-4">
                  <div className="flex justify-between items-center">
                    <span className="text-emerald-400 font-semibold">Total Gross Revenue</span>
                    <span className="text-emerald-400 text-2xl font-black">RM {data.grossRevenue.toLocaleString()}</span>
                  </div>
                </div>
              </div>
            </div>

            {/* Operating Costs */}
            <div>
              <h3 className="text-slate-400 text-sm font-semibold mb-4 uppercase tracking-wider">Operating Costs</h3>
              <div className="space-y-3">
                {[
                  { label: 'Server & Infrastructure', value: data.operatingCostBreakdown.server, icon: '🖥️' },
                  { label: 'Blockchain Network', value: data.operatingCostBreakdown.blockchain, icon: '⛓️' },
                  { label: 'Staff & Operations', value: data.operatingCostBreakdown.staff, icon: '👥' },
                  { label: 'Other Expenses', value: data.operatingCostBreakdown.other, icon: '📋' },
                ].map((item, index) => (
                  <div key={index} className="flex items-center justify-between py-3 border-b border-slate-200 last:border-0">
                    <div className="flex items-center gap-3">
                      <span className="text-xl">{item.icon}</span>
                      <span className="text-slate-600">{item.label}</span>
                    </div>
                    <span className="text-slate-800 font-semibold">RM {item.value.toLocaleString()}</span>
                  </div>
                ))}

                <div className="bg-red-500/20 border border-red-500/30 rounded-xl p-4 mt-4">
                  <div className="flex justify-between items-center">
                    <span className="text-red-400 font-semibold">Total Operating Costs</span>
                    <span className="text-red-400 text-xl font-bold">-RM {data.totalOperatingCosts.toLocaleString()}</span>
                  </div>
                </div>

                {/* Net Profit */}
                <div className={`rounded-xl p-5 mt-4 ${
                  data.netProfit >= 0
                    ? 'bg-gradient-to-r from-emerald-600 to-teal-600'
                    : 'bg-gradient-to-r from-red-600 to-red-700'
                }`}>
                  <div className="flex justify-between items-center">
                    <div>
                      <p className="text-white/80 text-sm">Net Profit</p>
                      <p className="text-3xl font-black text-white">
                        RM {data.netProfit.toLocaleString()}
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="text-white/80 text-sm">Margin</p>
                      <p className="text-2xl font-bold text-white">{data.profitMargin.toFixed(1)}%</p>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Regional Heatmap */}
        <div className="bg-white rounded-2xl p-6 border border-slate-200">
          <h2 className="text-xl font-bold text-slate-800 mb-6 flex items-center gap-2">
            <svg className="w-6 h-6 text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 20l-5.447-2.724A1 1 0 013 16.382V5.618a1 1 0 011.447-.894L9 7m0 13l6-3m-6 3V7m6 10l4.553 2.276A1 1 0 0021 18.382V7.618a1 1 0 00-.553-.894L15 4m0 13V4m0 0L9 7" />
            </svg>
            Network Heatmap - Sarawak Regions
          </h2>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Region Cards */}
            <div className="space-y-3">
              {SARAWAK_REGIONS.map((region) => {
                const regionStats = data.regionData[region.id];
                const percentage = (regionStats.transactions / data.totalTransactions) * 100;
                const intensity = regionStats.transactions / maxRegionTransactions;

                return (
                  <div
                    key={region.id}
                    onClick={() => setSelectedRegion(selectedRegion === region.id ? null : region.id)}
                    className={`bg-slate-50 rounded-xl p-4 cursor-pointer transition-all hover:bg-slate-100 ${
                      selectedRegion === region.id ? 'ring-2 ring-teal-500' : ''
                    }`}
                  >
                    <div className="flex items-center justify-between mb-3">
                      <div className="flex items-center gap-3">
                        <div
                          className="w-4 h-4 rounded-full"
                          style={{ backgroundColor: region.color, opacity: 0.3 + intensity * 0.7 }}
                        ></div>
                        <span className="text-slate-800 font-semibold">{region.name}</span>
                      </div>
                      <span className="text-slate-400 text-sm">{percentage.toFixed(1)}%</span>
                    </div>

                    <div className="w-full bg-slate-200 rounded-full h-3 mb-3">
                      <div
                        className="h-3 rounded-full transition-all"
                        style={{
                          width: `${percentage}%`,
                          backgroundColor: region.color,
                        }}
                      ></div>
                    </div>

                    <div className="grid grid-cols-3 gap-4 text-center">
                      <div>
                        <p className="text-slate-500 text-xs">MCs Issued</p>
                        <p className="text-slate-800 font-bold">{regionStats.transactions.toLocaleString()}</p>
                      </div>
                      <div>
                        <p className="text-slate-500 text-xs">Facilities</p>
                        <p className="text-slate-800 font-bold">{regionStats.hospitals + regionStats.clinics}</p>
                      </div>
                      <div>
                        <p className="text-slate-500 text-xs">Revenue</p>
                        <p className="text-emerald-400 font-bold">RM {regionStats.revenue.toLocaleString()}</p>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Visual Map */}
            <div className="bg-slate-50 rounded-xl p-6 flex items-center justify-center border border-slate-200">
              <div className="relative w-full max-w-md">
                {/* Simplified Sarawak map representation */}
                <svg viewBox="0 0 400 250" className="w-full h-auto">
                  {/* Base shape */}
                  <path
                    d="M50,150 Q80,100 150,80 Q200,60 280,70 Q350,80 380,120 Q390,160 360,180 Q300,200 250,210 Q150,220 80,200 Q40,180 50,150"
                    fill="#F1F5F9"
                    stroke="#CBD5E1"
                    strokeWidth="2"
                  />

                  {/* Region markers */}
                  {[
                    { id: 'kuching', x: 100, y: 170, label: 'Kuching' },
                    { id: 'sibu', x: 180, y: 140, label: 'Sibu' },
                    { id: 'bintulu', x: 250, y: 120, label: 'Bintulu' },
                    { id: 'miri', x: 320, y: 100, label: 'Miri' },
                    { id: 'kapit', x: 200, y: 100, label: 'Kapit' },
                  ].map((marker) => {
                    const region = SARAWAK_REGIONS.find(r => r.id === marker.id);
                    const regionStats = data.regionData[marker.id];
                    const intensity = regionStats.transactions / maxRegionTransactions;
                    const radius = 15 + intensity * 20;

                    return (
                      <g key={marker.id}>
                        {/* Glow effect */}
                        <circle
                          cx={marker.x}
                          cy={marker.y}
                          r={radius + 10}
                          fill={region.color}
                          opacity={0.2}
                        />
                        {/* Main circle */}
                        <circle
                          cx={marker.x}
                          cy={marker.y}
                          r={radius}
                          fill={region.color}
                          opacity={0.4 + intensity * 0.6}
                          className="cursor-pointer hover:opacity-100 transition-opacity"
                          onClick={() => setSelectedRegion(marker.id)}
                        />
                        {/* Label */}
                        <text
                          x={marker.x}
                          y={marker.y + radius + 15}
                          textAnchor="middle"
                          fill="#94a3b8"
                          fontSize="10"
                          fontWeight="500"
                        >
                          {marker.label}
                        </text>
                        {/* Value */}
                        <text
                          x={marker.x}
                          y={marker.y + 4}
                          textAnchor="middle"
                          fill="white"
                          fontSize="10"
                          fontWeight="700"
                        >
                          {(regionStats.transactions / 1000).toFixed(1)}k
                        </text>
                      </g>
                    );
                  })}
                </svg>

                {/* Legend */}
                <div className="mt-4 flex justify-center gap-4 flex-wrap">
                  {SARAWAK_REGIONS.map((region) => (
                    <div key={region.id} className="flex items-center gap-2">
                      <div
                        className="w-3 h-3 rounded-full"
                        style={{ backgroundColor: region.color }}
                      ></div>
                      <span className="text-slate-400 text-xs">{region.name.split(' ')[0]}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Churn Alert */}
        <div className="bg-white rounded-2xl p-6 border border-slate-200">
          <h2 className="text-xl font-bold text-slate-800 mb-2 flex items-center gap-2">
            <svg className="w-6 h-6 text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
            Churn Risk Alert
          </h2>
          <p className="text-slate-400 text-sm mb-6">
            Facilities with low credit balance (&lt;100 credits) for more than 7 days
          </p>

          {data.churnRiskFacilities.length > 0 ? (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-slate-200">
                    <th className="text-left py-3 px-4 text-slate-400 text-sm font-semibold">Facility</th>
                    <th className="text-left py-3 px-4 text-slate-400 text-sm font-semibold">Type</th>
                    <th className="text-left py-3 px-4 text-slate-400 text-sm font-semibold">Region</th>
                    <th className="text-right py-3 px-4 text-slate-400 text-sm font-semibold">Balance</th>
                    <th className="text-right py-3 px-4 text-slate-400 text-sm font-semibold">Days Low</th>
                    <th className="text-center py-3 px-4 text-slate-400 text-sm font-semibold">Risk</th>
                    <th className="text-center py-3 px-4 text-slate-400 text-sm font-semibold">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {data.churnRiskFacilities.map((facility, index) => {
                    const riskLevel = facility.lowSinceDays > 14 ? 'critical' : facility.lowSinceDays > 10 ? 'high' : 'medium';
                    return (
                      <tr key={index} className="border-b border-slate-200/50 hover:bg-slate-100/30">
                        <td className="py-4 px-4">
                          <span className="text-slate-800 font-medium">{facility.name}</span>
                        </td>
                        <td className="py-4 px-4">
                          <span className={`px-2 py-1 rounded-full text-xs font-bold ${
                            facility.type === 'Hospital'
                              ? 'bg-blue-500/20 text-blue-400'
                              : 'bg-purple-500/20 text-purple-400'
                          }`}>
                            {facility.type}
                          </span>
                        </td>
                        <td className="py-4 px-4 text-slate-600">{facility.region}</td>
                        <td className="py-4 px-4 text-right">
                          <span className="text-red-400 font-bold">{facility.balance} credits</span>
                        </td>
                        <td className="py-4 px-4 text-right">
                          <span className="text-amber-400 font-semibold">{facility.lowSinceDays} days</span>
                        </td>
                        <td className="py-4 px-4 text-center">
                          <span className={`px-3 py-1 rounded-full text-xs font-bold ${
                            riskLevel === 'critical'
                              ? 'bg-red-500/20 text-red-400 animate-pulse'
                              : riskLevel === 'high'
                              ? 'bg-amber-500/20 text-amber-400'
                              : 'bg-yellow-500/20 text-yellow-400'
                          }`}>
                            {riskLevel.toUpperCase()}
                          </span>
                        </td>
                        <td className="py-4 px-4 text-center">
                          <button className="px-3 py-1.5 bg-teal-600 hover:bg-teal-500 text-white text-sm rounded-lg transition-colors">
                            Contact
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="text-center py-8">
              <div className="w-16 h-16 bg-emerald-500/20 rounded-full flex items-center justify-center mx-auto mb-4">
                <svg className="w-8 h-8 text-emerald-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
              </div>
              <p className="text-emerald-400 font-semibold">All Clear!</p>
              <p className="text-slate-400 text-sm">No facilities at risk of churn</p>
            </div>
          )}

          {/* Summary Stats */}
          <div className="mt-6 grid grid-cols-4 gap-4">
            <div className="bg-slate-50 rounded-xl p-4 text-center">
              <p className="text-slate-400 text-xs uppercase tracking-wider">At Risk</p>
              <p className="text-2xl font-bold text-red-400">{data.churnRiskFacilities.length}</p>
            </div>
            <div className="bg-slate-50 rounded-xl p-4 text-center">
              <p className="text-slate-400 text-xs uppercase tracking-wider">Critical</p>
              <p className="text-2xl font-bold text-red-400">
                {data.churnRiskFacilities.filter(f => f.lowSinceDays > 14).length}
              </p>
            </div>
            <div className="bg-slate-50 rounded-xl p-4 text-center">
              <p className="text-slate-400 text-xs uppercase tracking-wider">Revenue at Risk</p>
              <p className="text-xl font-bold text-amber-400">
                RM {(data.churnRiskFacilities.length * 2000).toLocaleString()}
              </p>
            </div>
            <div className="bg-slate-50 rounded-xl p-4 text-center">
              <p className="text-slate-400 text-xs uppercase tracking-wider">Churn Rate</p>
              <p className="text-2xl font-bold text-emerald-400">
                {((data.churnRiskFacilities.length / data.totalFacilities) * 100).toFixed(1)}%
              </p>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="text-center py-8">
          <p className="text-slate-500 text-sm">
            Generated on {new Date().toLocaleDateString('en-MY', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
          </p>
          <p className="text-slate-600 text-xs mt-1">
            This report is confidential and intended for internal use only.
          </p>
        </div>
      </div>
    </div>
  );
}
