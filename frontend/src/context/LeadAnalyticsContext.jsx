import { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';

const LeadAnalyticsContext = createContext();

// Storage keys
const STORAGE_KEYS = {
  LEADS: 'medchain_hospital_leads',
  SESSIONS: 'medchain_lead_sessions',
  EMAIL_OPENS: 'medchain_email_opens',
  ALERTS: 'medchain_ceo_alerts',
};

// Default hospital leads (top 10 prospects)
const DEFAULT_LEADS = [
  {
    id: 'lead_001',
    hospitalName: 'KPJ Kuching Specialist Hospital',
    ceoName: 'Dato\' Dr. Ahmad Razali',
    email: 'ceo@kpjkuching.com.my',
    region: 'Kuching',
    trackingId: 'trk_kpj_kuching_001',
    status: 'invited',
    foundingSlot: 2,
  },
  {
    id: 'lead_002',
    hospitalName: 'Normah Medical Specialist Centre',
    ceoName: 'Dr. Noriah Hassan',
    email: 'ceo@normah.com.my',
    region: 'Kuching',
    trackingId: 'trk_normah_002',
    status: 'invited',
    foundingSlot: 3,
  },
  {
    id: 'lead_003',
    hospitalName: 'Timberland Medical Centre',
    ceoName: 'Mr. James Wong',
    email: 'ceo@timberland.com.my',
    region: 'Kuching',
    trackingId: 'trk_timberland_003',
    status: 'converted',
    foundingSlot: 1,
  },
  {
    id: 'lead_004',
    hospitalName: 'KPJ Bintulu Specialist Hospital',
    ceoName: 'Dr. Faizal Rahman',
    email: 'ceo@kpjbintulu.com.my',
    region: 'Bintulu',
    trackingId: 'trk_kpj_bintulu_004',
    status: 'viewing',
    foundingSlot: null,
  },
  {
    id: 'lead_005',
    hospitalName: 'Rejang Medical Centre',
    ceoName: 'Dato\' Dr. Ling Sing Hiing',
    email: 'ceo@rejangmedical.com.my',
    region: 'Sibu',
    trackingId: 'trk_rejang_005',
    status: 'invited',
    foundingSlot: 4,
  },
  {
    id: 'lead_006',
    hospitalName: 'Bintulu Medical Centre',
    ceoName: 'Dr. Michael Teo',
    email: 'ceo@bintulumedical.com.my',
    region: 'Bintulu',
    trackingId: 'trk_bintulu_006',
    status: 'converted',
    foundingSlot: 5,
  },
  {
    id: 'lead_007',
    hospitalName: 'Columbia Asia Hospital Miri',
    ceoName: 'Ms. Sarah Lim',
    email: 'ceo@columbiasiamiri.com.my',
    region: 'Miri',
    trackingId: 'trk_columbia_007',
    status: 'opened',
    foundingSlot: null,
  },
  {
    id: 'lead_008',
    hospitalName: 'Borneo Medical Centre',
    ceoName: 'Dr. Abdul Karim',
    email: 'ceo@borneomedical.com.my',
    region: 'Kuching',
    trackingId: 'trk_borneo_008',
    status: 'invited',
    foundingSlot: null,
  },
  {
    id: 'lead_009',
    hospitalName: 'Miri City Medical Centre',
    ceoName: 'Dr. Wong Chee Keong',
    email: 'ceo@miricity.com.my',
    region: 'Miri',
    trackingId: 'trk_miricity_009',
    status: 'invited',
    foundingSlot: null,
  },
  {
    id: 'lead_010',
    hospitalName: 'Sibu Specialist Medical Centre',
    ceoName: 'Dato\' Dr. Hii King Ching',
    email: 'ceo@sibuspecialist.com.my',
    region: 'Sibu',
    trackingId: 'trk_sibu_010',
    status: 'invited',
    foundingSlot: null,
  },
];

// Section names for heatmap tracking
const PITCH_SECTIONS = {
  hero: 'Hero Section',
  fraudAlert: 'Fraud Alert',
  howItWorks: 'How It Works',
  security: 'Security Features',
  foundingCircle: 'Founding Circle',
  pricing: 'Pricing',
  roi: 'ROI Calculator',
  testimonials: 'Testimonials',
  cta: 'Call to Action',
};

export function LeadAnalyticsProvider({ children }) {
  const [leads, setLeads] = useState([]);
  const [activeSessions, setActiveSessions] = useState([]);
  const [emailOpens, setEmailOpens] = useState([]);
  const [ceoAlerts, setCeoAlerts] = useState([]);
  const [isLoading, setIsLoading] = useState(true);

  // Load data from localStorage
  useEffect(() => {
    const storedLeads = localStorage.getItem(STORAGE_KEYS.LEADS);
    const storedSessions = localStorage.getItem(STORAGE_KEYS.SESSIONS);
    const storedOpens = localStorage.getItem(STORAGE_KEYS.EMAIL_OPENS);
    const storedAlerts = localStorage.getItem(STORAGE_KEYS.ALERTS);

    if (storedLeads) {
      try {
        setLeads(JSON.parse(storedLeads));
      } catch (e) {
        setLeads(DEFAULT_LEADS);
      }
    } else {
      setLeads(DEFAULT_LEADS);
      localStorage.setItem(STORAGE_KEYS.LEADS, JSON.stringify(DEFAULT_LEADS));
    }

    if (storedSessions) {
      try {
        setActiveSessions(JSON.parse(storedSessions));
      } catch (e) {
        setActiveSessions([]);
      }
    }

    if (storedOpens) {
      try {
        setEmailOpens(JSON.parse(storedOpens));
      } catch (e) {
        setEmailOpens([]);
      }
    }

    if (storedAlerts) {
      try {
        setCeoAlerts(JSON.parse(storedAlerts));
      } catch (e) {
        setCeoAlerts([]);
      }
    }

    setIsLoading(false);
  }, []);

  // Generate unique tracking pixel URL for email
  const generateTrackingPixel = useCallback((leadId) => {
    const lead = leads.find(l => l.id === leadId);
    if (!lead) return null;

    const pixelUrl = `${window.location.origin}/api/track/email/${lead.trackingId}`;
    const pixelHtml = `<img src="${pixelUrl}" width="1" height="1" style="display:none" alt="" />`;

    return {
      url: pixelUrl,
      html: pixelHtml,
      trackingId: lead.trackingId,
    };
  }, [leads]);

  // Record email open event
  const recordEmailOpen = useCallback((trackingId) => {
    const lead = leads.find(l => l.trackingId === trackingId);
    if (!lead) return;

    const openEvent = {
      id: `open_${Date.now()}`,
      leadId: lead.id,
      trackingId,
      hospitalName: lead.hospitalName,
      ceoName: lead.ceoName,
      timestamp: new Date().toISOString(),
      userAgent: navigator.userAgent,
    };

    const updatedOpens = [...emailOpens, openEvent];
    setEmailOpens(updatedOpens);
    localStorage.setItem(STORAGE_KEYS.EMAIL_OPENS, JSON.stringify(updatedOpens));

    // Update lead status
    const updatedLeads = leads.map(l => {
      if (l.id === lead.id && l.status === 'invited') {
        return { ...l, status: 'opened', emailOpenedAt: openEvent.timestamp };
      }
      return l;
    });
    setLeads(updatedLeads);
    localStorage.setItem(STORAGE_KEYS.LEADS, JSON.stringify(updatedLeads));

    // Create alert
    createAlert('email_opened', lead, `${lead.ceoName} opened the Founding Partner invitation email`);

    return openEvent;
  }, [leads, emailOpens]);

  // Start a pitch page session
  const startPitchSession = useCallback((trackingId) => {
    const lead = leads.find(l => l.trackingId === trackingId);

    const session = {
      id: `session_${Date.now()}`,
      leadId: lead?.id || 'anonymous',
      trackingId: trackingId || 'direct',
      hospitalName: lead?.hospitalName || 'Unknown Visitor',
      ceoName: lead?.ceoName || 'Anonymous',
      startTime: new Date().toISOString(),
      lastActivity: new Date().toISOString(),
      currentSection: 'hero',
      sectionTimes: {
        hero: 0,
        fraudAlert: 0,
        howItWorks: 0,
        security: 0,
        foundingCircle: 0,
        pricing: 0,
        roi: 0,
        testimonials: 0,
        cta: 0,
      },
      totalTime: 0,
      isActive: true,
      actions: [],
    };

    const updatedSessions = [...activeSessions.filter(s => s.trackingId !== trackingId), session];
    setActiveSessions(updatedSessions);
    localStorage.setItem(STORAGE_KEYS.SESSIONS, JSON.stringify(updatedSessions));

    // Update lead status
    if (lead && lead.status !== 'converted') {
      const updatedLeads = leads.map(l => {
        if (l.id === lead.id) {
          return { ...l, status: 'viewing', lastViewedAt: session.startTime };
        }
        return l;
      });
      setLeads(updatedLeads);
      localStorage.setItem(STORAGE_KEYS.LEADS, JSON.stringify(updatedLeads));

      // Create real-time alert
      createAlert('viewing_pitch', lead, `${lead.ceoName} of ${lead.hospitalName} is currently viewing the Pitch Portal`);
    }

    return session;
  }, [leads, activeSessions]);

  // Update section time tracking
  const updateSectionTime = useCallback((sessionId, section, timeSpent) => {
    const updatedSessions = activeSessions.map(s => {
      if (s.id === sessionId) {
        return {
          ...s,
          lastActivity: new Date().toISOString(),
          currentSection: section,
          sectionTimes: {
            ...s.sectionTimes,
            [section]: (s.sectionTimes[section] || 0) + timeSpent,
          },
          totalTime: s.totalTime + timeSpent,
        };
      }
      return s;
    });
    setActiveSessions(updatedSessions);
    localStorage.setItem(STORAGE_KEYS.SESSIONS, JSON.stringify(updatedSessions));
  }, [activeSessions]);

  // Record an action (click, scroll, etc.)
  const recordAction = useCallback((sessionId, action) => {
    const updatedSessions = activeSessions.map(s => {
      if (s.id === sessionId) {
        return {
          ...s,
          lastActivity: new Date().toISOString(),
          actions: [...s.actions, {
            type: action.type,
            target: action.target,
            timestamp: new Date().toISOString(),
          }],
        };
      }
      return s;
    });
    setActiveSessions(updatedSessions);
    localStorage.setItem(STORAGE_KEYS.SESSIONS, JSON.stringify(updatedSessions));
  }, [activeSessions]);

  // End a session
  const endPitchSession = useCallback((sessionId) => {
    const session = activeSessions.find(s => s.id === sessionId);
    if (!session) return;

    const updatedSessions = activeSessions.map(s => {
      if (s.id === sessionId) {
        return {
          ...s,
          isActive: false,
          endTime: new Date().toISOString(),
        };
      }
      return s;
    });
    setActiveSessions(updatedSessions);
    localStorage.setItem(STORAGE_KEYS.SESSIONS, JSON.stringify(updatedSessions));

    // Update lead status back to opened (not actively viewing)
    const lead = leads.find(l => l.id === session.leadId);
    if (lead && lead.status === 'viewing') {
      const updatedLeads = leads.map(l => {
        if (l.id === lead.id) {
          return { ...l, status: 'opened' };
        }
        return l;
      });
      setLeads(updatedLeads);
      localStorage.setItem(STORAGE_KEYS.LEADS, JSON.stringify(updatedLeads));

      // Create session end alert
      createAlert('left_pitch', lead, `${lead.ceoName} left the Pitch Portal after ${Math.round(session.totalTime / 60)}min`);
    }
  }, [activeSessions, leads]);

  // Create a CEO alert
  const createAlert = useCallback((type, lead, message) => {
    const alert = {
      id: `alert_${Date.now()}`,
      type,
      leadId: lead.id,
      hospitalName: lead.hospitalName,
      ceoName: lead.ceoName,
      region: lead.region,
      message,
      timestamp: new Date().toISOString(),
      isRead: false,
    };

    setCeoAlerts(prev => {
      const updated = [alert, ...prev].slice(0, 50); // Keep last 50 alerts
      localStorage.setItem(STORAGE_KEYS.ALERTS, JSON.stringify(updated));
      return updated;
    });

    // Dispatch custom event for real-time notification
    window.dispatchEvent(new CustomEvent('medchain-ceo-alert', { detail: alert }));

    return alert;
  }, []);

  // Mark alert as read
  const markAlertRead = useCallback((alertId) => {
    const updatedAlerts = ceoAlerts.map(a => {
      if (a.id === alertId) {
        return { ...a, isRead: true };
      }
      return a;
    });
    setCeoAlerts(updatedAlerts);
    localStorage.setItem(STORAGE_KEYS.ALERTS, JSON.stringify(updatedAlerts));
  }, [ceoAlerts]);

  // Mark all alerts as read
  const markAllAlertsRead = useCallback(() => {
    const updatedAlerts = ceoAlerts.map(a => ({ ...a, isRead: true }));
    setCeoAlerts(updatedAlerts);
    localStorage.setItem(STORAGE_KEYS.ALERTS, JSON.stringify(updatedAlerts));
  }, [ceoAlerts]);

  // Get unread alert count
  const getUnreadAlertCount = useCallback(() => {
    return ceoAlerts.filter(a => !a.isRead).length;
  }, [ceoAlerts]);

  // Get lead by tracking ID
  const getLeadByTrackingId = useCallback((trackingId) => {
    return leads.find(l => l.trackingId === trackingId);
  }, [leads]);

  // Get active sessions (currently viewing)
  const getActiveViewers = useCallback(() => {
    return activeSessions.filter(s => s.isActive);
  }, [activeSessions]);

  // Get conversion heatmap data
  const getHeatmapData = useCallback(() => {
    const allSectionTimes = {};

    // Initialize all sections
    Object.keys(PITCH_SECTIONS).forEach(key => {
      allSectionTimes[key] = {
        name: PITCH_SECTIONS[key],
        totalTime: 0,
        sessionCount: 0,
        avgTime: 0,
      };
    });

    // Aggregate data from all sessions
    activeSessions.forEach(session => {
      Object.entries(session.sectionTimes).forEach(([section, time]) => {
        if (allSectionTimes[section]) {
          allSectionTimes[section].totalTime += time;
          if (time > 0) {
            allSectionTimes[section].sessionCount += 1;
          }
        }
      });
    });

    // Calculate averages and find max for percentage
    let maxTime = 0;
    Object.keys(allSectionTimes).forEach(key => {
      const data = allSectionTimes[key];
      data.avgTime = data.sessionCount > 0 ? data.totalTime / data.sessionCount : 0;
      if (data.totalTime > maxTime) maxTime = data.totalTime;
    });

    // Add percentage (relative to max)
    Object.keys(allSectionTimes).forEach(key => {
      allSectionTimes[key].percentage = maxTime > 0
        ? Math.round((allSectionTimes[key].totalTime / maxTime) * 100)
        : 0;
    });

    return allSectionTimes;
  }, [activeSessions]);

  // Get lead funnel stats
  const getFunnelStats = useCallback(() => {
    const stats = {
      total: leads.length,
      invited: leads.filter(l => l.status === 'invited').length,
      opened: leads.filter(l => l.status === 'opened').length,
      viewing: leads.filter(l => l.status === 'viewing').length,
      converted: leads.filter(l => l.status === 'converted').length,
    };

    stats.openRate = stats.total > 0 ? Math.round(((stats.opened + stats.viewing + stats.converted) / stats.total) * 100) : 0;
    stats.conversionRate = stats.total > 0 ? Math.round((stats.converted / stats.total) * 100) : 0;

    return stats;
  }, [leads]);

  const value = {
    leads,
    activeSessions,
    emailOpens,
    ceoAlerts,
    isLoading,
    generateTrackingPixel,
    recordEmailOpen,
    startPitchSession,
    updateSectionTime,
    recordAction,
    endPitchSession,
    createAlert,
    markAlertRead,
    markAllAlertsRead,
    getUnreadAlertCount,
    getLeadByTrackingId,
    getActiveViewers,
    getHeatmapData,
    getFunnelStats,
    PITCH_SECTIONS,
  };

  return (
    <LeadAnalyticsContext.Provider value={value}>
      {children}
    </LeadAnalyticsContext.Provider>
  );
}

export function useLeadAnalytics() {
  const context = useContext(LeadAnalyticsContext);
  if (!context) {
    throw new Error('useLeadAnalytics must be used within a LeadAnalyticsProvider');
  }
  return context;
}

export default LeadAnalyticsContext;
