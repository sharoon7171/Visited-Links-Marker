// Visited Link Marker - Popup Functionality
import { StorageManager, DEFAULT_SETTINGS } from '../../utilities/storage-manager.mjs';

class PopupController {
  constructor() {
    this.settings = { ...DEFAULT_SETTINGS };
    this.currentSite = null;
    this.isInitialized = false;
    this.storageUpdateTimeout = null;

    this.init();
  }

  async init() {
    try {
      // Load settings from storage
      await this.loadSettings();

      // Get current site information
      await this.getCurrentSiteInfo();

      // Initialize UI elements
      this.initializeUI();

      // Setup event listeners
      this.setupEventListeners();

      // Show settings content
      this.showSettingsContent();

      this.isInitialized = true;

    } catch (error) {
      this.showError('Failed to load settings');
    }
  }

  async loadSettings() {
    try {
      this.settings = await StorageManager.getSettings();
    } catch (error) {
      this.settings = { ...DEFAULT_SETTINGS };
    }
  }

  async getCurrentSiteInfo() {
    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (tab && tab.url) {
        const url = new URL(tab.url);
        this.currentSite = url.hostname;
        this.updateSiteDisplay();
      }
    } catch (error) {
      this.currentSite = 'Unknown';
    }
  }

  updateSiteDisplay() {
    const siteNameElement = document.getElementById('site-name');
    if (siteNameElement && this.currentSite) {
      siteNameElement.textContent = this.currentSite;
    }
  }

  initializeUI() {
    // Initialize global settings
    this.initializeGlobalSettings();
    
    // Initialize site-specific settings
    this.initializeSiteSettings();
    
    // Update status indicator
    this.updateStatusIndicator();
  }

  initializeGlobalSettings() {
    // Global toggle
    const globalToggle = document.getElementById('global-toggle');
    if (globalToggle) {
      globalToggle.checked = this.settings.enabled;
    }

    // Global color picker
    const globalColorPicker = document.getElementById('global-color-picker');
    const globalColorHex = document.getElementById('global-color-hex');
    if (globalColorPicker && globalColorHex) {
      globalColorPicker.value = this.settings.visitedColor;
      globalColorHex.value = this.settings.visitedColor;
    }

  }

  initializeSiteSettings() {
    const currentSite = this.getCurrentSite();
    const siteSettings = this.settings.siteSettings?.[currentSite] || {};

    // Site toggle
    const siteToggle = document.getElementById('site-toggle');
    if (siteToggle) {
      siteToggle.checked = siteSettings.enabled !== false;
    }

    // Use custom color toggle
    const useCustomColor = document.getElementById('use-custom-color');
    const siteColorRow = document.getElementById('site-color-row');
    if (useCustomColor && siteColorRow) {
      const hasCustomColor = siteSettings.visitedColor !== undefined;
      useCustomColor.checked = hasCustomColor;
      siteColorRow.style.display = hasCustomColor ? 'flex' : 'none';
    }

    // Site color picker
    const siteColorPicker = document.getElementById('site-color-picker');
    const siteColorHex = document.getElementById('site-color-hex');
    if (siteColorPicker && siteColorHex) {
      if (siteSettings.visitedColor) {
        // Has custom color for this site
        siteColorPicker.value = siteSettings.visitedColor;
        siteColorHex.value = siteSettings.visitedColor;
      } else {
        // Uses global color
        siteColorPicker.value = this.settings.visitedColor;
        siteColorHex.value = this.settings.visitedColor;
      }
    }

  }

  getCurrentSite() {
    if (this.currentSite === 'local-file') {
      return 'local-file';
    }
    return this.currentSite || 'unknown';
  }

  setupEventListeners() {
    // Global settings
    this.setupGlobalEventListeners();
    
    // Site-specific settings
    this.setupSiteEventListeners();
    
    // Modal controls
  }

  setupGlobalEventListeners() {
    // Global toggle
    const globalToggle = document.getElementById('global-toggle');
    if (globalToggle) {
      globalToggle.addEventListener('change', (e) => {
        this.updateGlobalSetting('enabled', e.target.checked);
      });
    }

    // Global color picker
    const globalColorPicker = document.getElementById('global-color-picker');
    const globalColorHex = document.getElementById('global-color-hex');
    if (globalColorPicker && globalColorHex) {
      globalColorPicker.addEventListener('input', (e) => {
        globalColorHex.value = e.target.value;
        this.updateGlobalSetting('visitedColor', e.target.value);
      });

      globalColorHex.addEventListener('input', (e) => {
        if (this.isValidHexColor(e.target.value)) {
          globalColorPicker.value = e.target.value;
          this.updateGlobalSetting('visitedColor', e.target.value);
        }
      });
    }

  }

  setupSiteEventListeners() {
    // Site toggle
    const siteToggle = document.getElementById('site-toggle');
    if (siteToggle) {
      siteToggle.addEventListener('change', (e) => {
        this.updateSiteSetting('enabled', e.target.checked);
      });
    }

    // Site color picker - Set up event listeners first
    const siteColorPicker = document.getElementById('site-color-picker');
    const siteColorHex = document.getElementById('site-color-hex');
    if (siteColorPicker && siteColorHex) {
      siteColorPicker.addEventListener('input', (e) => {
        siteColorHex.value = e.target.value;
        this.updateSiteSetting('visitedColor', e.target.value);
      });

      siteColorHex.addEventListener('input', (e) => {
        if (this.isValidHexColor(e.target.value)) {
          siteColorPicker.value = e.target.value;
          this.updateSiteSetting('visitedColor', e.target.value);
        }
      });
    }

    // Use custom color toggle
    const useCustomColor = document.getElementById('use-custom-color');
    const siteColorRow = document.getElementById('site-color-row');
    if (useCustomColor && siteColorRow) {
      useCustomColor.addEventListener('change', (e) => {
        siteColorRow.style.display = e.target.checked ? 'flex' : 'none';
        if (e.target.checked) {
          // Initialize with current global color when enabling
          if (siteColorPicker && siteColorHex) {
            siteColorPicker.value = this.settings.visitedColor;
            siteColorHex.value = this.settings.visitedColor;
            this.updateSiteSetting('visitedColor', this.settings.visitedColor);
          }
        } else {
          // Remove custom color when disabling
          this.removeSiteSetting('visitedColor');
        }
      });
    }

  }


  async updateGlobalSetting(key, value) {
    try {
      this.settings[key] = value;
      
      await this.saveSettings(key);
      this.updateStatusIndicator();
    } catch (error) {
      this.showError('Failed to save setting');
    }
  }

  async updateSiteSetting(key, value) {
    try {
      const currentSite = this.getCurrentSite();
      if (!this.settings.siteSettings) {
        this.settings.siteSettings = {};
      }
      if (!this.settings.siteSettings[currentSite]) {
        this.settings.siteSettings[currentSite] = {};
      }
      
      this.settings.siteSettings[currentSite][key] = value;
      
      await this.saveSettings(key);
      this.updateStatusIndicator();
    } catch (error) {
      this.showError('Failed to save setting');
    }
  }

  async saveSettings(key) {
    // Clear any pending storage update
    if (this.storageUpdateTimeout) {
      clearTimeout(this.storageUpdateTimeout);
    }
    
    // For enable/disable changes, save immediately
    if (key === 'enabled') {
      await StorageManager.setSettings(this.settings);
      
      // Notify service worker immediately
      this.notifyServiceWorker().catch(error => {
        // Service worker notification failed
      });
    } else {
      // For color changes, debounce to avoid quota errors
      this.storageUpdateTimeout = setTimeout(async () => {
        try {
          await StorageManager.setSettings(this.settings);
          
          // Notify service worker
          this.notifyServiceWorker().catch(error => {
            // Service worker notification failed
          });
        } catch (error) {
          // Error saving debounced settings
        }
      }, 300); // 300ms debounce for color changes
    }
  }

  async removeSiteSetting(key) {
    try {
      const currentSite = this.getCurrentSite();
      if (this.settings.siteSettings && this.settings.siteSettings[currentSite]) {
        delete this.settings.siteSettings[currentSite][key];
        await StorageManager.setSettings(this.settings);
        await this.notifyServiceWorker();
        this.updateStatusIndicator();
      }
    } catch (error) {
      // Error removing site setting
    }
  }

  async notifyServiceWorker() {
    try {
      const response = await chrome.runtime.sendMessage({
        action: 'updateSettings',
        settings: this.settings
      });
      
      if (!response || !response.success) {
        throw new Error('Service worker returned error: ' + (response?.error || 'Unknown error'));
      }
    } catch (error) {
      throw error; // Re-throw to trigger the timeout
    }
  }

  updateStatusIndicator() {
    const statusDot = document.querySelector('.status-dot');
    const statusText = document.querySelector('.status-text');
    
    if (statusDot && statusText) {
      if (this.settings.enabled) {
        statusDot.className = 'status-dot active';
        statusText.textContent = 'Active';
      } else {
        statusDot.className = 'status-dot inactive';
        statusText.textContent = 'Disabled';
      }
    }
  }

  showSettingsContent() {
    const loadingOverlay = document.getElementById('loading-overlay');
    const settingsContent = document.getElementById('settings-content');
    
    if (loadingOverlay && settingsContent) {
      loadingOverlay.classList.add('hidden');
      settingsContent.classList.remove('hidden');
    }
  }

  showError(message) {
    // You could add a toast notification here
  }


  isValidHexColor(hex) {
    return /^#([A-Fa-f0-9]{6}|[A-Fa-f0-9]{3})$/.test(hex);
  }

  // Cleanup method to clear timeouts
  destroy() {
    if (this.storageUpdateTimeout) {
      clearTimeout(this.storageUpdateTimeout);
      this.storageUpdateTimeout = null;
    }
  }
}

// Initialize popup when DOM is ready
let popupController;
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => {
    popupController = new PopupController();
  });
} else {
  popupController = new PopupController();
}

// Cleanup when popup is closed
window.addEventListener('beforeunload', () => {
  if (popupController) {
    popupController.destroy();
  }
});
