// ─────────────────────────────────────────────────────────────
//  Boostune — Firefox Background Script
//  Manages session lifecycle and sends commands to content scripts.
// ─────────────────────────────────────────────────────────────

import {
  MSG,
  CAPTURE_STATE,
  VOLUME,
} from '../../../core/shared/constants.js';

import {
  log,
  isUnsupportedUrl,
  clamp,
  getDomain,
  friendlyError,
} from '../../../core/shared/utils.js';

import {
  getPrefs,
  getSiteVolumes,
  setSiteVolume,
  setSessionState,
  removeSessionState,
  getSessionStates,
} from '../../../core/storage/storage.js';

const sessions = new Map();

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

function broadcastState(tabId, state) {
  browser.runtime.sendMessage({ type: MSG.BOOST_STATE_CHANGED, tabId, state }).catch(() => {});
}

function broadcastError(tabId, error) {
  browser.runtime.sendMessage({ type: MSG.BOOST_ERROR, tabId, error }).catch(() => {});
}

async function injectContentScriptIfNeeded(tabId) {
  try {
    await browser.scripting.executeScript({
      target: { tabId },
      files: ['src/platforms/firefox/content-script.js']
    });
  } catch (err) {
    throw new Error('Failed to inject audio processing script into this page. It may be protected.');
  }
}

async function startBoost(tabId, options = {}) {
  let tab;
  try {
    tab = await browser.tabs.get(tabId);
  } catch {
    return { success: false, error: 'Tab not found.' };
  }

  if (isUnsupportedUrl(tab.url)) {
    return { success: false, error: "Boostune can't control audio on this browser page." };
  }

  const session = getOrCreateSession(tabId);
  if (session.captureState === CAPTURE_STATE.ACTIVE) return { success: true };
  if (session.captureState === CAPTURE_STATE.STARTING) return { success: true };

  session.title = tab.title || '';
  session.favicon = tab.favIconUrl || '';
  session.enabled = true;
  session.captureState = CAPTURE_STATE.STARTING;

  const prefs = await getPrefs();
  session.safeBoost = typeof options.safeBoost === 'boolean' ? options.safeBoost : prefs.safeBoost;

  const requestedVolume = Number(options.volume);
  if (Number.isFinite(requestedVolume)) {
    session.volume = requestedVolume;
  } else if (prefs.rememberVolume && tab.url) {
    const domain = getDomain(tab.url);
    const siteVols = await getSiteVolumes();
    session.volume = (domain && siteVols[domain] !== undefined) ? siteVols[domain] : prefs.defaultVolume;
  } else if (session.volume === VOLUME.DEFAULT) {
    session.volume = prefs.defaultVolume;
  }

  session.volume = clampVolumeForPrefs(session.volume, prefs);

  broadcastState(tabId, { ...session });
  await setSessionState(tabId, session);

  try {
    // 1. Inject the bridge script
    await injectContentScriptIfNeeded(tabId);

    // 2. Send START command to content script
    await browser.tabs.sendMessage(tabId, {
      type: 'OFFSCREEN_START',
      volume: session.volume,
      safeBoost: session.safeBoost
    });

    session.captureState = CAPTURE_STATE.ACTIVE;
    broadcastState(tabId, { ...session });
    await setSessionState(tabId, session);
    log.info(`Boost started for Firefox tab ${tabId} at ${session.volume}%`);
    return { success: true };
  } catch (err) {
    log.error('Firefox startBoost failed', err);
    session.captureState = CAPTURE_STATE.ERROR;
    session.enabled = false;
    broadcastState(tabId, { ...session });
    await setSessionState(tabId, session);
    return { success: false, error: friendlyError(err) };
  }
}

async function stopBoost(tabId) {
  const session = sessions.get(tabId);
  if (!session || session.captureState === CAPTURE_STATE.IDLE) return { success: true };

  session.captureState = CAPTURE_STATE.STOPPING;
  broadcastState(tabId, { ...session });

  try {
    await browser.tabs.sendMessage(tabId, { type: 'OFFSCREEN_STOP' });
  } catch (err) {
    log.warn(`Stop message failed for tab ${tabId}`, err);
  }

  session.captureState = CAPTURE_STATE.IDLE;
  session.enabled = false;
  broadcastState(tabId, { ...session });
  await setSessionState(tabId, session);
  return { success: true };
}

async function setVolume(tabId, volume) {
  const prefs = await getPrefs();
  const vol = clampVolumeForPrefs(volume, prefs);
  const session = getOrCreateSession(tabId);
  session.volume = vol;

  if (session.captureState === CAPTURE_STATE.ACTIVE) {
    browser.tabs.sendMessage(tabId, { type: 'OFFSCREEN_SET_VOLUME', volume: vol }).catch(() => {});
  }

  if (prefs.rememberVolume) {
    const tab = await browser.tabs.get(tabId).catch(() => null);
    if (tab?.url) {
      const domain = getDomain(tab.url);
      if (domain) await setSiteVolume(domain, vol);
    }
  }

  broadcastState(tabId, { ...session });
  await setSessionState(tabId, session);
  return { success: true };
}

async function toggleSafeBoost(tabId, enabled) {
  const session = getOrCreateSession(tabId);
  session.safeBoost = enabled;

  if (session.captureState === CAPTURE_STATE.ACTIVE) {
    browser.tabs.sendMessage(tabId, { type: 'OFFSCREEN_SET_SAFE_BOOST', enabled }).catch(() => {});
  }

  broadcastState(tabId, { ...session });
  await setSessionState(tabId, session);
  return { success: true };
}

async function cleanupTab(tabId) {
  if (sessions.has(tabId)) {
    const session = sessions.get(tabId);
    if (session.captureState === CAPTURE_STATE.ACTIVE || session.captureState === CAPTURE_STATE.STARTING) {
      await stopBoost(tabId);
    }
    sessions.delete(tabId);
  }
  await removeSessionState(tabId);
}

browser.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (!message?.type) return false;

  handleMessage(message)
    .then(sendResponse)
    .catch((err) => {
      log.error('SW message handler threw', err);
      sendResponse({ success: false, error: err.message });
    });

  return true; 
});

async function handleMessage(message) {
  const { type, tabId } = message;

  switch (type) {
    case MSG.BOOST_START:
      return await startBoost(tabId, {
        volume: message.volume,
        safeBoost: message.safeBoost,
      });
    case MSG.BOOST_STOP:
      return await stopBoost(tabId);
    case MSG.BOOST_SET_VOLUME:
      return await setVolume(tabId, message.volume);
    case MSG.BOOST_TOGGLE_SAFE_BOOST:
      return await toggleSafeBoost(tabId, message.enabled);
    case MSG.BOOST_GET_STATE:
      return { success: true, state: sessions.get(tabId) || null };
    case MSG.BOOST_GET_ALL_STATES:
      const allStates = {};
      sessions.forEach((s, id) => { allStates[id] = { ...s }; });
      return { success: true, states: allStates };
    default:
      return { success: false, error: `Unknown message type: "${type}"` };
  }
}

browser.tabs.onRemoved.addListener((tabId) => cleanupTab(tabId));

browser.tabs.onUpdated.addListener((tabId, changeInfo) => {
  const session = sessions.get(tabId);
  if (!session) return;

  if (changeInfo.url !== undefined && session.captureState === CAPTURE_STATE.ACTIVE) {
    stopBoost(tabId);
    return;
  }
  if (changeInfo.title) session.title = changeInfo.title;
  if (changeInfo.favIconUrl) session.favicon = changeInfo.favIconUrl;

  if (changeInfo.status === 'loading' && session.captureState === CAPTURE_STATE.ERROR) {
    session.captureState = CAPTURE_STATE.IDLE;
    broadcastState(tabId, { ...session });
    setSessionState(tabId, session).catch(() => {});
  }
});

browser.commands.onCommand.addListener(async (command) => {
  const [tab] = await browser.tabs.query({ active: true, currentWindow: true });
  if (!tab) return;
  const session = sessions.get(tab.id);
  if (!session || session.captureState !== CAPTURE_STATE.ACTIVE) return;

  switch (command) {
    case 'volume-up': await setVolume(tab.id, session.volume + VOLUME.STEP); break;
    case 'volume-down': await setVolume(tab.id, session.volume - VOLUME.STEP); break;
    case 'volume-reset': await setVolume(tab.id, VOLUME.DEFAULT); break;
  }
});

async function recoverFromRestart() {
  try {
    const saved = await getSessionStates();
    for (const [tabIdStr, state] of Object.entries(saved)) {
      const tabId = parseInt(tabIdStr, 10);
      const tab = await browser.tabs.get(tabId).catch(() => null);
      if (!tab) {
        await removeSessionState(tabId);
        continue;
      }
      if (state.captureState === CAPTURE_STATE.ACTIVE || state.captureState === CAPTURE_STATE.STARTING) {
        state.captureState = CAPTURE_STATE.ERROR;
        state.enabled = false;
        await setSessionState(tabId, state);
      }
      sessions.set(tabId, state);
    }
  } catch (e) {
    log.error('Recovery failed', e);
  }
}

function clampVolumeForPrefs(volume, prefs = {}) {
  const parsedMax = Number(prefs.maxVolume);
  const parsedVolume = Number(volume);
  const max = clamp(Number.isFinite(parsedMax) ? parsedMax : VOLUME.MAX, VOLUME.MIN, VOLUME.MAX);
  return clamp(Number.isFinite(parsedVolume) ? parsedVolume : VOLUME.DEFAULT, VOLUME.MIN, max);
}

recoverFromRestart();
log.info('Boostune Firefox Background started');
