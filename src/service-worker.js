// Visited Link Marker - Service Worker
// Handles all logic and CSS injection to avoid code duplication

(function() {
  'use strict';

  // Default settings
  const DEFAULT_SETTINGS = {
    visitedColor: '#551a8b', // Global color - default purple
    enabled: true,            // Global enable/disable
    siteSettings: {}          // Site-specific settings (empty by default)
  };

  const SETTINGS_KEY = 'settings';

  class VisitedLinkService {
    constructor() {
      this.settings = { ...DEFAULT_SETTINGS };
      // No caching - always generate fresh CSS and settings
      this.init();
    }

    async init() {
      try {
        // Load settings from storage
        await this.loadSettings();
        
        // Set up event listeners
        this.setupEventListeners();
        
        // Inject CSS on all existing tabs immediately
        await this.updateAllTabs();
        
      } catch (error) {
        // Error initializing service
      }
    }

    async loadSettings() {
      try {
        const result = await chrome.storage.sync.get(SETTINGS_KEY);
        this.settings = result[SETTINGS_KEY] || { ...DEFAULT_SETTINGS };
      } catch (error) {
        this.settings = { ...DEFAULT_SETTINGS };
      }
    }

    setupEventListeners() {
      // Handle extension installation
      chrome.runtime.onInstalled.addListener((details) => {
        this.handleInstallation(details);
      });

      // Handle messages from popup and content scripts
      chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
        this.handleMessage(message, sender, sendResponse);
        return true; // Keep message channel open for async response
      });

      // Handle tab updates
      chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
        this.handleTabUpdate(tabId, changeInfo, tab);
      });

      // Handle new tabs being created
      chrome.tabs.onCreated.addListener((tab) => {
        // Inject CSS immediately when new tab is created
        if (tab.id && this.shouldInjectOnSite(tab.url)) {
          this.injectCSS(tab.id);
        }
      });
      
      // Also listen for tab activation to inject CSS immediately
      chrome.tabs.onActivated.addListener(async (activeInfo) => {
        try {
          const tab = await chrome.tabs.get(activeInfo.tabId);
          if (tab && tab.url && this.shouldInjectOnSite(tab.url)) {
            await this.injectCSS(activeInfo.tabId);
          }
        } catch (error) {
          // Silent error handling
        }
      });

      // Handle storage changes
      chrome.storage.onChanged.addListener((changes, namespace) => {
        this.handleStorageChange(changes, namespace);
      });
    }

    async handleInstallation(details) {
      if (details.reason === 'install') {
        // Initialize default settings
        await this.initializeDefaultSettings();
      }
    }

    async initializeDefaultSettings() {
      try {
        const currentSettings = await this.getSettings();
        
        if (!currentSettings || Object.keys(currentSettings).length === 0) {
          await this.setSettings(DEFAULT_SETTINGS);
        }
      } catch (error) {
        // Error initializing default settings
      }
    }

    async handleMessage(message, sender, sendResponse) {
      try {
        switch (message.action) {
          case 'getSettings':
            const settings = await this.getSettings();
            sendResponse({ success: true, data: settings });
            break;

          case 'updateSettings':
            await this.updateSettings(message.settings);
            sendResponse({ success: true });
            break;

          case 'injectCSS':
            await this.injectCSS(message.tabId);
            sendResponse({ success: true });
            break;

          case 'ping':
            sendResponse({ success: true });
            break;

          default:
            sendResponse({ success: false, error: 'Unknown action' });
        }
      } catch (error) {
        sendResponse({ success: false, error: error.message });
      }
    }

    async handleTabUpdate(tabId, changeInfo, tab) {
      // Inject immediately on both loading and complete for real-time updates
      if ((changeInfo.status === 'loading' || changeInfo.status === 'complete') && tab.url) {
        try {
          // Check if we should inject CSS on this site
          if (this.shouldInjectOnSite(tab.url)) {
            // Inject immediately - no delays
            try {
              await this.injectCSS(tabId);
            } catch (error) {
              // Don't log errors for restricted pages or invalid tabs
              // Silent error handling
            }
            
            // Also inject on complete status for pages that load content later
            if (changeInfo.status === 'loading') {
              setTimeout(async () => {
                try {
                  await this.injectCSS(tabId);
                } catch (error) {
                  // Silent retry
                }
              }, 50); // Very short delay for loading status
            }
          }
        } catch (error) {
          // Error handling tab update
        }
      }
    }

    async handleStorageChange(changes, namespace) {
      if (namespace === 'sync' && changes.settings) {
        // Update local settings
        this.settings = changes.settings.newValue || { ...DEFAULT_SETTINGS };
        
        // Notify all tabs about settings change
        await this.notifyAllTabs({
          action: 'updateSettings',
          settings: this.settings
        });
      }
    }

    shouldInjectOnSite(url) {
      try {
        const urlObj = new URL(url);
        
        // Don't inject on chrome://, chrome-extension://, or other special schemes
        if (urlObj.protocol === 'chrome:' || 
            urlObj.protocol === 'chrome-extension:' ||
            urlObj.protocol === 'moz-extension:' ||
            urlObj.protocol === 'edge:' ||
            urlObj.protocol === 'about:' ||
            urlObj.protocol === 'data:' ||
            urlObj.protocol === 'file:') {
          return false;
        }
        
        // Run on all other websites
        return true;
      } catch (error) {
        return false;
      }
    }

    async injectCSS(tabId) {
      try {
        // Check if tab still exists and is accessible
        const tab = await chrome.tabs.get(tabId);
        if (!tab || !tab.url) {
          return;
        }

        // Check if we should inject on this site
        if (!this.shouldInjectOnSite(tab.url)) {
          return;
        }

        // Get effective settings for this site
        const effectiveSettings = await this.getEffectiveSettings(tabId);
        
        if (!effectiveSettings.enabled) {
          // Remove CSS when disabled
          await this.removeCSS(tabId);
          return;
        }

        // Generate CSS directly - no caching to ensure colors always update
        const css = this.generateCSS(effectiveSettings.visitedColor);
        
        // Single operation - replace CSS atomically (optimization)
        await chrome.scripting.insertCSS({
          target: { tabId },
          css: css
        });

        // No caching - always inject fresh CSS
      } catch (error) {
        // Don't log errors for restricted pages or invalid tabs
        // Silent error handling
      }
    }

    async removeCSS(tabId) {
      try {
        // Remove CSS by injecting CSS that resets the styles
        const resetCSS = `
          :root {
            --visited-link-color: unset;
          }
          html body a:visited,
          html body a:visited *,
          html body [role="link"]:visited,
          html body [role="link"]:visited * {
            color: unset !important;
          }
        `;
        
        await chrome.scripting.insertCSS({
          target: { tabId },
          css: resetCSS
        });
      } catch (error) {
        // Ignore errors when removing CSS
      }
    }

    generateCSS(color) {
      return `
        /* Visited Links Marker CSS - Using Browser's Native :visited State */
        :root {
          --visited-link-color: ${color || 'unset'};
        }

        /* High specificity CSS rules to override any website styles */
        html body a:visited,
        html body a:visited *,
        html body [role="link"]:visited,
        html body [role="link"]:visited * {
          color: var(--visited-link-color) !important;
        }

        /* Additional high-specificity rules for stubborn websites */
        html body div a:visited,
        html body div a:visited *,
        html body section a:visited,
        html body section a:visited *,
        html body article a:visited,
        html body article a:visited *,
        html body main a:visited,
        html body main a:visited *,
        html body nav a:visited,
        html body nav a:visited *,
        html body header a:visited,
        html body header a:visited *,
        html body footer a:visited,
        html body footer a:visited * {
          color: var(--visited-link-color) !important;
        }

        /* Handle common class-based links */
        html body .link:visited,
        html body .link:visited *,
        html body .url:visited,
        html body .url:visited *,
        html body .external:visited,
        html body .external:visited * {
          color: var(--visited-link-color) !important;
        }

        /* Handle deeply nested elements */
        html body a:visited span,
        html body a:visited div,
        html body a:visited p,
        html body a:visited h1,
        html body a:visited h2,
        html body a:visited h3,
        html body a:visited h4,
        html body a:visited h5,
        html body a:visited h6,
        html body a:visited strong,
        html body a:visited em,
        html body a:visited b,
        html body a:visited i,
        html body a:visited u {
          color: var(--visited-link-color) !important;
        }

        /* Override text decoration while preserving functionality */
        html body a:visited {
          color: var(--visited-link-color) !important;
        }
      `;
    }

    async getEffectiveSettings(tabId) {
      try {
        // Get tab URL to determine site-specific settings
        const tab = await chrome.tabs.get(tabId);
        const url = new URL(tab.url);
        const currentSite = url.hostname;
        
        // Get site-specific settings
        const siteSettings = this.settings.siteSettings?.[currentSite] || {};
        
        // Site is enabled if it's not explicitly disabled
        const siteEnabled = siteSettings.enabled !== false;
        
        // Use custom color only if it's defined (custom color toggle is on)
        const visitedColor = siteSettings.visitedColor !== undefined 
          ? siteSettings.visitedColor 
          : this.settings.visitedColor;
        
        const effectiveSettings = {
          visitedColor: visitedColor,
          enabled: this.settings.enabled && siteEnabled
        };

        return effectiveSettings;
      } catch (error) {
        return {
          visitedColor: this.settings.visitedColor,
          enabled: this.settings.enabled
        };
      }
    }

    async getSettings() {
      try {
        const result = await chrome.storage.sync.get(SETTINGS_KEY);
        return result[SETTINGS_KEY] || { ...DEFAULT_SETTINGS };
      } catch (error) {
        return { ...DEFAULT_SETTINGS };
      }
    }

    async setSettings(settings) {
      try {
        await chrome.storage.sync.set({ [SETTINGS_KEY]: settings });
        this.settings = settings;
        return true;
      } catch (error) {
        // Handle storage quota exceeded gracefully
        if (error.message.includes('quota')) {
          try {
            // Clear old data and retry
            await chrome.storage.sync.clear();
            await chrome.storage.sync.set({ [SETTINGS_KEY]: settings });
            this.settings = settings;
            return true;
          } catch (retryError) {
            // Failed to recover from storage quota error
          }
        }
        
        return false;
      }
    }

    async updateSettings(newSettings) {
      try {
        // Merge settings immediately
        this.settings = { ...this.settings, ...newSettings };
        
        // Save immediately for all changes - no delays
        await this.setSettings(this.settings);
        
        // No caching - always use fresh settings
        
        // Notify all tabs about settings change immediately
        await this.notifyAllTabs({
          action: 'updateSettings',
          settings: this.settings
        });
        
        // Re-inject CSS on all tabs
        await this.updateAllTabs();
        
        return true;
      } catch (error) {
        return false;
      }
    }


    async notifyAllTabs(message) {
      try {
        const tabs = await chrome.tabs.query({});
        
        for (const tab of tabs) {
          if (tab.url && this.shouldInjectOnSite(tab.url)) {
            try {
              await chrome.tabs.sendMessage(tab.id, message);
            } catch (error) {
              // Tab might not have content script loaded yet
            }
          }
        }
      } catch (error) {
        // Error notifying tabs
      }
    }

    async updateAllTabs() {
      try {
        const tabs = await chrome.tabs.query({});
        
        // Batch process tabs efficiently with parallel execution
        const promises = tabs.map(async (tab) => {
          try {
            if (tab.url && this.shouldInjectOnSite(tab.url)) {
              await this.injectCSS(tab.id);
            }
          } catch (error) {
            // Silently ignore errors for restricted pages
            // Silent error handling
          }
        });
        
        // Execute all tab updates in parallel for maximum speed
        await Promise.all(promises);
      } catch (error) {
        // Error updating tabs
      }
    }
  }

  // Initialize service
  new VisitedLinkService();
})();
