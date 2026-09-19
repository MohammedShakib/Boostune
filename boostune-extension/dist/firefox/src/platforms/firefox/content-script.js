// ─────────────────────────────────────────────────────────────
// Boostune — Firefox Content Script (Bridge)
// Injected into the isolated world. Listens to extension background
// messages and forwards them to the page-audio.js in the main world.
// ─────────────────────────────────────────────────────────────

if (!window.__BOOSTUNE_CONTENT_SCRIPT_INJECTED__) {
  window.__BOOSTUNE_CONTENT_SCRIPT_INJECTED__ = true;

  console.log('[Boostune] Content script bridge injected.');

  // Inject page-audio.js into the main world
  function injectPageScript() {
    return new Promise((resolve) => {
      const script = document.createElement('script');
      script.src = browser.runtime.getURL('src/platforms/firefox/page-audio.js');
      script.onload = () => script.remove();
      
      const readyListener = (event) => {
        if (event.source === window && event.data && event.data.source === 'BOOSTUNE_PAGE_AUDIO' && event.data.type === 'READY') {
          window.removeEventListener('message', readyListener);
          resolve();
        }
      };
      window.addEventListener('message', readyListener);
      
      (document.head || document.documentElement).appendChild(script);
    });
  }

  let pageScriptReady = false;

  async function ensurePageScript() {
    if (pageScriptReady) return;
    await injectPageScript();
    pageScriptReady = true;
  }

  function postToPage(type, payload = {}) {
    window.postMessage({ source: 'BOOSTUNE_CONTENT_SCRIPT', type, payload }, '*');
  }

  browser.runtime.onMessage.addListener((message, sender, sendResponse) => {
    // Only handle audio pipeline commands
    if (message.type === 'OFFSCREEN_START') { // Reuse same message signature as Chromium
      ensurePageScript().then(() => {
        postToPage('SET_VOLUME', { volume: message.volume });
        postToPage('SET_SAFE_BOOST', { enabled: message.safeBoost });
        postToPage('START');
        sendResponse({ success: true });
      });
      return true; // async
    }

    if (message.type === 'OFFSCREEN_STOP') {
      postToPage('STOP');
      sendResponse({ success: true });
      return false;
    }

    if (message.type === 'OFFSCREEN_SET_VOLUME') {
      postToPage('SET_VOLUME', { volume: message.volume });
      sendResponse({ success: true });
      return false;
    }

    if (message.type === 'OFFSCREEN_SET_SAFE_BOOST') {
      postToPage('SET_SAFE_BOOST', { enabled: message.enabled });
      sendResponse({ success: true });
      return false;
    }

    return false;
  });
}
