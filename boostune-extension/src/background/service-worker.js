// ─────────────────────────────────────────────────────────────
//  Boostune — Service Worker (background)
//
//  Responsibilities:
//   • Manage the session lifecycle (start / stop / update)
//   • Call chrome.tabCapture.getMediaStreamId
//   • Create / destroy the Offscreen Document
//   • Route messages between popup, offscreen, and tab events
//   • Handle keyboard shortcuts (chrome.commands)
//   • Survive restarts by reading chrome.storage.session
// ─────────────────────────────────────────────────────────────

import {
  MSG,
  CAPTURE_STATE,
  OFFSCREEN_URL,
  OFFSCREEN_REASON,
  OFFSCREEN_JUSTIFICATION,
  VOLUME,
} from '../shared/constants.js';

import {
  log,
  isUnsupportedUrl,
  clamp,
  getDomain,
  friendlyError,
} from '../shared/utils.js';

import {
  getPrefs,
  getSiteVolumes,
  setSiteVolume,
  setSessionState,
  removeSessionState,
  getSessionStates,
} from '../storage/storage.js';

// ── In-memory session registry ────────────────────────────────
//
// Lost on SW termination; rebuilt from chrome.storage.session on wake-up.
// Key: tabId (number), Value: SessionRecord

/** @type {Map<number, SessionRecord>} */
const sessions = new Map();

/**
 * @typedef {{
 *   tabId:        number,
 *   enabled:      boolean,
 *   volume:       number,
 *   safeBoost:    boolean,
 *   captureState: string,
 *   title:        string,
 *   favicon:      string,
 * }} SessionRecord
 */

function makeSession(tabId, overrides = {}) {
  return {
    tabId,
    enabled:      false,
    volume:       VOLUME.DEFAULT,
    safeBoost:    true,
    captureState: CAPTURE_STATE.IDLE,
    title:        '',
    favicon:      '',
    ...overrides,
  };
}

function getOrCreateSession(tabId) {
  if (!sessions.has(tabId)) {
    sessions.set(tabId, makeSession(tabId));
  }
  return sessions.get(tabId);
}

// ── Broadcast helpers ─────────────────────────────────────────

function broadcastState(tabId, state) {
  chrome.runtime.sendMessage({ type: MSG.BOOST_STATE_CHANGED, tabId, state })
    .catch(() => {}); // popup may not be open — ignore
}

function broadcastError(tabId, error) {
  chrome.runtime.sendMessage({ type: MSG.BOOST_ERROR, tabId, error })
    .catch(() => {});
}

// ── Offscreen document management ────────────────────────────

async function ensureOffscreenDocument() {
  const exists = await chrome.offscreen.hasDocument();
  if (!exists) {
    await chrome.offscreen.createDocument({
      url:           OFFSCREEN_URL,
      reasons:       [OFFSCREEN_REASON],
      justification: OFFSCREEN_JUSTIFICATION,
    });
    log.info('Offscreen document created');
    // Give the document a moment to load before we send messages
    await _sleep(150);
  }
}

async function maybeDestroyOffscreenDocument() {
  const hasActive = [...sessions.values()].some(
    (s) => s.captureState === CAPTURE_STATE.ACTIVE,
  );
  if (!hasActive) {
    const exists = await chrome.offscreen.hasDocument();
    if (exists) {
      await chrome.offscreen.closeDocument();
      log.info('Offscreen document destroyed (no active sessions)');
    }
  }
}

// ── Core: Start audio boost for a tab ────────────────────────

async function startBoost(tabId) {
  // ── 1. Validate tab ──────────────────────────────────────
  let tab;
  try {
    tab = await chrome.tabs.get(tabId);
  } catch {
    return { success: false, error: 'Tab not found.' };
  }

  if (isUnsupportedUrl(tab.url)) {
    return {
      success: false,
      error:   "Boostune can't control audio on this browser page.",
    };
  }

  // ── 2. Guard against duplicate starts ───────────────────
  const session = getOrCreateSession(tabId);

  if (session.captureState === CAPTURE_STATE.ACTIVE) {
    return { success: true }; // already running
  }
  if (session.captureState === CAPTURE_STATE.STARTING) {
    return { success: false, error: 'Capture is already starting.' };
  }

  // ── 3. Populate session record ───────────────────────────
  session.title        = tab.title   || '';
  session.favicon      = tab.favIconUrl || '';
  session.enabled      = true;
  session.captureState = CAPTURE_STATE.STARTING;

  const prefs = await getPrefs();
  session.safeBoost = prefs.safeBoost;

  // Apply remembered volume if feature is enabled
  if (prefs.rememberVolume && tab.url) {
    const domain   = getDomain(tab.url);
    const siteVols = await getSiteVolumes();
    session.volume = (domain && siteVols[domain] !== undefined)
      ? siteVols[domain]
      : prefs.defaultVolume;
  } else {
    // Only apply default if the session is fresh (volume hasn't been set yet)
    if (session.volume === VOLUME.DEFAULT) {
      session.volume = prefs.defaultVolume;
    }
  }

  broadcastState(tabId, { ...session });
  await setSessionState(tabId, session);

  // ── 4. Create offscreen document (if not already alive) ──
  try {
    await ensureOffscreenDocument();
  } catch (err) {
    log.error('ensureOffscreenDocument failed', err);
    session.captureState = CAPTURE_STATE.ERROR;
    session.enabled      = false;
    broadcastState(tabId, { ...session });
    await setSessionState(tabId, session);
    return { success: false, error: 'Failed to create offscreen document.' };
  }

  // ── 5. Get tab media stream ID ───────────────────────────
  let streamId;
  try {
    streamId = await new Promise((resolve, reject) => {
      chrome.tabCapture.getMediaStreamId({ targetTabId: tabId }, (id) => {
        if (chrome.runtime.lastError) {
          reject(new Error(chrome.runtime.lastError.message));
        } else {
          resolve(id);
        }
      });
    });
  } catch (err) {
    log.error(`getMediaStreamId failed for tab ${tabId}`, err);
    session.captureState = CAPTURE_STATE.ERROR;
    session.enabled      = false;
    broadcastState(tabId, { ...session });
    await setSessionState(tabId, session);
    await maybeDestroyOffscreenDocument();
    return { success: false, error: friendlyError(err) };
  }

  // ── 6. Send stream ID to offscreen document ──────────────
  let response;
  try {
    response = await chrome.runtime.sendMessage({
      type:      MSG.OFFSCREEN_START,
      tabId,
      streamId,
      volume:    session.volume,
      safeBoost: session.safeBoost,
    });
  } catch (err) {
    log.error('OFFSCREEN_START message failed', err);
    response = { success: false, error: err.message };
  }

  // ── 7. Finalise session state based on offscreen response ─
  if (response?.success) {
    session.captureState = CAPTURE_STATE.ACTIVE;
    broadcastState(tabId, { ...session });
    await setSessionState(tabId, session);
    log.info(`Boost started for tab ${tabId} at ${session.volume}%`);
    return { success: true };
  } else {
    session.captureState = CAPTURE_STATE.ERROR;
    session.enabled      = false;
    broadcastState(tabId, { ...session });
    await setSessionState(tabId, session);
    await maybeDestroyOffscreenDocument();
    return { success: false, error: friendlyError(new Error(response?.error)) };
  }
}

// ── Core: Stop audio boost for a tab ─────────────────────────

async function stopBoost(tabId) {
  const session = sessions.get(tabId);
  if (!session || session.captureState === CAPTURE_STATE.IDLE) {
    return { success: true };
  }

  session.captureState = CAPTURE_STATE.STOPPING;
  broadcastState(tabId, { ...session });

  // Tell offscreen to stop the audio session
  try {
    const exists = await chrome.offscreen.hasDocument();
    if (exists) {
      await chrome.runtime.sendMessage({ type: MSG.OFFSCREEN_STOP, tabId });
    }
  } catch (err) {
    log.warn(`OFFSCREEN_STOP message failed for tab ${tabId}`, err);
  }

  session.captureState = CAPTURE_STATE.IDLE;
  session.enabled      = false;
  broadcastState(tabId, { ...session });
  await setSessionState(tabId, session);

  await maybeDestroyOffscreenDocument();
  return { success: true };
}

// ── Core: Change volume for a tab ────────────────────────────

async function setVolume(tabId, volume) {
  const vol     = clamp(volume, VOLUME.MIN, VOLUME.MAX);
  const session = getOrCreateSession(tabId);
  session.volume = vol;

  // Forward to offscreen if session is active
  if (session.captureState === CAPTURE_STATE.ACTIVE) {
    const exists = await chrome.offscreen.hasDocument();
    if (exists) {
      chrome.runtime.sendMessage({ type: MSG.OFFSCREEN_SET_VOLUME, tabId, volume: vol })
        .catch(() => {});
    }
  }

  // Remember volume per domain if preference is set
  const prefs = await getPrefs();
  if (prefs.rememberVolume) {
    const tab = await chrome.tabs.get(tabId).catch(() => null);
    if (tab?.url) {
      const domain = getDomain(tab.url);
      if (domain) await setSiteVolume(domain, vol);
    }
  }

  broadcastState(tabId, { ...session });
  await setSessionState(tabId, session);
  return { success: true };
}

// ── Core: Toggle Safe Boost ───────────────────────────────────

async function toggleSafeBoost(tabId, enabled) {
  const session = getOrCreateSession(tabId);
  session.safeBoost = enabled;

  if (session.captureState === CAPTURE_STATE.ACTIVE) {
    const exists = await chrome.offscreen.hasDocument();
    if (exists) {
      chrome.runtime.sendMessage({
        type: MSG.OFFSCREEN_SET_SAFE_BOOST, tabId, enabled,
      }).catch(() => {});
    }
  }

  broadcastState(tabId, { ...session });
  await setSessionState(tabId, session);
  return { success: true };
}

// ── Core: Clean up a tab completely ──────────────────────────

async function cleanupTab(tabId) {
  if (sessions.has(tabId)) {
    const session = sessions.get(tabId);
    if (session.captureState === CAPTURE_STATE.ACTIVE ||
        session.captureState === CAPTURE_STATE.STARTING) {
      await stopBoost(tabId);
    }
    sessions.delete(tabId);
  }
  await removeSessionState(tabId);
  log.debug(`Cleaned up tab ${tabId}`);
}

// ── Message listener ─────────────────────────────────────────

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (!message?.type) return false;

  // ── Async messages from the offscreen document ───────────
  if (message.type === MSG.OFFSCREEN_ERROR) {
    handleOffscreenError(message.tabId, message.error);
    return false; // no response needed
  }

  // ── Synchronous-ish messages from popup / options ────────
  handleMessage(message)
    .then(sendResponse)
    .catch((err) => {
      log.error('SW message handler threw', err);
      sendResponse({ success: false, error: err.message });
    });

  return true; // keep channel open
});

async function handleMessage(message) {
  const { type, tabId } = message;

  switch (type) {
    case MSG.BOOST_START:
      return await startBoost(tabId);

    case MSG.BOOST_STOP:
      return await stopBoost(tabId);

    case MSG.BOOST_SET_VOLUME:
      return await setVolume(tabId, message.volume);

    case MSG.BOOST_TOGGLE_SAFE_BOOST:
      return await toggleSafeBoost(tabId, message.enabled);

    case MSG.BOOST_GET_STATE: {
      const state = sessions.get(tabId) || null;
      return { success: true, state };
    }

    case MSG.BOOST_GET_ALL_STATES: {
      const allStates = {};
      sessions.forEach((s, id) => { allStates[id] = { ...s }; });
      return { success: true, states: allStates };
    }

    default:
      return { success: false, error: `Unknown message type: "${type}"` };
  }
}

function handleOffscreenError(tabId, error) {
  const session = sessions.get(tabId);
  if (!session) return;

  session.captureState = CAPTURE_STATE.ERROR;
  session.enabled      = false;
  broadcastState(tabId, { ...session });
  broadcastError(tabId, friendlyError(new Error(error)));
  setSessionState(tabId, session).catch(() => {});
  maybeDestroyOffscreenDocument().catch(() => {});
}

// ── Tab lifecycle events ──────────────────────────────────────

chrome.tabs.onRemoved.addListener((tabId) => {
  if (sessions.has(tabId)) {
    cleanupTab(tabId);
  }
});

chrome.tabs.onUpdated.addListener((tabId, changeInfo) => {
  const session = sessions.get(tabId);
  if (!session) return;

  // Tab navigated to a new URL — the old capture stream is invalidated
  if (changeInfo.url !== undefined && session.captureState === CAPTURE_STATE.ACTIVE) {
    log.info(`Tab ${tabId} navigated to new URL — stopping boost`);
    stopBoost(tabId);
    return;
  }

  // Keep metadata fresh
  if (changeInfo.title)      session.title   = changeInfo.title;
  if (changeInfo.favIconUrl) session.favicon  = changeInfo.favIconUrl;

  // If the tab finished loading after a navigation, reset to IDLE
  if (changeInfo.status === 'loading' && session.captureState === CAPTURE_STATE.ERROR) {
    session.captureState = CAPTURE_STATE.IDLE;
    broadcastState(tabId, { ...session });
    setSessionState(tabId, session).catch(() => {});
  }
});

// ── Keyboard shortcuts ────────────────────────────────────────

chrome.commands.onCommand.addListener(async (command) => {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab) return;

  const session = sessions.get(tab.id);
  if (!session || session.captureState !== CAPTURE_STATE.ACTIVE) return;

  switch (command) {
    case 'volume-up':
      await setVolume(tab.id, session.volume + VOLUME.STEP);
      break;
    case 'volume-down':
      await setVolume(tab.id, session.volume - VOLUME.STEP);
      break;
    case 'volume-reset':
      await setVolume(tab.id, VOLUME.DEFAULT);
      break;
  }
});

// ── Service Worker restart recovery ──────────────────────────
//
// When the SW is terminated and restarted, any in-memory sessions are lost.
// We recover the last-known state from chrome.storage.session, mark any
// previously-active sessions as ERROR (the offscreen document was also
// likely closed), and let the user choose to resume.

async function recoverFromRestart() {
  try {
    const saved = await getSessionStates();
    for (const [tabIdStr, state] of Object.entries(saved)) {
      const tabId = parseInt(tabIdStr, 10);

      // Verify the tab still exists
      const tab = await chrome.tabs.get(tabId).catch(() => null);
      if (!tab) {
        await removeSessionState(tabId);
        continue;
      }

      if (state.captureState === CAPTURE_STATE.ACTIVE ||
          state.captureState === CAPTURE_STATE.STARTING) {
        // Audio was streaming — SW restart killed the pipeline
        state.captureState = CAPTURE_STATE.ERROR;
        state.enabled      = false;
        await setSessionState(tabId, state);
      }

      sessions.set(tabId, state);
    }
    log.info('Session state recovered after SW restart');
  } catch (e) {
    log.error('Recovery failed', e);
  }
}

// ── Init ──────────────────────────────────────────────────────

recoverFromRestart();
log.info('Boostune Service Worker started');

// ── Internal helpers ──────────────────────────────────────────

function _sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}
