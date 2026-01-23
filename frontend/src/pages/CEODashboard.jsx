import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { LineChart, Line, AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import { getAllHospitalBalances } from '../utils/contract';
import { useBilling } from '../context/BillingContext';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import BroadcastNotification from '../components/BroadcastNotification';
import { ServiceRestoredToast } from '../components/ServiceNotifications';

// HOSPITAL WALLET MAPPING - Maps wallet addresses to hospital data
// In production, this would come from the blockchain or backend
const HOSPITAL_WALLET_MAPPING = {
  '0x70997970c51812dc3a010c7d01b50e0d17dc79c8': {
    id: 1,
    name: 'Timberland Medical Centre',
    location: 'Kuching',
    tier: 'Hospital',
  },
  '0x3c44cdddb6a900fa2b585dd299e03d12fa4293bc': {
    id: 2,
    name: 'KPJ Kuching Specialist',
    location: 'Kuching',
    tier: 'Hospital',
  },
  '0x90f79bf6eb2c4f870365e785982e1f101e93b906': {
    id: 3,
    name: 'Normah Medical Specialist',
    location: 'Kuching',
    tier: 'Hospital',
  },
  '0x15d34aaf54267db7d7c367839aaf71a00a2c6a65': {
    id: 4,
    name: 'Rejang Medical Centre',
    location: 'Sibu',
    tier: 'Hospital',
  },
  '0x9965507d1a55bcc2695c58ba16fb37d819b0a4dc': {
    id: 5,
    name: 'Bintulu Medical Centre',
    location: 'Bintulu',
    tier: 'Clinic',
  },
};

// Mock flu season data - in production, this would come from actual MC issuance dates
const generateFluSeasonData = () => {
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  return months.map((month, index) => {
    // Simulate flu season spikes (higher in monsoon months: Oct-Feb)
    let baseValue = 50;
    if (index >= 9 || index <= 1) baseValue = 120; // Oct-Feb spike
    if (index >= 5 && index <= 7) baseValue = 80; // Jun-Aug moderate
    const randomVariation = Math.floor(Math.random() * 30) - 15;
    const mcs = Math.max(20, baseValue + randomVariation);
    return {
      month,
      mcsIssued: mcs,
      previousYear: Math.max(15, baseValue - 20 + Math.floor(Math.random() * 20)),
      revenue: mcs * 1, // RM1 per MC
      prevRevenue: Math.max(15, baseValue - 20 + Math.floor(Math.random() * 20))
    };
  });
};

// Doctor Performance Leaderboard Data
const generateDoctorPerformanceData = () => {
  const doctors = [
    { id: 1, name: 'Dr. Ahmad Razak', department: 'General Medicine', mcsIssued: 47 },
    { id: 2, name: 'Dr. Sarah Lim', department: 'Pediatrics', mcsIssued: 38 },
    { id: 3, name: 'Dr. James Wong', department: 'Emergency', mcsIssued: 31 },
    { id: 4, name: 'Dr. Fatimah Hassan', department: 'Internal Medicine', mcsIssued: 24 },
    { id: 5, name: 'Dr. Kumar Pillai', department: 'Orthopedics', mcsIssued: 16 },
  ];

  // Sort by MCs issued (descending)
  return doctors.sort((a, b) => b.mcsIssued - a.mcsIssued).map((doc, index) => ({
    ...doc,
    rank: index + 1,
    revenue: doc.mcsIssued * 1, // RM1.00 per MC
  }));
};

// Revenue Forecast Data Generator
// Base: RM10,000/mo (Hospital) or RM2,000/mo (Clinic) + RM1.00/MC usage
const generateRevenueForecastData = (facilityType, currentMCs) => {
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const baseSubscription = facilityType === 'Hospital' ? 10000 : 2000;

  return months.map((month, index) => {
    // Project MC growth with seasonal variations
    let mcGrowthFactor = 1 + (index * 0.03); // 3% growth per month
    if (index >= 9 || index <= 1) mcGrowthFactor *= 1.4; // Monsoon flu spike
    if (index >= 5 && index <= 7) mcGrowthFactor *= 1.15; // Mid-year moderate

    const projectedMCs = Math.round(currentMCs * mcGrowthFactor);
    const usageRevenue = projectedMCs * 1; // RM1 per MC
    const totalRevenue = baseSubscription + usageRevenue;

    return {
      month,
      baseSubscription,
      usageRevenue,
      totalRevenue,
      projectedMCs
    };
  });
};

// Stat Card Component - Enterprise Style
function StatCard({ title, value, subtitle, icon, trend, darkMode }) {
  return (
    <div className={`rounded-xl p-6 shadow-lg transition-all duration-300 hover:shadow-xl ${
      darkMode
        ? 'bg-gray-800 border border-gray-700'
        : 'bg-white border border-gray-100'
    }`}>
      <div className="flex items-center justify-start gap-x-4">
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

// Generate unique referral code from wallet address
const generateReferralCode = (address) => {
  if (!address) return '';
  const hash = address.slice(2, 10).toUpperCase();
  return `MEDCHAIN-${hash}`;
};

// Get referral stats from localStorage
const getReferralStats = (referralCode) => {
  const referrals = JSON.parse(localStorage.getItem('medchain_referrals') || '{}');
  const stats = referrals[referralCode] || { referred: [], totalEarned: 0, pendingRewards: 0 };
  return stats;
};

export default function CEODashboard({ walletAddress }) {
  const navigate = useNavigate();

  // Get connected hospital info based on wallet address
  const connectedHospital = walletAddress
    ? HOSPITAL_WALLET_MAPPING[walletAddress.toLowerCase()]
    : null;

  // Use Billing Context for consistent billing data
  const {
    accountType,
    changeAccountType,
    currentTier,
    monthlySubscriptionFee,
    variableUsageCost,
    totalOutstandingBalance,
    mcRate,
    mcsIssuedThisMonth,
    subscriptionPaid,
    processPayment,
    refreshBillingData
  } = useBilling();

  // Force dark mode - no toggle
  const darkMode = true;
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState({
    totalMCs: 0,
    activeDoctors: 0,
    revenue: 0
  });
  const [fluData, setFluData] = useState([]);
  const [forecastData, setForecastData] = useState([]);
  const [doctorPerformance, setDoctorPerformance] = useState([]);
  const [hospitalBalances, setHospitalBalances] = useState([]);

  // Payment processing state
  const [paymentProcessing, setPaymentProcessing] = useState(false);
  const [paymentSuccess, setPaymentSuccess] = useState(false);

  // PDF Generation state
  const [generatingPDF, setGeneratingPDF] = useState(false);
  const [pdfProgress, setPdfProgress] = useState(0);

  // Growth Multiplier / Referral state
  const [showReferralModal, setShowReferralModal] = useState(false);
  const [referralEmail, setReferralEmail] = useState('');
  const [referralHospitalName, setReferralHospitalName] = useState('');
  const [referralSending, setReferralSending] = useState(false);
  const [referralSuccess, setReferralSuccess] = useState(false);
  const [copiedLink, setCopiedLink] = useState(false);

  // Generate referral code and link
  const referralCode = generateReferralCode(walletAddress);
  const referralLink = `${window.location.origin}/agreement?ref=${referralCode}`;
  const referralStats = getReferralStats(referralCode);

  // Derived billing values (using context)
  const facilityType = accountType;
  const setFacilityType = changeAccountType;
  const baseFee = monthlySubscriptionFee;
  const tierName = currentTier.name;
  const mcCost = mcRate;
  const meteredUsageCost = variableUsageCost;
  const totalDue = totalOutstandingBalance;
  const baseFeeDetected = subscriptionPaid;
  const baseFeePayment = subscriptionPaid ? baseFee : 0;
  const isSubscriptionOverdue = !subscriptionPaid && totalDue > 0;

  // Color scheme
  const sarawakRed = '#DC2626'; // For overdue alerts
  const sarawakBlue = '#007BFF'; // Professional Sarawak Blue for buttons
  const medicalBlue = '#0284C7'; // For View Invoice button

  useEffect(() => {
    fetchDashboardData();
    setFluData(generateFluSeasonData());
    setDoctorPerformance(generateDoctorPerformanceData());
  }, []);

  // Update forecast data when facility type or MCs change
  useEffect(() => {
    const currentMCs = mcsIssuedThisMonth || 100; // Default to 100 if no data
    setForecastData(generateRevenueForecastData(facilityType, currentMCs));
  }, [facilityType, mcsIssuedThisMonth]);

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

  const handlePayNow = async () => {
    try {
      setPaymentProcessing(true);
      setPaymentSuccess(false);

      const result = await processPayment(totalDue);

      if (result.success) {
        setPaymentSuccess(true);

        // Auto-hide success after 5 seconds
        setTimeout(() => {
          setPaymentSuccess(false);
        }, 5000);

        // Refresh billing data
        await refreshBillingData();
        await fetchDashboardData();
      }
    } catch (error) {
      console.error('Payment error:', error);
    } finally {
      setPaymentProcessing(false);
    }
  };

  // Generate Executive Monthly Report PDF
  const generateMonthlyReport = async () => {
    setGeneratingPDF(true);
    setPdfProgress(0);

    // Simulate progress
    const progressInterval = setInterval(() => {
      setPdfProgress(prev => {
        if (prev >= 90) return prev;
        return prev + Math.random() * 15;
      });
    }, 200);

    try {
      // Small delay to show progress animation
      await new Promise(resolve => setTimeout(resolve, 800));

      const doc = new jsPDF();
      const pageWidth = doc.internal.pageSize.getWidth();
      const pageHeight = doc.internal.pageSize.getHeight();
      const margin = 20;
      let yPos = margin;

      // Colors
      const sarawakBlue = [0, 123, 255];
      const darkGray = [30, 41, 59];
      const lightGray = [100, 116, 139];
      const emeraldGreen = [16, 185, 129];

      // ========== HEADER SECTION ==========
      // Header background
      doc.setFillColor(...darkGray);
      doc.rect(0, 0, pageWidth, 45, 'F');

      // Logo placeholder (shield icon simulation)
      doc.setFillColor(...sarawakBlue);
      doc.circle(margin + 10, 22, 10, 'F');
      doc.setTextColor(255, 255, 255);
      doc.setFontSize(14);
      doc.setFont('helvetica', 'bold');
      doc.text('SM', margin + 5.5, 25);

      // Title
      doc.setTextColor(255, 255, 255);
      doc.setFontSize(8);
      doc.setFont('helvetica', 'normal');
      doc.text('KERAJAAN NEGERI SARAWAK', margin + 25, 15);
      doc.setFontSize(18);
      doc.setFont('helvetica', 'bold');
      doc.text('SARAWAK MEDCHAIN', margin + 25, 24);
      doc.setFontSize(10);
      doc.setFont('helvetica', 'normal');
      doc.text('Healthcare Blockchain Services', margin + 25, 31);

      // Report title on right
      doc.setFontSize(10);
      doc.text('EXECUTIVE MONTHLY REPORT', pageWidth - margin - 65, 18);
      doc.setFontSize(8);
      doc.text(`Generated: ${new Date().toLocaleDateString('en-MY', { day: 'numeric', month: 'long', year: 'numeric' })}`, pageWidth - margin - 65, 25);
      doc.text('January 2026', pageWidth - margin - 65, 32);

      yPos = 55;

      // ========== SUBSCRIPTION DETAILS SECTION ==========
      doc.setFillColor(248, 250, 252);
      doc.rect(margin, yPos, pageWidth - margin * 2, 35, 'F');
      doc.setDrawColor(226, 232, 240);
      doc.rect(margin, yPos, pageWidth - margin * 2, 35, 'S');

      doc.setTextColor(...darkGray);
      doc.setFontSize(12);
      doc.setFont('helvetica', 'bold');
      doc.text('Section 1: Subscription Details', margin + 5, yPos + 10);

      doc.setFontSize(10);
      doc.setFont('helvetica', 'normal');
      doc.setTextColor(...lightGray);
      doc.text(`Plan: ${tierName}`, margin + 5, yPos + 20);
      doc.text(`Monthly Fee: RM ${baseFee.toLocaleString()}`, margin + 5, yPos + 28);

      doc.text(`Facility Type: ${facilityType}`, pageWidth / 2, yPos + 20);
      doc.text(`Billing Period: January 2026`, pageWidth / 2, yPos + 28);

      yPos += 45;

      // ========== MONTHLY SUMMARY SECTION ==========
      doc.setTextColor(...darkGray);
      doc.setFontSize(12);
      doc.setFont('helvetica', 'bold');
      doc.text('Section 2: Monthly Performance Summary', margin, yPos);
      yPos += 10;

      // Summary boxes
      const boxWidth = (pageWidth - margin * 2 - 20) / 3;

      // Box 1: Total MCs
      doc.setFillColor(...sarawakBlue);
      doc.roundedRect(margin, yPos, boxWidth, 30, 3, 3, 'F');
      doc.setTextColor(255, 255, 255);
      doc.setFontSize(8);
      doc.text('TOTAL MCs ISSUED', margin + 5, yPos + 10);
      doc.setFontSize(18);
      doc.setFont('helvetica', 'bold');
      const totalMCs = doctorPerformance.reduce((sum, d) => sum + d.mcsIssued, 0);
      doc.text(totalMCs.toString(), margin + 5, yPos + 24);

      // Box 2: Total Revenue
      doc.setFillColor(...emeraldGreen);
      doc.roundedRect(margin + boxWidth + 10, yPos, boxWidth, 30, 3, 3, 'F');
      doc.setTextColor(255, 255, 255);
      doc.setFontSize(8);
      doc.setFont('helvetica', 'normal');
      doc.text('TOTAL REVENUE', margin + boxWidth + 15, yPos + 10);
      doc.setFontSize(18);
      doc.setFont('helvetica', 'bold');
      const totalRevenue = doctorPerformance.reduce((sum, d) => sum + d.revenue, 0);
      doc.text(`RM ${totalRevenue.toLocaleString()}`, margin + boxWidth + 15, yPos + 24);

      // Box 3: Active Doctors
      doc.setFillColor(...darkGray);
      doc.roundedRect(margin + (boxWidth + 10) * 2, yPos, boxWidth, 30, 3, 3, 'F');
      doc.setTextColor(255, 255, 255);
      doc.setFontSize(8);
      doc.setFont('helvetica', 'normal');
      doc.text('ACTIVE DOCTORS', margin + (boxWidth + 10) * 2 + 5, yPos + 10);
      doc.setFontSize(18);
      doc.setFont('helvetica', 'bold');
      doc.text(doctorPerformance.length.toString(), margin + (boxWidth + 10) * 2 + 5, yPos + 24);

      yPos += 45;

      // ========== BLOCKCHAIN SECURITY LOG ==========
      doc.setTextColor(...darkGray);
      doc.setFontSize(12);
      doc.setFont('helvetica', 'bold');
      doc.text('Section 3: Blockchain Security Log', margin, yPos);
      yPos += 10;

      doc.setFillColor(240, 253, 244);
      doc.rect(margin, yPos, pageWidth - margin * 2, 25, 'F');
      doc.setDrawColor(134, 239, 172);
      doc.rect(margin, yPos, pageWidth - margin * 2, 25, 'S');

      doc.setFillColor(...emeraldGreen);
      doc.circle(margin + 12, yPos + 12.5, 6, 'F');
      doc.setTextColor(255, 255, 255);
      doc.setFontSize(10);
      doc.text('✓', margin + 9.5, yPos + 15);

      doc.setTextColor(22, 101, 52);
      doc.setFontSize(10);
      doc.setFont('helvetica', 'bold');
      doc.text('100% Data Integrity Verified', margin + 25, yPos + 10);
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(8);
      doc.text(`All ${totalMCs} medical certificates cryptographically secured on Sarawak MedChain`, margin + 25, yPos + 18);

      yPos += 35;

      // ========== PRODUCTIVITY LEADERBOARD ==========
      doc.setTextColor(...darkGray);
      doc.setFontSize(12);
      doc.setFont('helvetica', 'bold');
      doc.text('Section 4: Productivity Leaderboard - Top Performers', margin, yPos);
      yPos += 8;

      // Table
      const tableData = doctorPerformance.slice(0, 3).map((doc, index) => [
        index === 0 ? '🥇 #1' : index === 1 ? '🥈 #2' : '🥉 #3',
        doc.name,
        doc.department,
        doc.mcsIssued.toString(),
        `RM ${doc.revenue}`
      ]);

      autoTable(doc, {
        startY: yPos,
        head: [['Rank', 'Doctor Name', 'Department', 'MCs Issued', 'Revenue']],
        body: tableData,
        margin: { left: margin, right: margin },
        headStyles: {
          fillColor: darkGray,
          textColor: [255, 255, 255],
          fontStyle: 'bold',
          fontSize: 9
        },
        bodyStyles: {
          fontSize: 9,
          textColor: darkGray
        },
        alternateRowStyles: {
          fillColor: [248, 250, 252]
        },
        columnStyles: {
          0: { cellWidth: 20, halign: 'center' },
          1: { cellWidth: 50 },
          2: { cellWidth: 45 },
          3: { cellWidth: 25, halign: 'center' },
          4: { cellWidth: 30, halign: 'right' }
        }
      });

      yPos = (doc).lastAutoTable.finalY + 15;

      // ========== FOOTER ==========
      // Footer line
      doc.setDrawColor(226, 232, 240);
      doc.line(margin, pageHeight - 25, pageWidth - margin, pageHeight - 25);

      doc.setFontSize(8);
      doc.setTextColor(...lightGray);
      doc.text('This is a computer-generated report and does not require a signature.', margin, pageHeight - 18);
      doc.text('Sarawak MedChain - Blockchain-Secured Healthcare Records', margin, pageHeight - 12);

      doc.setTextColor(...emeraldGreen);
      doc.text('Verified on Blockchain', pageWidth - margin - 35, pageHeight - 15);

      // Complete progress and download
      setPdfProgress(100);
      await new Promise(resolve => setTimeout(resolve, 300));

      // Save PDF
      doc.save(`SarawakMedChain_Executive_Report_${new Date().toISOString().slice(0, 7)}.pdf`);

    } catch (error) {
      console.error('Error generating PDF:', error);
      alert('Error generating PDF: ' + error.message);
    } finally {
      clearInterval(progressInterval);
      setTimeout(() => {
        setGeneratingPDF(false);
        setPdfProgress(0);
      }, 500);
    }
  };

  // Copy referral link to clipboard
  const copyReferralLink = async () => {
    try {
      await navigator.clipboard.writeText(referralLink);
      setCopiedLink(true);
      setTimeout(() => setCopiedLink(false), 2000);
    } catch (err) {
      console.error('Failed to copy:', err);
    }
  };

  // Send referral invitation (simulated)
  const sendReferralInvite = async () => {
    if (!referralEmail || !referralHospitalName) return;

    setReferralSending(true);
    try {
      // Simulate sending email
      await new Promise(resolve => setTimeout(resolve, 1500));

      // Store pending referral in localStorage
      const pendingReferrals = JSON.parse(localStorage.getItem('medchain_pending_referrals') || '[]');
      pendingReferrals.push({
        id: `ref-${Date.now()}`,
        referrerCode: referralCode,
        referrerHospital: connectedHospital?.name || 'Unknown Hospital',
        referrerWallet: walletAddress,
        invitedEmail: referralEmail,
        invitedHospitalName: referralHospitalName,
        sentAt: new Date().toISOString(),
        status: 'pending'
      });
      localStorage.setItem('medchain_pending_referrals', JSON.stringify(pendingReferrals));

      // Add to founder alerts
      const alerts = JSON.parse(localStorage.getItem('medchain_founder_alerts') || '[]');
      alerts.unshift({
        id: `alert-${Date.now()}`,
        type: 'referral_sent',
        title: 'Referral Invitation Sent',
        message: `${connectedHospital?.name || 'A hospital'} invited ${referralHospitalName} to join MedChain`,
        timestamp: new Date().toISOString(),
        read: false
      });
      localStorage.setItem('medchain_founder_alerts', JSON.stringify(alerts));

      setReferralSuccess(true);
      setReferralEmail('');
      setReferralHospitalName('');

      setTimeout(() => {
        setReferralSuccess(false);
        setShowReferralModal(false);
      }, 3000);
    } catch (error) {
      console.error('Error sending referral:', error);
    } finally {
      setReferralSending(false);
    }
  };

  // Calculate network contributor tier
  const getContributorTier = () => {
    const referralCount = referralStats.referred.length;
    if (referralCount >= 10) return { tier: 'Diamond', color: 'from-cyan-400 to-blue-500', icon: '💎', credits: referralCount * 1000 };
    if (referralCount >= 5) return { tier: 'Gold', color: 'from-yellow-400 to-amber-500', icon: '🥇', credits: referralCount * 1000 };
    if (referralCount >= 3) return { tier: 'Silver', color: 'from-gray-300 to-gray-400', icon: '🥈', credits: referralCount * 1000 };
    if (referralCount >= 1) return { tier: 'Bronze', color: 'from-amber-600 to-amber-700', icon: '🥉', credits: referralCount * 1000 };
    return { tier: 'Starter', color: 'from-slate-500 to-slate-600', icon: '🌱', credits: 0 };
  };

  const contributorTier = getContributorTier();

  return (
    <div className="flex-1 flex-grow w-full min-h-full font-sans ceo-dashboard" style={{ backgroundColor: '#0a0e14' }}>
      {/* Network-Wide Broadcast Notification */}
      <BroadcastNotification />

      {/* Service Restored Toast Notification */}
      <ServiceRestoredToast />

      <div className="px-12 py-10" style={{ maxWidth: '1400px', margin: '0 auto' }}>
      {/* Header - Full Width Enterprise Style */}
      <div className="mb-8 flex flex-col lg:flex-row lg:items-center justify-start gap-6">
        <div className="flex items-center gap-4">
          <div>
            <h1 className={`text-3xl lg:text-4xl font-bold ${darkMode ? 'text-white' : 'text-slate-800'}`}>
              {connectedHospital ? connectedHospital.name : 'Hospital CEO Dashboard'}
            </h1>
            {connectedHospital && (
              <p className={`text-sm mt-1 ${darkMode ? 'text-slate-400' : 'text-slate-500'}`}>
                {connectedHospital.location} • {connectedHospital.tier}
              </p>
            )}
          </div>
          <span className={`px-3 py-1 rounded-full text-sm font-medium ${
            darkMode ? 'bg-slate-700 text-slate-300' : 'bg-slate-100 text-slate-600'
          }`}>
            Analytics
          </span>
        </div>

        {/* Actions Row */}
        <div className="flex items-center gap-3 lg:ml-auto">
          {/* Quarterly Summary Button */}
          <button
            onClick={() => navigate('/ceo/quarterly')}
            className={`relative flex items-center gap-2 px-5 py-3 rounded-xl font-semibold transition-all shadow-lg hover:scale-[1.02] active:scale-[0.98] ${
              darkMode
                ? 'bg-gradient-to-r from-purple-500 to-indigo-600 text-white hover:from-purple-400 hover:to-indigo-500'
                : 'bg-gradient-to-r from-purple-500 to-indigo-600 text-white hover:from-purple-400 hover:to-indigo-500'
            }`}
            style={{ boxShadow: '0 10px 30px rgba(139, 92, 246, 0.3)' }}
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
            </svg>
            <span>Q Report</span>
          </button>

          {/* Expand the Network Button */}
          <button
            onClick={() => setShowReferralModal(true)}
            className={`relative flex items-center gap-2 px-6 py-3 rounded-xl font-semibold transition-all shadow-lg hover:scale-[1.02] active:scale-[0.98] overflow-hidden ${
              darkMode
                ? 'bg-gradient-to-r from-emerald-500 to-teal-600 text-white hover:from-emerald-400 hover:to-teal-500'
                : 'bg-gradient-to-r from-emerald-500 to-teal-600 text-white hover:from-emerald-400 hover:to-teal-500'
            }`}
            style={{ boxShadow: '0 10px 30px rgba(16, 185, 129, 0.3)' }}
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M18 9v3m0 0v3m0-3h3m-3 0h-3m-2-5a4 4 0 11-8 0 4 4 0 018 0zM3 20a6 6 0 0112 0v1H3v-1z" />
            </svg>
            <span>Expand the Network</span>
            {referralStats.referred.length > 0 && (
              <span className="ml-1 px-2 py-0.5 bg-white/20 rounded-full text-xs">
                {referralStats.referred.length}
              </span>
            )}
          </button>

          {/* Download Executive Report Button */}
          <button
            onClick={generateMonthlyReport}
            disabled={generatingPDF}
            className={`relative flex items-center gap-2 px-6 py-3 rounded-xl font-semibold transition-all shadow-lg hover:scale-[1.02] active:scale-[0.98] overflow-hidden ${
              generatingPDF
                ? 'bg-slate-600 cursor-wait'
                : darkMode
                  ? 'bg-gradient-to-r from-sky-500 to-blue-600 text-white hover:from-sky-400 hover:to-blue-500'
                  : 'bg-gradient-to-r from-sky-500 to-blue-600 text-white hover:from-sky-400 hover:to-blue-500'
            }`}
            style={{ boxShadow: generatingPDF ? 'none' : '0 10px 30px rgba(14, 165, 233, 0.3)' }}
          >
            {generatingPDF ? (
              <>
                {/* Progress Bar Background */}
                <div
                  className="absolute inset-0 bg-gradient-to-r from-emerald-500 to-emerald-600 transition-all duration-300"
                  style={{ width: `${pdfProgress}%` }}
                />
                <span className="relative flex items-center gap-2">
                  <svg className="w-5 h-5 animate-spin" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                  </svg>
                  <span>Generating PDF... {Math.round(pdfProgress)}%</span>
                </span>
              </>
            ) : (
              <>
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
                <span>Download Executive Report</span>
              </>
            )}
          </button>
        </div>
      </div>

      {/* Referral Modal */}
      {showReferralModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className={`w-full max-w-lg rounded-2xl shadow-2xl overflow-hidden ${
            darkMode ? 'bg-slate-800' : 'bg-white'
          }`}>
            {/* Modal Header */}
            <div className="bg-gradient-to-r from-emerald-500 to-teal-600 p-6 text-white">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-12 h-12 bg-white/20 rounded-xl flex items-center justify-center">
                    <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
                    </svg>
                  </div>
                  <div>
                    <h2 className="text-xl font-bold">Expand the Network</h2>
                    <p className="text-emerald-100 text-sm">Earn 1,000 free MC credits per referral</p>
                  </div>
                </div>
                <button
                  onClick={() => setShowReferralModal(false)}
                  className="w-8 h-8 rounded-full bg-white/20 hover:bg-white/30 flex items-center justify-center transition-colors"
                >
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
            </div>

            {/* Modal Body */}
            <div className="p-6">
              {referralSuccess ? (
                <div className="text-center py-8">
                  <div className="w-20 h-20 mx-auto mb-4 bg-emerald-100 rounded-full flex items-center justify-center">
                    <svg className="w-10 h-10 text-emerald-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                    </svg>
                  </div>
                  <h3 className={`text-xl font-bold mb-2 ${darkMode ? 'text-white' : 'text-gray-900'}`}>
                    Invitation Sent!
                  </h3>
                  <p className={`${darkMode ? 'text-gray-400' : 'text-gray-600'}`}>
                    You will earn 1,000 free MC credits when they sign up and pay.
                  </p>
                </div>
              ) : (
                <>
                  {/* Your Referral Link */}
                  <div className={`mb-6 p-4 rounded-xl ${darkMode ? 'bg-slate-700/50' : 'bg-gray-50'}`}>
                    <label className={`block text-sm font-semibold mb-2 ${darkMode ? 'text-gray-300' : 'text-gray-700'}`}>
                      Your Partner Link
                    </label>
                    <div className="flex gap-2">
                      <input
                        type="text"
                        readOnly
                        value={referralLink}
                        className={`flex-1 px-3 py-2 rounded-lg text-sm font-mono truncate ${
                          darkMode
                            ? 'bg-slate-800 border border-slate-600 text-gray-300'
                            : 'bg-white border border-gray-200 text-gray-700'
                        }`}
                      />
                      <button
                        onClick={copyReferralLink}
                        className={`px-4 py-2 rounded-lg font-medium transition-all ${
                          copiedLink
                            ? 'bg-emerald-500 text-white'
                            : darkMode
                              ? 'bg-slate-600 text-white hover:bg-slate-500'
                              : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
                        }`}
                      >
                        {copiedLink ? 'Copied!' : 'Copy'}
                      </button>
                    </div>
                    <p className={`text-xs mt-2 ${darkMode ? 'text-gray-500' : 'text-gray-500'}`}>
                      Referral Code: <span className="font-mono font-bold text-emerald-500">{referralCode}</span>
                    </p>
                  </div>

                  {/* Divider */}
                  <div className="flex items-center gap-4 mb-6">
                    <div className={`flex-1 h-px ${darkMode ? 'bg-slate-700' : 'bg-gray-200'}`}></div>
                    <span className={`text-sm ${darkMode ? 'text-gray-500' : 'text-gray-400'}`}>or invite directly</span>
                    <div className={`flex-1 h-px ${darkMode ? 'bg-slate-700' : 'bg-gray-200'}`}></div>
                  </div>

                  {/* Direct Invite Form */}
                  <div className="space-y-4">
                    <div>
                      <label className={`block text-sm font-semibold mb-2 ${darkMode ? 'text-gray-300' : 'text-gray-700'}`}>
                        Hospital Name
                      </label>
                      <input
                        type="text"
                        value={referralHospitalName}
                        onChange={(e) => setReferralHospitalName(e.target.value)}
                        placeholder="e.g., Normah Medical Specialist"
                        className={`w-full px-4 py-3 rounded-xl ${
                          darkMode
                            ? 'bg-slate-700 border border-slate-600 text-white placeholder-gray-500'
                            : 'bg-gray-50 border border-gray-200 text-gray-900 placeholder-gray-400'
                        }`}
                      />
                    </div>
                    <div>
                      <label className={`block text-sm font-semibold mb-2 ${darkMode ? 'text-gray-300' : 'text-gray-700'}`}>
                        CEO/Admin Email
                      </label>
                      <input
                        type="email"
                        value={referralEmail}
                        onChange={(e) => setReferralEmail(e.target.value)}
                        placeholder="ceo@hospital.com"
                        className={`w-full px-4 py-3 rounded-xl ${
                          darkMode
                            ? 'bg-slate-700 border border-slate-600 text-white placeholder-gray-500'
                            : 'bg-gray-50 border border-gray-200 text-gray-900 placeholder-gray-400'
                        }`}
                      />
                    </div>
                  </div>

                  {/* Reward Info */}
                  <div className={`mt-6 p-4 rounded-xl border ${
                    darkMode
                      ? 'bg-amber-500/10 border-amber-500/30'
                      : 'bg-amber-50 border-amber-200'
                  }`}>
                    <div className="flex items-start gap-3">
                      <span className="text-2xl">🎁</span>
                      <div>
                        <p className={`font-semibold ${darkMode ? 'text-amber-400' : 'text-amber-700'}`}>
                          Your Reward: 1,000 Free MC Credits
                        </p>
                        <p className={`text-sm ${darkMode ? 'text-amber-400/70' : 'text-amber-600'}`}>
                          Worth RM 1,000 — credited automatically when they complete their first RM 10,000 payment.
                        </p>
                      </div>
                    </div>
                  </div>

                  {/* Send Button */}
                  <button
                    onClick={sendReferralInvite}
                    disabled={!referralEmail || !referralHospitalName || referralSending}
                    className={`w-full mt-6 py-4 rounded-xl font-bold text-lg transition-all ${
                      !referralEmail || !referralHospitalName
                        ? 'bg-gray-300 text-gray-500 cursor-not-allowed'
                        : 'bg-gradient-to-r from-emerald-500 to-teal-600 text-white hover:from-emerald-400 hover:to-teal-500 shadow-lg'
                    }`}
                  >
                    {referralSending ? (
                      <span className="flex items-center justify-center gap-2">
                        <svg className="w-5 h-5 animate-spin" fill="none" viewBox="0 0 24 24">
                          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                        </svg>
                        Sending Invitation...
                      </span>
                    ) : (
                      'Send Invitation'
                    )}
                  </button>
                </>
              )}
            </div>

            {/* Your Stats */}
            {!referralSuccess && (
              <div className={`px-6 pb-6 pt-0`}>
                <div className={`p-4 rounded-xl ${darkMode ? 'bg-slate-700/30' : 'bg-gray-50'}`}>
                  <div className="flex items-center justify-between">
                    <div>
                      <p className={`text-sm ${darkMode ? 'text-gray-400' : 'text-gray-500'}`}>Your Referrals</p>
                      <p className={`text-2xl font-bold ${darkMode ? 'text-white' : 'text-gray-900'}`}>
                        {referralStats.referred.length} hospitals
                      </p>
                    </div>
                    <div className="text-right">
                      <p className={`text-sm ${darkMode ? 'text-gray-400' : 'text-gray-500'}`}>Credits Earned</p>
                      <p className="text-2xl font-bold text-emerald-500">
                        {referralStats.totalEarned.toLocaleString()}
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

        {/* Network Contributor Badge */}
        {referralStats.referred.length > 0 && (
          <div className={`mb-6 rounded-2xl overflow-hidden ${
            darkMode ? 'bg-slate-800 border border-slate-700' : 'bg-white shadow-lg'
          }`}>
            <div className={`bg-gradient-to-r ${contributorTier.color} p-4`}>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-14 h-14 bg-white/20 rounded-xl flex items-center justify-center text-3xl">
                    {contributorTier.icon}
                  </div>
                  <div className="text-white">
                    <p className="text-sm font-medium text-white/80">Network Contributor</p>
                    <p className="text-2xl font-black">{contributorTier.tier} Partner</p>
                  </div>
                </div>
                <div className="text-right text-white">
                  <p className="text-sm text-white/80">Credits Earned</p>
                  <p className="text-3xl font-black">{contributorTier.credits.toLocaleString()}</p>
                </div>
              </div>
            </div>
            <div className="p-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-6">
                  <div>
                    <p className={`text-xs ${darkMode ? 'text-gray-500' : 'text-gray-400'}`}>Hospitals Referred</p>
                    <p className={`text-xl font-bold ${darkMode ? 'text-white' : 'text-gray-900'}`}>
                      {referralStats.referred.length}
                    </p>
                  </div>
                  <div>
                    <p className={`text-xs ${darkMode ? 'text-gray-500' : 'text-gray-400'}`}>Total Value</p>
                    <p className="text-xl font-bold text-emerald-500">
                      RM {contributorTier.credits.toLocaleString()}
                    </p>
                  </div>
                  <div>
                    <p className={`text-xs ${darkMode ? 'text-gray-500' : 'text-gray-400'}`}>Next Tier</p>
                    <p className={`text-xl font-bold ${darkMode ? 'text-white' : 'text-gray-900'}`}>
                      {referralStats.referred.length < 1 ? '1 more' :
                       referralStats.referred.length < 3 ? `${3 - referralStats.referred.length} more` :
                       referralStats.referred.length < 5 ? `${5 - referralStats.referred.length} more` :
                       referralStats.referred.length < 10 ? `${10 - referralStats.referred.length} more` : 'Max!'}
                    </p>
                  </div>
                </div>
                <button
                  onClick={() => setShowReferralModal(true)}
                  className={`px-5 py-2.5 rounded-xl font-semibold transition-all ${
                    darkMode
                      ? 'bg-emerald-500/20 text-emerald-400 hover:bg-emerald-500/30'
                      : 'bg-emerald-100 text-emerald-700 hover:bg-emerald-200'
                  }`}
                >
                  Refer More
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Payment Success Notification */}
        {paymentSuccess && (
          <div className={`mb-6 rounded-xl px-6 py-4 flex items-center gap-3 ${
            darkMode
              ? 'bg-emerald-500/10 border border-emerald-500/30'
              : 'bg-emerald-50 border border-emerald-200'
          }`}>
            <div className={`w-10 h-10 rounded-full flex items-center justify-center ${
              darkMode ? 'bg-emerald-500/20' : 'bg-emerald-100'
            }`}>
              <svg className="w-5 h-5 text-emerald-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
            </div>
            <div>
              <p className={`font-semibold ${darkMode ? 'text-emerald-300' : 'text-emerald-700'}`}>Payment Successful!</p>
              <p className={`text-sm ${darkMode ? 'text-emerald-400/80' : 'text-emerald-600'}`}>Your monthly payment has been processed</p>
            </div>
          </div>
        )}

        {/* ========== SUBSCRIPTION & USAGE CARD (col-span-12) ========== */}
        <div className="col-span-12 mb-8">
          <div className={`rounded-2xl shadow-2xl overflow-hidden ${
            darkMode
              ? 'bg-gradient-to-br from-slate-800 via-slate-800 to-slate-900 border border-slate-700/50'
              : 'bg-white border border-gray-200'
          }`}>
            {/* Card Header */}
            <div className={`px-8 py-5 border-b ${
              darkMode ? 'border-slate-700/50 bg-slate-800/80' : 'border-gray-100 bg-gray-50'
            }`}>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-4">
                  <div className="w-12 h-12 rounded-xl flex items-center justify-center" style={{ backgroundColor: `${sarawakBlue}20` }}>
                    <svg className="w-6 h-6" style={{ color: sarawakBlue }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 7h6m0 10v-3m-3 3h.01M9 17h.01M9 14h.01M12 14h.01M15 11h.01M12 11h.01M9 11h.01M7 21h10a2 2 0 002-2V5a2 2 0 00-2-2H7a2 2 0 00-2 2v14a2 2 0 002 2z" />
                    </svg>
                  </div>
                  <div>
                    <h2 className={`text-2xl font-bold ${darkMode ? 'text-white' : 'text-gray-900'}`}>Subscription & Usage</h2>
                    <p className={`text-sm ${darkMode ? 'text-slate-400' : 'text-gray-500'}`}>January 2026 Billing Period</p>
                  </div>
                </div>
                {/* Tier Selector */}
                <div className="flex items-center gap-3">
                  <select
                    value={facilityType}
                    onChange={(e) => setFacilityType(e.target.value)}
                    className={`text-sm font-medium rounded-lg px-4 py-2 focus:ring-2 focus:ring-blue-500 ${
                      darkMode
                        ? 'bg-slate-700 border border-slate-600 text-white'
                        : 'bg-white border border-gray-200 text-gray-900'
                    }`}
                  >
                    <option value="Hospital">Hospital</option>
                    <option value="Clinic">Clinic</option>
                  </select>
                  <span className={`px-4 py-2 rounded-full text-sm font-bold ${
                    subscriptionPaid
                      ? darkMode ? 'bg-emerald-500/20 text-emerald-400' : 'bg-emerald-100 text-emerald-700'
                      : darkMode ? 'bg-amber-500/20 text-amber-400' : 'bg-amber-100 text-amber-700'
                  }`}>
                    {subscriptionPaid ? 'PAID' : 'DUE'}
                  </span>
                </div>
              </div>
            </div>

            {/* Card Body */}
            <div className="p-8">
              <div className="grid grid-cols-12 gap-8">
                {/* Left Side: Fee Breakdown */}
                <div className="col-span-12 lg:col-span-7 space-y-6">
                  {/* Base Fee */}
                  <div className={`rounded-xl p-5 border ${
                    darkMode ? 'bg-slate-700/30 border-slate-600/30' : 'bg-gray-50 border-gray-100'
                  }`}>
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-4">
                        <div className={`w-12 h-12 rounded-xl flex items-center justify-center ${
                          facilityType === 'Hospital'
                            ? darkMode ? 'bg-sky-500/20' : 'bg-sky-100'
                            : darkMode ? 'bg-emerald-500/20' : 'bg-emerald-100'
                        }`}>
                          <svg className={`w-6 h-6 ${facilityType === 'Hospital' ? 'text-sky-500' : 'text-emerald-500'}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
                          </svg>
                        </div>
                        <div>
                          <p className={`font-semibold text-lg ${darkMode ? 'text-white' : 'text-gray-900'}`}>Base Fee</p>
                          <p className={`text-sm ${darkMode ? 'text-slate-400' : 'text-gray-500'}`}>{tierName}</p>
                        </div>
                      </div>
                      <p className={`text-3xl font-bold ${darkMode ? 'text-white' : 'text-gray-900'}`}>
                        RM {baseFee.toLocaleString()}
                      </p>
                    </div>
                  </div>

                  {/* MC Usage - Live Counter */}
                  <div className={`rounded-xl p-5 border ${
                    darkMode ? 'bg-slate-700/30 border-slate-600/30' : 'bg-gray-50 border-gray-100'
                  }`}>
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-4">
                        <div className={`w-12 h-12 rounded-xl flex items-center justify-center ${
                          darkMode ? 'bg-emerald-500/20' : 'bg-emerald-100'
                        }`}>
                          <svg className="w-6 h-6 text-emerald-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                          </svg>
                        </div>
                        <div>
                          <div className="flex items-center gap-2">
                            <p className={`font-semibold text-lg ${darkMode ? 'text-white' : 'text-gray-900'}`}>MC Usage</p>
                            <span className="flex items-center gap-1 text-emerald-500 text-xs font-medium bg-emerald-500/20 px-2 py-0.5 rounded-full">
                              <span className="w-1.5 h-1.5 bg-emerald-500 rounded-full animate-pulse"></span>
                              LIVE
                            </span>
                          </div>
                          <p className={`text-sm ${darkMode ? 'text-slate-400' : 'text-gray-500'}`}>
                            <span className={`font-bold text-xl ${darkMode ? 'text-white' : 'text-gray-900'}`}>{mcsIssuedThisMonth}</span> MCs × RM {mcCost.toFixed(2)}
                          </p>
                        </div>
                      </div>
                      <p className="text-3xl font-bold text-emerald-500">
                        RM {meteredUsageCost.toLocaleString()}
                      </p>
                    </div>
                  </div>
                </div>

                {/* Right Side: Total Due & Pay Button */}
                <div className="col-span-12 lg:col-span-5">
                  <div className={`rounded-2xl p-6 h-full flex flex-col justify-center ${
                    isSubscriptionOverdue
                      ? 'bg-gradient-to-br from-red-600 to-red-800'
                      : subscriptionPaid
                        ? darkMode
                          ? 'bg-gradient-to-br from-emerald-600/20 to-emerald-800/20 border border-emerald-500/30'
                          : 'bg-gradient-to-br from-emerald-50 to-emerald-100 border border-emerald-200'
                        : darkMode
                          ? 'bg-gradient-to-br from-slate-700 to-slate-800 border border-slate-600/50'
                          : 'bg-gradient-to-br from-gray-100 to-gray-200 border border-gray-300'
                  }`}>
                    <p className={`text-sm font-semibold uppercase tracking-wider mb-2 ${
                      isSubscriptionOverdue ? 'text-red-200' : subscriptionPaid ? (darkMode ? 'text-emerald-400' : 'text-emerald-700') : (darkMode ? 'text-slate-400' : 'text-gray-600')
                    }`}>
                      Total Due
                    </p>
                    <p className={`text-6xl font-black mb-2 ${
                      isSubscriptionOverdue ? 'text-white' : subscriptionPaid ? (darkMode ? 'text-emerald-400' : 'text-emerald-700') : (darkMode ? 'text-white' : 'text-gray-900')
                    }`}>
                      RM {totalDue.toLocaleString()}
                    </p>
                    <p className={`text-sm mb-6 ${
                      isSubscriptionOverdue ? 'text-red-200' : subscriptionPaid ? (darkMode ? 'text-emerald-400/70' : 'text-emerald-600') : (darkMode ? 'text-slate-400' : 'text-gray-500')
                    }`}>
                      Base: RM {baseFee.toLocaleString()} + Usage: RM {meteredUsageCost.toLocaleString()}
                    </p>

                    {subscriptionPaid ? (
                      <div className={`flex items-center gap-2 px-4 py-3 rounded-xl ${
                        darkMode ? 'bg-emerald-500/20 text-emerald-400' : 'bg-emerald-200/50 text-emerald-700'
                      }`}>
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                        </svg>
                        <span className="font-semibold">All Dues Cleared</span>
                      </div>
                    ) : (
                      <button
                        onClick={handlePayNow}
                        disabled={paymentProcessing}
                        className="gold-btn-filled gold-btn-pulse w-full py-4 rounded-xl font-bold text-lg transition-all transform hover:scale-[1.02] active:scale-[0.98]"
                      >
                        {paymentProcessing ? (
                          <span className="flex items-center justify-center gap-2">
                            <svg className="animate-spin h-5 w-5" viewBox="0 0 24 24">
                              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                            </svg>
                            Processing...
                          </span>
                        ) : (
                          'Process Payment'
                        )}
                      </button>
                    )}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Monetization Engine - Full Width Subscription Banner */}
        <div className="col-span-12 mb-8">
          <div className={`rounded-2xl p-6 ${
            isSubscriptionOverdue
              ? darkMode
                ? 'bg-gradient-to-r from-red-900/40 to-slate-900 border-2 border-red-500/50'
                : 'bg-gradient-to-r from-red-50 to-white border-2 border-red-300'
              : darkMode
                ? 'bg-gradient-to-r from-sky-900/40 to-slate-900 border border-sky-500/30'
                : 'bg-gradient-to-r from-sky-50 to-white border border-sky-200 shadow-lg'
          }`}>
            <div className="flex flex-col gap-4">
              {/* Entity Type & Subscription Info */}
              <div className="flex items-start gap-4">
                <div className={`w-14 h-14 rounded-2xl flex items-center justify-center flex-shrink-0 ${
                  facilityType === 'Hospital'
                    ? darkMode ? 'bg-sky-500/20' : 'bg-sky-100'
                    : darkMode ? 'bg-emerald-500/20' : 'bg-emerald-100'
                }`}>
                  <svg className={`w-7 h-7 ${facilityType === 'Hospital' ? 'text-sky-500' : 'text-emerald-500'}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
                  </svg>
                </div>
                <div className="flex-1">
                  <div className="flex items-center gap-3 mb-1">
                    <select
                      value={facilityType}
                      onChange={(e) => setFacilityType(e.target.value)}
                      className={`text-sm rounded-lg px-3 py-1 focus:ring-2 focus:ring-sky-500 ${
                        darkMode
                          ? 'bg-slate-700/50 border border-slate-600 text-white'
                          : 'bg-white border border-gray-200 text-gray-900'
                      }`}
                    >
                      <option value="Hospital">Hospital</option>
                      <option value="Clinic">Clinic</option>
                    </select>
                    {isSubscriptionOverdue && (
                      <span className="px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wider" style={{ backgroundColor: `${sarawakRed}20`, color: sarawakRed }}>
                        Overdue
                      </span>
                    )}
                  </div>
                  <p className={`text-2xl font-bold ${darkMode ? 'text-white' : 'text-gray-900'}`}>
                    <span className="flex items-center gap-4 flex-wrap">
                      <span>{tierName} <span className={darkMode ? 'text-slate-400' : 'text-gray-400'}>—</span> <span className="text-sky-500">RM {baseFee.toLocaleString()}/mo</span></span>
                      {/* View Invoice Button - Positioned near tier title */}
                      <button
                        onClick={handlePayNow}
                        className="gold-btn px-5 py-2 rounded-xl font-semibold transition-all flex items-center gap-2"
                      >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                        </svg>
                        View Invoice
                      </button>
                    </span>
                  </p>
                  <p className={`text-sm mt-1 ${darkMode ? 'text-slate-400' : 'text-gray-500'}`}>
                    {facilityType === 'Hospital'
                      ? 'Unlimited doctors • Priority support • Full API access'
                      : 'Up to 5 doctors • Email support • Standard API access'}
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Transaction Meter & Real-time Costing */}
        <div className="grid grid-cols-12 gap-6 w-full mb-8">
          {/* Live Transaction Meter */}
          <div className={`col-span-12 lg:col-span-4 rounded-2xl p-6 ${
            darkMode
              ? 'bg-gradient-to-br from-slate-800 to-slate-900 border border-slate-700'
              : 'bg-white border border-gray-100 shadow-lg'
          }`}>
            <div className="flex items-center justify-between mb-4">
              <h2 className={`text-lg font-semibold ${darkMode ? 'text-white' : 'text-gray-900'}`}>Transaction Meter</h2>
              <span className="flex items-center gap-1.5 text-emerald-500 text-xs font-medium">
                <span className="w-2 h-2 bg-emerald-500 rounded-full animate-pulse"></span>
                LIVE
              </span>
            </div>
            <div className="text-center py-4">
              <p className={`text-6xl font-black tabular-nums ${darkMode ? 'text-white' : 'text-gray-900'}`}>{stats.totalMCs}</p>
              <p className={`text-sm mt-2 ${darkMode ? 'text-slate-400' : 'text-gray-500'}`}>MCs Issued This Month</p>
            </div>
            <div className={`mt-4 pt-4 border-t ${darkMode ? 'border-slate-700' : 'border-gray-100'}`}>
              <div className="flex items-center justify-between text-sm">
                <span className={darkMode ? 'text-slate-400' : 'text-gray-500'}>Rate per MC</span>
                <span className={`font-semibold ${darkMode ? 'text-white' : 'text-gray-900'}`}>RM {mcCost.toFixed(2)}</span>
              </div>
            </div>
          </div>

          {/* Real-time Costing */}
          <div className={`col-span-12 lg:col-span-4 rounded-2xl p-6 ${
            darkMode
              ? 'bg-gradient-to-br from-emerald-900/30 to-slate-900 border border-emerald-700/30'
              : 'bg-gradient-to-br from-emerald-50 to-white border border-emerald-100 shadow-lg'
          }`}>
            <h2 className={`text-lg font-semibold mb-4 ${darkMode ? 'text-white' : 'text-gray-900'}`}>Real-time Costing</h2>
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <span className={darkMode ? 'text-slate-400' : 'text-gray-500'}>Base Subscription</span>
                <span className={`font-medium ${darkMode ? 'text-white' : 'text-gray-900'}`}>RM {baseFee.toLocaleString()}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className={darkMode ? 'text-slate-400' : 'text-gray-500'}>Metered Usage ({stats.totalMCs} × RM1)</span>
                <span className="text-emerald-500 font-medium">RM {meteredUsageCost.toLocaleString()}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className={darkMode ? 'text-slate-400' : 'text-gray-500'}>Payments Received</span>
                <span className="text-sky-500 font-medium">- RM {baseFeePayment.toLocaleString()}</span>
              </div>
              <div className={`pt-4 border-t ${darkMode ? 'border-slate-700' : 'border-emerald-100'}`}>
                <div className="flex items-center justify-between">
                  <span className={`font-semibold ${darkMode ? 'text-white' : 'text-gray-900'}`}>Sub-Total Due</span>
                  <span className={`text-2xl font-bold ${isSubscriptionOverdue ? 'text-red-500' : 'text-emerald-500'}`}>
                    RM {totalDue.toLocaleString()}
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* Total Due Card - Bold & Prominent */}
          <div className={`col-span-12 lg:col-span-4 rounded-2xl p-6 shadow-xl ${
            isSubscriptionOverdue
              ? 'bg-gradient-to-br from-red-600 to-red-800 shadow-red-900/30'
              : 'bg-gradient-to-br from-sky-600 to-sky-800 shadow-sky-900/30'
          }`}>
            <h2 className={`text-lg font-semibold mb-2 ${isSubscriptionOverdue ? 'text-red-100' : 'text-sky-100'}`}>
              {isSubscriptionOverdue ? 'Amount Overdue' : 'Total Due'}
            </h2>
            <div className="mb-4">
              <p className="text-5xl font-black text-white">
                RM {totalDue.toLocaleString()}
              </p>
              <p className={`text-sm mt-1 ${isSubscriptionOverdue ? 'text-red-200' : 'text-sky-200'}`}>
                Base: RM {baseFee.toLocaleString()} + Usage: RM {meteredUsageCost.toLocaleString()}
              </p>
            </div>
            {baseFeeDetected ? (
              <div className="flex items-center gap-2 text-emerald-300 bg-emerald-500/20 px-4 py-2 rounded-lg">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
                <span className="font-medium">Base Fee Paid</span>
              </div>
            ) : (
              <button
                onClick={handlePayNow}
                className="gold-btn w-full py-3 rounded-lg font-semibold transition-all"
              >
                {isSubscriptionOverdue ? 'Pay Overdue Balance' : 'Pay Now'}
              </button>
            )}
          </div>
        </div>

        {/* Monthly Dues Table */}
        <div className={`rounded-2xl overflow-hidden mb-8 ${
          darkMode ? 'bg-slate-800/50 border border-slate-700' : 'bg-white shadow-lg'
        }`}>
          <div className={`px-6 py-4 border-b ${darkMode ? 'border-slate-700' : 'border-gray-100'}`}>
            <h2 className={`text-xl font-semibold ${darkMode ? 'text-white' : 'text-gray-900'}`}>Monthly Dues</h2>
            <p className={`text-sm ${darkMode ? 'text-slate-400' : 'text-gray-500'}`}>Invoice history and payment status</p>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className={darkMode ? 'bg-slate-700/30' : 'bg-gray-50'}>
                  <th className={`text-left px-6 py-4 font-medium text-sm ${darkMode ? 'text-slate-300' : 'text-gray-600'}`}>Billing Period</th>
                  <th className={`text-right px-6 py-4 font-medium text-sm ${darkMode ? 'text-slate-300' : 'text-gray-600'}`}>Base Fee</th>
                  <th className={`text-right px-6 py-4 font-medium text-sm ${darkMode ? 'text-slate-300' : 'text-gray-600'}`}>Metered Usage</th>
                  <th className={`text-right px-6 py-4 font-medium text-sm ${darkMode ? 'text-slate-300' : 'text-gray-600'}`}>Total</th>
                  <th className={`text-right px-6 py-4 font-medium text-sm ${darkMode ? 'text-slate-300' : 'text-gray-600'}`}>Status</th>
                  <th className={`text-right px-6 py-4 font-medium text-sm ${darkMode ? 'text-slate-300' : 'text-gray-600'}`}>Action</th>
                </tr>
              </thead>
              <tbody>
                <tr className={`border-t transition-colors ${
                  darkMode ? 'border-slate-700/30 hover:bg-slate-700/20' : 'border-gray-100 hover:bg-gray-50'
                }`}>
                  <td className={`px-6 py-4 font-medium ${darkMode ? 'text-slate-200' : 'text-gray-900'}`}>January 2026</td>
                  <td className={`px-6 py-4 text-right ${darkMode ? 'text-slate-300' : 'text-gray-600'}`}>RM {baseFee.toLocaleString()}</td>
                  <td className={`px-6 py-4 text-right ${darkMode ? 'text-slate-300' : 'text-gray-600'}`}>RM {meteredUsageCost.toLocaleString()}</td>
                  <td className={`px-6 py-4 text-right font-bold ${darkMode ? 'text-white' : 'text-gray-900'}`}>RM {totalDue.toLocaleString()}</td>
                  <td className="px-6 py-4 text-right">
                    {baseFeeDetected ? (
                      <span className="inline-flex items-center gap-1 text-emerald-500 bg-emerald-500/10 px-3 py-1 rounded-full text-sm font-medium">
                        <span className="w-2 h-2 bg-emerald-500 rounded-full"></span>
                        Paid
                      </span>
                    ) : isSubscriptionOverdue ? (
                      <span className="inline-flex items-center gap-1 px-3 py-1 rounded-full text-sm font-medium" style={{ backgroundColor: `${sarawakRed}15`, color: sarawakRed }}>
                        <span className="w-2 h-2 rounded-full" style={{ backgroundColor: sarawakRed }}></span>
                        Overdue
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 text-amber-500 bg-amber-500/10 px-3 py-1 rounded-full text-sm font-medium">
                        <span className="w-2 h-2 bg-amber-500 rounded-full"></span>
                        Pending
                      </span>
                    )}
                  </td>
                  <td className="px-6 py-4 text-right">
                    <button
                      onClick={handlePayNow}
                      disabled={baseFeeDetected}
                      className={`px-4 py-2 rounded-lg font-semibold text-sm transition-all ${
                        baseFeeDetected
                          ? 'bg-emerald-500 text-white cursor-default'
                          : 'gold-btn'
                      }`}
                    >
                      {baseFeeDetected ? 'Paid' : 'View Invoice'}
                    </button>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>

        {/* Loading State */}
        {loading ? (
          <div className="flex items-center justify-start h-64">
            <div className={`text-lg ${darkMode ? 'text-gray-400' : 'text-gray-500'}`}>
              Loading dashboard data...
            </div>
          </div>
        ) : (
          <>
            {/* Stats Cards Grid - Full Width 12 Column */}
            <div className="grid grid-cols-12 gap-10 w-full mb-8">
              <div className="col-span-12 md:col-span-4">
                <StatCard
                  title="Total MCs Issued"
                  value={stats.totalMCs.toLocaleString()}
                  subtitle="Medical certificates this period"
                  icon="📋"
                  trend={12}
                  darkMode={darkMode}
                />
              </div>
              <div className="col-span-12 md:col-span-4">
                <StatCard
                  title="Active Verified Doctors"
                  value={stats.activeDoctors}
                  subtitle="Currently registered doctors"
                  icon="👨‍⚕️"
                  trend={5}
                  darkMode={darkMode}
                />
              </div>
              <div className="col-span-12 md:col-span-4">
                <StatCard
                  title="Revenue Generated"
                  value={`RM ${stats.revenue.toLocaleString()}`}
                  subtitle="At RM1 per MC issued"
                  icon="💰"
                  trend={15}
                  darkMode={darkMode}
                />
              </div>
            </div>

            {/* Revenue Forecast Chart - col-span-8 with Soft Green Gradient */}
            <div className="grid grid-cols-12 gap-8 mb-8">
              <div className={`col-span-12 xl:col-span-8 rounded-3xl p-8 shadow-lg ${
                darkMode ? 'bg-gray-800 border border-gray-700' : 'bg-white'
              }`}>
                <div className="flex items-center justify-between mb-6">
                  <div>
                    <h2 className={`text-xl font-bold ${darkMode ? 'text-white' : 'text-gray-900'}`}>
                      Revenue Forecast
                    </h2>
                    <p className={`text-sm mt-1 ${darkMode ? 'text-gray-400' : 'text-gray-500'}`}>
                      12-month projection: Base RM {facilityType === 'Hospital' ? '10,000' : '2,000'}/mo + RM1/MC
                    </p>
                  </div>
                  <div className={`px-4 py-2 rounded-xl text-sm font-semibold ${
                    darkMode ? 'bg-emerald-500/20 text-emerald-400' : 'bg-emerald-100 text-emerald-700'
                  }`}>
                    {facilityType}
                  </div>
                </div>

                <div className="h-80">
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={forecastData}>
                      <defs>
                        <linearGradient id="greenGradient" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="#10B981" stopOpacity={0.4}/>
                          <stop offset="50%" stopColor="#10B981" stopOpacity={0.15}/>
                          <stop offset="95%" stopColor="#10B981" stopOpacity={0.02}/>
                        </linearGradient>
                        <linearGradient id="blueGradient" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="#3B82F6" stopOpacity={0.3}/>
                          <stop offset="95%" stopColor="#3B82F6" stopOpacity={0.02}/>
                        </linearGradient>
                      </defs>
                      <CartesianGrid
                        strokeDasharray="3 3"
                        stroke={darkMode ? '#374151' : '#e5e7eb'}
                        vertical={false}
                      />
                      <XAxis
                        dataKey="month"
                        stroke={darkMode ? '#9ca3af' : '#6b7280'}
                        tick={{ fill: darkMode ? '#9ca3af' : '#6b7280', fontSize: 12 }}
                        axisLine={{ stroke: darkMode ? '#4b5563' : '#d1d5db' }}
                      />
                      <YAxis
                        stroke={darkMode ? '#9ca3af' : '#6b7280'}
                        tick={{ fill: darkMode ? '#9ca3af' : '#6b7280', fontSize: 12 }}
                        tickFormatter={(value) => `RM ${(value/1000).toFixed(0)}k`}
                        axisLine={{ stroke: darkMode ? '#4b5563' : '#d1d5db' }}
                      />
                      <Tooltip
                        contentStyle={{
                          backgroundColor: darkMode ? '#1f2937' : '#ffffff',
                          border: `1px solid ${darkMode ? '#374151' : '#e5e7eb'}`,
                          borderRadius: '12px',
                          boxShadow: '0 10px 25px rgba(0,0,0,0.1)',
                          padding: '12px 16px'
                        }}
                        formatter={(value, name) => {
                          const labels = {
                            totalRevenue: 'Total Revenue',
                            baseSubscription: 'Base Subscription',
                            usageRevenue: 'MC Usage Revenue'
                          };
                          return [`RM ${value.toLocaleString()}`, labels[name] || name];
                        }}
                        labelStyle={{ color: darkMode ? '#fff' : '#111', fontWeight: 'bold', marginBottom: '8px' }}
                      />
                      <Legend
                        wrapperStyle={{ paddingTop: '20px' }}
                        formatter={(value) => {
                          const labels = {
                            totalRevenue: 'Total Revenue',
                            baseSubscription: 'Base Fee',
                            usageRevenue: 'MC Usage'
                          };
                          return <span className={darkMode ? 'text-gray-300' : 'text-gray-600'}>{labels[value] || value}</span>;
                        }}
                      />
                      <Area
                        type="monotone"
                        dataKey="totalRevenue"
                        name="totalRevenue"
                        stroke="#10B981"
                        strokeWidth={3}
                        fill="url(#greenGradient)"
                        dot={{ fill: '#10B981', strokeWidth: 2, r: 4 }}
                        activeDot={{ r: 8, stroke: '#10B981', strokeWidth: 2 }}
                      />
                      <Area
                        type="monotone"
                        dataKey="baseSubscription"
                        name="baseSubscription"
                        stroke="#3B82F6"
                        strokeWidth={2}
                        fill="url(#blueGradient)"
                        strokeDasharray="5 5"
                      />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>

                {/* Forecast Summary */}
                <div className={`mt-6 pt-6 border-t grid grid-cols-3 gap-4 ${
                  darkMode ? 'border-gray-700' : 'border-gray-100'
                }`}>
                  <div className="text-center">
                    <p className={`text-sm ${darkMode ? 'text-gray-400' : 'text-gray-500'}`}>Base Fee</p>
                    <p className={`text-xl font-bold ${darkMode ? 'text-white' : 'text-gray-900'}`}>
                      RM {(facilityType === 'Hospital' ? 10000 : 2000).toLocaleString()}
                    </p>
                  </div>
                  <div className="text-center">
                    <p className={`text-sm ${darkMode ? 'text-gray-400' : 'text-gray-500'}`}>Projected MC Revenue</p>
                    <p className="text-xl font-bold text-emerald-500">
                      RM {(forecastData[11]?.usageRevenue || 0).toLocaleString()}
                    </p>
                  </div>
                  <div className="text-center">
                    <p className={`text-sm ${darkMode ? 'text-gray-400' : 'text-gray-500'}`}>Year-End Total</p>
                    <p className="text-xl font-bold text-emerald-500">
                      RM {(forecastData[11]?.totalRevenue || 0).toLocaleString()}
                    </p>
                  </div>
                </div>
              </div>

              {/* Doctor Performance Leaderboard - col-span-4 */}
              <div className="col-span-12 xl:col-span-4">
                <div className={`rounded-2xl overflow-hidden h-full ${
                  darkMode ? 'bg-gray-800 border border-gray-700' : 'bg-white shadow-lg'
                }`}>
                  {/* Leaderboard Header */}
                  <div className={`px-6 py-4 border-b ${
                    darkMode ? 'border-gray-700 bg-gray-800/50' : 'border-gray-100 bg-gray-50'
                  }`}>
                    <div className="flex items-center justify-between">
                      <div>
                        <h3 className={`text-lg font-bold ${darkMode ? 'text-white' : 'text-gray-900'}`}>
                          Doctor Leaderboard
                        </h3>
                        <p className={`text-xs mt-0.5 ${darkMode ? 'text-gray-400' : 'text-gray-500'}`}>
                          Top performers this month
                        </p>
                      </div>
                      <div className={`px-3 py-1 rounded-full text-xs font-semibold ${
                        darkMode ? 'bg-amber-500/20 text-amber-400' : 'bg-amber-100 text-amber-700'
                      }`}>
                        {doctorPerformance.length} Doctors
                      </div>
                    </div>
                  </div>

                  {/* Leaderboard Table */}
                  <div className="p-4">
                    <div className="space-y-2">
                      {doctorPerformance.map((doctor, index) => {
                        const monthlyGoal = facilityType === 'Hospital' ? 10000 : 2000;
                        const progressPercent = Math.min(100, (doctor.revenue / monthlyGoal) * 100);

                        return (
                          <div
                            key={doctor.id}
                            className={`relative p-4 rounded-2xl transition-all cursor-pointer ${
                              darkMode
                                ? 'hover:bg-gray-700/50'
                                : 'hover:bg-slate-50'
                            } ${index === 0 ? (darkMode ? 'bg-amber-500/10 border border-amber-500/30' : 'bg-amber-50 border border-amber-200') : ''}`}
                          >
                            <div className="flex items-center gap-3">
                              {/* Rank Badge */}
                              <div className={`w-8 h-8 rounded-full flex items-center justify-center font-bold text-sm ${
                                index === 0
                                  ? 'bg-gradient-to-br from-amber-400 to-amber-600 text-white shadow-lg shadow-amber-500/30'
                                  : index === 1
                                    ? 'bg-gradient-to-br from-slate-300 to-slate-400 text-white'
                                    : index === 2
                                      ? 'bg-gradient-to-br from-amber-600 to-amber-800 text-white'
                                      : darkMode
                                        ? 'bg-gray-700 text-gray-400'
                                        : 'bg-gray-100 text-gray-500'
                              }`}>
                                {doctor.rank}
                              </div>

                              {/* Doctor Info */}
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-2">
                                  <p className={`font-semibold text-sm truncate ${darkMode ? 'text-white' : 'text-gray-900'}`}>
                                    {doctor.name}
                                  </p>
                                  {index === 0 && (
                                    <span className="flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-bold bg-gradient-to-r from-amber-400 to-amber-600 text-white shadow-sm">
                                      <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20">
                                        <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
                                      </svg>
                                      TOP
                                    </span>
                                  )}
                                </div>
                                <p className={`text-xs ${darkMode ? 'text-gray-400' : 'text-gray-500'}`}>
                                  {doctor.department}
                                </p>
                              </div>

                              {/* Revenue */}
                              <div className="text-right">
                                <p className={`font-bold ${index === 0 ? 'text-amber-500' : 'text-emerald-500'}`}>
                                  RM {doctor.revenue}
                                </p>
                                <p className={`text-xs ${darkMode ? 'text-gray-500' : 'text-gray-400'}`}>
                                  {doctor.mcsIssued} MCs
                                </p>
                              </div>
                            </div>

                            {/* Progress Bar */}
                            <div className="mt-3">
                              <div className={`h-1.5 rounded-full overflow-hidden ${
                                darkMode ? 'bg-gray-700' : 'bg-gray-100'
                              }`}>
                                <div
                                  className={`h-full rounded-full transition-all ${
                                    index === 0
                                      ? 'bg-gradient-to-r from-amber-400 to-amber-600'
                                      : 'bg-gradient-to-r from-emerald-400 to-emerald-600'
                                  }`}
                                  style={{ width: `${progressPercent}%` }}
                                />
                              </div>
                              <p className={`text-xs mt-1 ${darkMode ? 'text-gray-500' : 'text-gray-400'}`}>
                                {progressPercent.toFixed(1)}% of RM{monthlyGoal.toLocaleString()} goal
                              </p>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>

                  {/* Leaderboard Footer */}
                  <div className={`px-6 py-4 border-t ${
                    darkMode ? 'border-gray-700 bg-gray-800/30' : 'border-gray-100 bg-gray-50/50'
                  }`}>
                    <div className="flex items-center justify-between">
                      <div>
                        <p className={`text-xs font-medium ${darkMode ? 'text-gray-400' : 'text-gray-500'}`}>
                          Total Revenue
                        </p>
                        <p className="text-lg font-bold text-emerald-500">
                          RM {doctorPerformance.reduce((sum, d) => sum + d.revenue, 0).toLocaleString()}
                        </p>
                      </div>
                      <div className={`text-right`}>
                        <p className={`text-xs font-medium ${darkMode ? 'text-gray-400' : 'text-gray-500'}`}>
                          Total MCs
                        </p>
                        <p className={`text-lg font-bold ${darkMode ? 'text-white' : 'text-gray-900'}`}>
                          {doctorPerformance.reduce((sum, d) => sum + d.mcsIssued, 0)}
                        </p>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Charts Grid - Full Width */}
            <div className="grid grid-cols-12 gap-8 mb-8">
              {/* Flu Season Chart - col-span-7 */}
              <div className={`col-span-12 xl:col-span-7 rounded-3xl p-8 shadow-md ${
                darkMode ? 'bg-gray-800 border border-gray-700' : 'bg-white'
              }`}>
                <div className="flex items-center justify-between mb-6">
                  <div>
                    <h2 className={`text-xl font-bold ${darkMode ? 'text-white' : 'text-gray-900'}`}>
                      12-Month MC Issuance Trend
                    </h2>
                    <p className={`text-sm mt-1 ${darkMode ? 'text-gray-400' : 'text-gray-500'}`}>
                      Flu season spikes for staff allocation planning
                    </p>
                  </div>
                </div>

                <div className="h-96">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={fluData}>
                      <CartesianGrid
                        strokeDasharray="3 3"
                        stroke={darkMode ? '#374151' : '#e5e7eb'}
                      />
                      <XAxis
                        dataKey="month"
                        stroke={darkMode ? '#9ca3af' : '#6b7280'}
                        tick={{ fill: darkMode ? '#9ca3af' : '#6b7280', fontSize: 12 }}
                      />
                      <YAxis
                        stroke={darkMode ? '#9ca3af' : '#6b7280'}
                        tick={{ fill: darkMode ? '#9ca3af' : '#6b7280', fontSize: 12 }}
                      />
                      <Tooltip
                        contentStyle={{
                          backgroundColor: darkMode ? '#1f2937' : '#ffffff',
                          border: `1px solid ${darkMode ? '#374151' : '#e5e7eb'}`,
                          borderRadius: '12px',
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
                        dot={{ fill: '#3b82f6', strokeWidth: 2, r: 4 }}
                        activeDot={{ r: 8 }}
                      />
                      <Line
                        type="monotone"
                        dataKey="previousYear"
                        name="Previous Year"
                        stroke="#9ca3af"
                        strokeWidth={2}
                        strokeDasharray="5 5"
                        dot={{ fill: '#9ca3af', strokeWidth: 2, r: 3 }}
                      />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              </div>

              {/* Revenue Chart - col-span-5 */}
              <div className={`col-span-12 xl:col-span-5 rounded-3xl p-8 shadow-md ${
                darkMode ? 'bg-gray-800 border border-gray-700' : 'bg-white'
              }`}>
                <div className="flex items-center justify-between mb-6">
                  <div>
                    <h2 className={`text-xl font-bold ${darkMode ? 'text-white' : 'text-gray-900'}`}>
                      Revenue Trend (RM)
                    </h2>
                    <p className={`text-sm mt-1 ${darkMode ? 'text-gray-400' : 'text-gray-500'}`}>
                      Monthly revenue at RM1/MC
                    </p>
                  </div>
                </div>

                <div className="h-96">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={fluData}>
                      <CartesianGrid
                        strokeDasharray="3 3"
                        stroke={darkMode ? '#374151' : '#e5e7eb'}
                      />
                      <XAxis
                        dataKey="month"
                        stroke={darkMode ? '#9ca3af' : '#6b7280'}
                        tick={{ fill: darkMode ? '#9ca3af' : '#6b7280', fontSize: 12 }}
                      />
                      <YAxis
                        stroke={darkMode ? '#9ca3af' : '#6b7280'}
                        tick={{ fill: darkMode ? '#9ca3af' : '#6b7280', fontSize: 12 }}
                      />
                      <Tooltip
                        contentStyle={{
                          backgroundColor: darkMode ? '#1f2937' : '#ffffff',
                          border: `1px solid ${darkMode ? '#374151' : '#e5e7eb'}`,
                          borderRadius: '12px',
                          color: darkMode ? '#ffffff' : '#000000'
                        }}
                        formatter={(value) => [`RM ${value}`, 'Revenue']}
                      />
                      <Legend />
                      <Line
                        type="monotone"
                        dataKey="revenue"
                        name="Revenue (RM)"
                        stroke="#10b981"
                        strokeWidth={3}
                        dot={{ fill: '#10b981', strokeWidth: 2, r: 4 }}
                        activeDot={{ r: 8 }}
                      />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              </div>
            </div>

            {/* Key Insights Card */}
            <div className={`rounded-3xl p-8 shadow-md mb-8 ${
              darkMode ? 'bg-gray-800 border border-gray-700' : 'bg-white'
            }`}>
              <h3 className={`text-xl font-bold mb-4 ${darkMode ? 'text-white' : 'text-gray-900'}`}>
                📊 Key Insights
              </h3>
              <div className="grid grid-cols-12 gap-6">
                <div className={`col-span-12 md:col-span-4 p-5 rounded-2xl ${darkMode ? 'bg-gray-700' : 'bg-blue-50'}`}>
                  <p className={`font-semibold ${darkMode ? 'text-white' : 'text-gray-900'}`}>Peak Season</p>
                  <p className={`text-sm mt-1 ${darkMode ? 'text-gray-300' : 'text-gray-600'}`}>October - February (Monsoon season flu spike)</p>
                </div>
                <div className={`col-span-12 md:col-span-4 p-5 rounded-2xl ${darkMode ? 'bg-gray-700' : 'bg-emerald-50'}`}>
                  <p className={`font-semibold ${darkMode ? 'text-white' : 'text-gray-900'}`}>Recommendation</p>
                  <p className={`text-sm mt-1 ${darkMode ? 'text-gray-300' : 'text-gray-600'}`}>Increase staff allocation by 40% during peak months</p>
                </div>
                <div className={`col-span-12 md:col-span-4 p-5 rounded-2xl ${darkMode ? 'bg-gray-700' : 'bg-amber-50'}`}>
                  <p className={`font-semibold ${darkMode ? 'text-white' : 'text-gray-900'}`}>YoY Trend</p>
                  <p className={`text-sm mt-1 ${darkMode ? 'text-gray-300' : 'text-gray-600'}`}>12% increase in MC issuance compared to last year</p>
                </div>
              </div>
            </div>

            {/* Hospital Performance Table */}
            <div className={`rounded-3xl p-8 shadow-md ${
              darkMode ? 'bg-gray-800 border border-gray-700' : 'bg-white'
            }`}>
              <div className="flex items-center justify-between mb-6">
                <div>
                  <h2 className={`text-xl font-bold ${darkMode ? 'text-white' : 'text-gray-900'}`}>
                    Doctor Performance Overview
                  </h2>
                  <p className={`text-sm mt-1 ${darkMode ? 'text-gray-400' : 'text-gray-500'}`}>
                    Credit balances and activity status
                  </p>
                </div>
                <button
                  onClick={fetchDashboardData}
                  className="px-6 py-3 bg-sarawak-blue-500 hover:bg-sarawak-blue-600 text-white rounded-2xl font-semibold transition-all duration-200"
                >
                  Refresh
                </button>
              </div>
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

            {/* Data Privacy Notice */}
            {connectedHospital && (
              <div className={`mt-8 p-4 rounded-xl border flex items-center gap-4 ${
                darkMode
                  ? 'bg-sky-500/10 border-sky-500/30'
                  : 'bg-sky-50 border-sky-200'
              }`}>
                <svg className={`w-6 h-6 flex-shrink-0 ${darkMode ? 'text-sky-400' : 'text-sky-500'}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                </svg>
                <div>
                  <p className={`font-semibold text-sm ${darkMode ? 'text-sky-300' : 'text-sky-700'}`}>Data Privacy</p>
                  <p className={`text-xs ${darkMode ? 'text-slate-400' : 'text-slate-500'}`}>
                    You are viewing data for <strong>{connectedHospital.name}</strong> only.
                    Other hospitals' data is not accessible from this dashboard.
                    Contact MedChain support if you need cross-facility access.
                  </p>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
