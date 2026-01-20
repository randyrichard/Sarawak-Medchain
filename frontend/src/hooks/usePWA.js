/**
 * PWA Hook - Manages manifest and apple-touch-icon injection for unique home screen icons
 * Each page calls this to set its own PWA identity
 */
import { useEffect } from 'react';

export function usePWA(config) {
  useEffect(() => {
    // Skip if no config specified (conditional PWA)
    if (!config) return;

    const { manifest, icon, themeColor, title } = config;

    // Skip if no manifest specified
    if (!manifest) return;

    // Remove existing manifest link and create new one
    const existingManifest = document.querySelector('link[rel="manifest"]');
    if (existingManifest) {
      existingManifest.remove();
    }
    const manifestLink = document.createElement('link');
    manifestLink.rel = 'manifest';
    manifestLink.href = manifest;
    document.head.appendChild(manifestLink);

    // Remove existing apple-touch-icon and create new one (only if icon specified)
    if (icon) {
      const existingAppleIcon = document.querySelector('link[rel="apple-touch-icon"]');
      if (existingAppleIcon) {
        existingAppleIcon.remove();
      }
      const appleIcon = document.createElement('link');
      appleIcon.rel = 'apple-touch-icon';
      appleIcon.href = icon;
      document.head.appendChild(appleIcon);
    }

    // Update theme-color meta tag
    let themeColorMeta = document.querySelector('meta[name="theme-color"]');
    if (!themeColorMeta) {
      themeColorMeta = document.createElement('meta');
      themeColorMeta.name = 'theme-color';
      document.head.appendChild(themeColorMeta);
    }
    themeColorMeta.content = themeColor;

    // Update apple-mobile-web-app-title
    let appTitle = document.querySelector('meta[name="apple-mobile-web-app-title"]');
    if (!appTitle) {
      appTitle = document.createElement('meta');
      appTitle.name = 'apple-mobile-web-app-title';
      document.head.appendChild(appTitle);
    }
    appTitle.content = title;

    // Update page title
    document.title = title;

    // Cleanup on unmount
    return () => {
      // Optionally restore defaults here
    };
  }, [config]);
}

// PWA configurations for each app - using isolated /pwa/ paths
export const PWA_CONFIGS = {
  // No PWA for landing - just a regular website
  landing: null,
  gov: {
    manifest: '/manifest-gov.json',
    icon: '/icons/gov-180.png',
    themeColor: '#d97706',
    title: 'Gov',
    path: '/admin/gov-dashboard',
  },
  verify: {
    manifest: '/manifest-verify.json',
    icon: '/icons/verify-180.png',
    themeColor: '#0ea5e9',
    title: 'Verify',
    path: '/pwa/verify',
  },
  issue: {
    manifest: '/manifest-issue.json',
    icon: '/icons/issue-180.png',
    themeColor: '#10b981',
    title: 'Issue',
    path: '/pwa/issue',
  },
};
