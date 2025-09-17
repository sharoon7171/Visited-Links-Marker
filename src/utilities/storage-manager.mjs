// Storage management for Visited Link Marker extension

export class StorageManager {
  static async getSettings() {
    try {
      const result = await chrome.storage.sync.get(SETTINGS_KEY);
      return result[SETTINGS_KEY] || DEFAULT_SETTINGS;
    } catch (error) {
      return DEFAULT_SETTINGS;
    }
  }

  static async setSettings(settings) {
    try {
      await chrome.storage.sync.set({ [SETTINGS_KEY]: settings });
      return true;
    } catch (error) {
      return false;
    }
  }

  static async updateSettings(updates) {
    try {
      const currentSettings = await this.getSettings();
      const newSettings = { ...currentSettings, ...updates };
      return await this.setSettings(newSettings);
    } catch (error) {
      return false;
    }
  }
}

// Default settings
export const DEFAULT_SETTINGS = {
  visitedColor: '#551a8b', // Global color - default purple
  enabled: true,            // Global enable/disable
  siteSettings: {}          // Site-specific settings (empty by default)
};

// Settings key for storage
export const SETTINGS_KEY = 'settings';
