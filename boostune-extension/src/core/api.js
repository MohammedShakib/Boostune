/**
 * Cross-browser API wrapper.
 * Provides a unified interface for extensions APIs, preferring standard promises
 * and falling back appropriately between `chrome.*` and `browser.*`.
 */

const api = globalThis.browser ?? globalThis.chrome;
const isFirefox = Boolean(globalThis.browser);

if (!api) {
  throw new Error('Boostune extension APIs are unavailable in this context.');
}

export const platformApi = {
  runtime: {
    sendMessage: (msg) => {
      // Return a Promise in both Chrome and Firefox
      if (isFirefox) {
        return api.runtime.sendMessage(msg);
      }
      return new Promise((resolve, reject) => {
        api.runtime.sendMessage(msg, (response) => {
          if (api.runtime.lastError) {
            reject(new Error(api.runtime.lastError.message));
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
      if (isFirefox) {
        return api.tabs.get(tabId);
      }
      return new Promise((resolve, reject) => {
        api.tabs.get(tabId, (tab) => {
          if (api.runtime.lastError) reject(new Error(api.runtime.lastError.message));
          else resolve(tab);
        });
      });
    },
    query: (queryInfo) => {
      if (isFirefox) {
        return api.tabs.query(queryInfo);
      }
      return new Promise((resolve) => {
        api.tabs.query(queryInfo, resolve);
      });
    },
    create: (createProperties) => {
      if (isFirefox) {
        return api.tabs.create(createProperties);
      }
      return new Promise((resolve) => {
        api.tabs.create(createProperties, resolve);
      });
    },
  },
  storage: {
    onChanged: {
      addListener: (listener) => api.storage.onChanged.addListener(listener),
      removeListener: (listener) => api.storage.onChanged.removeListener(listener),
    },
    sync: {
      get: (keys) => {
        if (isFirefox) {
          return api.storage.sync.get(keys);
        }
        return new Promise((resolve, reject) => {
          api.storage.sync.get(keys, (items) => {
            if (api.runtime.lastError) reject(new Error(api.runtime.lastError.message));
            else resolve(items);
          });
        });
      },
      set: (items) => {
        if (isFirefox) {
          return api.storage.sync.set(items);
        }
        return new Promise((resolve, reject) => {
          api.storage.sync.set(items, () => {
            if (api.runtime.lastError) reject(new Error(api.runtime.lastError.message));
            else resolve();
          });
        });
      },
      remove: (keys) => {
        if (isFirefox) {
          return api.storage.sync.remove(keys);
        }
        return new Promise((resolve, reject) => {
          api.storage.sync.remove(keys, () => {
            if (api.runtime.lastError) reject(new Error(api.runtime.lastError.message));
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
        if (isFirefox) {
          return storageObj.get(keys);
        }
        return new Promise((resolve, reject) => {
          storageObj.get(keys, (items) => {
            if (api.runtime.lastError) reject(new Error(api.runtime.lastError.message));
            else resolve(items);
          });
        });
      },
      set: (items) => {
        const storageObj = api.storage.session || api.storage.local;
        if (isFirefox) {
          return storageObj.set(items);
        }
        return new Promise((resolve, reject) => {
          storageObj.set(items, () => {
            if (api.runtime.lastError) reject(new Error(api.runtime.lastError.message));
            else resolve();
          });
        });
      },
      remove: (keys) => {
        const storageObj = api.storage.session || api.storage.local;
        if (isFirefox) {
          return storageObj.remove(keys);
        }
        return new Promise((resolve, reject) => {
          storageObj.remove(keys, () => {
            if (api.runtime.lastError) reject(new Error(api.runtime.lastError.message));
            else resolve();
          });
        });
      }
    }
  },
  commands: {
    getAll: () => {
      if (isFirefox) {
        return api.commands.getAll();
      }
      return new Promise((resolve) => {
        api.commands.getAll(resolve);
      });
    }
  }
};
