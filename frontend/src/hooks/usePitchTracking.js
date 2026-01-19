import { useEffect, useRef, useState, useCallback } from 'react';
import { useLeadAnalytics } from '../context/LeadAnalyticsContext';

/**
 * Hook for tracking user behavior on the pitch page
 * Monitors section visibility, time spent, and interactions
 */
export function usePitchTracking(trackingId = null) {
  const {
    startPitchSession,
    updateSectionTime,
    recordAction,
    endPitchSession,
    getLeadByTrackingId,
  } = useLeadAnalytics();

  const [sessionId, setSessionId] = useState(null);
  const [currentSection, setCurrentSection] = useState('hero');
  const [isTracking, setIsTracking] = useState(false);

  const sectionStartTime = useRef(Date.now());
  const lastUpdateTime = useRef(Date.now());
  const intersectionObserver = useRef(null);
  const updateInterval = useRef(null);

  // Start tracking session
  const startTracking = useCallback(() => {
    if (isTracking) return;

    const session = startPitchSession(trackingId);
    setSessionId(session.id);
    setIsTracking(true);
    sectionStartTime.current = Date.now();

    // Update time every 5 seconds
    updateInterval.current = setInterval(() => {
      if (sessionId) {
        const timeSpent = (Date.now() - lastUpdateTime.current) / 1000;
        updateSectionTime(sessionId, currentSection, timeSpent);
        lastUpdateTime.current = Date.now();
      }
    }, 5000);

    return session;
  }, [trackingId, startPitchSession, isTracking, sessionId, currentSection, updateSectionTime]);

  // Stop tracking session
  const stopTracking = useCallback(() => {
    if (!isTracking || !sessionId) return;

    // Record final time for current section
    const timeSpent = (Date.now() - sectionStartTime.current) / 1000;
    updateSectionTime(sessionId, currentSection, timeSpent);

    // Clear interval
    if (updateInterval.current) {
      clearInterval(updateInterval.current);
    }

    // End session
    endPitchSession(sessionId);
    setIsTracking(false);
    setSessionId(null);
  }, [isTracking, sessionId, currentSection, updateSectionTime, endPitchSession]);

  // Handle section change
  const handleSectionChange = useCallback((newSection) => {
    if (!sessionId || newSection === currentSection) return;

    // Record time spent on previous section
    const timeSpent = (Date.now() - sectionStartTime.current) / 1000;
    updateSectionTime(sessionId, currentSection, timeSpent);

    // Start timing new section
    setCurrentSection(newSection);
    sectionStartTime.current = Date.now();
    lastUpdateTime.current = Date.now();

    // Record section view action
    recordAction(sessionId, {
      type: 'section_view',
      target: newSection,
    });
  }, [sessionId, currentSection, updateSectionTime, recordAction]);

  // Track click events
  const trackClick = useCallback((target, metadata = {}) => {
    if (!sessionId) return;

    recordAction(sessionId, {
      type: 'click',
      target,
      ...metadata,
    });
  }, [sessionId, recordAction]);

  // Track scroll depth
  const trackScroll = useCallback((percentage) => {
    if (!sessionId) return;

    recordAction(sessionId, {
      type: 'scroll',
      target: `${percentage}%`,
    });
  }, [sessionId, recordAction]);

  // Setup intersection observer for section tracking
  useEffect(() => {
    if (!isTracking) return;

    const sectionElements = document.querySelectorAll('[data-section]');

    intersectionObserver.current = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting && entry.intersectionRatio >= 0.5) {
            const section = entry.target.getAttribute('data-section');
            if (section) {
              handleSectionChange(section);
            }
          }
        });
      },
      {
        threshold: [0.5],
        rootMargin: '-10% 0px -10% 0px',
      }
    );

    sectionElements.forEach((el) => {
      intersectionObserver.current.observe(el);
    });

    return () => {
      if (intersectionObserver.current) {
        intersectionObserver.current.disconnect();
      }
    };
  }, [isTracking, handleSectionChange]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (isTracking && sessionId) {
        stopTracking();
      }
    };
  }, []);

  // Handle page visibility change (tab switch)
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.hidden && isTracking) {
        // Pause tracking when tab is hidden
        const timeSpent = (Date.now() - sectionStartTime.current) / 1000;
        if (sessionId) {
          updateSectionTime(sessionId, currentSection, timeSpent);
        }
      } else if (!document.hidden && isTracking) {
        // Resume tracking when tab is visible
        sectionStartTime.current = Date.now();
        lastUpdateTime.current = Date.now();
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => document.removeEventListener('visibilitychange', handleVisibilityChange);
  }, [isTracking, sessionId, currentSection, updateSectionTime]);

  // Handle beforeunload
  useEffect(() => {
    const handleBeforeUnload = () => {
      if (isTracking && sessionId) {
        stopTracking();
      }
    };

    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [isTracking, sessionId, stopTracking]);

  return {
    sessionId,
    currentSection,
    isTracking,
    startTracking,
    stopTracking,
    trackClick,
    trackScroll,
    handleSectionChange,
  };
}

/**
 * Component wrapper for section tracking
 */
export function TrackedSection({ id, children, className = '' }) {
  return (
    <div data-section={id} className={className}>
      {children}
    </div>
  );
}

export default usePitchTracking;
