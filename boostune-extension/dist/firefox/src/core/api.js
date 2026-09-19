/**
 * Cross-browser API wrapper.
 * Provides a unified interface for extensions APIs, preferring standard promises
 * and falling back appropriately between `chrome.*` and `browser.*`.
 */

const api = typeof browser !== 'undefined' ? browser : chrome;

export const platformApi = {
  runtime: {
    sendMessage: (msg) => {
      // Return a Promise in both Chrome and Firefox
      if (typeof browser !== 'undefined') {
        return browser.runtime.sendMessage(msg);
      }
      return new Promise((resolve, reject) => {
        chrome.runtime.sendMessage(msg, (response) => {
          if (chrome.runtime.lastError) {
            reject(new Error(chrome.runtime.lastError.message));
          } else {
            resolve(response);
          }
        });
      });
    },
    onMessage: {
      addListener: (listener) => api.runtime.onMessage.addListener(listener),
      removeListener: (listener) => api.runtime.onMessage.removeListener(listener),
    },
    getURL: (path) => api.runtime.getURL(path),
    getManifest: () => api.runtime.getManifest(),
    openOptionsPage: () => api.runtime.openOptionsPage(),
    lastError: () => api.runtime.lastError,
  },
  tabs: {
    get: (tabId) => {
      if (typeof browser !== 'undefined') {
        return browser.tabs.get(tabId);
      }
      return new Promise((resolve, reject) => {
        chrome.tabs.get(tabId, (tab) => {
          if (chrome.runtime.lastError) reject(new Error(chrome.runtime.lastError.message));
          else resolve(tab);
        });
      });
    },
    query: (queryInfo) => {
      if (typeof browser !== 'undefined') {
        return browser.tabs.query(queryInfo);
      }
      return new Promise((resolve) => {
        chrome.tabs.query(queryInfo, resolve);
      });
    },
    create: (createProperties) => {
      if (typeof browser !== 'undefined') {
        return browser.tabs.create(createProperties);
      }
      return new Promise((resolve) => {
        chrome.tabs.create(createProperties, resolve);
      });
    },
  },
  storage: {
    sync: {
      get: (keys) => {
        if (typeof browser !== 'undefined') {
          return browser.storage.sync.get(keys);
        }
        return new Promise((resolve, reject) => {
          chrome.storage.sync.get(keys, (items) => {
            if (chrome.runtime.lastError) reject(new Error(chrome.runtime.lastError.message));
            else resolve(items);
          });
        });
      },
      set: (items) => {
        if (typeof browser !== 'undefined') {
          return browser.storage.sync.set(items);
        }
        return new Promise((resolve, reject) => {
          chrome.storage.sync.set(items, () => {
            if (chrome.runtime.lastError) reject(new Error(chrome.runtime.lastError.message));
            else resolve();
          });
        });
      },
      remove: (keys) => {
        if (typeof browser !== 'undefined') {
          return browser.storage.sync.remove(keys);
        }
        return new Promise((resolve, reject) => {
          chrome.storage.sync.remove(keys, () => {
            if (chrome.runtime.lastError) reject(new Error(chrome.runtime.lastError.message));
            else resolve();
          });
        });
      },
    },
    // Firefox doesn't natively support storage.session in MV2, and in MV3 it's limited, 
    // but we can abstract it here. We will use a fallback for Firefox if needed, or rely on Firefox MV3.
    // For now, assume it's available or fallback to local.
    session: {
      get: (keys) => {
        const storageObj = api.storage.session || api.storage.local;
        if (typeof browser !== 'undefined') {
          return storageObj.get(keys);
        }
        return new Promise((resolve, reject) => {
          storageObj.get(keys, (items) => {
            if (chrome.runtime.lastError) reject(new Error(chrome.runtime.lastError.message));
            else resolve(items);
          });
        });
      },
      set: (items) => {
        const storageObj = api.storage.session || api.storage.local;
        if (typeof browser !== 'undefined') {
          return storageObj.set(items);
        }
        return new Promise((resolve, reject) => {
          storageObj.set(items, () => {
            if (chrome.runtime.lastError) reject(new Error(chrome.runtime.lastError.message));
            else resolve();
          });
        });
      },
      remove: (keys) => {
        const storageObj = api.storage.session || api.storage.local;
        if (typeof browser !== 'undefined') {
          return storageObj.remove(keys);
        }
        return new Promise((resolve, reject) => {
          storageObj.remove(keys, () => {
            if (chrome.runtime.lastError) reject(new Error(chrome.runtime.lastError.message));
            else resolve();
          });
        });
      }
    }
  },
  commands: {
    getAll: () => {
      if (typeof browser !== 'undefined') {
        return browser.commands.getAll();
      }
      return new Promise((resolve) => {
        chrome.commands.getAll(resolve);
      });
    }
  }
};
