// Visited Link Marker - Content Script
// Simple communication bridge between service worker and popup

class ContentScript {
  constructor() {
    this.init();
  }

  async init() {
    try {
      // Setup message listener for service worker communication
      this.setupMessageListener();
      
      // Request CSS injection immediately for real-time updates
      await this.requestCSSInjection();
      
      // Set up observer for dynamically loaded content
      this.setupDOMObserver();
      
    } catch (error) {
      // Error initializing content script
    }
  }

  setupDOMObserver() {
    // Smart DOM observer - only triggers on actual link additions
    const observer = new MutationObserver((mutations) => {
      let hasNewLinks = false;
      
      mutations.forEach((mutation) => {
        if (mutation.type === 'childList') {
          // Smart link detection - only check for actual links
          mutation.addedNodes.forEach((node) => {
            if (node.nodeType === Node.ELEMENT_NODE) {
              // Only trigger if it's actually a link or contains links
              if (node.tagName === 'A' || 
                  (node.querySelector && node.querySelector('a'))) {
                hasNewLinks = true;
              }
            }
          });
        }
      });
      
      // Request CSS injection immediately if new links were added
      if (hasNewLinks) {
        this.requestCSSInjection();
      }
    });
    
    // Start observing with optimized settings
    observer.observe(document.body, {
      childList: true,
      subtree: true,
      // Only observe direct children and their descendants
      attributes: false,
      characterData: false
    });

    // Cleanup observer when page unloads
    window.addEventListener('beforeunload', () => {
      observer.disconnect();
    });
  }

  setupMessageListener() {
    chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
      switch (message.action) {
        case 'updateSettings':
          // Forward to service worker for CSS update
          this.requestCSSInjection();
          sendResponse({ success: true });
          break;
        case 'ping':
          sendResponse({ success: true });
          break;
        default:
          sendResponse({ success: false, error: 'Unknown action' });
      }
      return true;
    });
  }

  async requestCSSInjection() {
    try {
      // Get current tab ID from the content script context
      const tabId = await this.getCurrentTabId();
      if (tabId) {
        await chrome.runtime.sendMessage({
          action: 'injectCSS',
          tabId: tabId
        });
      }
    } catch (error) {
      // Error requesting CSS injection
    }
  }

  async getCurrentTabId() {
    try {
      // Use chrome.tabs.getCurrent() to get the current tab ID
      const tab = await chrome.tabs.getCurrent();
      return tab ? tab.id : null;
    } catch (error) {
      // Fallback: try to get tab ID from the sender
      return null;
    }
  }
}

// Initialize content script when DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => {
    new ContentScript();
  });
} else {
  new ContentScript();
}
